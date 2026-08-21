/**
 * Pruebas de la lógica del webhook de RevenueCat.
 *
 * Portadas desde `pruebas/webhook-revenuecat.test.ts` del stack anterior
 * (node:test) al runner que usa el proyecto ahora (vitest). Lo que cambió es
 * la sintaxis y que la verificación de firma pasó a ser asíncrona al migrar a
 * Web Crypto; las aserciones son las mismas.
 *
 * No tocan la base de datos: `lib/revenuecat.ts` es puro a propósito, así que
 * esto corre sin levantar Convex ni tener un despliegue configurado.
 *
 * Se prueba lo que ADR-006 exige y lo que más caro sale si está mal: que un
 * reenvío no duplique nada, que una firma falsa no entre, y que una suscripción
 * cancelada no pierda el acceso antes de tiempo.
 */

import { describe, expect, test } from "vitest";

import { ESTADO_SUSCRIPCION } from "./enums";
import {
  ESTADO_POR_TIPO_EVENTO,
  EVENTOS_SIN_EFECTO,
  autenticarPeticion,
  interpretarEvento,
  leerEvento,
  tieneAccesoVigente,
  verificarCabeceraCompartida,
  verificarFirma,
} from "./revenuecat";

const SECRETO = "secreto-de-prueba-no-real";

/** Construye una cabecera de firma válida, como la enviaría RevenueCat. */
async function firmar(cuerpo: string, t: number, secreto = SECRETO): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC",
    clave,
    new TextEncoder().encode(`${t}.${cuerpo}`),
  );
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

function sobreDeEvento(parcial: Record<string, unknown> = {}): string {
  return JSON.stringify({
    api_version: "1.0",
    event: {
      id: "evt_0001",
      type: "INITIAL_PURCHASE",
      app_user_id: "perfil-ficticio-1",
      product_id: "REP_PREMIUM_MENSUAL",
      entitlement_ids: ["premium"],
      purchased_at_ms: 1_760_000_000_000,
      expiration_at_ms: 1_762_592_000_000,
      environment: "SANDBOX",
      store: "PLAY_STORE",
      ...parcial,
    },
  });
}

const T = 1_760_000_000;

describe("autenticación", () => {
  test("acepta una firma HMAC válida", async () => {
    const cuerpo = sobreDeEvento();
    const r = await verificarFirma({
      cuerpoCrudo: cuerpo,
      cabeceraFirma: await firmar(cuerpo, T),
      secreto: SECRETO,
      ahoraSegundos: T + 10,
    });
    expect(r.ok).toBe(true);
  });

  test("rechaza una firma calculada con otro secreto", async () => {
    const cuerpo = sobreDeEvento();
    const r = await verificarFirma({
      cuerpoCrudo: cuerpo,
      cabeceraFirma: await firmar(cuerpo, T, "secreto-del-atacante"),
      secreto: SECRETO,
      ahoraSegundos: T + 10,
    });
    expect(r.ok).toBe(false);
  });

  test("rechaza si el cuerpo cambió después de firmarse", async () => {
    const cuerpo = sobreDeEvento();
    const cabecera = await firmar(cuerpo, T);
    // Un atacante intercepta y se auto-regala el plan del docente.
    const alterado = cuerpo.replace("REP_PREMIUM_MENSUAL", "DOC_PRO");

    const r = await verificarFirma({
      cuerpoCrudo: alterado,
      cabeceraFirma: cabecera,
      secreto: SECRETO,
      ahoraSegundos: T + 10,
    });
    expect(r.ok).toBe(false);
  });

  test("rechaza una firma vieja, fuera de la ventana anti-reenvío", async () => {
    const cuerpo = sobreDeEvento();
    const r = await verificarFirma({
      cuerpoCrudo: cuerpo,
      cabeceraFirma: await firmar(cuerpo, T),
      secreto: SECRETO,
      ahoraSegundos: T + 3600, // una hora después
    });
    expect(r.ok).toBe(false);
  });

  test("una re-serialización del JSON invalida la firma", async () => {
    const cuerpo = sobreDeEvento();
    const cabecera = await firmar(cuerpo, T);
    // Esto es lo que pasa si alguien hace JSON.parse -> JSON.stringify antes
    // de verificar. El contenido es el mismo; los bytes no.
    const reserializado = JSON.stringify(JSON.parse(cuerpo), null, 2);

    const r = await verificarFirma({
      cuerpoCrudo: reserializado,
      cabeceraFirma: cabecera,
      secreto: SECRETO,
      ahoraSegundos: T + 10,
    });
    expect(r.ok, "si esto pasa, el manejador está reparseando el cuerpo").toBe(false);
  });

  test("la cabecera compartida acepta el valor correcto y rechaza el resto", () => {
    expect(verificarCabeceraCompartida(SECRETO, SECRETO).ok).toBe(true);
    expect(verificarCabeceraCompartida("otra-cosa", SECRETO).ok).toBe(false);
    expect(verificarCabeceraCompartida(null, SECRETO).ok).toBe(false);
    // Sin secreto configurado en el servidor, nada entra: falla cerrado.
    expect(verificarCabeceraCompartida(SECRETO, "").ok).toBe(false);
  });

  test("si llega firma HMAC se exige la firma, aunque la cabecera sea correcta", async () => {
    const r = await autenticarPeticion({
      cuerpoCrudo: sobreDeEvento(),
      cabeceraAuth: SECRETO,
      cabeceraFirma: "t=1760000000,v1=firmafalsa",
      secreto: SECRETO,
      ahoraSegundos: T + 10,
    });
    expect(r.ok, "una firma inválida no debe poder eludirse mandando la cabecera").toBe(false);
  });
});

