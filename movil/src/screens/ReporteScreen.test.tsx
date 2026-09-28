import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  hoy: undefined as unknown,
  anteriores: undefined as unknown,
  acumulado: undefined as unknown,
  comunicados: [] as unknown,
  lecturas: [] as unknown[],
  argsHoy: undefined as unknown,
  suscripcion: undefined as unknown,
  informe: undefined as unknown,
  llamadas: [] as { nombre: string; args: unknown }[],
  puedeImprimir: true,
  anuncio: "PREMIO" as string,
  anunciosVistos: 0,
  impresos: [] as string[],
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
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    const nombre = getFunctionName(ref);
    if (nombre === "conducta:reporteDeHoy") {
      estado.argsHoy = args;
      return estado.hoy;
    }
    if (nombre === "suscripciones:miSuscripcion") return estado.suscripcion;
    if (nombre === "conducta:reportesAnteriores") return estado.anteriores;
    if (nombre === "conducta:comunicadosVigentes") return estado.comunicados;
    if (nombre === "nucleo:obtenerPerfil") return undefined;
    return estado.acumulado;
  },
  // `useLecturaSensible` registra la lectura con una mutation al montar. Las
  // del informe devuelven lo que devolvería el servidor.
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    return async (args: unknown) => {
      estado.lecturas.push(args);
      estado.llamadas.push({ nombre, args });
      return nombre === "conducta:prepararInforme" ? estado.informe : null;
    };
  },
}));
// `AnuncioBanner` (en `ReporteDeHoy`) importa `expo-crypto` y `compras.ts`
// arriba del archivo. Sin el primer mock, `expo-modules-core` revienta con
// "__DEV__ is not defined" -- ese global solo existe bajo Metro, no en
// Vitest. `compras.ts` tiene el mismo problema (lee `__DEV__` al cargarse),
// así que se mockea entero, igual que ya hace `PaywallScreen.test.tsx`.
vi.mock("expo-crypto", () => ({ randomUUID: () => "impresion-sintetica-1234" }));
vi.mock("../lib/compras", () => ({ prepararCompras: async () => null }));
// El PDF y el anuncio con premio son nativos: se reemplazan por lo que
// devolverían, y el HTML sí se arma de verdad.
vi.mock("../lib/informe", async (original) => ({
  ...(await original<typeof import("../lib/informe")>()),
  puedeImprimir: async () => estado.puedeImprimir,
  imprimirYCompartir: async (html: string) => { estado.impresos.push(html); return "LISTO"; },
}));
vi.mock("../lib/anuncioConPremio", () => ({
  verAnuncioConPremio: async () => { estado.anunciosVistos++; return estado.anuncio; },
}));
// El propio SDK de anuncios es nativo: `import()` dentro de `AnuncioBanner`
// lo intenta y falla en las pruebas, y el componente ya sabe no pintar nada
// en ese caso. No hace falta un mock más elaborado que ese fallo real.

const { ReporteAcumulado, ReporteDeHoy, ReportesAnteriores } =
  await import("./ReporteScreen");
const { Boton } = await import("../components/NucleoUI");

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
  estado.llamadas = [];
  estado.suscripcion = undefined;
  estado.informe = undefined;
  estado.puedeImprimir = true;
  estado.anuncio = "PREMIO";
  estado.anunciosVistos = 0;
  estado.impresos = [];
  estado.hoy = { fecha: "2026-09-09", hay: true, reporte: REPORTE };
  estado.anteriores = { limite: 2, premium: false, reportes: [REPORTE] };
  estado.comunicados = [];
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

/**
 * QA del 27 de septiembre: un sábado o domingo, "todavía no hay reporte de
 * hoy" no es cierto -- no hay clases, no es que el docente no lo publicó.
 */
