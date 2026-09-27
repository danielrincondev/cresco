import { beforeEach, expect, it, vi } from "vitest";

/**
 * Un anuncio con premio de mentira que emite los mismos eventos que el SDK
 * real, en el orden en que los emite: cargar, abrirse, dar el premio (o no) y
 * cerrarse. Así se prueba lo único que importa de `verAnuncioConPremio`: que
 * solo diga "PREMIO" cuando el anuncio de verdad lo dio.
 */
const guion = vi.hoisted(() => ({
  pasos: [] as string[],
  seguidos: [] as string[],
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "impresion-sintetica" }));
vi.mock("react-native-purchases", () => ({
  default: {
    adTracker: {
      trackAdLoaded: async () => { guion.seguidos.push("loaded"); },
      trackAdDisplayed: async () => { guion.seguidos.push("displayed"); },
      trackAdRevenue: async () => { guion.seguidos.push("revenue"); },
      trackAdFailedToLoad: async () => { guion.seguidos.push("failed"); },
    },
  },
}));
vi.mock("react-native-google-mobile-ads", () => {
  const AdEventType = { OPENED: "opened", PAID: "paid", CLOSED: "closed", ERROR: "error" };
  const RewardedAdEventType = { LOADED: "rewarded_loaded", EARNED_REWARD: "rewarded_earned_reward" };
  return {
    AdEventType,
    RewardedAdEventType,
    TestIds: { REWARDED: "prueba-con-premio" },
    RewardedAd: {
      createForAdRequest: () => {
        const oyentes = new Map<string, ((dato?: unknown) => void)[]>();
        const emitir = (tipo: string, dato?: unknown) => (oyentes.get(tipo) ?? []).forEach((f) => f(dato));
        return {
          addAdEventListener: (tipo: string, f: (dato?: unknown) => void) => {
            oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), f]);
            return () => oyentes.set(tipo, (oyentes.get(tipo) ?? []).filter((g) => g !== f));
          },
          load: () => {
            if (guion.pasos.includes("falla")) return emitir(AdEventType.ERROR, new Error("sin inventario"));
            emitir(RewardedAdEventType.LOADED);
          },
          show: async () => {
            emitir(AdEventType.OPENED);
            emitir(AdEventType.PAID, { value: 0.01, currency: "USD", precision: 1 });
            if (guion.pasos.includes("premio")) emitir(RewardedAdEventType.EARNED_REWARD, { amount: 1 });
            emitir(AdEventType.CLOSED);
          },
        };
      },
    },
  };
});

const { verAnuncioConPremio } = await import("./anuncioConPremio");

beforeEach(() => {
  guion.pasos = [];
  guion.seguidos = [];
});

it("visto hasta el final, da el premio y se reporta a RevenueCat", async () => {
  guion.pasos = ["premio"];
  expect(await verAnuncioConPremio()).toBe("PREMIO");
  expect(guion.seguidos).toEqual(expect.arrayContaining(["loaded", "displayed", "revenue"]));
});

it("cerrado antes de terminar, no hay premio, y no es un error", async () => {
  expect(await verAnuncioConPremio()).toBe("SIN_PREMIO");
});

it("si no carga, lo dice como error y lo reporta como fallo", async () => {
  guion.pasos = ["falla"];
  expect(await verAnuncioConPremio()).toBe("ERROR");
  expect(guion.seguidos).toContain("failed");
});
