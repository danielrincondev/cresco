import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";

export type SolicitudRegistro = FunctionArgs<
  typeof api.nucleo.canjearInvitacion
>;
const clave = (usuarioId: string) => `cresco.registro.${usuarioId}`;
export async function guardarRegistro(
  usuarioId: string,
  solicitud: SolicitudRegistro,
) {
  const texto = JSON.stringify(solicitud);
  if (Platform.OS === "web") sessionStorage.setItem(clave(usuarioId), texto);
  else await SecureStore.setItemAsync(clave(usuarioId), texto);
}
export async function recuperarRegistro(
  usuarioId: string,
): Promise<SolicitudRegistro | null> {
  const texto =
    Platform.OS === "web"
      ? sessionStorage.getItem(clave(usuarioId))
      : await SecureStore.getItemAsync(clave(usuarioId));
  return texto ? JSON.parse(texto) : null;
}
export async function borrarRegistro(usuarioId: string) {
  if (Platform.OS === "web") sessionStorage.removeItem(clave(usuarioId));
  else await SecureStore.deleteItemAsync(clave(usuarioId));
}
