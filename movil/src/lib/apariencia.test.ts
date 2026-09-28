import { afterEach, beforeEach, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  os: "android",
  guardado: true,
  reloadFalla: false,
  reinicios: 0,
  reiniciosMetro: 0,
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return estado.os;
    },
  },
  DevSettings: {
    reload: () => {
      estado.reiniciosMetro++;
    },
  },
}));
vi.mock("../theme/modo", () => ({ guardarModoOscuro: () => estado.guardado }));
vi.mock("expo-updates", () => ({
  reloadAsync: async () => {
    if (estado.reloadFalla) throw new Error("reloadAsync no está disponible en desarrollo");
    estado.reinicios++;
  },
}));

const { cambiarModoOscuro } = await import("./apariencia");

beforeEach(() => {
  Object.assign(estado, { os: "android", guardado: true, reloadFalla: false, reinicios: 0, reiniciosMetro: 0 });
  vi.stubGlobal("__DEV__", false);
});
afterEach(() => vi.unstubAllGlobals());

it("si no se pudo guardar la preferencia, no reinicia nada", async () => {
  estado.guardado = false;
  expect(await cambiarModoOscuro(true)).toBe("SIN_GUARDAR");
  expect(estado.reinicios + estado.reiniciosMetro).toBe(0);
});

it("en la build General reinicia con expo-updates", async () => {
  expect(await cambiarModoOscuro(true)).toBe("REINICIANDO");
  expect(estado.reinicios).toBe(1);
});

it("en la Beta de desarrollo, donde reloadAsync no existe, reinicia Metro", async () => {
  estado.reloadFalla = true;
  vi.stubGlobal("__DEV__", true);
  expect(await cambiarModoOscuro(false)).toBe("REINICIANDO");
  expect(estado.reiniciosMetro).toBe(1);
});

it("si no hay forma de reiniciar, pide cerrar y abrir la app (la preferencia ya quedó guardada)", async () => {
  estado.reloadFalla = true;
  expect(await cambiarModoOscuro(true)).toBe("CIERRA_Y_ABRE");
  expect(estado.reiniciosMetro).toBe(0);
});

it("en web recarga la página", async () => {
  estado.os = "web";
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  expect(await cambiarModoOscuro(true)).toBe("REINICIANDO");
  expect(reload).toHaveBeenCalled();
});
