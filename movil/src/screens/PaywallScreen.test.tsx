import React from "react";
import { expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  suscripcion: undefined as unknown,
  planes: [] as unknown[],
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Platform: { OS: "web" }, StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "suscripciones:miSuscripcion" ? estado.suscripcion : estado.planes,
}));

const { PaywallDocente, PaywallRepresentante } = await import("./PaywallScreen");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

const gratuito = {
  plan: { codigo: "REP_FREE", nombre: "Gratuito", audiencia: "REPRESENTANTE",
    periodicidad: "MENSUAL", sinPublicidad: false,
    limites: { reportesPrevios: 1, exportarPdf: "CON_ANUNCIO" }, productoGooglePlay: null },
  estado: "SIN_SUSCRIPCION", expiraEn: null, renovacionAutomatica: false, acceso: false,
};

/**
 * ADR-006: el precio lo pone RevenueCat en el dispositivo. Un numero escrito
 * en esta pantalla seria una segunda fuente de verdad que ademas no se
 * actualiza sin desplegar la aplicacion.
 */
it("no escribe ningun precio en la pantalla", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [{
    codigo: "REP_PRO", nombre: "Sin anuncios", audiencia: "REPRESENTANTE",
    periodicidad: "MENSUAL", sinPublicidad: true,
    limites: { reportesPrevios: 12, exportarPdf: "LIBRE" },
    productoGooglePlay: "rep_pro_mensual", entitlement: "sin_anuncios",
  }];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).not.toMatch(/\$|USD|\d+[,.]\d{2}/);
  expect(t).toContain("el precio lo vas a ver aquí en tu moneda");
});

/**
 * Un boton de comprar que no cobra entrena a la persona a no creerle a la
 * pantalla. Mientras el SDK no este integrado (#13), no hay boton.
 */
it("no finge un boton de compra mientras la compra no exista", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).not.toContain("Comprar");
  expect(t).not.toContain("Suscribirme");
});

/**
 * Una cancelada sigue dando acceso hasta que expira. Decirle "estas en el
 * gratuito" a quien pago hasta fin de mes seria quitarle lo que ya pago.
 */
it("una suscripcion cancelada pero vigente se lee como acceso, con su fecha", () => {
  estado.suscripcion = {
    representante: {
      plan: { codigo: "REP_PRO", nombre: "Sin anuncios", audiencia: "REPRESENTANTE",
        periodicidad: "MENSUAL", sinPublicidad: true,
        limites: { reportesPrevios: 12 }, productoGooglePlay: null },
      estado: "CANCELADA",
      expiraEn: Date.parse("2026-10-01T15:00:00Z"),
      renovacionAutomatica: false, acceso: true,
    },
    docente: null,
  };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).toContain("sigues teniendo acceso hasta");
  expect(t).toContain("jueves 1 de octubre");
});

/** Quien no es docente no ve un muro de pago de docente. */
it("no ensena el paywall de un rol que la persona no tiene", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  expect(texto(pintar(<PaywallDocente />))).toContain("Esta sección no es para tu cuenta");
});

it("traduce los limites del plan a frases, no a nombres de campo", () => {
  estado.suscripcion = { representante: gratuito, docente: null };
  estado.planes = [];
  const t = texto(pintar(<PaywallRepresentante />));
  expect(t).toContain("Solo el reporte más reciente");
  expect(t).not.toContain("reportesPrevios");
});
