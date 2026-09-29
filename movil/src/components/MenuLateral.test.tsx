import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const ajustes = vi.hoisted(() => ({ reducir: false }));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(ajustes.reducir),
    addEventListener: () => ({ remove: () => {} }),
  },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
// El panel los usa para esquivar el recorte de camara y la barra de
// navegacion. En pruebas no hay pantalla: van a cero.
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { MenuLateral, ItemMenu, SeccionMenu } = await import("./MenuLateral");

const pintar = async (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  await act(async () => {
    v = create(e);
  });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

beforeEach(() => {
  ajustes.reducir = false;
});

/**
 * Lo mas importante de un panel que se superpone: **cuando esta cerrado no
 * existe**. Una capa a pantalla completa con opacidad cero sigue comiendose
 * todos los toques, y la pantalla de debajo deja de responder sin que nada lo
 * explique. Por eso `MenuLateral` se desmonta al terminar de cerrarse.
 */
it("cerrado no pinta nada", async () => {
  const v = await pintar(
    <MenuLateral abierto={false} onCerrar={() => {}}>
      <ItemMenu icono="school" texto="Cursos" onPress={() => {}} />
    </MenuLateral>,
  );
  expect(v.toJSON()).toBeNull();
});

it("abierto pinta su contenido", async () => {
  const v = await pintar(
    <MenuLateral abierto onCerrar={() => {}}>
      <SeccionMenu titulo="Quinto B" />
      <ItemMenu icono="notebook" texto="Anotar conducta" onPress={() => {}} />
    </MenuLateral>,
  );
  const t = texto(v);
  expect(t).toContain("Quinto B");
  expect(t).toContain("Anotar conducta");
});

/**
 * El velo no es decoracion: es la forma de salir sin buscar un boton. Quien
 * abre un cajon por error espera cerrarlo tocando fuera.
 */
it("tocar el velo cierra", async () => {
  const cerrar = vi.fn();
  const v = await pintar(
    <MenuLateral abierto onCerrar={cerrar}>
      <ItemMenu icono="school" texto="Cursos" onPress={() => {}} />
    </MenuLateral>,
  );
  const velo = v.root
    .findAll((n) => n.props.accessibilityLabel === "Cerrar el menú")
    .at(0);
  act(() => velo!.props.onPress());
  expect(cerrar).toHaveBeenCalledOnce();
});

it("un destino del menú se puede pulsar", async () => {
  const ir = vi.fn();
  const v = await pintar(
    <MenuLateral abierto onCerrar={() => {}}>
      <ItemMenu icono="notebook" texto="Pasar lista" onPress={ir} />
    </MenuLateral>,
  );
  const item = v.root.findAllByType(ItemMenu)[0];
  act(() => item.props.onPress());
  expect(ir).toHaveBeenCalledOnce();
});

/**
 * Con movimiento reducido el panel aparece sin deslizarse, pero **aparece**.
 * Apagar la animacion no puede apagar la navegacion.
 */
it("con movimiento reducido sigue abriendo", async () => {
  ajustes.reducir = true;
  const v = await pintar(
    <MenuLateral abierto onCerrar={() => {}}>
      <ItemMenu icono="school" texto="Cursos" onPress={() => {}} />
    </MenuLateral>,
  );
  expect(texto(v)).toContain("Cursos");
});

/** El "estás aquí" tiene que llegar al lector de pantalla, no solo al ojo. */
it("el destino activo se anuncia como seleccionado", async () => {
  const v = await pintar(
    <MenuLateral abierto onCerrar={() => {}}>
      <ItemMenu icono="school" texto="Cursos" activo onPress={() => {}} />
    </MenuLateral>,
  );
  const pulsable = v.root
    .findAll((n) => n.props.accessibilityState?.selected === true)
    .at(0);
  expect(pulsable).toBeTruthy();
});

/* ---------- Gestos (issue #101) ---------- */

/** Un `gestureState` inventado: solo lo que miran los gestos. */
const gesto = (g: { x0?: number; dx: number; dy?: number; vx?: number }) =>
  ({ x0: 0, dy: 0, vx: 0, ...g }) as never;

it("deslizar hacia la izquierda sobre el menú lo cierra; un toque o un desliz vertical no", async () => {
  const onCerrar = vi.fn();
  const v = await pintar(
    <MenuLateral abierto onCerrar={onCerrar}>
      <ItemMenu icono="school" texto="Cursos" onPress={() => {}} />
    </MenuLateral>,
  );
  const capa = v.root.findAll((n) => typeof n.props.onPanResponderRelease === "function")[0];
  expect(capa.props.onMoveShouldSetPanResponderCapture(null, gesto({ dx: -30, dy: 4 }))).toBe(true);
  expect(capa.props.onMoveShouldSetPanResponderCapture(null, gesto({ dx: -6 }))).toBe(false);
  expect(capa.props.onMoveShouldSetPanResponderCapture(null, gesto({ dx: -20, dy: 60 }))).toBe(false);
  expect(capa.props.onMoveShouldSetPanResponderCapture(null, gesto({ dx: 40 }))).toBe(false);

  capa.props.onPanResponderRelease(null, gesto({ dx: -20, vx: -0.1 }));
  expect(onCerrar).not.toHaveBeenCalled();
  capa.props.onPanResponderRelease(null, gesto({ dx: -80 }));
  expect(onCerrar).toHaveBeenCalledTimes(1);
  capa.props.onPanResponderRelease(null, gesto({ dx: -25, vx: -0.9 }));
  expect(onCerrar).toHaveBeenCalledTimes(2);
});

it("desde el borde izquierdo, deslizar a la derecha abre el menú; desde el medio o sin menú, no", async () => {
  const { useGestoParaAbrirMenu, BORDE_DEL_GESTO } = await import("./MenuLateral");
  const onAbrir = vi.fn();
  let manejadores: Record<string, (e: unknown, g: unknown) => unknown> = {};
  function Pantalla({ activo }: { activo: boolean }) {
    manejadores = useGestoParaAbrirMenu(onAbrir, activo) as never;
    return null;
  }
  const v = await pintar(<Pantalla activo />);
  const captura = (g: Parameters<typeof gesto>[0]) =>
    manejadores.onMoveShouldSetPanResponderCapture(null, gesto(g));

  expect(captura({ x0: 10, dx: 30, dy: 3 })).toBe(true);
  expect(captura({ x0: BORDE_DEL_GESTO + 20, dx: 30 })).toBe(false);
  expect(captura({ x0: 10, dx: 30, dy: 70 })).toBe(false);
  expect(captura({ x0: 10, dx: -30 })).toBe(false);
  expect(captura({ x0: 10, dx: 6 })).toBe(false);

  manejadores.onPanResponderRelease(null, gesto({ x0: 10, dx: 30 }));
  expect(onAbrir).not.toHaveBeenCalled();
  manejadores.onPanResponderRelease(null, gesto({ x0: 10, dx: 90 }));
  expect(onAbrir).toHaveBeenCalledTimes(1);

  await act(async () => v.update(<Pantalla activo={false} />));
  expect(captura({ x0: 10, dx: 30 })).toBe(false);
});
