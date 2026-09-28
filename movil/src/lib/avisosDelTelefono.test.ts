import { beforeEach, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  permiso: "undetermined" as string,
  respuestaAlPedir: "granted" as string,
  pedidos: 0,
  canales: [] as string[],
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("convex/react", () => ({ useMutation: () => async () => null }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0", extra: { eas: { projectId: "proyecto-eas" } } } },
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: async (id: string) => { estado.canales.push(id); },
  getPermissionsAsync: async () => ({ status: estado.permiso }),
  requestPermissionsAsync: async () => { estado.pedidos++; return { status: estado.respuestaAlPedir }; },
  getExpoPushTokenAsync: async ({ projectId }: { projectId: string }) =>
    ({ data: `ExponentPushToken[${projectId}]` }),
}));

const { idDelAviso, registrarTelefono } = await import("./avisosDelTelefono");

beforeEach(() => {
  estado.permiso = "undetermined";
  estado.respuestaAlPedir = "granted";
  estado.pedidos = 0;
  estado.canales = [];
});

it("pide permiso, obtiene el token del proyecto de EAS y lo registra", async () => {
  const registrar = vi.fn(async () => null);
  expect(await registrarTelefono(registrar)).toBe("REGISTRADO");
  expect(estado.canales).toEqual(["default"]);
  expect(registrar).toHaveBeenCalledWith({
    tokenPush: "ExponentPushToken[proyecto-eas]", plataforma: "ANDROID", versionApp: "1.0.0",
  });
});

it("si ya tenía permiso, no lo vuelve a pedir", async () => {
  estado.permiso = "granted";
  await registrarTelefono(vi.fn(async () => null));
  expect(estado.pedidos).toBe(0);
});

it("sin permiso no registra nada, y lo dice", async () => {
  estado.respuestaAlPedir = "denied";
  const registrar = vi.fn(async () => null);
  expect(await registrarTelefono(registrar)).toBe("SIN_PERMISO");
  expect(registrar).not.toHaveBeenCalled();
});

it("si el servidor falla, la app sigue: devuelve ERROR en vez de romperse", async () => {
  estado.permiso = "granted";
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await registrarTelefono(async () => { throw new Error("sin red"); })).toBe("ERROR");
  aviso.mockRestore();
});

it("lee el id de la notificación que viaja en el aviso, y nada más", () => {
  expect(idDelAviso({ notification: { request: { content: { data: { notificacionId: "n1" } } } } })).toBe("n1");
  expect(idDelAviso({ notification: { request: { content: { data: {} } } } })).toBeNull();
  expect(idDelAviso(null)).toBeNull();
});
