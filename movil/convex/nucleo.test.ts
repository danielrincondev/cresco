// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./nucleo.ts", "./_generated/*.js"]);

const datosCurso = {
  nombreInstitucion: "Unidad Educativa Piloto",
  nombreCurso: "Quinto A",
  nivel: "5to de básica",
  paralelo: "A",
  anioInicio: "2026-05-04",
  anioFin: "2027-02-26",
};

const periodosValidos = [
  { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-05-04", fechaFin: "2026-07-10" },
  { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-07-13", fechaFin: "2026-09-18" },
];

async function sembrarDocente(t: ReturnType<typeof convexTest>, subject = "docente_1") {
  const ids = await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: `https://convex.test|${subject}`,
      tipoDocumento: "CEDULA",
      numeroDocumento: `090000000${subject.at(-1) ?? "1"}`,
      actualizadoEn: Date.now(),
    });
    const docenteId = await ctx.db.insert("docente", {
      perfilUsuarioId,
      actualizadoEn: Date.now(),
    });
    return { perfilUsuarioId, docenteId };
  });
  return { ...ids, cliente: t.withIdentity({ subject }) };
}

async function concederPro(t: ReturnType<typeof convexTest>, perfilUsuarioId: Id<"perfilUsuario">) {
  await t.run(async (ctx) => {
    const planId = await ctx.db.insert("plan", {
      codigo: "DOC_PRO",
      nombre: "Docente — PRO",
      audiencia: "DOCENTE",
      entitlementRevenuecat: "docente_pro",
      productoGooglePlay: "DOC_PRO",
      periodicidad: "MENSUAL",
      sinPublicidad: false,
      limites: { cursosActivos: 5 },
      activo: true,
      actualizadoEn: Date.now(),
    });
    await ctx.db.insert("suscripcion", {
      perfilUsuarioId,
      planId,
      origen: "GOOGLE_PLAY",
      estado: "ACTIVA",
      iniciaEn: Date.now(),
      renovacionAutomatica: true,
      actualizadoEn: Date.now(),
    });
  });
}

describe("nucleo — cursos", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-08-27T15:00:00Z")));

  it("rechaza solicitudes sin autenticar", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.nucleo.crearCurso, datosCurso)).rejects.toThrow(
      "Inicia sesión para continuar",
    );
  });

  it("crea institución no verificada, año, curso y asignación titular atómicamente", async () => {
    const t = convexTest(schema, modules);
    const { cliente, docenteId } = await sembrarDocente(t);

    const curso = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    expect(curso).toMatchObject({
      institucion: "Unidad Educativa Piloto",
      nombre: "Quinto A",
      nivel: "5to de básica",
      paralelo: "A",
      jornada: "MATUTINA",
      totalEstudiantes: 0,
      periodoVigente: null,
    });

    const estado = await t.run(async (ctx) => ({
      instituciones: await ctx.db.query("institucion").collect(),
      anios: await ctx.db.query("anioLectivo").collect(),
      asignaciones: await ctx.db.query("asignacionDocente").collect(),
    }));
    expect(estado.instituciones).toHaveLength(1);
    expect(estado.instituciones[0]).toMatchObject({ verificada: false, nombreDeclarado: datosCurso.nombreInstitucion });
    expect(estado.anios[0]).toMatchObject({ nombre: "2026–2027", fechaInicio: datosCurso.anioInicio });
    expect(estado.asignaciones[0]).toMatchObject({ docenteId, rol: "TITULAR", vigenteDesde: "2026-08-27" });
  });

  it("aplica el límite FREE sin dejar escrituras parciales", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    await cliente.mutation(api.nucleo.crearCurso, datosCurso);

    await expect(
      cliente.mutation(api.nucleo.crearCurso, {
        ...datosCurso,
        nombreInstitucion: "Otra escuela",
        nombreCurso: "Sexto B",
        nivel: "6to de básica",
        paralelo: "B",
      }),
    ).rejects.toThrow("Tu plan permite hasta 1 curso activo");

    const instituciones = await t.run(async (ctx) => await ctx.db.query("institucion").collect());
    expect(instituciones).toHaveLength(1);
  });

  it("rechaza fechas de calendario inválidas", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);

    await expect(
      cliente.mutation(api.nucleo.crearCurso, { ...datosCurso, anioInicio: "2026-02-30" }),
    ).rejects.toThrow("no es una fecha válida");
  });

  it("permite cinco cursos con DOC_PRO y rechaza el sexto", async () => {
    const t = convexTest(schema, modules);
    const { cliente, perfilUsuarioId } = await sembrarDocente(t);
    await concederPro(t, perfilUsuarioId);

    for (let numero = 1; numero <= 5; numero++) {
      await cliente.mutation(api.nucleo.crearCurso, {
        ...datosCurso,
        nombreCurso: `Curso ${numero}`,
        nivel: `Nivel ${numero}`,
        paralelo: String(numero),
      });
    }
    await expect(
      cliente.mutation(api.nucleo.crearCurso, {
        ...datosCurso,
        nombreCurso: "Curso 6",
        nivel: "Nivel 6",
        paralelo: "6",
      }),
    ).rejects.toThrow("hasta 5 cursos activos");

    const listado = await cliente.query(api.nucleo.listarCursos);
    expect(listado.limitePlan).toBe(5);
    expect(listado.cursos).toHaveLength(5);
    const estructura = await t.run(async (ctx) => ({
      instituciones: await ctx.db.query("institucion").collect(),
      anios: await ctx.db.query("anioLectivo").collect(),
    }));
    expect(estructura.instituciones).toHaveLength(5);
    expect(estructura.anios).toHaveLength(5);
  });
});

