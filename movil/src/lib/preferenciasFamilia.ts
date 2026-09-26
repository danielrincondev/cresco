/**
 * Preferencias de la app de la familia que viven en el teléfono, no en
 * Convex.
 *
 * ## Por qué local y no en el perfil del servidor
 *
 * `convex/schema.ts` es superficie compartida (ver `.github/CODEOWNERS`):
 * cambiarlo exige acuerdo de Daniel, Jere y Kenny, y a dos días de la entrega
 * ese acuerdo no está garantizado a tiempo. Además, mostrar u ocultar la
 * barra inferior no es un dato que el docente, otro dispositivo o el
 * servidor necesiten conocer — es una preferencia de cómo esta persona usa
 * *este* teléfono. Vive aquí, con la misma técnica que `registroPendiente.ts`
 * ya usa para datos locales por cuenta: `SecureStore` en el teléfono,
 * `localStorage` en web (no `sessionStorage` — esto tiene que sobrevivir a
 * cerrar la aplicación, no es un borrador de un formulario a medias).
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const clave = (perfilUsuarioId: string) => `cresco.barraInferior.${perfilUsuarioId}`;

/**
 * Sin preferencia guardada = cuenta que nunca la tocó = encendida.
 * Es el valor con el que llega toda cuenta nueva de representante.
 */
export async function leerBarraInferior(perfilUsuarioId: string): Promise<boolean> {
  const texto =
    Platform.OS === "web"
      ? localStorage.getItem(clave(perfilUsuarioId))
      : await SecureStore.getItemAsync(clave(perfilUsuarioId));
  return texto === null ? true : texto === "1";
}

export async function guardarBarraInferior(
  perfilUsuarioId: string,
  encendida: boolean,
): Promise<void> {
  const texto = encendida ? "1" : "0";
  if (Platform.OS === "web") localStorage.setItem(clave(perfilUsuarioId), texto);
  else await SecureStore.setItemAsync(clave(perfilUsuarioId), texto);
}
