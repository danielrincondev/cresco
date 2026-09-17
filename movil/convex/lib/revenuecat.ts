/**
 * Lógica del webhook de RevenueCat. Dueño: Persona C.
 *
 * Portado desde `servidor/lib/revenuecat.ts` (stack anterior). La lógica de
 * negocio no cambió — ya estaba probada — pero sí dos cosas del entorno:
 *
 *  1. `node:crypto` → **Web Crypto** (`crypto.subtle`). El runtime por defecto
 *     de las funciones de Convex no garantiza los módulos de Node, y Web Crypto
 *     es portable. Como `crypto.subtle` es asíncrono, `verificarFirma` y
 *     `autenticarPeticion` ahora devuelven promesas.
 *  2. `timingSafeEqual` no existe en Web Crypto, así que la comparación en
 *     tiempo constante va a mano (ver `igualesEnTiempoConstante`).
 *
 * Aquí no hay base de datos ni red: son funciones que reciben datos y devuelven
 * datos. Por eso se pueden probar sin levantar nada — ver `revenuecat.test.ts`.
 *
 * ADR-006: RevenueCat es la fuente de verdad de los pagos; `suscripcion` es una
 * proyección local y el webhook es lo único que la mueve.
 */

import { ESTADO_SUSCRIPCION, type EstadoSuscripcion } from "./enums";

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

/**
 * RevenueCat ofrece dos mecanismos y no son lo mismo:
 *
 *  1. Una **cabecera compartida** (`Authorization`) con un valor fijo definido
 *     en el panel. Es lo que declaraba `api/openapi.yaml`.
 *  2. Una **firma HMAC** en `X-RevenueCat-Webhook-Signature`, que además prueba
 *     que el cuerpo no fue alterado y permite rechazar reenvíos viejos.
 *
 * Se implementan las dos; si llega firma, manda la firma.
 */
export type ResultadoAuth = { ok: true; modo: "CABECERA" | "FIRMA" } | { ok: false; motivo: string };

/**
 * Compara sin filtrar información por el tiempo que tarda.
 *
 * Un `===` corta en el primer carácter distinto, así que quien pruebe muchas
 * veces puede deducir el secreto midiendo microsegundos. Es un ataque real y
 * evitarlo cuesta cinco líneas.
 */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  // La longitud sí es observable. No importa: la longitud no es el secreto.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifica la cabecera compartida configurada en el panel de RevenueCat. */
export function verificarCabeceraCompartida(
  valorRecibido: string | null,
  secretoEsperado: string,
): ResultadoAuth {
  if (!secretoEsperado) {
    return { ok: false, motivo: "REVENUECAT_WEBHOOK_SECRET no está configurado en el servidor" };
  }
  if (!valorRecibido) return { ok: false, motivo: "Falta la cabecera Authorization" };
  if (!igualesEnTiempoConstante(valorRecibido, secretoEsperado)) {
    return { ok: false, motivo: "La cabecera Authorization no coincide" };
  }
  return { ok: true, modo: "CABECERA" };
}