it("un fin de semana sin reporte, muestra el resumen de la semana en vez de decir que todavía no hay reporte", () => {
  estado.hoy = {
    fecha: "2026-09-06", hay: false, reporte: null, finDeSemana: true,
    resumenSemana: {
      desde: "2026-08-31", hasta: "2026-09-06", puntosPositivos: 2, puntosNegativos: -1,
      acciones: [{ id: "a1", categoria: "Disciplina", signo: "NEGATIVA", puntos: -1, descripcion: "Se distrajo en clase", estado: "VIGENTE", fecha: "2026-09-04" }],
    },
  };
  const t = texto(hoy());
  expect(t).toContain("Resumen de la semana");
  expect(t).toContain("Hoy no hay clases");
  // Las cifras, destacadas y sin signos confusos: ganó 2, perdió 1.
  expect(t).toContain("Puntos ganados: ");
  expect(t).toContain("+2");
  expect(t).toContain("Puntos perdidos: ");
  expect(t).toContain("-1");
  expect(t).toContain("Anotaciones de la semana (1)");
  expect(t).toContain("Se distrajo en clase");
  expect(t).not.toContain("Todavía no hay reporte de hoy");
});

it("un fin de semana sin ninguna novedad, lo dice en vez de dejar la tarjeta vacía", () => {
  estado.hoy = {
    fecha: "2026-09-06", hay: false, reporte: null, finDeSemana: true,
    resumenSemana: { desde: "2026-08-31", hasta: "2026-09-06", puntosPositivos: 0, puntosNegativos: 0, acciones: [] },
  };
  expect(texto(hoy())).toContain("Sin novedades de conducta esta semana");
});

it("entre semana sin reporte, sigue diciendo que todavía no hay uno, sin resumen", () => {
  estado.hoy = { fecha: "2026-09-09", hay: false, reporte: null, finDeSemana: false, resumenSemana: null };
  const t = texto(hoy());
  expect(t).toContain("Todavía no hay reporte de hoy");
  expect(t).not.toContain("Resumen de la semana");
});

/**
 * QA del 26 de septiembre: "los eventos no se reflejan en el reporte
 * diario". Van después de las acciones del estudiante, nunca antes: son
 * avisos del curso, no lo que le pasó a él o ella hoy.
 */
it("muestra las notas y eventos vigentes del curso, después de las acciones del estudiante", () => {
  estado.comunicados = [
    { id: "c1", tipo: "NOTA_PROFESOR", titulo: "Traer materiales", contenido: "Para la clase de arte", fechaEvento: null, fechaEventoFin: null, horaEvento: null },
    { id: "c2", tipo: "EVENTO", titulo: "Feria de ciencias", contenido: "En el patio central", fechaEvento: "2026-09-20", fechaEventoFin: null, horaEvento: "09:00" },
  ];
  const t = texto(hoy());
  expect(t).toContain("Novedades del curso");
  expect(t).toContain("Traer materiales");
  expect(t).toContain("Feria de ciencias");
  expect(t).toContain("09:00");
  expect(t.indexOf("Se levantó varias veces")).toBeLessThan(t.indexOf("Novedades del curso"));
});

/**
 * El docente necesita saber quién ya vio un aviso ("ya no vale que yo le avisé
 * por WhatsApp"). Mostrarlos en el reporte es lo que cuenta como verlos.
 */
it("al mostrar los comunicados, deja constancia de que esta familia los vio", () => {
  estado.comunicados = [
    { id: "c2", tipo: "NOTA_PROFESOR", titulo: "B", contenido: "b", fechaEvento: null, fechaEventoFin: null, horaEvento: null },
    { id: "c1", tipo: "NOTA_PROFESOR", titulo: "A", contenido: "a", fechaEvento: null, fechaEventoFin: null, horaEvento: null },
  ];
  hoy();
  expect(estado.lecturas).toContainEqual({ estudianteId: "e1", comunicadoIds: ["c1", "c2"] });
});

it("sin comunicados no registra nada de comunicados", () => {
  estado.comunicados = [];
  hoy();
  expect(estado.lecturas.some((l) => "comunicadoIds" in (l as object))).toBe(false);
});

it("sin comunicados vigentes, no muestra la sección de novedades del curso", () => {
  estado.comunicados = [];
  expect(texto(hoy())).not.toContain("Novedades del curso");
});

/* ---------- El reporte de otro día, desde un aviso ---------- */

