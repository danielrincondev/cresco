import { useAuth } from "@clerk/expo";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Registra la sesión y vuelve a intentarlo al completar el perfil o recuperar conexión. */
export function useAuditoriaSesion(perfilId: Id<"perfilUsuario"> | null | undefined) {
  const { sessionId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const registrarInicioSesion = useMutation(api.auditoria.registrarInicioSesion);

  useEffect(() => {
    if (!isAuthenticated || !sessionId || perfilId === undefined) return;
    let cancelada = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let espera = 1_000;
    async function registrar(): Promise<void> {
      try {
        await registrarInicioSesion({
          plataforma: Platform.OS === "android" ? "ANDROID" : Platform.OS === "ios" ? "IOS" : "WEB",
        });
        // SIN_PERFIL se reintenta cuando cambie perfilId; YA_REGISTRADO es éxito.
      } catch {
        if (!cancelada) {
          temporizador = setTimeout(() => void registrar(), espera);
          espera = Math.min(espera * 2, 60_000);
        }
      }
    }
    void registrar();
    return () => {
      cancelada = true;
      clearTimeout(temporizador);
    };
  }, [isAuthenticated, sessionId, perfilId, registrarInicioSesion]);
}
