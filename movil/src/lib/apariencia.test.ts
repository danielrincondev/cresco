import { afterEach, beforeEach, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  os: "android",
  guardado: true,
  preferencia: "claro" as string,
  reloadFalla: false,
  reinicios: 0,
  reiniciosMetro: 0,
  esquemas: [] as string[],
  fondos: [] as string[],
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
  Appearance: {
    setColorScheme: (esquema: string) => {
      estado.esquemas.push(esquema);
    },
  },
}));
vi.mock("../theme/modo", () => ({
  guardarPreferenciaTema: () => estado.guardado,
  get preferenciaTema() {
    return estado.preferencia;
  },
}));
vi.mock("../theme/Theme", () => ({ Superficie: { fondo: "#FONDO" } }));
vi.mock("expo-updates", () => ({
  reloadAsync: async () => {
    if (estado.reloadFalla) throw new Error("reloadAsync no está disponible en desarrollo");
    estado.reinicios++;
  },
}));
vi.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: async (color: string) => {
    estado.fondos.push(color);
  },
}));

const { aplicarTemaNativo, cambiarTema } = await import("./apariencia");

beforeEach(() => {
  Object.assign(estado, {
    os: "android", guardado: true, preferencia: "claro", reloadFalla: false,
    reinicios: 0, reiniciosMetro: 0, esquemas: [], fondos: [],
  });
  vi.stubGlobal("__DEV__", false);
});
afterEach(() => vi.unstubAllGlobals());

it("al arrancar, lo nativo toma el tema elegido y el fondo de la paleta", async () => {
  estado.preferencia = "oscuro";
  aplicarTemaNativo();
  await vi.waitFor(() => expect(estado.fondos).toEqual(["#FONDO"]));
  expect(estado.esquemas).toEqual(["dark"]);
});

it("con 'como el teléfono', lo nativo no se fuerza: sigue al sistema", () => {
  estado.preferencia = "sistema";
  aplicarTemaNativo();
  expect(estado.esquemas).toEqual(["unspecified"]);
});

it("con el tema claro, lo nativo queda claro aunque el teléfono esté en oscuro", () => {
  aplicarTemaNativo();
  expect(estado.esquemas).toEqual(["light"]);
});

it("si no se pudo guardar la preferencia, no toca nada ni reinicia", async () => {
  estado.guardado = false;
  expect(await cambiarTema("oscuro")).toBe("SIN_GUARDAR");
  expect(estado.esquemas).toEqual([]);
  expect(estado.reinicios + estado.reiniciosMetro).toBe(0);
});

it("en la build General deja lo nativo listo y reinicia con expo-updates", async () => {
  expect(await cambiarTema("sistema")).toBe("REINICIANDO");
  expect(estado.esquemas).toEqual(["unspecified"]);
  expect(estado.reinicios).toBe(1);
});

it("en la Beta de desarrollo, donde reloadAsync no existe, reinicia Metro", async () => {
  estado.reloadFalla = true;
  vi.stubGlobal("__DEV__", true);
  expect(await cambiarTema("claro")).toBe("REINICIANDO");
  expect(estado.reiniciosMetro).toBe(1);
});

it("si no hay forma de reiniciar, pide cerrar y abrir la app (la preferencia ya quedó guardada)", async () => {
  estado.reloadFalla = true;
  expect(await cambiarTema("oscuro")).toBe("CIERRA_Y_ABRE");
  expect(estado.reiniciosMetro).toBe(0);
});

it("en web recarga la página", async () => {
  estado.os = "web";
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  expect(await cambiarTema("oscuro")).toBe("REINICIANDO");
  expect(reload).toHaveBeenCalled();
});
