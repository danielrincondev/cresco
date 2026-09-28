import { DevSettings, Platform } from "react-native";

import { guardarModoOscuro } from "../theme/modo";

/**
 * Encender o apagar el modo oscuro desde Ajustes (DP-014).
 *
 * Guarda la preferencia y **reinicia la aplicación**: los estilos de cada
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
export type ResultadoCambioModo = "REINICIANDO" | "CIERRA_Y_ABRE" | "SIN_GUARDAR";

export async function cambiarModoOscuro(oscuro: boolean): Promise<ResultadoCambioModo> {
  if (!guardarModoOscuro(oscuro)) return "SIN_GUARDAR";
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
