/**
 * La mitad de RevenueCat que faltaba: el SDK en el teléfono.
 *
 * Hasta ahora el proyecto tenía el lado del servidor —el webhook, la tabla
 * `suscripcion`, `miSuscripcion`— y **ninguna forma de comprar**. Los muros de
 * pago enseñaban los planes y avisaban de que la compra no estaba disponible.
 * Esto es lo que la hace posible.
 *
 * ## Por qué el `appUserID` es el perfil de Convex
 *
 * El webhook resuelve a quién pertenece un evento con
 * `ctx.db.get(evento.app_user_id)`, tratándolo como un `Id<"perfilUsuario">`.
 * Si el SDK usara su identificador anónimo, **ningún pago se aplicaría jamás**:
 * el evento llegaría, se guardaría, y fallaría al buscar el perfil. Es el
 * contrato entre las dos mitades y por eso vive aquí arriba, escrito.
 *
 * ## Por qué todo esto es opcional
 *
 * Sin `EXPO_PUBLIC_REVENUECAT_API_KEY` el módulo no configura nada y todas sus
 * funciones responden "no disponible". La aplicación sigue funcionando igual
 * que antes: los planes se ven, la compra avisa de que todavía no está. Así el
 * proyecto no queda bloqueado esperando una clave, y nadie se encuentra la app
 * rota porque falte una variable.
 *
 * ## Y por qué no funciona en Expo Go
 *
 * `react-native-purchases` es un módulo **nativo**. Necesita una build de
 * desarrollo o `preview`; en Expo Go no existe. El módulo lo detecta y lo dice
 * en vez de reventar al arrancar.
 */

import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

const claveApi = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

/** Motivo por el que las compras no están disponibles, o `null` si lo están. */
export type MotivoSinCompras = "SIN_CLAVE" | "SIN_MODULO_NATIVO";

let configurado = false;
let motivo: MotivoSinCompras | null = null;

/**
 * Se carga el SDK solo cuando hace falta.
 *
 * Un `import` normal ejecutaría el módulo nativo al arrancar la aplicación, y
 * en Expo Go eso es un fallo en la primera pantalla. Cargándolo aquí, quien no
 * abre un muro de pago nunca lo toca.
 */
async function sdk() {
  try {
    return (await import("react-native-purchases")).default;
  } catch {
    motivo = "SIN_MODULO_NATIVO";
    return null;
  }
}

/**
 * Deja el SDK listo y **atado al perfil de Convex**.
 *
 * Idempotente: llamarla en cada montaje de un paywall no reconfigura nada.
 */
export async function prepararCompras(
  perfilUsuarioId: string,
): Promise<MotivoSinCompras | null> {
  if (!claveApi) return (motivo = "SIN_CLAVE");
  if (configurado) return motivo;

  const Purchases = await sdk();
  if (!Purchases) return motivo;

  Purchases.configure({ apiKey: claveApi, appUserID: perfilUsuarioId });
  configurado = true;
  motivo = null;
  return null;
}

/**
 * Los paquetes comprables de una oferta, con **el precio que pone RevenueCat**.
 *
 * ADR-006: el precio nunca se escribe en la aplicación ni viaja desde Convex.
 * `precio` llega ya formateado en la moneda del país de la persona.
 */
export type PaqueteComprable = {
  identificador: string;
  productoId: string;
  precio: string;
  titulo: string;
};

export async function paquetesDisponibles(): Promise<PaqueteComprable[]> {
  const Purchases = await sdk();
  if (!Purchases || !configurado) return [];

  const ofertas = await Purchases.getOfferings();
  const actual: PurchasesOffering | null = ofertas.current;
  if (!actual) return [];

  return actual.availablePackages.map((p: PurchasesPackage) => ({
    identificador: p.identifier,
    productoId: p.product.identifier,
    precio: p.product.priceString,
    titulo: p.product.title,
  }));
}

/** Lo que puede pasar al intentar comprar, dicho como lo entiende la pantalla. */
export type ResultadoCompra =
  | { estado: "COMPRADA" }
  | { estado: "CANCELADA" }
  | { estado: "NO_DISPONIBLE"; motivo: MotivoSinCompras }
  | { estado: "ERROR"; mensaje: string };

/**
 * Lanza la compra de un paquete.
 *
 * **No toca la base de datos.** El acceso lo concede el webhook cuando
 * RevenueCat avisa del cobro (ADR-006): si esta función escribiera la
 * suscripción, habría dos fuentes de verdad y una de ellas se equivocaría.
 * Que el usuario cancele no es un error y se distingue como tal, porque
 * enseñarle un mensaje rojo a quien decidió no comprar es maltratarlo.
 */
export async function comprar(identificador: string): Promise<ResultadoCompra> {
  const Purchases = await sdk();
  if (!Purchases || !configurado) {
    return { estado: "NO_DISPONIBLE", motivo: motivo ?? "SIN_CLAVE" };
  }

  try {
    const ofertas = await Purchases.getOfferings();
    const paquete = ofertas.current?.availablePackages.find(
      (p: PurchasesPackage) => p.identifier === identificador,
    );
    if (!paquete) return { estado: "ERROR", mensaje: "Ese plan ya no está disponible." };

    await Purchases.purchasePackage(paquete);
    return { estado: "COMPRADA" };
  } catch (error) {
    const e = error as { userCancelled?: boolean; message?: string };
    if (e.userCancelled) return { estado: "CANCELADA" };
    return { estado: "ERROR", mensaje: e.message ?? "No se pudo completar la compra." };
  }
}

/**
 * Vuelve a aplicar compras hechas antes, por ejemplo tras reinstalar.
 *
 * Google Play lo exige para las aplicaciones con suscripción, y sin esto una
 * persona que cambia de teléfono pierde lo que pagó.
 */
export async function restaurarCompras(): Promise<ResultadoCompra> {
  const Purchases = await sdk();
  if (!Purchases || !configurado) {
    return { estado: "NO_DISPONIBLE", motivo: motivo ?? "SIN_CLAVE" };
  }
  try {
    await Purchases.restorePurchases();
    return { estado: "COMPRADA" };
  } catch (error) {
    const e = error as { message?: string };
    return { estado: "ERROR", mensaje: e.message ?? "No se pudo restaurar." };
  }
}
