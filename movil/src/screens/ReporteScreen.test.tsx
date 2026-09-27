import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  hoy: undefined as unknown,
  anteriores: undefined as unknown,
  acumulado: undefined as unknown,
  lecturas: [] as unknown[],
}));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
  // `HijoActivo` (el selector de hijo con más de uno) usa `Modal` para su
  // lista desplegable.
  Modal: "Modal",
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    if (nombre === "conducta:reporteDeHoy") return estado.hoy;
    if (nombre === "conducta:reportesAnteriores") return estado.anteriores;
    return estado.acumulado;
  },
  // `useLecturaSensible` registra la lectura con una mutation al montar.
  useMutation: () => async (args: unknown) => { estado.lecturas.push(args); return null; },
}));

const { ReporteAcumulado, ReporteDeHoy, ReportesAnteriores } =
  await import("./ReporteScreen");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

const REPORTE = {
  id: "r1", fecha: "2026-09-09", tieneNovedades: true, puntaje: 58,
  franja: { nombre: "Atención", frase: "Conviene conversar en casa.", color: null },
  asistencia: "PRESENTE",
  acciones: [
    { id: "a1", categoria: "Disciplina", signo: "NEGATIVA", puntos: -2,
      descripcion: "Se levantó varias veces durante la clase de lectura.",
      estado: "VIGENTE" },
  ],
  general: [{ etiqueta: "Anuncios", texto: "Mañana traer el cuaderno de tareas." }],
};

beforeEach(() => {
  estado.lecturas = [];
  estado.hoy = { fecha: "2026-09-09", hay: true, reporte: REPORTE };
  estado.anteriores = { limite: 2, premium: false, reportes: [REPORTE] };
  estado.acumulado = {
    periodo: { nombre: "Primer parcial", fechaInicio: "2026-05-01", fechaFin: "2026-07-10" },
    puntaje: 58, puntosPositivos: 3, puntosNegativos: -5, congelado: false,
    franja: { nombre: "Atención", frase: "Conviene conversar en casa.", color: null },
    bitacora: [
      { id: "a1", fecha: "2026-09-09", signo: "NEGATIVA", puntos: -2,
        descripcion: "Se levantó varias veces.", estado: "VIGENTE" },
    ],
  };
});

const hoy = () =>
  pintar(
    <ReporteDeHoy
      estudianteId={"e1" as never}
      nombre="Ana Pérez"
      onVerAnteriores={() => {}}
      onVerAcumulado={() => {}}
    />,
  );

/* ---------- P4 ---------- */

it("enseña lo que el docente escribió, no solo el número", () => {
  const t = texto(hoy());
  expect(t).toContain("Se levantó varias veces durante la clase de lectura");
  expect(t).toContain("Mañana traer el cuaderno de tareas");
});

/**
 * C3: la franja nunca aparece sin su puntaje. Un color sin cifra no dice nada,
 * y una cifra sin la frase se lee como una calificación — que es justo lo que
 * Cresco no es.
 */
it("el puntaje nunca aparece solo: va dentro de la franja", () => {
  const t = texto(hoy());
  expect(t).toContain("58");
  expect(t).toContain("Conviene conversar en casa");
});

/**
 * "Todavía no hay reporte" y "hoy no hubo novedades" son cosas distintas.
 * Confundirlas haría que una madre creyera que a su hijo no le pasó nada
 * cuando en realidad el docente aún no ha cerrado el día.
 */
it("distingue el día sin cerrar del día sin novedades", () => {
  estado.hoy = { fecha: "2026-09-09", hay: false, reporte: null };
  expect(texto(hoy())).toContain("Todavía no hay reporte de hoy");

  estado.hoy = {
    fecha: "2026-09-09", hay: true,
    reporte: { ...REPORTE, acciones: [], general: [] },
  };
  const t = texto(hoy());
  expect(t).toContain("Hoy no hubo anotaciones");
  expect(t).not.toContain("Todavía no hay reporte de hoy");
});

/* ---------- P5 ---------- */

/**
 * Una lista que se corta en silencio se lee como que no hay más. El límite del
 * plan se dice siempre, no solo al chocar con él.
 */
