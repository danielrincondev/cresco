/// <reference types="vite/client" />

import React from "react";
import { expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  suscripcion: undefined as unknown,
  planes: [] as unknown[],
  paquetes: [] as { identificador: string; productoId: string; precio: string; titulo: string }[],
  motivoSinCompras: null as string | null,
  comprados: [] as string[],
}));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

// Theme.ts no lleva mock: son constantes, y comparar contra el mismo token
// que usa el componente evita fijar el hex a mano en la prueba.
const { Marca } = await import("../theme/Theme");
vi.mock("../lib/compras", () => ({
  prepararCompras: async () => estado.motivoSinCompras,
  paquetesDisponibles: async () => estado.paquetes,
  comprar: async (id: string) => { estado.comprados.push(id); return { estado: "COMPRADA" }; },
  restaurarCompras: async () => ({ estado: "COMPRADA" }),
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    if (nombre === "suscripciones:miSuscripcion") return estado.suscripcion;
    // El perfil es lo que el SDK usa como `appUserID`.
    if (nombre === "nucleo:obtenerPerfil") return { perfilUsuarioId: "perfil-1" };
    return estado.planes;
  },
}));

// La pantalla ahora tiene un efecto (preparar el SDK), asi que React exige
// declarar el entorno de `act`. Sin esto fallan hasta las pruebas que no lo
// usan.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { PaywallDocente, PaywallRepresentante } = await import("./PaywallScreen");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

const gratuito = {
  plan: { codigo: "REP_FREE", nombre: "Gratuito", audiencia: "REPRESENTANTE",
    periodicidad: "MENSUAL", sinPublicidad: false,
    limites: { reportesPrevios: 1, exportarPdf: "CON_ANUNCIO" }, productoGooglePlay: null },
  estado: "SIN_SUSCRIPCION", expiraEn: null, renovacionAutomatica: false, acceso: false,
};

/**
 * ADR-006: el precio lo pone RevenueCat en el dispositivo. Un numero escrito
 * en esta pantalla seria una segunda fuente de verdad que ademas no se
 * actualiza sin desplegar la aplicacion.
 */
it("no escribe ningun precio en la pantalla", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [{
    codigo: "REP_PRO", nombre: "Sin anuncios", audiencia: "REPRESENTANTE",
    periodicidad: "MENSUAL", sinPublicidad: true,
    limites: { reportesPrevios: 12, exportarPdf: "LIBRE" },
    productoGooglePlay: "rep_pro_mensual", entitlement: "sin_anuncios",
  }];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).not.toMatch(/\$|USD|\d+[,.]\d{2}/);
  expect(t).toContain("fase MVP");
});

/**
 * Un boton de comprar que no cobra entrena a la persona a no creerle a la
 * pantalla. Mientras el SDK no este integrado (#13), no hay boton.
 */
it("no finge un boton de compra mientras la compra no exista", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).not.toContain("Comprar");
  expect(t).not.toContain("Suscribirme");
});

/**
 * Una cancelada sigue dando acceso hasta que expira. Decirle "estas en el
 * gratuito" a quien pago hasta fin de mes seria quitarle lo que ya pago.
 */
it("una suscripcion cancelada pero vigente se lee como acceso, con su fecha", () => {
  estado.suscripcion = {
    representante: {
      plan: { codigo: "REP_PRO", nombre: "Sin anuncios", audiencia: "REPRESENTANTE",
        periodicidad: "MENSUAL", sinPublicidad: true,
        limites: { reportesPrevios: 12 }, productoGooglePlay: null },
      estado: "CANCELADA",
      expiraEn: Date.parse("2026-10-01T15:00:00Z"),
      renovacionAutomatica: false, acceso: true,
    },
    docente: null,
  };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).toContain("sigues teniendo acceso hasta");
  expect(t).toContain("jueves 1 de octubre");
});