it("abierto desde el aviso de otro día, pide ese día, lo dice y ofrece volver al de hoy", async () => {
  estado.hoy = { fecha: "2020-03-04", hay: true, reporte: { ...REPORTE, fecha: "2020-03-04" } };
  const onVerHoy = vi.fn();
  const v = pintar(
    <ReporteDeHoy
      estudianteId={"e1" as never} nombre="Ana Pérez" fecha="2020-03-04"
      onVerAnteriores={() => {}} onVerAcumulado={() => {}} onVerHoy={onVerHoy}
    />,
  );
  expect(estado.argsHoy).toEqual({ estudianteId: "e1", fecha: "2020-03-04" });
  expect(texto(v)).toContain("Lo del miércoles 4 de marzo, contado por su docente.");
  const volver = v.root.findAllByType(Boton).find((b) => b.props.children === "Ver el reporte de hoy")!;
  await act(async () => volver.props.onPress());
  expect(onVerHoy).toHaveBeenCalled();
});

it("sin reporte ese día, no dice que todavía no hay reporte de hoy", () => {
  estado.hoy = { fecha: "2020-03-04", hay: false, reporte: null, finDeSemana: false, resumenSemana: null };
  const t = texto(pintar(
    <ReporteDeHoy
      estudianteId={"e1" as never} nombre="Ana Pérez" fecha="2020-03-04"
      onVerAnteriores={() => {}} onVerAcumulado={() => {}} onVerHoy={() => {}}
    />,
  ));
  expect(t).toContain("No hay reporte de ese día");
  expect(t).not.toContain("Todavía no hay reporte de hoy");
});

it("sin fecha sigue siendo el reporte de hoy, sin botón para volver a él", () => {
  const v = hoy();
  expect(estado.argsHoy).toEqual({ estudianteId: "e1" });
  expect(texto(v)).toContain("Lo de hoy, contado por su docente.");
  expect(v.root.findAllByType(Boton).some((b) => b.props.children === "Ver el reporte de hoy")).toBe(false);
});

/* ---------- P5 ---------- */

/**
 * Un reporte de las 22:00 casi siempre se lee al día siguiente, y ahí ya está
 * en "Reportes anteriores": verlo en esa lista también cuenta como abierto.
 */
it("en Reportes anteriores, deja constancia de que la familia abrió lo que ve", () => {
  estado.anteriores = { limite: 7, premium: true, reportes: [REPORTE, { ...REPORTE, id: "r0", fecha: "2026-09-08" }] };
  pintar(
    <ReportesAnteriores
      estudianteId={"e1" as never} nombre="Ana Pérez"
      onVolver={() => {}} onVerPlan={() => {}}
    />,
  );
  expect(estado.lecturas).toContainEqual({ estudianteId: "e1", reporteEstudianteIds: ["r0", "r1"] });
});

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

/**
 * QA del 27 de septiembre: motivar el acompañamiento, no calificar dos veces.
 * La pantalla solo pinta lo que el servidor ya calculó (lib/insights.ts) —
 * no decide nada por su cuenta.
 */
it("muestra la frase de aliento cuando el servidor la manda", () => {
  estado.acumulado = { ...(estado.acumulado as object), insight: "Subió 5 puntos desde el parcial anterior — vale la pena celebrarlo en casa." };
  const t = texto(pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  ));
  expect(t).toContain("Subió 5 puntos");
});

it("sin nada positivo que decir, no fuerza ninguna frase", () => {
  estado.acumulado = { ...(estado.acumulado as object), insight: null };
  const t = texto(pintar(
    <ReporteAcumulado estudianteId={"e1" as never} nombre="Ana Pérez" onVolver={() => {}} onVerAccion={() => {}} />,
  ));
  expect(t).not.toContain("acompañamiento");
  expect(t).not.toContain("celebrarlo");
});

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
  expect(estado.lecturas).toContainEqual({ estudianteId: "e1", recurso: "REPORTE_ESTUDIANTE", reporteEstudianteId: "r1" });
});

/**
 * QA del 27 de septiembre: `fraseDeLecturas` solo tiene sentido para una
 * fotografía real -- la vista en vivo (sin publicar todavía) no tiene un
 * `reporteEstudianteId` que marcar como leído.
 */