describe("lectura del evento", () => {
  test("lee un evento bien formado", () => {
    const r = leerEvento(JSON.parse(sobreDeEvento()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.evento.id).toBe("evt_0001");
    expect(r.evento.environment).toBe("SANDBOX");
  });

  test("rechaza un evento sin id, que es la clave de idempotencia", () => {
    const sobre = JSON.parse(sobreDeEvento());
    delete sobre.event.id;
    expect(leerEvento(sobre).ok).toBe(false);
  });

  test("rechaza un cuerpo sin objeto event", () => {
    expect(leerEvento({ api_version: "1.0" }).ok).toBe(false);
    expect(leerEvento(null).ok).toBe(false);
    expect(leerEvento("texto").ok).toBe(false);
  });
});

describe("interpretación", () => {
  test("todos los estados del mapeo existen en enums.ts", () => {
    // Regla 1: los estados no se escriben a mano. Si alguien inventa uno aquí,
    // el validador del esquema lo rechazaría en ejecución; esto lo detiene antes.
    for (const [tipo, estado] of Object.entries(ESTADO_POR_TIPO_EVENTO)) {
      expect(
        (ESTADO_SUSCRIPCION as readonly string[]).includes(estado),
        `El evento ${tipo} mapea a "${estado}", que no está en ESTADO_SUSCRIPCION`,
      ).toBe(true);
    }
  });

  test("una compra inicial activa la suscripción con su fecha de expiración", () => {
    const lectura = leerEvento(JSON.parse(sobreDeEvento()));
    if (!lectura.ok) throw new Error("no se leyó el evento");

    const i = interpretarEvento(lectura.evento);
    expect(i.efecto).toBe("ACTUALIZAR");
    if (i.efecto !== "ACTUALIZAR") return;

    expect(i.estado).toBe("ACTIVA");
    expect(i.renovacionAutomatica).toBe(true);
    expect(i.esSandbox).toBe(true);
    expect(i.expiraEn).toBe(1_762_592_000_000);
  });

  test("una cancelación apaga la renovación pero NO vence la suscripción", () => {
    const lectura = leerEvento(JSON.parse(sobreDeEvento({ type: "CANCELLATION" })));
    if (!lectura.ok) throw new Error("no se leyó el evento");

    const i = interpretarEvento(lectura.evento);
    if (i.efecto !== "ACTUALIZAR") throw new Error("debería actualizar");

    expect(i.estado).toBe("CANCELADA");
    expect(i.renovacionAutomatica).toBe(false);
    expect(i.estado, "cancelar no es vencer: el acceso sigue hasta expiraEn").not.toBe("VENCIDA");
  });

  test("un problema de cobro deja la suscripción en período de gracia", () => {
    const lectura = leerEvento(JSON.parse(sobreDeEvento({ type: "BILLING_ISSUE" })));
    if (!lectura.ok) throw new Error("no se leyó el evento");
    const i = interpretarEvento(lectura.evento);
    if (i.efecto !== "ACTUALIZAR") throw new Error("debería actualizar");
    expect(i.estado).toBe("EN_PERIODO_GRACIA");
  });

  test("los eventos sin efecto se ignoran sin romper nada", () => {
    for (const tipo of EVENTOS_SIN_EFECTO) {
      const lectura = leerEvento(JSON.parse(sobreDeEvento({ type: tipo })));
      if (!lectura.ok) throw new Error(`no se leyó el evento ${tipo}`);
      expect(interpretarEvento(lectura.evento).efecto, tipo).toBe("IGNORAR");
    }
  });

  test("un tipo de evento nuevo se marca DESCONOCIDO en vez de pasar en silencio", () => {
    const lectura = leerEvento(
      JSON.parse(sobreDeEvento({ type: "ALGO_QUE_INVENTEN_EN_2027" })),
    );
    if (!lectura.ok) throw new Error("no se leyó el evento");
    expect(interpretarEvento(lectura.evento).efecto).toBe("DESCONOCIDO");
  });
});

describe("acceso vigente — la regla que evita quitarle premium a quien ya pagó", () => {
  const ahora = new Date("2026-08-21T12:00:00Z").getTime();
  const futuro = new Date("2026-09-01T00:00:00Z").getTime();
  const pasado = new Date("2026-08-01T00:00:00Z").getTime();

  test("una suscripción cancelada conserva el acceso hasta que expira", () => {
    expect(tieneAccesoVigente({ estado: "ACTIVA", expiraEn: futuro }, ahora)).toBe(true);
    expect(tieneAccesoVigente({ estado: "EN_PERIODO_GRACIA", expiraEn: pasado }, ahora)).toBe(true);
    expect(
      tieneAccesoVigente({ estado: "CANCELADA", expiraEn: futuro }, ahora),
      "canceló la renovación, pero pagó hasta septiembre",
    ).toBe(true);
    expect(tieneAccesoVigente({ estado: "CANCELADA", expiraEn: pasado }, ahora)).toBe(false);
    expect(tieneAccesoVigente({ estado: "VENCIDA", expiraEn: futuro }, ahora)).toBe(false);
    expect(tieneAccesoVigente({ estado: "REEMBOLSADA", expiraEn: futuro }, ahora)).toBe(false);
  });
});