/** Quien no es docente no ve un muro de pago de docente. */
it("no ensena el paywall de un rol que la persona no tiene", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  expect(texto(pintar(<PaywallDocente />))).toContain("Esta sección no es para tu cuenta");
});

it("traduce los limites del plan a frases, no a nombres de campo", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).toContain("Solo el reporte más reciente");
  expect(t).not.toContain("reportesPrevios");
});

/**
 * El guardia contra la deriva entre la pantalla y la semilla.
 *
 * `limitesLegibles` mira las claves de `plan.limites` por nombre. La primera
 * version leia `limites.cursos` y `convex/semillas.ts` escribe
 * `cursosActivos`: el plan del docente se pintaba **sin un solo limite**, como
 * si no tuviera ninguno. No es un error visible en una captura; se descubre
 * cuando alguien pregunta por que su plan no dice nada.
 *
 * Esta prueba lee el archivo de semillas como texto y exige que cada clave que
 * siembra la sepa pintar la pantalla. Si mañana se añade un limite nuevo y
 * nadie toca el paywall, esto se rompe aqui y no en el telefono de una madre.
 */
it("la pantalla sabe pintar todas las claves de limite que siembra el backend", async () => {
  const fuente = (await import("../../convex/semillas.ts?raw")).default as string;

  const claves = new Set<string>();
  for (const bloque of fuente.matchAll(/limites:\s*\{([^}]*)\}/g)) {
    for (const clave of bloque[1].matchAll(/(\w+)\s*:/g)) claves.add(clave[1]);
  }

  // Si esto sale vacio, el regex dejo de encontrar los planes y la prueba
  // estaria pasando por no comprobar nada.
  expect(claves.size).toBeGreaterThan(2);

  const conocidas = new Set([
    "reportesPrevios",
    "cursosActivos",
    "estudiantesPorCurso",
    "exportarPdf",
  ]);
  expect([...claves].filter((c) => !conocidas.has(c))).toEqual([]);
});

it("pinta los limites del plan del docente, que antes salian en blanco", () => {
  estado.suscripcion = {
    representante: null,
    docente: {
      // La forma exacta que siembra `semillas.ts` para DOC_FREE.
      plan: { codigo: "DOC_FREE", nombre: "Docente — Gratuito", audiencia: "DOCENTE",
        periodicidad: "PERPETUO", sinPublicidad: false,
        limites: { cursosActivos: 1, estudiantesPorCurso: 40 }, productoGooglePlay: null },
      estado: "SIN_SUSCRIPCION", expiraEn: null, renovacionAutomatica: false, acceso: false,
    },
  };
  estado.planes = [];
  const t = texto(pintar(<PaywallDocente />));
  expect(t).toContain("Un curso a la vez");
  expect(t).toContain("Hasta 40 estudiantes por curso");
});

/* ---------- La compra de verdad ---------- */

const PLAN_PREMIUM = {
  codigo: "REP_PREMIUM_MENSUAL", nombre: "Premium mensual", audiencia: "REPRESENTANTE",
  periodicidad: "MENSUAL", sinPublicidad: true,
  limites: { reportesPrevios: 7 }, productoGooglePlay: "REP_PREMIUM_MENSUAL",
  entitlement: "premium",
};

/**
 * Sin SDK configurado no hay paquetes, y entonces **no hay boton**: nunca se
 * ofrece comprar algo que no se puede cobrar. La app sigue funcionando igual
 * que antes de integrar el SDK.
 */
it("sin paquetes no ofrece comprar, y lo dice", async () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [PLAN_PREMIUM];
  estado.paquetes = [];
  estado.motivoSinCompras = "SIN_CLAVE";

  const v = pintar(<PaywallRepresentante />);
  await act(async () => {});
  const t = texto(v);
  expect(t).toContain("fase MVP");
  expect(t).not.toContain("Suscribirme");
});

/**
 * ADR-006: el precio lo pone RevenueCat en la moneda de la persona. La
 * pantalla lo muestra tal cual llega, sin formatearlo ni traducirlo -- ni
 * siquiera para quitarle el símbolo de moneda y ponerlo aparte.
 */
