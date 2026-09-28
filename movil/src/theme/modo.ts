/**
 * Modo oscuro: la preferencia de este teléfono (DP-014).
 *
 * Se lee **una sola vez, al arrancar y de forma síncrona**, antes de que
 * ninguna pantalla cree sus estilos. Así `Theme.ts` exporta ya la paleta que
 * toca y ningún componente tiene que saber que existe otro modo: todos siguen
 * usando `Superficie.fondo`, `Texto.primario`, etc. Por lo mismo, cambiarla
 * reinicia la aplicación (`src/lib/apariencia.ts`): los estilos se crean al
 * cargar cada módulo y no se vuelven a calcular solos.
 *
 * Vive en el teléfono y no en Convex, por el mismo motivo que
 * `preferenciasFamilia.ts`: es cómo esta persona usa *este* teléfono. Y la
 * pantalla de inicio de sesión ya se pinta con ella, antes de saber quién es.
 *
 * ## Por qué `require` dentro de un `try`
 *
 * `Theme.ts` lo importan casi todas las pruebas de interfaz, y cargar el
 * `expo-secure-store` real fuera de Metro rompe: usa `__DEV__`, que solo
 * existe allí (ver el mock de `preferenciasFamilia` en `NucleoScreen.test`).
 * Aquí solo se carga dentro de React Native, y cualquier fallo —un teléfono
 * sin el módulo, un valor ilegible— deja el modo claro, que es el de siempre.
 * La lectura síncrona (`getItem`) existe en `expo-secure-store` 57, que ya va
 * dentro de las builds instaladas: esto llega por el aire, sin build nueva.
 */

const CLAVE = "cresco.modoOscuro";

type Almacen = {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
};

function almacen(): Almacen | null {
  try {
    if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
      return require("expo-secure-store") as Almacen;
    }
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Sin almacén no hay preferencia guardada: modo claro.
  }
  return null;
}

/** Lo que diga el almacén, o modo claro ante cualquier duda. */
export function leerModoOscuro(): boolean {
  try {
    return almacen()?.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

/** Si esta sesión de la aplicación se pinta en oscuro. Fijo hasta reiniciar. */
export const modoOscuro: boolean = leerModoOscuro();

/** Guarda la preferencia para el próximo arranque. Devuelve si se pudo. */
export function guardarModoOscuro(oscuro: boolean): boolean {
  try {
    const destino = almacen();
    if (destino === null) return false;
    destino.setItem(CLAVE, oscuro ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}