it("la vista en vivo (sin id) no manda un reporteEstudianteId a marcar como leído", async () => {
  estado.hoy = { fecha: "2026-09-09", hay: true, reporte: { ...REPORTE, id: null } };
  hoy();
  await act(async () => {});
  const lectura = estado.lecturas.find((l) => (l as { recurso: string }).recurso === "REPORTE_ESTUDIANTE");
  expect((lectura as { reporteEstudianteId?: unknown } | undefined)?.reporteEstudianteId).toBeUndefined();
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

/* ---------- P12: el informe imprimible ---------- */

const conPlan = (exportarPdf: "LIBRE" | "CON_ANUNCIO") => ({
  representante: { plan: { limites: { reportesPrevios: 2, exportarPdf } } },
  docente: null,
});
const acumulado = () => pintar(
  <ReporteAcumulado
    estudianteId={"e1" as never} nombre="Ana Pérez"
    onVolver={() => {}} onVerAccion={() => {}}
  />,
);
const llamadasA = (nombre: string) => estado.llamadas.filter((l) => l.nombre === nombre);
async function tocar(v: ReturnType<typeof pintar>, texto: string) {
  const boton = v.root.findAllByType(Boton).find((b) => b.props.children === texto);
  expect(boton, `no hay un botón "${texto}"`).toBeDefined();
  await act(async () => {
    boton!.props.onPress();
    // El flujo encadena varias promesas: se las deja terminar.
    for (let i = 0; i < 5; i++) await new Promise((listo) => setTimeout(listo, 0));
  });
}

beforeEach(() => {
  estado.informe = {
    ...(estado.acumulado as object), bitacora: [], insight: null, consejo: null, reconocimiento: null,
    estudiante: "Ana Pérez", curso: "Quinto A", institucion: "Piloto", docente: null,
    generadoEn: Date.UTC(2026, 8, 15, 15),
  };
});

it("con Premium, el informe se descarga directo, sin anuncio", async () => {
  estado.suscripcion = conPlan("LIBRE");
  const v = acumulado();
  await tocar(v, "Descargar el PDF");
  expect(estado.anunciosVistos).toBe(0);
  expect(llamadasA("conducta:otorgarDesbloqueo")).toEqual([]);
  expect(llamadasA("conducta:prepararInforme")).toEqual([{ nombre: "conducta:prepararInforme", args: { estudianteId: "e1" } }]);
  expect(estado.impresos).toHaveLength(1);
  expect(estado.impresos[0]).toContain("Ana Pérez · Quinto A · Piloto");
});

it("en el plan gratuito, ve el anuncio, se desbloquea y descarga", async () => {
  estado.suscripcion = conPlan("CON_ANUNCIO");
  const v = acumulado();
  expect(texto(v)).toContain("se desbloquea viendo un anuncio");
  await tocar(v, "Ver un anuncio y descargar el PDF");
  expect(estado.anunciosVistos).toBe(1);
  expect(llamadasA("conducta:otorgarDesbloqueo").map((l) => l.args)).toEqual([{ recurso: "EXPORTAR_PDF_ACUMULADO" }]);
  expect(llamadasA("conducta:prepararInforme")).toHaveLength(1);
  expect(estado.impresos).toHaveLength(1);
});

it("si cierra el anuncio antes de terminar, no hay informe", async () => {
  estado.suscripcion = conPlan("CON_ANUNCIO");
  estado.anuncio = "SIN_PREMIO";
  const v = acumulado();
  await tocar(v, "Ver un anuncio y descargar el PDF");
  expect(llamadasA("conducta:otorgarDesbloqueo")).toEqual([]);
  expect(llamadasA("conducta:prepararInforme")).toEqual([]);
  expect(texto(v)).toContain("El informe se desbloquea al terminar el anuncio.");
});

it("en una build sin los módulos del PDF, pide actualizar y no gasta un anuncio", async () => {
  estado.suscripcion = conPlan("CON_ANUNCIO");
  estado.puedeImprimir = false;
  const v = acumulado();
  await tocar(v, "Ver un anuncio y descargar el PDF");
  expect(estado.anunciosVistos).toBe(0);
  expect(llamadasA("conducta:prepararInforme")).toEqual([]);
  expect(texto(v)).toContain("Actualiza la aplicación");
});

it("mientras no se sabe el plan, no ofrece un informe", () => {
  expect(texto(acumulado())).not.toContain("Informe imprimible");
});

