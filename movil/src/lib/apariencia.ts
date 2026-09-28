import { Appearance, DevSettings, Platform } from "react-native";

import { guardarPreferenciaTema, preferenciaTema, type PreferenciaTema } from "../theme/modo";
import { Superficie } from "../theme/Theme";

/**
 * El tema de la aplicación en lo que Android pinta por su cuenta, y el cambio
 * de tema desde Ajustes (DP-014).
 *
 * Las pantallas ya salen con la paleta correcta (`theme/modo.ts`). Lo que no
 * pasa por ellas es nativo: la barra de navegación del sistema, el fondo que
 * asoma detrás de la app al abrirla o al mostrar el teclado, y los controles
 * del sistema. Para eso `app.json` deja el tema nativo en `"automatic"` y aquí
 * se le dice cuál usar: el que eligió la persona, no el del teléfono (salvo que
 * haya elegido justamente "como el teléfono").
 */
type EsquemaNativo = "light" | "dark" | "unspecified";

function esquemaNativo(preferencia: PreferenciaTema): EsquemaNativo {
  if (preferencia === "sistema") return "unspecified";
  return preferencia === "oscuro" ? "dark" : "light";
}

function fijarEsquemaNativo(esquema: EsquemaNativo): void {
  try {
    Appearance.setColorScheme?.(esquema);
  } catch {
    // En web no existe, y no hace falta.
  }
}

/**
 * Se llama una vez, al arrancar. Con "como el teléfono" no fuerza nada: lo
 * nativo sigue al sistema, que es lo que eligió la persona. Una build sin
 * `expo-system-ui` (anterior a la 1.1.0) no tiene el módulo, y se sigue igual.
 */
export function aplicarTemaNativo(): void {
  fijarEsquemaNativo(esquemaNativo(preferenciaTema));
  void import("expo-system-ui")
    .then((SystemUI) => SystemUI.setBackgroundColorAsync(Superficie.fondo))
    .catch(() => {});
}

/**
 * Guarda el tema elegido y **reinicia la aplicación**: los estilos de cada
 * pantalla se crean al cargar su módulo con la paleta que eligió `modo.ts` al
 * arrancar, así que la única forma segura de cambiarla es volver a arrancar.
 * La sesión de Clerk sobrevive al reinicio (vive en `SecureStore`), así que la
 * persona vuelve a entrar sin escribir nada.
 *
 * - En la build "General" reinicia `expo-updates`, que ya va dentro del APK
 *   porque es el que trae las actualizaciones por el aire.
 * - En la "Beta" (de desarrollo) `reloadAsync` no existe, y reinicia Metro.
 * - En web basta con recargar la página.
 *
 * Si nada de eso funciona, la preferencia ya quedó guardada: la pantalla le
 * pide a la persona que cierre y abra la aplicación.
 */
export type ResultadoCambioTema = "REINICIANDO" | "CIERRA_Y_ABRE" | "SIN_GUARDAR";

export async function cambiarTema(preferencia: PreferenciaTema): Promise<ResultadoCambioTema> {
  if (!guardarPreferenciaTema(preferencia)) return "SIN_GUARDAR";
  // Antes de reiniciar, y no después: el tema nativo que fuerza esta sesión
  // sobrevive a un reinicio del JavaScript, y con "como el teléfono" el
  // próximo arranque tiene que leer el del sistema, no el forzado.
  fijarEsquemaNativo(esquemaNativo(preferencia));
  if (Platform.OS === "web") {
    window.location.reload();
    return "REINICIANDO";
  }
  try {
    const Updates = await import("expo-updates");
    await Updates.reloadAsync();
    return "REINICIANDO";
  } catch {
    // Build de desarrollo: sigue abajo.
  }
  try {
    if (__DEV__) {
      DevSettings.reload();
      return "REINICIANDO";
    }
  } catch {
    // Sin forma de reiniciar desde aquí.
  }
  return "CIERRA_Y_ABRE";
}
