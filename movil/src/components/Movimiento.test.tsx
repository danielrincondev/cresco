import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * `reducir` es mutable a proposito: las dos ramas de `useReduceMotion` son
 * justamente lo que hay que probar, y no se pueden separar en dos archivos sin
 * duplicar el mock entero.
 */
const ajustes = vi.hoisted(() => ({ reducir: false }));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(ajustes.reducir),
    addEventListener: () => ({ remove: () => {} }),
  },
}));

const { Aparece, Esqueleto, EsqueletoPagina } = await import("./Movimiento");

const pintar = async (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  // `await` dentro de `act`: `useReduceMotion` resuelve una promesa al montar,
  // y sin esto la asercion corre antes de que el estado se asiente.
  await act(async () => {
    v = create(e);
  });
  return v;
};
const json = (v: ReactTestRenderer) => v.toJSON() as { type: string } | null;
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

beforeEach(() => {
  ajustes.reducir = false;
});

/**
 * Lo primero que tiene que cumplir cualquier animacion de entrada: **no
 * esconder nada**. Un componente que deja el contenido esperando a un efecto
 * es un componente que un dia deja la pantalla en blanco -- y esta aplicacion
 * ya tuvo esta semana un fallo en el que una pantalla entera no se pintaba.
 */
it("Aparece pinta su contenido", async () => {
  const v = await pintar(<Aparece><text>Reporte de hoy</text></Aparece>);
  expect(texto(v)).toContain("Reporte de hoy");
});

it("Aparece anima cuando el sistema no pide lo contrario", async () => {
  const v = await pintar(<Aparece><text>hola</text></Aparece>);
  expect(json(v)?.type).toBe("Animated.View");
});

/**
 * Con "reducir movimiento" activado no basta con acortar la animacion: no
 * debe crearse. Para quien tiene trastorno vestibular el movimiento de una
 * interfaz produce mareo real, y la app ya cuida el contraste por el sol y el
 * cuerpo de 16 por los abuelos -- marear aqui seria incoherente.
 */
it("Aparece no anima nada con movimiento reducido", async () => {
  ajustes.reducir = true;
  const v = await pintar(<Aparece><text>hola</text></Aparece>);
  expect(json(v)?.type).toBe("View");
  expect(texto(v)).toContain("hola");
});

it("el esqueleto late, y deja de latir con movimiento reducido", async () => {
  const conMovimiento = await pintar(<Esqueleto />);
  expect(json(conMovimiento)?.type).toBe("Animated.View");

  ajustes.reducir = true;
  const sinMovimiento = await pintar(<Esqueleto />);
  expect(json(sinMovimiento)?.type).toBe("View");
});

/**
 * Un lector de pantalla no ve barras grises. Sin esto, quien lo usa se queda
 * sin saber si la pantalla esta cargando o si eso **es** el contenido.
 */
it("el esqueleto de pagina se anuncia como una espera", async () => {
  const v = await pintar(<EsqueletoPagina etiqueta="Cargando el reporte" />);
  const raiz = v.toJSON() as { props: Record<string, unknown> };
  expect(raiz.props.accessibilityRole).toBe("progressbar");
  expect(raiz.props.accessibilityLabel).toBe("Cargando el reporte");
});

/**
 * El esqueleto solo sirve si lo que llega despues ocupa el mismo sitio: si la
 * pantalla da un salto al cargar, es peor que no haber puesto nada. Esto fija
 * el numero de tarjetas pedido.
 */
it("el esqueleto de pagina pinta las tarjetas que se le piden", async () => {
  const v = await pintar(<EsqueletoPagina tarjetas={2} />);
  const hijos = (v.toJSON() as { children: unknown[] }).children;
  // El titulo mas las dos tarjetas.
  expect(hijos).toHaveLength(3);
});