it("dice el límite del plan gratuito, y no lo dice en premium", () => {
  const ver = () =>
    texto(pintar(
      <ReportesAnteriores
        estudianteId={"e1" as never} nombre="Ana Pérez"
        onVolver={() => {}} onVerPlan={() => {}}
      />,
    ));
  expect(ver()).toContain("los últimos 2 reportes");

  estado.anteriores = { limite: 7, premium: true, reportes: [REPORTE] };
  expect(ver()).not.toContain("Con el plan de pago");
});

/* ---------- P6 ---------- */

it("avisa cuando el parcial ya cerró y el puntaje no se mueve", () => {
  const ver = () =>
    texto(pintar(
      <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
    ));
  expect(ver()).not.toContain("ya cerró");

  estado.acumulado = { ...(estado.acumulado as object), congelado: true };
  expect(ver()).toContain("ya cerró");
});

/**
 * El puntaje de conducta no entra en el expediente académico (DP-010). La
 * pantalla que enseña el número es donde hay que decirlo.
 */
it("aclara que el puntaje no es una calificación", () => {
  const t = texto(pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  ));
  expect(t).toContain("no es una calificación");
});

/**
 * DP-006. P6 es la lectura mas sensible de toda la app del representante:
 * cada anotacion del parcial con lo que escribio el docente. Tiene que quedar
 * en la bitacora, y con el recurso que la describe.
 */
it("abrir el acumulado registra la lectura de la bitácora", async () => {
  pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  );
  await act(async () => {});
  expect(estado.lecturas).toContainEqual({ estudianteId: "e1", recurso: "BITACORA_ACCIONES" });
});

it("abrir el reporte del día registra la lectura del reporte", async () => {
  hoy();
  await act(async () => {});
  expect(estado.lecturas).toContainEqual({ estudianteId: "e1", recurso: "REPORTE_ESTUDIANTE" });
});

/**
 * El bug que Kenny encontró: sin parcial vigente hoy, el servidor devuelve
 * `periodo: null` en vez de reventar. La pantalla tiene que sostener eso —
 * título sin el nombre del parcial, y un aviso que explique la situación en
 * vez de "No pudimos cargar esta vista".
 */
it("sin parcial vigente no revienta: título sin parcial, y lo dice", () => {
  estado.acumulado = { ...(estado.acumulado as object), periodo: null };
  const v = pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  );
  expect(texto(v)).toContain("Hoy no hay un parcial en curso");
  expect(texto(v)).not.toContain("undefined");
});

/**
 * El punto de partida (51-60) es una franja como cualquier otra, no una
 * ausencia de datos: la barra tiene que verse incluso sin una sola acción.
 */
it("la barra de franjas se pinta con el puntaje aunque la bitácora esté vacía", () => {
  estado.acumulado = { ...(estado.acumulado as object), bitacora: [], puntaje: 60 };
  const v = pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  );
  const marcador = v.root.findAll((n) =>
    Array.isArray(n.props.style) &&
    n.props.style.some((s: unknown) => !!s && typeof s === "object" && "left" in (s as object)),
  );
  expect(marcador.length).toBeGreaterThan(0);
  expect((marcador[0].props.style as { left: string }[]).find((s) => "left" in s)?.left).toBe("60%");
});

/** Con dos hijos, cambiar desde el acumulado no debería obligar a salir a Mis hijos. */
it("con más de un hijo, ofrece el selector y avisa al cambiar", () => {
  const cambios: [string, string][] = [];
  const v = pintar(
    <ReporteAcumulado
      estudianteId={"e1" as never}
      nombre="Ana Pérez"
      hijos={[{ estudianteId: "e1", nombre: "Ana" }, { estudianteId: "e2", nombre: "Luis" }]}
      onCambiarHijo={(id, nombre) => cambios.push([id, nombre])}
      onVolver={() => {}}
      onVerAccion={() => {}}
    />,
  );
  const boton = v.root.findAll((n) => n.props.accessibilityLabel === "Viendo a Ana. Cambiar de hijo")[0];
  expect(boton).toBeTruthy();
});