describe("nucleo — periodos", () => {
  async function cursoDe(t: ReturnType<typeof convexTest>) {
    const { cliente } = await sembrarDocente(t);
    const curso = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    if (!curso) throw new Error("No se creó el curso de prueba");
    return { cliente, cursoId: curso.id };
  }

  it("muestra el año y los parciales planificados solo a su titular", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);
    expect(await cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId })).toEqual({
      fechaInicio: datosCurso.anioInicio,
      fechaFin: datosCurso.anioFin,
      periodos: [],
    });
    await cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: [...periodosValidos].reverse() });
    const calendario = await cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId });
    expect(calendario.periodos).toMatchObject(periodosValidos.map((p) => ({ ...p, estado: "PLANIFICADO" })));
    const otro = await sembrarDocente(t, "docente_2");
    await expect(otro.cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId })).rejects.toThrow("No eres el docente titular");
    await expect(t.query(api.nucleo.obtenerCalendarioCurso, { cursoId })).rejects.toThrow("Inicia sesión para continuar");
  });

  /**
   * `definirPeriodos` es de un solo uso, asi que hasta el 26 de septiembre un
   * docente que se equivocaba por unos dias al montar el año **no tenia
   * ninguna salida**: ni la aplicacion ni el servidor.
   */
  describe("corregir las fechas ya definidas", () => {
    async function conPeriodos(t: ReturnType<typeof convexTest>) {
      const { cliente, cursoId } = await cursoDe(t);
      await cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: periodosValidos });
      const { periodos } = await cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId });
      return { cliente, cursoId, periodos };
    }

    it("corrige solo lo que cambió", async () => {
      const t = convexTest(schema, modules);
      const { cliente, cursoId, periodos } = await conPeriodos(t);
      const r = await cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [
          { periodoAcademicoId: periodos[0].id, fechaInicio: periodos[0].fechaInicio, fechaFin: "2026-07-08" },
          { periodoAcademicoId: periodos[1].id, fechaInicio: periodos[1].fechaInicio, fechaFin: periodos[1].fechaFin },
        ],
      });
      expect(r).toEqual({ corregidos: 1 });
      const calendario = await cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId });
      expect(calendario.periodos[0].fechaFin).toBe("2026-07-08");
      expect(calendario.periodos[1].fechaInicio).toBe(periodosValidos[1].fechaInicio);
    });

    it("rechaza fechas que solapan", async () => {
      const t = convexTest(schema, modules);
      const { cliente, cursoId, periodos } = await conPeriodos(t);
      await expect(cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [
          { periodoAcademicoId: periodos[0].id, fechaInicio: periodos[0].fechaInicio, fechaFin: "2026-08-01" },
          { periodoAcademicoId: periodos[1].id, fechaInicio: periodos[1].fechaInicio, fechaFin: periodos[1].fechaFin },
        ],
      })).rejects.toThrow("no pueden solaparse");
    });

    it("rechaza salirse del año lectivo", async () => {
      const t = convexTest(schema, modules);
      const { cliente, cursoId, periodos } = await conPeriodos(t);
      await expect(cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [
          { periodoAcademicoId: periodos[0].id, fechaInicio: "2020-01-01", fechaFin: periodos[0].fechaFin },
          { periodoAcademicoId: periodos[1].id, fechaInicio: periodos[1].fechaInicio, fechaFin: periodos[1].fechaFin },
        ],
      })).rejects.toThrow("dentro del año lectivo");
    });

    /**
     * Comprobar solapes con la mitad de los parciales daria por buena una
     * correccion que pisa a la otra mitad.
     */
    it("exige la lista completa", async () => {
      const t = convexTest(schema, modules);
      const { cliente, cursoId, periodos } = await conPeriodos(t);
      await expect(cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [{ periodoAcademicoId: periodos[0].id, fechaInicio: "2026-05-01", fechaFin: periodos[0].fechaFin }],
      })).rejects.toThrow("todos los parciales");
    });

    /**
     * Un parcial cerrado tiene los puntajes congelados y las familias ya los
     * vieron. Moverle las fechas cambiaria que anotaciones caen dentro sin
     * recalcular nada, asi que el puntaje que leyeron dejaria de cuadrar.
     */
    it("no mueve un parcial cerrado, pero deja reenviar sus fechas iguales", async () => {
      const t = convexTest(schema, modules);
      const { cliente, cursoId, periodos } = await conPeriodos(t);
      await t.run((ctx) => ctx.db.patch("periodoAcademico", periodos[0].id, { estado: "CERRADO" }));

      await expect(cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [
          { periodoAcademicoId: periodos[0].id, fechaInicio: periodos[0].fechaInicio, fechaFin: "2026-07-08" },
          { periodoAcademicoId: periodos[1].id, fechaInicio: periodos[1].fechaInicio, fechaFin: periodos[1].fechaFin },
        ],
      })).rejects.toThrow("ya está cerrado");

      // Reenviarlas sin cambio no es mover nada: corregir el segundo parcial
      // no puede quedar bloqueado porque el primero este cerrado.
      const r = await cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: [
          { periodoAcademicoId: periodos[0].id, fechaInicio: periodos[0].fechaInicio, fechaFin: periodos[0].fechaFin },
          { periodoAcademicoId: periodos[1].id, fechaInicio: periodos[1].fechaInicio, fechaFin: "2026-09-20" },
        ],
      });
      expect(r).toEqual({ corregidos: 1 });
    });

    it("solo el titular corrige", async () => {
      const t = convexTest(schema, modules);
      const { cursoId, periodos } = await conPeriodos(t);
      const otro = await sembrarDocente(t, "docente_2");
      await expect(otro.cliente.mutation(api.nucleo.corregirFechasPeriodos, {
        cursoId,
        fechas: periodos.map((p) => ({ periodoAcademicoId: p.id, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin })),
      })).rejects.toThrow("No eres el docente titular");
    });
  });

  it("solo permite que el docente titular defina los periodos", async () => {
    const t = convexTest(schema, modules);
    const { cursoId } = await cursoDe(t);
    const otro = await sembrarDocente(t, "docente_2");

    await expect(
      otro.cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: periodosValidos }),
    ).rejects.toThrow("No eres el docente titular");
  });

  it("exige entre 2 y 3 parciales", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);

    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: periodosValidos.slice(0, 1) }),
    ).rejects.toThrow("entre 2 y 3 parciales");
  });

  it("rechaza periodos solapados y no guarda ninguno", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);

    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, {
        cursoId,
        periodos: [
          periodosValidos[0],
          { ...periodosValidos[1], fechaInicio: "2026-07-10" },
        ],
      }),
    ).rejects.toThrow("no pueden solaparse");

    const guardados = await t.run(async (ctx) => await ctx.db.query("periodoAcademico").collect());
    expect(guardados).toHaveLength(0);
  });

  it("rechaza periodos fuera del año lectivo", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);

    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, {
        cursoId,
        periodos: [
          { ...periodosValidos[0], fechaInicio: "2026-04-30" },
          periodosValidos[1],
        ],
      }),
    ).rejects.toThrow("dentro del año lectivo");
  });

  it("exige que el orden coincida con la secuencia cronológica", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);

    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, {
        cursoId,
        periodos: [
          { ...periodosValidos[0], orden: 2 },
          { ...periodosValidos[1], orden: 1 },
        ],
      }),
    ).rejects.toThrow("debe coincidir con sus fechas");
  });

  it("crea los parciales en orden y evita volver a definirlos", async () => {
    const t = convexTest(schema, modules);
    const { cliente, cursoId } = await cursoDe(t);

    const ids = await cliente.mutation(api.nucleo.definirPeriodos, {
      cursoId,
      periodos: [...periodosValidos].reverse(),
    });
    expect(ids).toHaveLength(2);

    const guardados = await t.run(async (ctx) =>
      await ctx.db.query("periodoAcademico").withIndex("por_anio_orden").collect(),
    );
    expect(guardados.map((p) => p.orden)).toEqual([1, 2]);
    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: periodosValidos }),
    ).rejects.toThrow("ya fueron definidos");
  });

  it("mantiene calendarios independientes para dos cursos del mismo docente", async () => {
    const t = convexTest(schema, modules);
    const { cliente, perfilUsuarioId } = await sembrarDocente(t);
    await concederPro(t, perfilUsuarioId);
    const primero = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    const segundo = await cliente.mutation(api.nucleo.crearCurso, {
      ...datosCurso,
      nombreCurso: "Sexto B",
      nivel: "6to de básica",
      paralelo: "B",
    });

    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, {
        cursoId: primero.id,
        periodos: periodosValidos,
      }),
    ).resolves.toHaveLength(2);
    await expect(
      cliente.mutation(api.nucleo.definirPeriodos, {
        cursoId: segundo.id,
        periodos: periodosValidos,
      }),
    ).resolves.toHaveLength(2);
  });
});