it("con paquete, el chip de precio lleva el precio que puso RevenueCat", async () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [PLAN_PREMIUM];
  estado.motivoSinCompras = null;
  estado.paquetes = [{
    identificador: "$rc_monthly", productoId: "REP_PREMIUM_MENSUAL",
    precio: "US$1.99", titulo: "Premium mensual",
  }];

  const v = pintar(<PaywallRepresentante />);
  await act(async () => {});
  expect(texto(v)).toContain("US$1.99");
});

/**
 * Hasta el 26 de septiembre todo lo que no era ANUAL decía "Cobro mensual.",
 * así que el plan bimestral del representante (H3: $2.99 cada dos meses)
 * mentía sobre su propio ciclo de cobro.
 */
it("el plan bimestral no dice que cobra cada mes", async () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [{
    ...PLAN_PREMIUM, codigo: "REP_PREMIUM_BIMESTRAL", periodicidad: "BIMESTRAL",
  }];

  const v = pintar(<PaywallRepresentante />);
  await act(async () => {});
  const t = texto(v);
  expect(t).toContain("Cobro cada dos meses.");
  expect(t).not.toContain("Cobro mensual.");
});

/**
 * El chip de precio es a la vez el único elemento accionable de la tarjeta,
 * así que necesita su propio feedback táctil -- el mismo tono claro de marca
 * que usa el resto del sistema para "esto se está tocando".
 */
it("el chip de precio se tiñe de azul claro al presionarlo", async () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [PLAN_PREMIUM];
  estado.motivoSinCompras = null;
  estado.paquetes = [{
    identificador: "$rc_monthly", productoId: "REP_PREMIUM_MENSUAL",
    precio: "US$1.99", titulo: "Premium mensual",
  }];

  const v = pintar(<PaywallRepresentante />);
  await act(async () => {});
  const chip = v.root.findAll((n) =>
    typeof n.props.accessibilityLabel === "string" &&
    n.props.accessibilityLabel.startsWith("Suscribirme a"))[0];

  const enReposo = [chip.props.style({ pressed: false })].flat(Infinity);
  const presionado = [chip.props.style({ pressed: true })].flat(Infinity);

  const conFondoClaro = (estilos: unknown[]) =>
    estilos.some((s) => !!s && (s as { backgroundColor?: string }).backgroundColor === Marca.claro);
  expect(conFondoClaro(enReposo)).toBe(false);
  expect(conFondoClaro(presionado)).toBe(true);
});

/**
 * La compra no escribe la suscripcion: eso lo hace el webhook cuando
 * RevenueCat avisa del cobro. Si la pantalla lo escribiera habria dos fuentes
 * de verdad y una se equivocaria.
 */
it("al comprar avisa de que el plan se activa solo, sin prometer acceso inmediato", async () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [PLAN_PREMIUM];
  estado.motivoSinCompras = null;
  estado.comprados = [];
  estado.paquetes = [{
    identificador: "$rc_monthly", productoId: "REP_PREMIUM_MENSUAL",
    precio: "US$1.99", titulo: "Premium mensual",
  }];

  const v = pintar(<PaywallRepresentante />);
  await act(async () => {});
  // El precio ES el botón de compra ahora: no hay un "Suscribirme por..." de
  // texto plano, así que se busca por la etiqueta de accesibilidad, que sigue
  // diciendo qué hace y por cuánto -- un lector de pantalla no ve el chip.
  const boton = v.root.findAll((n) =>
    typeof n.props.accessibilityLabel === "string" &&
    n.props.accessibilityLabel.startsWith("Suscribirme a"))[0];
  await act(async () => { boton.props.onPress(); });

  expect(estado.comprados).toEqual(["$rc_monthly"]);
  expect(texto(v)).toContain("se activa en unos segundos");
});