async function hmacSha256Hex(secreto: string, mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifica la firma HMAC.
 *
 * Formato: `t=<unix_segundos>,v1=<hmac_sha256_hex>`, calculado sobre la cadena
 * `${t}.${cuerpoCrudo}`.
 *
 * **`cuerpoCrudo` tiene que ser el cuerpo tal cual llegó**, byte por byte. Si
 * se parsea el JSON y se vuelve a serializar, cambian los bytes (espacios,
 * orden de claves, escapes) y la firma de un evento legítimo falla. Es el
 * error número uno al implementar esto, y hay una prueba que lo fija.
 */
export async function verificarFirma(opciones: {
  cuerpoCrudo: string;
  cabeceraFirma: string | null;
  secreto: string;
  /** Ventana anti-reenvío. 5 minutos, como recomienda RevenueCat. */
  toleranciaSegundos?: number;
  /** Inyectable para probar sin depender del reloj. */
  ahoraSegundos?: number;
}): Promise<ResultadoAuth> {
  const {
    cuerpoCrudo,
    cabeceraFirma,
    secreto,
    toleranciaSegundos = 300,
    ahoraSegundos = Math.floor(Date.now() / 1000),
  } = opciones;

  if (!secreto) {
    return { ok: false, motivo: "REVENUECAT_WEBHOOK_SECRET no está configurado en el servidor" };
  }
  if (!cabeceraFirma) {
    return { ok: false, motivo: "Falta la cabecera X-RevenueCat-Webhook-Signature" };
  }

  const partes = new Map<string, string>();
  for (const trozo of cabeceraFirma.split(",")) {
    const i = trozo.indexOf("=");
    if (i > 0) partes.set(trozo.slice(0, i).trim(), trozo.slice(i + 1).trim());
  }

  const t = partes.get("t");
  const v1 = partes.get("v1");
  if (!t || !v1) {
    return { ok: false, motivo: "La cabecera de firma no tiene el formato t=...,v1=..." };
  }

  const marca = Number(t);
  if (!Number.isFinite(marca)) {
    return { ok: false, motivo: "La marca de tiempo de la firma no es un número" };
  }
  if (Math.abs(ahoraSegundos - marca) > toleranciaSegundos) {
    /**
     * Rechaza reenvíos de un evento capturado hace rato. RevenueCat reintenta
     * hasta 80 minutos después, pero cada reintento se firma de nuevo con marca
     * fresca, así que esto no descarta reintentos legítimos.
     */
    return { ok: false, motivo: "La firma está fuera de la ventana de tolerancia" };
  }

  const esperado = await hmacSha256Hex(secreto, `${t}.${cuerpoCrudo}`);
  if (!igualesEnTiempoConstante(v1, esperado)) {
    return { ok: false, motivo: "La firma HMAC no coincide" };
  }
  return { ok: true, modo: "FIRMA" };
}

/** Si llega firma HMAC se exige la firma; si no, la cabecera compartida. */
export async function autenticarPeticion(opciones: {
  cuerpoCrudo: string;
  cabeceraAuth: string | null;
  cabeceraFirma: string | null;
  secreto: string;
  ahoraSegundos?: number;
}): Promise<ResultadoAuth> {
  if (opciones.cabeceraFirma) {
    return await verificarFirma({
      cuerpoCrudo: opciones.cuerpoCrudo,
      cabeceraFirma: opciones.cabeceraFirma,
      secreto: opciones.secreto,
      ahoraSegundos: opciones.ahoraSegundos,
    });
  }
  return verificarCabeceraCompartida(opciones.cabeceraAuth, opciones.secreto);
}

// ---------------------------------------------------------------------------
// Lectura del evento
// ---------------------------------------------------------------------------

/** Los campos que Cresco usa. RevenueCat envía bastantes más. */
export interface EventoRevenuecat {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  /** "SANDBOX" con el Test Store (ADR-008), "PRODUCTION" con una compra real. */
  environment?: string | null;
  store?: string | null;
  cancel_reason?: string | null;
}

export type LecturaEvento =
  | { ok: true; evento: EventoRevenuecat }
  | { ok: false; motivo: string };

export function leerEvento(cuerpo: unknown): LecturaEvento {
  if (typeof cuerpo !== "object" || cuerpo === null) {
    return { ok: false, motivo: "El cuerpo no es un objeto JSON" };
  }
  const crudo = (cuerpo as Record<string, unknown>).event;
  if (typeof crudo !== "object" || crudo === null) {
    return { ok: false, motivo: "Falta el objeto 'event'" };
  }
  const e = crudo as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.length === 0) {
    return { ok: false, motivo: "El evento no trae 'id', que es la clave de idempotencia" };
  }
  if (typeof e.type !== "string" || e.type.length === 0) {
    return { ok: false, motivo: "El evento no trae 'type'" };
  }
  if (typeof e.app_user_id !== "string" || e.app_user_id.length === 0) {
    return { ok: false, motivo: "El evento no trae 'app_user_id'" };
  }

  return {
    ok: true,
    evento: {
      id: e.id,
      type: e.type,
      app_user_id: e.app_user_id,
      product_id: typeof e.product_id === "string" ? e.product_id : null,
      entitlement_ids: Array.isArray(e.entitlement_ids)
        ? e.entitlement_ids.filter((x): x is string => typeof x === "string")
        : null,
      purchased_at_ms: typeof e.purchased_at_ms === "number" ? e.purchased_at_ms : null,
      expiration_at_ms: typeof e.expiration_at_ms === "number" ? e.expiration_at_ms : null,
      environment: typeof e.environment === "string" ? e.environment : null,
      store: typeof e.store === "string" ? e.store : null,
      cancel_reason: typeof e.cancel_reason === "string" ? e.cancel_reason : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Interpretación: qué le hace este evento a `suscripcion`
// ---------------------------------------------------------------------------

/**
 * Tipo de evento de RevenueCat → estado local de la suscripción.
 *
 * **OJO CON `CANCELLATION`.** En RevenueCat significa "el usuario apagó la
 * renovación automática", **no** "se acabó el acceso": la suscripción sigue
 * valiendo hasta `expiration_at_ms`. Por eso `CANCELADA` y `VENCIDA` son
 * estados distintos, y por eso el acceso se decide con `tieneAccesoVigente()`
 * y nunca mirando solo el estado. Tratar CANCELADA como "sin premium" le
 * quitaría a alguien lo que ya pagó.
 */
export const ESTADO_POR_TIPO_EVENTO: Readonly<Record<string, EstadoSuscripcion>> = {
  INITIAL_PURCHASE: "ACTIVA",
  RENEWAL: "ACTIVA",
  UNCANCELLATION: "ACTIVA",
  PRODUCT_CHANGE: "ACTIVA",
  SUBSCRIPTION_EXTENDED: "ACTIVA",
  NON_RENEWING_PURCHASE: "ACTIVA",
  REFUND_REVERSED: "ACTIVA",

  BILLING_ISSUE: "EN_PERIODO_GRACIA",

  CANCELLATION: "CANCELADA",
  SUBSCRIPTION_PAUSED: "CANCELADA",

  EXPIRATION: "VENCIDA",
};

/**
 * Eventos que se reciben, se guardan y se responden 200, pero **no mueven la
 * suscripción**. Listarlos explícitamente evita que un evento nuevo de
 * RevenueCat pase en silencio por un `default` y corrompa el estado.
 */
export const EVENTOS_SIN_EFECTO: ReadonlySet<string> = new Set([
  "TEST", "TRANSFER", "SUBSCRIBER_ALIAS", "INVOICE_ISSUANCE",
  "TEMPORARY_ENTITLEMENT_GRANT", "VIRTUAL_CURRENCY_TRANSACTION",
  "EXPERIMENT_ENROLLMENT", "PURCHASE_REDEEMED",
  "PRICE_INCREASE_CONSENT_REQUIRED", "PRICE_INCREASE_CONSENT_APPROVED",
  "PAYWALL_IMPRESSION", "PAYWALL_CLOSE", "PAYWALL_CANCEL",
  "PAYWALL_EXIT_OFFER", "PAYWALL_COMPONENT_INTERACTED",
]);

export type Interpretacion =
  | {
      efecto: "ACTUALIZAR";
      estado: EstadoSuscripcion;
      expiraEn: number | null;
      iniciaEn: number | null;
      renovacionAutomatica: boolean;
      productoId: string | null;
      esSandbox: boolean;
    }
  | { efecto: "IGNORAR"; motivo: string }
  | { efecto: "DESCONOCIDO"; motivo: string };

/**
 * Traduce un evento a lo que hay que escribir en `suscripcion`.
 *
 * Un tipo desconocido no se ignora en silencio: se marca `DESCONOCIDO` para que
 * el manejador lo guarde con su error y responda 200 igual. Responder un error
 * haría que RevenueCat reintente cinco veces algo que nunca va a funcionar, y
 * además perderíamos el evento.
 */
export function interpretarEvento(evento: EventoRevenuecat): Interpretacion {
  if (EVENTOS_SIN_EFECTO.has(evento.type)) {
    return { efecto: "IGNORAR", motivo: `El evento ${evento.type} no altera la suscripción` };
  }

  const estado = ESTADO_POR_TIPO_EVENTO[evento.type];
  if (!estado) {
    return { efecto: "DESCONOCIDO", motivo: `Tipo de evento no contemplado: ${evento.type}` };
  }

  return {
    efecto: "ACTUALIZAR",
    estado,
    expiraEn: evento.expiration_at_ms ?? null,
    iniciaEn: evento.purchased_at_ms ?? null,
    // Solo sigue renovándose lo que está vigente y no se canceló.
    renovacionAutomatica: estado === "ACTIVA",
    productoId: evento.product_id ?? null,
    esSandbox: evento.environment === "SANDBOX",
  };
}

/**
 * Prepara el payload para poder guardarlo en Convex.
 *
 * RevenueCat manda `subscriber_attributes` con claves reservadas suyas:
 * `$displayName`, `$email`, `$phoneNumber`. **Convex prohibe los nombres de
 * campo que empiezan por `$`**, asi que guardar el evento tal cual lanza
 * `Field name $displayName starts with a '$', which is reserved` y tumba la
 * transaccion entera -- el manejador devuelve 500 y RevenueCat reintenta cinco
 * veces antes de **descartar el cobro**.
 *
 * Se renombran a `_`: se conserva el dato y el nombre sigue siendo legible.
 * No se descartan porque el payload entero es la prueba de lo que llego, y
 * esa es la razon de guardarlo.
 */
export function sanearParaConvex(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanearParaConvex);
  if (valor === null || typeof valor !== "object") return valor;
  const limpio: Record<string, unknown> = {};
  for (const [clave, dentro] of Object.entries(valor as Record<string, unknown>)) {
    limpio[clave.startsWith("$") ? `_${clave.slice(1)}` : clave] = sanearParaConvex(dentro);
  }
  return limpio;
}

/**
 * Decide si hay acceso ahora mismo.
 *
 * Es la regla que impide el bug descrito arriba: una suscripción CANCELADA
 * sigue dando acceso hasta que expira. Vive aquí, y no repartida por las
 * pantallas, para que exista una sola versión de la verdad.
 *
 * **Quien construya D19 o P11 tiene que usar esta función**, no comparar el
 * estado a mano.
 */
export function tieneAccesoVigente(
  suscripcion: { estado: string; expiraEn: number | null | undefined },
  ahora: number = Date.now(),
): boolean {
  if (suscripcion.estado === "ACTIVA" || suscripcion.estado === "EN_PERIODO_GRACIA") return true;
  if (suscripcion.estado === "CANCELADA") {
    return suscripcion.expiraEn != null && suscripcion.expiraEn > ahora;
  }
  return false;
}

/** Comprobación de coherencia: todo estado del mapeo existe en `enums.ts`. */
export function estadosDelMapeoSonValidos(): boolean {
  return Object.values(ESTADO_POR_TIPO_EVENTO).every((e) =>
    (ESTADO_SUSCRIPCION as readonly string[]).includes(e),
  );
}
