import { useMutation } from "convex/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { api } from "../../convex/_generated/api";

/**
 * Los avisos en el teléfono, del lado de la app: registrar el teléfono y
 * reaccionar cuando la persona toca un aviso del sistema.
 *
 * Hasta el 27 de septiembre esto no existía: el servidor enviaba bien
 * (`convex/push.ts`), pero ningún teléfono estaba registrado, así que todo
 * quedaba en la campana. Es lo que pide `docs/04-guias/contrato-push.md`: al
 * iniciar sesión, permiso → token de Expo → `registrarDispositivo`.
 *
 * `expo-notifications` es nativo y se carga con `import()`, como los SDKs de
 * los anuncios: una build anterior a la que lo trae sigue funcionando, solo
 * que sin avisos en el teléfono.
 */

type Notificaciones = typeof import("expo-notifications");

async function modulo(): Promise<Notificaciones | null> {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

export type ResultadoRegistro = "REGISTRADO" | "SIN_PERMISO" | "SIN_MODULO" | "ERROR";

/**
 * El último intento de registro, para mostrarlo en Ajustes. Sin esto, un
 * fallo solo quedaba en la consola, que en una build instalada no ve nadie
 * (así pasó el 28 de septiembre: permiso aceptado, Firebase dentro del APK, y
 * ningún registro en el servidor, sin forma de saber por qué).
 */
export type EstadoAvisos = { resultado: ResultadoRegistro | "PENDIENTE"; detalle?: string };
let estadoActual: EstadoAvisos = { resultado: "PENDIENTE" };
const oyentes = new Set<() => void>();
function fijarEstado(estado: EstadoAvisos): void {
  estadoActual = estado;
  for (const oyente of oyentes) oyente();
}
export const estadoDeAvisos = (): EstadoAvisos => estadoActual;
export function useEstadoAvisos(): EstadoAvisos {
  return useSyncExternalStore(
    (oyente) => { oyentes.add(oyente); return () => { oyentes.delete(oyente); }; },
    estadoDeAvisos,
  );
}

type Registrar = (args: {
  tokenPush: string;
  plataforma: "ANDROID" | "IOS";
  versionApp?: string;
}) => Promise<unknown>;

/**
 * Pide permiso (solo si todavía no lo tiene), obtiene el token de Expo y lo
 * registra en Convex. Si ese token ya estaba a nombre de otra persona —un
 * teléfono compartido—, `registrarDispositivo` lo pasa a quien inició sesión.
 * Un fallo no se le muestra a nadie: la app funciona igual, con la campana.
 */
export async function registrarTelefono(registrar: Registrar): Promise<ResultadoRegistro> {
  const estado = await intentarRegistro(registrar);
  fijarEstado(estado);
  return estado.resultado as ResultadoRegistro;
}

async function intentarRegistro(registrar: Registrar): Promise<EstadoAvisos> {
  const N = await modulo();
  if (N === null) return { resultado: "SIN_MODULO" };
  let paso = "preparar el canal de avisos";
  try {
    if (Platform.OS === "android") {
      // Android 8+ agrupa los avisos por canal; sin uno propio caen en uno
      // genérico que no aparece arriba de la pantalla.
      await N.setNotificationChannelAsync("default", {
        name: "Avisos de Cresco",
        importance: N.AndroidImportance.HIGH,
      });
    }
    paso = "pedir el permiso";
    let { status } = await N.getPermissionsAsync();
    if (status !== "granted") ({ status } = await N.requestPermissionsAsync());
    if (status !== "granted") return { resultado: "SIN_PERMISO" };

    const Constants = (await import("expo-constants")).default;
    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      Constants.easConfig?.projectId;
    paso = "obtener el token de Expo";
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    paso = "guardarlo en el servidor";
    await registrar({
      tokenPush: data,
      plataforma: Platform.OS === "ios" ? "IOS" : "ANDROID",
      versionApp: Constants.expoConfig?.version,
    });
    return { resultado: "REGISTRADO" };
  } catch (error) {
    console.warn("[avisos] no se pudo registrar el teléfono:", error);
    const motivo = error instanceof Error ? error.message : String(error);
    return { resultado: "ERROR", detalle: `Al ${paso}: ${motivo}` };
  }
}

/** El id de la notificación de Cresco que viaja en el aviso (`push.ts` lo manda en `data`). */
export function idDelAviso(respuesta: unknown): string | null {
  const data = (respuesta as { notification?: { request?: { content?: { data?: unknown } } } })
    ?.notification?.request?.content?.data as { notificacionId?: unknown } | undefined;
  return typeof data?.notificacionId === "string" ? data.notificacionId : null;
}

/**
 * Registra el teléfono en cuanto hay perfil, y avisa con el id de la
 * notificación cuando se toca un aviso del sistema, también el que abrió la
 * app estando cerrada. Quien lo usa decide a dónde ir, igual que al tocar
 * un aviso en la campana.
 */
export function useAvisosDelTelefono(
  perfilUsuarioId: string | undefined,
  alTocar: (notificacionId: string) => void,
) {
  const registrar = useMutation(api.interaccion.registrarDispositivo);
  const ultimoRegistrar = useRef(registrar);
  ultimoRegistrar.current = registrar;
  const ultimoAlTocar = useRef(alTocar);
  ultimoAlTocar.current = alTocar;

  useEffect(() => {
    if (!perfilUsuarioId) return;
    void registrarTelefono((args) => ultimoRegistrar.current(args));
  }, [perfilUsuarioId]);

  useEffect(() => {
    let vivo = true;
    let quitar: (() => void) | undefined;
    void modulo().then(async (N) => {
      if (N === null || !vivo) return;
      // Con la app abierta el aviso también se ve, sin sonido: la campana ya
      // cuenta la novedad, esto solo la hace visible.
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      const suscripcion = N.addNotificationResponseReceivedListener((respuesta) => {
        const id = idDelAviso(respuesta);
        if (id) ultimoAlTocar.current(id);
      });
      quitar = () => suscripcion.remove();
      const inicial = await N.getLastNotificationResponseAsync();
      const id = inicial ? idDelAviso(inicial) : null;
      if (id && vivo) ultimoAlTocar.current(id);
    });
    return () => {
      vivo = false;
      quitar?.();
    };
  }, []);
}
