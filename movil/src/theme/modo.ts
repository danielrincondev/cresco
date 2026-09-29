/**
 * El tema de la aplicación: la preferencia de este teléfono (DP-014).
 *
 * Tres opciones: **claro** (el de siempre, y el valor por defecto),
 * **oscuro**, y **como el teléfono**, que sigue el modo oscuro del sistema.
 *
 * Se lee **una sola vez, al arrancar y de forma síncrona**, antes de que
 * ninguna pantalla cree sus estilos. Así `Theme.ts` exporta ya la paleta que
 * toca y ningún componente tiene que saber que existe otro modo: todos siguen
 * usando `Superficie.fondo`, `Texto.primario`, etc. Por lo mismo, cambiarla
 * reinicia la aplicación (`src/lib/apariencia.ts`): los estilos se crean al
 * cargar cada módulo y no se vuelven a calcular solos. Con "como el teléfono",
 * un cambio del sistema con la app abierta se aplica la próxima vez que se
 * abra: reiniciarla sola podría borrarle a alguien un reporte a medio escribir.
 *
 * Vive en el teléfono y no en Convex, por el mismo motivo que
 * `preferenciasFamilia.ts`: es cómo esta persona usa *este* teléfono. Y la
 * pantalla de inicio de sesión ya se pinta con ella, antes de saber quién es.
 *
 * ## Por qué `require` dentro de un `try`
 *
 * `Theme.ts` lo importan casi todas las pruebas de interfaz, y cargar el
 * `expo-secure-store` real (o `react-native`) fuera de Metro rompe: usa
 * `__DEV__`, que solo existe allí (ver el mock de `preferenciasFamilia` en
 * `NucleoScreen.test`). Aquí solo se cargan dentro de React Native, y
 * cualquier fallo deja el modo claro, que es el de siempre.
 */

export type PreferenciaTema = "claro" | "oscuro" | "sistema";

const CLAVE = "cresco.tema";
/** La del 28 de septiembre, cuando solo había un interruptor: "1" era oscuro. */
const CLAVE_ANTERIOR = "cresco.modoOscuro";

type Almacen = {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
};

const enReactNative = () =>
  typeof navigator !== "undefined" && navigator.product === "ReactNative";

function almacen(): Almacen | null {
  try {
    if (enReactNative()) return require("expo-secure-store") as Almacen;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Sin almacén no hay preferencia guardada: modo claro.
  }
  return null;
}

/** Lo que diga el almacén, o el modo claro ante cualquier duda. */
export function leerPreferenciaTema(): PreferenciaTema {
  try {
    const origen = almacen();
    const valor = origen?.getItem(CLAVE);
    if (valor === "claro" || valor === "oscuro" || valor === "sistema") return valor;
    return origen?.getItem(CLAVE_ANTERIOR) === "1" ? "oscuro" : "claro";
  } catch {
    return "claro";
  }
}

/** El modo del sistema en este momento, si se puede saber. */
export function esquemaDelSistema(): "light" | "dark" | null {
  try {
    if (enReactNative()) {
      const { Appearance } = require("react-native") as typeof import("react-native");
      const esquema = Appearance.getColorScheme();
      return esquema === "dark" || esquema === "light" ? esquema : null;
    }
    if (typeof matchMedia !== "undefined") {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    // Sin forma de preguntarle al sistema: "como el teléfono" queda en claro.
  }
  return null;
}

export function resolverModoOscuro(
  preferencia: PreferenciaTema,
  sistema: "light" | "dark" | null,
): boolean {
  return preferencia === "oscuro" || (preferencia === "sistema" && sistema === "dark");
}

/** Lo que eligió la persona. Fijo hasta reiniciar. */
export const preferenciaTema: PreferenciaTema = leerPreferenciaTema();

/** Si esta sesión de la aplicación se pinta en oscuro. Fijo hasta reiniciar. */
export const modoOscuro: boolean = resolverModoOscuro(
  preferenciaTema,
  preferenciaTema === "sistema" ? esquemaDelSistema() : null,
);

/** Guarda la preferencia para el próximo arranque. Devuelve si se pudo. */
export function guardarPreferenciaTema(preferencia: PreferenciaTema): boolean {
  try {
    const destino = almacen();
    if (destino === null) return false;
    destino.setItem(CLAVE, preferencia);
    return true;
  } catch {
    return false;
  }
}