describe("nucleo — el año lectivo: reglas y corrección", () => {
  // Jueves 27 de agosto: el año del piloto (mayo a febrero) ya está en curso.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-08-27T15:00:00Z")));

  it("un año que ya empezó se puede crear; uno que ya terminó, no", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    await expect(cliente.mutation(api.nucleo.crearCurso, { ...datosCurso, anioInicio: "2025-05-05", anioFin: "2026-02-27" }))
      .rejects.toThrow("El año lectivo ya terminó");
    await expect(cliente.mutation(api.nucleo.crearCurso, datosCurso)).resolves.toBeDefined();
  });

  it("un año lectivo no dura más de 400 días", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    await expect(cliente.mutation(api.nucleo.crearCurso, { ...datosCurso, anioInicio: "2026-05-04", anioFin: "2027-06-30" }))
      .rejects.toThrow("no dura más de 400 días");
  });

  it("el titular corrige las fechas y el nombre del año se actualiza", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    const { id: cursoId } = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    await cliente.mutation(api.nucleo.corregirAnioLectivo, { cursoId, fechaInicio: "2026-04-27", fechaFin: "2027-03-05" });
    const calendario = await cliente.query(api.nucleo.obtenerCalendarioCurso, { cursoId });
    expect(calendario).toMatchObject({ fechaInicio: "2026-04-27", fechaFin: "2027-03-05" });
    expect((await t.run((ctx) => ctx.db.query("anioLectivo").collect()))[0].nombre).toBe("2026–2027");
  });

  it("al corregir valen las mismas reglas que al crear", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    const { id: cursoId } = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    await expect(cliente.mutation(api.nucleo.corregirAnioLectivo, { cursoId, fechaInicio: "2025-09-01", fechaFin: "2026-08-20" }))
      .rejects.toThrow("El año lectivo ya terminó");
    await expect(cliente.mutation(api.nucleo.corregirAnioLectivo, { cursoId, fechaInicio: "2026-01-05", fechaFin: "2027-03-05" }))
      .rejects.toThrow("no dura más de 400 días");
  });

  it("no deja fuera a un parcial ya definido", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    const { id: cursoId } = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    await cliente.mutation(api.nucleo.definirPeriodos, { cursoId, periodos: periodosValidos });
    await expect(cliente.mutation(api.nucleo.corregirAnioLectivo, { cursoId, fechaInicio: "2026-06-01", fechaFin: "2027-02-26" }))
      .rejects.toThrow("Primer parcial");
  });

  it("solo el titular corrige el año", async () => {
    const t = convexTest(schema, modules);
    const { cliente } = await sembrarDocente(t);
    const { id: cursoId } = await cliente.mutation(api.nucleo.crearCurso, datosCurso);
    const otro = await sembrarDocente(t, "docente_2");
    await expect(otro.cliente.mutation(api.nucleo.corregirAnioLectivo, { cursoId, fechaInicio: "2026-05-04", fechaFin: "2027-02-26" }))
      .rejects.toThrow("No eres el docente titular");
  });
});

