import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({ suscripcion: undefined as unknown }));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "impresion-sintetica" }));
vi.mock("../lib/compras", () => ({ prepararCompras: async () => null }));
// Los dos SDKs son nativos: aquí se reemplazan por lo mínimo que el
// componente usa, para que "se ve el anuncio" signifique algo en la prueba.
vi.mock("react-native-google-mobile-ads", () => ({
  BannerAd: "BannerAd",
  BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: "LARGE_ANCHORED_ADAPTIVE_BANNER" },
}));
vi.mock("react-native-purchases", () => ({
  default: {
    adTracker: {
      trackAdLoaded: async () => {},
      trackAdDisplayed: async () => {},
      trackAdFailedToLoad: async () => {},
      trackAdRevenue: async () => {},
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "suscripciones:miSuscripcion"
      ? estado.suscripcion
      : { perfilUsuarioId: "perfil" },
}));

const { AnuncioBanner } = await import("./AnuncioBanner");

const plan = (sinPublicidad: boolean) => ({
  representante: { plan: { sinPublicidad }, acceso: sinPublicidad },
  docente: null,
});

async function pintar() {
  let v!: ReactTestRenderer;
  await act(async () => {
    v = create(<AnuncioBanner />);
  });
  // Los SDKs llegan por `import()` dentro de un efecto: se deja terminar esa
  // carga antes de mirar qué quedó en pantalla.
  await act(async () => {
    await new Promise((listo) => setTimeout(listo, 0));
  });
  return v;
}
const hayAnuncio = (v: ReactTestRenderer) => v.root.findAllByType("BannerAd" as never).length > 0;

beforeEach(() => {
  estado.suscripcion = undefined;
});

it("en el plan gratuito, la familia ve el anuncio", async () => {
  estado.suscripcion = plan(false);
  expect(hayAnuncio(await pintar())).toBe(true);
});

/**
 * El muro de pago promete "Sin anuncios" en Premium. Antes del 27 de
 * septiembre, una familia que pagaba seguía viendo el anuncio.
 */
it("con Premium no hay anuncio: es lo que promete el muro de pago", async () => {
  estado.suscripcion = plan(true);
  expect(hayAnuncio(await pintar())).toBe(false);
});

it("mientras no se sabe el plan, no se muestra: ni un instante para quien pagó", async () => {
  expect(hayAnuncio(await pintar())).toBe(false);
});
