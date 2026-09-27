// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { textoResumenSemanal } from "./conducta";
import type { Id } from "./_generated/dataModel";
import { BANDERAS } from "./lib/flags";
import schema from "./schema";

const modules = import.meta.glob(["./conducta.ts", "./nucleo.ts", "./semillas.ts", "./auditoria.ts", "./_generated/*.js"]);
/**
 * convex-test firma las identidades con el emisor `https://convex.test`, y
 * desde el PR #42 `perfilActual` las resuelve por `tokenIdentifier` -- emisor
 * + subject --, con respaldo al subject a secas solo para el emisor que
 * declare `CLERK_JWT_ISSUER_DOMAIN`. Declararlo aqui hace que sembrar por
 * `authSubject` siga funcionando, sin que la prueba fije el formato interno de
 * la identidad, que no es asunto suyo.
 */
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date("2026-09-10T02:00:00Z"));
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
});
afterEach(() => vi.unstubAllEnvs());
afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "review_docente", tipoDocumento: "CEDULA", numeroDocumento: "0000000000", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const cliente = t.withIdentity({ subject: "review_docente" });
  const curso = await cliente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela prueba", nombreCurso: "Quinto A", nivel: "5to", paralelo: "A",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  await t.mutation(internal.semillas.cargar, {});
  const ids = await t.run(async ctx => {
    const c = (await ctx.db.get(curso.id))!;
    const a = (await ctx.db.get(c.anioLectivoId))!;
    const periodoId = await ctx.db.insert("periodoAcademico", {
      anioLectivoId: a._id, nombre: "Parcial", orden: 1, fechaInicio: "2026-09-01", fechaFin: "2026-09-30", estado: "EN_CURSO", actualizadoEn: Date.now(),
    });
    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId: a.institucionId, tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "", nombres: "Prueba", apellidos: "Prueba",
      origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("matricula", { estudianteId, cursoId: c._id, fechaIngreso: "2026-09-01", estado: "CURSANDO", actualizadoEn: Date.now() });
    const tipo = (await ctx.db.query("tipoAccion").collect()).find(x => x.signo === "POSITIVA")!;
    return { estudianteId, tipoAccionId: tipo._id, periodoId, anioLectivoId: a._id, institucionId: a.institucionId };
  });
  const args = { estudianteId: ids.estudianteId, tipoAccionId: ids.tipoAccionId, descripcion: "Acción de prueba", puntosAplicados: 2, fechaOcurrencia: "2026-09-09" };
  return { t, cliente, ids, args };
}

/**
 * El bug que costó una tarde real: `fixture()` —como casi todo este archivo—
 * inserta el parcial **a mano, con `estado: "EN_CURSO"`**, saltándose la
 * mutation real. Ningún docente puede escribir eso: `definirPeriodos` solo
 * sabe insertar con `estado: "PLANIFICADO"`, y nada en la aplicación lo
 * transiciona jamás — ver `lib/periodos.ts`. Con las 429 pruebas usando el
 * atajo, la aplicación entera podía (y estuvo) rota para cualquier
 * institución real sin que ninguna lo notara.
 *
 * Esta prueba monta el escenario **como lo monta un docente de verdad**: la
 * mutation pública, sin tocar la base a mano para el parcial. Si algo vuelve
 * a exigir `estado === "EN_CURSO"` en vez de mirar las fechas, esto revienta
 * aquí, no en el teléfono de Kenny.
 */
it("con un parcial recién definido por la mutation real (PLANIFICADO, no EN_CURSO), sí se puede registrar", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_real", tipoDocumento: "CEDULA", numeroDocumento: "0000000001", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const cliente = t.withIdentity({ subject: "docente_real" });
  const curso = await cliente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela prueba", nombreCurso: "Sexto B", nivel: "6to", paralelo: "B",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  // La mutation real, tal cual la usa la pantalla de "Definir parciales".
  // Las fechas: el año empezó ayer, el parcial empieza hoy -- exactamente lo
  // que Kenny puso al reportar esto.
  await cliente.mutation(api.nucleo.definirPeriodos, {
    cursoId: curso.id,
    periodos: [
      { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-09-09", fechaFin: "2026-09-30" },
      { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-10-01", fechaFin: "2026-11-30" },
    ],
  });
  await t.mutation(internal.semillas.cargar, {});
  const ids = await t.run(async (ctx) => {
    const c = (await ctx.db.get(curso.id))!;
    const a = (await ctx.db.get(c.anioLectivoId))!;
    const periodo = (await ctx.db.query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", a._id)).first())!;
    // Comprobación de que no se hizo trampa: sigue exactamente como lo dejó
    // `definirPeriodos`, sin que este test ni nada más lo haya tocado.
    if (periodo.estado !== "PLANIFICADO") throw new Error(`esperaba PLANIFICADO, quedó ${periodo.estado}`);
    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId: a.institucionId, tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "", nombres: "Ana", apellidos: "Prueba",
      origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("matricula", { estudianteId, cursoId: c._id, fechaIngreso: "2026-09-09", estado: "CURSANDO", actualizadoEn: Date.now() });
    const tipo = (await ctx.db.query("tipoAccion").collect()).find((x) => x.signo === "POSITIVA")!;
    return { estudianteId, tipoAccionId: tipo._id };
  });

  const accionId = await cliente.mutation(api.conducta.registrarAccion, {
    estudianteId: ids.estudianteId, tipoAccionId: ids.tipoAccionId,
    descripcion: "Ayudó a un compañero", puntosAplicados: 2,
  });
  expect(accionId).toBeTruthy();
  const puntaje = await t.run((ctx) => ctx.db.get(accionId).then(async (accion) =>
    ctx.db.query("puntajePeriodo")
      .withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", accion!.matriculaId).eq("periodoAcademicoId", accion!.periodoAcademicoId))
      .unique(),
  ));
  expect(puntaje?.puntajeActual).toBe(62);

  // Y lo mismo para pasar lista: el otro sitio que Kenny reportó roto.
  await expect(cliente.mutation(api.conducta.tomarAsistencia, {
    cursoId: curso.id, marcas: [{ estudianteId: ids.estudianteId, estado: "PRESENTE" }],
  })).resolves.toBeDefined();

  // Y la pantalla que Kenny no lograba encontrar: el progreso del hijo para
  // la familia. No es que la pantalla no existiera -- `reporteAcumulado`
  // depende del mismo `periodoDelCurso`, así que fallaba con el mismo
  // PERIODO_NO_VIGENTE. Un error de servidor en una pantalla real se lee
  // fácil como "esta pantalla no existe" cuando no se distingue de una
  // pantalla vacía.
  await t.run(async (ctx) => {
    const repPerfilId = await ctx.db.insert("perfilUsuario", {
      authSubject: "familia_real", tipoDocumento: "CEDULA", numeroDocumento: "0000000003", actualizadoEn: Date.now(),
    });
    const representanteId = await ctx.db.insert("representante", { perfilUsuarioId: repPerfilId, actualizadoEn: Date.now() });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId: ids.estudianteId, parentesco: "MADRE",
      estado: "ACTIVO", vigenteDesde: "2026-09-09", actualizadoEn: Date.now(),
    });
  });
  const progreso = await t.withIdentity({ subject: "familia_real" })
    .query(api.conducta.reporteAcumulado, { estudianteId: ids.estudianteId });
  expect(progreso.puntaje).toBe(62);
  expect(progreso.franja).not.toBeNull();
});

/**
 * El segundo bug que Kenny encontró probando de verdad: un estudiante recién
 * aprobado, sin una sola acción todavía, se quedaba sin franja —
 * `puntaje?.franjaConductaId` solo existe después de la primera
 * `recalcularPuntaje`, y esa nunca corrió. La pantalla necesita el color y la
 * frase desde el primer día, no desde la primera anotación.
 */
it("reporteAcumulado calcula la franja aunque nunca haya corrido recalcularPuntaje (sin acciones)", async () => {
  const { t, args } = await fixture();
  // `fixture()` deja la matrícula sin ninguna fila en `puntajePeriodo`: es
  // exactamente el estado de un estudiante recién aprobado.
  const repPerfilId = await t.run((ctx) => ctx.db.insert("perfilUsuario", {
    authSubject: "familia_sin_acciones", tipoDocumento: "CEDULA", numeroDocumento: "0000000004", actualizadoEn: Date.now(),
  }));
  await t.run(async (ctx) => {
    const representanteId = await ctx.db.insert("representante", { perfilUsuarioId: repPerfilId, actualizadoEn: Date.now() });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId: args.estudianteId, parentesco: "PADRE",
      estado: "ACTIVO", vigenteDesde: "2026-09-01", actualizadoEn: Date.now(),
    });
  });
  const progreso = await t.withIdentity({ subject: "familia_sin_acciones" })
    .query(api.conducta.reporteAcumulado, { estudianteId: args.estudianteId });
  expect(progreso.puntaje).toBe(60);
  expect(progreso.bitacora).toEqual([]);
  expect(progreso.franja).toMatchObject({ nombre: "En el punto de partida" });
});

/**
 * El primer bug: sin ningún parcial cubriendo hoy —entre dos parciales, o el
 * docente todavía no definió ninguno—, `reporteAcumulado` lanzaba
 * `PERIODO_NO_VIGENTE` sin que nada lo atrapara, y la familia se llevaba
 * "No pudimos cargar esta vista" en vez de ver el punto de partida.
 */
it("reporteAcumulado no revienta sin ningún parcial cubriendo hoy: punto de partida, sin error", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_sin_parcial_hoy", tipoDocumento: "CEDULA", numeroDocumento: "0000000005", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const cliente = t.withIdentity({ subject: "docente_sin_parcial_hoy" });
  const curso = await cliente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela de prueba", nombreCurso: "Octavo A", nivel: "8vo", paralelo: "A",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  // Ninguno de los dos cubre "hoy" (2026-09-09, por el reloj congelado):
  // el primero ya terminó, el segundo todavía no empieza.
  await cliente.mutation(api.nucleo.definirPeriodos, {
    cursoId: curso.id,
    periodos: [
      { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-05-04", fechaFin: "2026-09-01" },
      { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-09-20", fechaFin: "2026-11-30" },
    ],
  });
  await t.mutation(internal.semillas.cargar, {});
  const estudianteId = await t.run(async (ctx) => {
    const c = (await ctx.db.get(curso.id))!;
    const a = (await ctx.db.get(c.anioLectivoId))!;
    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId: a.institucionId, tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "", nombres: "Sin", apellidos: "Parcial",
      origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("matricula", { estudianteId, cursoId: c._id, fechaIngreso: "2026-09-01", estado: "CURSANDO", actualizadoEn: Date.now() });
    const representanteId = await ctx.db.insert("representante", {
      perfilUsuarioId: await ctx.db.insert("perfilUsuario", {
        authSubject: "familia_sin_parcial_hoy", tipoDocumento: "CEDULA", numeroDocumento: "0000000006", actualizadoEn: Date.now(),
      }), actualizadoEn: Date.now(),
    });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId, parentesco: "MADRE", estado: "ACTIVO", vigenteDesde: "2026-09-01", actualizadoEn: Date.now(),
    });
    return estudianteId;
  });

  const progreso = await t.withIdentity({ subject: "familia_sin_parcial_hoy" })
    .query(api.conducta.reporteAcumulado, { estudianteId });
  expect(progreso.periodo).toBeNull();
  expect(progreso.puntaje).toBe(60);
  expect(progreso.congelado).toBe(false);
  expect(progreso.bitacora).toEqual([]);
  expect(progreso.franja).toMatchObject({ nombre: "En el punto de partida" });
});

it("control: registra, recalcula y rechaza superar +4", async () => {
  const { t, cliente, args } = await fixture();
  await cliente.mutation(api.conducta.registrarAccion, args);
  await cliente.mutation(api.conducta.registrarAccion, args);
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toThrow("tope");
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(64);
});

it.each(["1900-01-01", "2026-10-01"])("rechaza fecha fuera del período: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "PERIODO_CERRADO" } });
});

it("debe rechazar un día no lectivo", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(ctx => ctx.db.insert("diaNoLectivo", { anioLectivoId: ids.anioLectivoId, fecha: args.fechaOcurrencia, motivo: "Suspensión", actualizadoEn: Date.now() }));
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "DIA_NO_LECTIVO" } });
});

it("debe rechazar un tipo de otra institución", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(async ctx => {
    const { _id, _creationTime, ...institucion } = (await ctx.db.get(ids.institucionId))!;
    const otraId = await ctx.db.insert("institucion", { ...institucion, nombreDeclarado: "Otra escuela" });
    await ctx.db.patch(ids.tipoAccionId, { institucionId: otraId });
  });
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
});

it.each([1.5, NaN, Infinity, -Infinity, 0, 3, -1])("rechaza puntos inválidos: %s", async puntosAplicados => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, puntosAplicados })).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
});

it.each(["", "basura", "2026-9-09", "2026-02-30", "2026-09-09T12:00:00Z"])("rechaza fecha inválida: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "FECHAS_INVALIDAS" } });
});

/**
 * La regla se prueba en sus dos estados, no solo en el que esté en `true` o
 * `false` hoy en `flags.ts` — así el archivo sigue significando algo aunque
 * la bandera del QA de fin de semana cambie de valor el lunes. Se muta el
 * objeto compartido y se restaura en `finally`: es el mismo módulo que
 * importa `conducta.ts`, así que afecta a la mutation real, no a una copia.
 */
async function conBandera<T>(valor: boolean, fn: () => Promise<T>): Promise<T> {
  const original = BANDERAS.PERMITIR_ANOTAR_FIN_DE_SEMANA;
  (BANDERAS as { PERMITIR_ANOTAR_FIN_DE_SEMANA: boolean }).PERMITIR_ANOTAR_FIN_DE_SEMANA = valor;
  try {
    return await fn();
  } finally {
    (BANDERAS as { PERMITIR_ANOTAR_FIN_DE_SEMANA: boolean }).PERMITIR_ANOTAR_FIN_DE_SEMANA = original;
  }
}

it.each(["2026-09-05", "2026-09-06"])("rechaza el fin de semana con la bandera de QA apagada: %s", async fechaOcurrencia => {
  await conBandera(false, async () => {
    const { cliente, args } = await fixture();
    await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "DIA_NO_LECTIVO" } });
  });
});

/**
 * `BANDERAS.PERMITIR_ANOTAR_FIN_DE_SEMANA` — QA del fin de semana antes de la
 * entrega. Solo salta "es sábado o domingo"; un `diaNoLectivo` declarado a
 * mano por la institución sigue bloqueando igual con la bandera encendida.
 */
it.each(["2026-09-05", "2026-09-06"])("con la bandera de QA encendida, el fin de semana ya no se rechaza: %s", async fechaOcurrencia => {
  await conBandera(true, async () => {
    const { cliente, args } = await fixture();
    await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).resolves.toBeTruthy();
  });
});

it("la bandera de QA no salta un día declarado explícitamente como no lectivo", async () => {
  await conBandera(true, async () => {
    const { t, cliente, ids, args } = await fixture();
    // Un sábado, pero el mismo que además la institución marcó a mano.
    await t.run((ctx) => ctx.db.insert("diaNoLectivo", {
      anioLectivoId: ids.anioLectivoId, fecha: "2026-09-05", motivo: "Feriado local", actualizadoEn: Date.now(),
    }));
    await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia: "2026-09-05" }))
      .rejects.toMatchObject({ data: { codigo: "DIA_NO_LECTIVO" } });
  });
});

it("rechaza un docente ajeno con ErrorPermiso sin escribir acciones, puntajes ni auditoría", async () => {
  const { t, args } = await fixture();
  await t.run(async ctx => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_ajeno", tipoDocumento: "CEDULA", numeroDocumento: "0000000001", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  // El codigo viaja en `.data`, no como clase cruda: `conErroresPublicos`
  // envuelve en `ConvexError` y esa es la convencion del resto del proyecto
  // (`interaccion`, `nucleo`). La version de #39 era la que se salia.
  await expect(t.withIdentity({ subject: "docente_ajeno" }).mutation(api.conducta.registrarAccion, args))
    .rejects.toMatchObject({ data: { codigo: "SIN_PERMISO" } });
  const estado = await t.run(async ctx => ({
    acciones: await ctx.db.query("accionRegistrada").collect(),
    puntajes: await ctx.db.query("puntajePeriodo").collect(),
    auditoria: await ctx.db.query("auditoria").filter(q => q.eq(q.field("entidadTipo"), "accionRegistrada")).collect(),
  }));
  expect(estado).toEqual({ acciones: [], puntajes: [], auditoria: [] });
});

it("rechaza solicitudes sin autenticar", async () => {
  const { t, args } = await fixture();
  await expect(t.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "NO_AUTENTICADO" } });
});

it("usa la fecha de Guayaquil y audita la creación", async () => {
  const { t, cliente, args, ids } = await fixture();
  const { fechaOcurrencia, ...sinFecha } = args;
  const id = await cliente.mutation(api.conducta.registrarAccion, sinFecha);
  const estado = await t.run(async ctx => ({
    accion: await ctx.db.get(id),
    auditoria: await ctx.db.query("auditoria").filter(q => q.eq(q.field("entidadId"), id)).unique(),
  }));
  expect(estado.accion).toMatchObject({ fechaOcurrencia: "2026-09-09", periodoAcademicoId: ids.periodoId });
  expect(estado.auditoria).toMatchObject({ accion: "CREAR", institucionId: ids.institucionId, entidadId: id });
  expect(estado.auditoria?.perfilUsuarioId).toBeDefined();
});

it("suma los signos por separado para el tope diario y excluye acciones anuladas al recalcular", async () => {
  const { t, cliente, args } = await fixture();
  const tipoAccionId = await t.run(async ctx => (await ctx.db.query("tipoAccion").collect()).find(x => x.codigo === "NEG_INDISCIPLINA")!._id);
  const negativa = { ...args, tipoAccionId, puntosAplicados: -3 };
  await cliente.mutation(api.conducta.registrarAccion, args);
  const anulada = await cliente.mutation(api.conducta.registrarAccion, negativa);
  await cliente.mutation(api.conducta.registrarAccion, { ...negativa, puntosAplicados: -2 });
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...negativa, puntosAplicados: -1 })).rejects.toMatchObject({ data: { codigo: "TOPE_DIARIO_ALCANZADO" } });
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(57);
  await t.run(ctx => ctx.db.patch(anulada, { estado: "ANULADA", puntosAplicados: 0, resueltaEn: Date.now(), motivoResolucion: "Corrección" }));
  await cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia: "2026-09-10" });
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!)).toMatchObject({ puntajeActual: 62, puntosPositivos: 4, puntosNegativos: -2 });
});

it.each(["congelado", "cerrado"])("no deja escrituras parciales con puntaje %s", async estado => {
  const { t, cliente, args, ids } = await fixture();
  await cliente.mutation(api.conducta.registrarAccion, args);
  await t.run(async ctx => {
    if (estado === "congelado") {
      const puntaje = (await ctx.db.query("puntajePeriodo").unique())!;
      await ctx.db.patch(puntaje._id, { congelado: true });
    } else {
      await ctx.db.patch(ids.periodoId, { estado: "CERRADO" });
    }
  });
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "PERIODO_CERRADO" } });
  expect(await t.run(async ctx => (await ctx.db.query("accionRegistrada").collect()).length)).toBe(1);
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(62);
});

it.each(["propia", "ajena", "inactiva"])("valida categoría %s", async caso => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(async ctx => {
    const tipo = (await ctx.db.get(ids.tipoAccionId))!;
    let institucionId = ids.institucionId;
    if (caso === "ajena") {
      const { _id, _creationTime, ...datos } = (await ctx.db.get(ids.institucionId))!;
      institucionId = await ctx.db.insert("institucion", datos);
    }
    await ctx.db.patch(tipo.categoriaAccionId, { institucionId, activa: caso !== "inactiva" });
    await ctx.db.patch(tipo._id, { institucionId: ids.institucionId });
  });
  if (caso === "propia") {
    await expect(cliente.mutation(api.conducta.registrarAccion, args)).resolves.toBeDefined();
  } else {
    await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
  }
});

/* =======================================================================
 * Asistencia, reportes y cierre nocturno (#10)
 *
 * Vienen de `feat/asistencia-reportes-cron`. Se conservan enteras junto a
 * las de arriba: las de main cubren `registrarAccion` (#39) y estas cubren
 * todo lo demas del modulo. El ayudante se llama `sembrar` y el de arriba
 * `fixture`, asi que no chocan.
 * ======================================================================= */

async function sembrar(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const ahora = Date.now();
    const perfil = await ctx.db.insert("perfilUsuario", { authSubject: "docente_1", tipoDocumento: "CEDULA", numeroDocumento: "1", actualizadoEn: ahora });
    const docenteId = await ctx.db.insert("docente", { perfilUsuarioId: perfil, actualizadoEn: ahora });
    const institucionId = await ctx.db.insert("institucion", { nombreDeclarado: "Piloto", verificada: false, regimen: "COSTA_INSULAR", ciudad: "GYE", zonaHoraria: "America/Guayaquil", puntajeBase: 60, puntajeMinimo: 0, puntajeMaximo: 100, topeDiarioPositivo: 4, topeDiarioNegativo: 5, estado: "ACTIVA", actualizadoEn: ahora });
    const anio = await ctx.db.insert("anioLectivo", { institucionId, nombre: "2026", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "EN_CURSO", actualizadoEn: ahora });
    const periodoAcademicoId = await ctx.db.insert("periodoAcademico", { anioLectivoId: anio, nombre: "P1", orden: 1, fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "EN_CURSO", actualizadoEn: ahora });
    const cursoId = await ctx.db.insert("curso", { anioLectivoId: anio, nombre: "5A", nivel: "5", paralelo: "A", jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora });
    await ctx.db.insert("asignacionDocente", { cursoId, docenteId, rol: "TITULAR", vigenteDesde: "2026-01-01", actualizadoEn: ahora });
    const estudianteId = await ctx.db.insert("estudiante", { institucionId, nombres: "Ana", apellidos: "Pérez", tipoDocumento: "CEDULA", numeroDocumento: "2", origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: ahora });
    const matriculaId = await ctx.db.insert("matricula", { estudianteId, cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: ahora });
    await ctx.db.insert("puntajePeriodo", { matriculaId, periodoAcademicoId, puntajeBase: 60, puntosPositivos: 0, puntosNegativos: 0, puntajeActual: 60, congelado: false, recalculadoEn: ahora });
    const categoria = await ctx.db.insert("categoriaAccion", { institucionId, codigo: "DISCIPLINA", nombre: "Disciplina", aplicaA: "ESTUDIANTE", orden: 1, activa: true, actualizadoEn: ahora });
    const negativaId = await ctx.db.insert("tipoAccion", { institucionId, categoriaAccionId: categoria, codigo: "NEG", nombre: "Neg", signo: "NEGATIVA", puntosDefecto: -1, puntosMin: -3, puntosMax: -1, requiereDescripcion: true, admiteInconformidad: true, cuentaEnBitacora: true, activa: true, actualizadoEn: ahora });
    const positivaId = await ctx.db.insert("tipoAccion", { institucionId, categoriaAccionId: categoria, codigo: "POS", nombre: "Pos", signo: "POSITIVA", puntosDefecto: 1, puntosMin: 1, puntosMax: 2, requiereDescripcion: true, admiteInconformidad: false, cuentaEnBitacora: true, activa: true, actualizadoEn: ahora });
    const plantillaReporteId = await ctx.db.insert("plantillaReporte", { nombre: "Diario", version: 1, activa: true, actualizadoEn: ahora });
    const plantillaCampoId = await ctx.db.insert("plantillaCampo", { plantillaReporteId, codigo: "ANUNCIOS", etiqueta: "Anuncios", tipoDato: "TEXTO_LARGO", orden: 1, activo: true });
    return { estudianteId, matriculaId, periodoAcademicoId, cursoId, negativaId, positivaId, plantillaCampoId };
  });
  return { ...ids, docente: t.withIdentity({ subject: "docente_1" }) };
}

describe("conducta — asistencia, reportes y cierre nocturno (#10)", () => {
  // Dentro del `describe` y no en el nivel superior: un `beforeEach` suelto se
  // aplica a **todas** las pruebas del archivo, y este fijaba el reloj al 15
  // de septiembre por encima del que usan las pruebas de #39, que esperan el
  // 9. Al juntar los dos archivos eso rompia cinco pruebas ajenas.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  it("rechaza a un docente ajeno", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await t.run(async (ctx) => { const p = await ctx.db.insert("perfilUsuario", { authSubject: "docente_2", tipoDocumento: "CEDULA", numeroDocumento: "9", actualizadoEn: Date.now() }); await ctx.db.insert("docente", { perfilUsuarioId: p, actualizadoEn: Date.now() }); });
    await expect(t.withIdentity({ subject: "docente_2" }).mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -1 })).rejects.toThrow("no pertenece a un curso tuyo");
  });
  it("no deja escribir más allá del tope negativo", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t); const accion = (puntos: number) => e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: puntos });
    await accion(-3); await accion(-2); await expect(accion(-1)).rejects.toThrow("tope");
    expect(await t.run((ctx) => ctx.db.query("accionRegistrada").collect())).toHaveLength(2);
  });
  it("recalcula desde todas las acciones vigentes", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -3 });
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.positivaId, descripcion: "Ayuda", puntosAplicados: 2 });
    const puntaje = await t.run((ctx) => ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", e.matriculaId).eq("periodoAcademicoId", e.periodoAcademicoId)).unique());
    expect(puntaje?.puntajeActual).toBe(59);
  });
  it("corrige la asistencia del día sin crear una segunda fila", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.tomarAsistencia, { cursoId: e.cursoId, marcas: [{ estudianteId: e.estudianteId, estado: "AUSENTE" }] });
    const resultado = await e.docente.mutation(api.conducta.tomarAsistencia, { cursoId: e.cursoId, marcas: [{ estudianteId: e.estudianteId, estado: "PRESENTE", observacion: "Llegó" }] });
    expect(resultado).toMatchObject({ creadas: 0, actualizadas: 1 });
    const filas = await t.run((ctx) => ctx.db.query("registroAsistencia").collect());
    expect(filas).toHaveLength(1); expect(filas[0]).toMatchObject({ estado: "PRESENTE", observacion: "Llegó" });
  });
  it("muestra a los estudiantes cursando sin marca como pendientes", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    const respuesta = await e.docente.query(api.conducta.asistenciaDelDia, { cursoId: e.cursoId });
    expect(respuesta.estudiantes).toEqual([expect.objectContaining({ estudianteId: e.estudianteId, estado: null, observacion: null })]);
  });
  it("guarda un borrador y publica una fotografía por estudiante", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.guardarReporteGeneral, { cursoId: e.cursoId, valores: [{ plantillaCampoId: e.plantillaCampoId, valorTexto: "Mañana hay evaluación" }] });
    const publicado = await e.docente.mutation(api.conducta.publicarReporteGeneral, { cursoId: e.cursoId });
    expect(publicado.generados).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("reporteEstudiante").collect())).toHaveLength(1);
  });
  it("rechaza notas que superan siete días", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await expect(e.docente.mutation(api.conducta.publicarComunicado, { cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "CURSO", titulo: "Aviso", contenido: "Texto", diasVisible: 8 })).rejects.toThrow("entre 1 y 7");
  });
  it("el cierre nocturno genera el reporte de una acción sin borrador", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -1 });
    const primero = await t.mutation(internal.conducta.cierreNocturno, { fecha: "2026-09-15" });
    const segundo = await t.mutation(internal.conducta.cierreNocturno, { fecha: "2026-09-15" });
    expect(primero.generados).toBe(1); expect(segundo.generados).toBe(0);
  });
});

/* =======================================================================
 * Deshacer una anotacion puesta por error
 * ======================================================================= */

/** El curso y un tipo negativo del catalogo sembrado, sobre el `fixture`. */
async function conCursoYNegativa(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.t.run(async (ctx) => {
    const matricula = (await ctx.db.query("matricula").collect())[0];
    const negativa = (await ctx.db.query("tipoAccion").collect())
      .find((x) => x.codigo === "NEG_INDISCIPLINA")!;
    return { cursoId: matricula.cursoId, negativaId: negativa._id };
  });
}

/**
 * `anularAccion` existia y auditaba, pero ninguna pantalla la llamaba porque
 * no habia forma de listar lo que un docente ya anoto. Un error quedaba en el
 * expediente de un menor hasta que la familia reclamara.
 */
it("lista las anotaciones recientes del curso, lo mas nuevo primero", async () => {
  const f = await fixture();
  const { cursoId, negativaId } = await conCursoYNegativa(f);

  await f.cliente.mutation(api.conducta.registrarAccion, f.args);
  vi.advanceTimersByTime(1000);
  await f.cliente.mutation(api.conducta.registrarAccion, {
    ...f.args, tipoAccionId: negativaId, puntosAplicados: -1, descripcion: "Se equivocó de alumno",
  });

  const lista = await f.cliente.query(api.conducta.anotacionesRecientesDelCurso, { cursoId });
  expect(lista).toHaveLength(2);
  expect(lista[0]).toMatchObject({
    estudiante: "Prueba Prueba", descripcion: "Se equivocó de alumno", signo: "NEGATIVA",
  });
});

/**
 * `anulable` lo decide el servidor con la misma regla que `anularAccion`: solo
 * una negativa vigente. Si lo decidiera la pantalla, podria ofrecer un boton
 * que despues se rechaza.
 */
it("marca como anulable solo la negativa vigente", async () => {
  const f = await fixture();
  const { cursoId, negativaId } = await conCursoYNegativa(f);
  await f.cliente.mutation(api.conducta.registrarAccion, f.args);
  await f.cliente.mutation(api.conducta.registrarAccion, {
    ...f.args, tipoAccionId: negativaId, puntosAplicados: -1,
  });

  const lista = await f.cliente.query(api.conducta.anotacionesRecientesDelCurso, { cursoId });
  expect(lista.find((a) => a.signo === "POSITIVA")?.anulable).toBe(false);
  expect(lista.find((a) => a.signo === "NEGATIVA")?.anulable).toBe(true);
});

it("tras anularla, sigue en la lista pero ya no es anulable", async () => {
  const f = await fixture();
  const { cursoId, negativaId } = await conCursoYNegativa(f);
  const id = await f.cliente.mutation(api.conducta.registrarAccion, {
    ...f.args, tipoAccionId: negativaId, puntosAplicados: -1,
  });

  await f.cliente.mutation(api.conducta.anularAccion, { accionRegistradaId: id, motivo: "Era otro alumno" });

  const [fila] = await f.cliente.query(api.conducta.anotacionesRecientesDelCurso, { cursoId });
  expect(fila).toMatchObject({ estado: "ANULADA", anulable: false });
});

it("no enseña lo de hace más de una semana", async () => {
  const f = await fixture();
  const { cursoId } = await conCursoYNegativa(f);
  await f.cliente.mutation(api.conducta.registrarAccion, { ...f.args, fechaOcurrencia: "2026-09-01" });

  expect(await f.cliente.query(api.conducta.anotacionesRecientesDelCurso, { cursoId })).toHaveLength(0);
});

it("un docente que no es titular del curso no ve sus anotaciones", async () => {
  const f = await fixture();
  const { cursoId } = await conCursoYNegativa(f);
  await f.t.run(async (ctx) => {
    const perfil = await ctx.db.insert("perfilUsuario", {
      authSubject: "otro_docente", tipoDocumento: "CEDULA", numeroDocumento: "0000000009", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
  });
  await expect(
    f.t.withIdentity({ subject: "otro_docente" }).query(api.conducta.anotacionesRecientesDelCurso, { cursoId }),
  ).rejects.toMatchObject({ data: { codigo: expect.any(String) } });
});

/* =======================================================================
 * QA del 26 de septiembre: notificaciones, comunicados y el reporte en vivo
 *
 * Antes de esto, `registrarAccion`, `publicarReporteGeneral`/cierreNocturno
 * y `publicarComunicado` no avisaban a nadie — un representante solo se
 * enteraba de algo si abría la aplicación por su cuenta. Y del lado de la
 * familia, nada leía `comunicadoCurso`: se escribía y no se consultaba en
 * ningún sitio.
 * ======================================================================= */

/** Vincula un representante nuevo al estudiante y devuelve su `perfilUsuarioId`. */
async function conRepresentante(
  t: Awaited<ReturnType<typeof fixture>>["t"],
  estudianteId: Id<"estudiante">,
  authSubject: string,
) {
  return await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject, tipoDocumento: "CEDULA", numeroDocumento: authSubject, actualizadoEn: Date.now(),
    });
    const representanteId = await ctx.db.insert("representante", { perfilUsuarioId, actualizadoEn: Date.now() });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId, parentesco: "MADRE", estado: "ACTIVO",
      vigenteDesde: "2026-09-01", actualizadoEn: Date.now(),
    });
    return perfilUsuarioId;
  });
}

it("registrarAccion notifica al representante vinculado, con el estudiante como referencia", async () => {
  const { t, cliente, args, ids } = await fixture();
  const perfilUsuarioId = await conRepresentante(t, ids.estudianteId, "familia_notif_1");

  await cliente.mutation(api.conducta.registrarAccion, args);

  const notificaciones = await t.run((ctx) => ctx.db.query("notificacion")
    .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfilUsuarioId)).collect());
  expect(notificaciones).toHaveLength(1);
  expect(notificaciones[0]).toMatchObject({
    tipo: "ACCION_POSITIVA", cuerpo: args.descripcion,
    entidadTipo: "estudiante", entidadId: ids.estudianteId,
  });
});

it("sin representante vinculado, registrarAccion no revienta ni notifica a nadie", async () => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).resolves.toBeDefined();
});

it("publicarComunicado ya no exige un parcial vigente hoy", async () => {
  // Mismo escenario que el bug de `reporteAcumulado`: ningún parcial cubre
  // "hoy". Antes esto hacía que publicar una nota o un evento reventara con
  // PERIODO_NO_VIGENTE — un comunicado es informativo, no una acción de
  // conducta, y no debería depender de si hay un parcial abierto.
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_comunicado_sin_parcial", tipoDocumento: "CEDULA", numeroDocumento: "1", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const cliente = t.withIdentity({ subject: "docente_comunicado_sin_parcial" });
  const curso = await cliente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela prueba", nombreCurso: "Noveno A", nivel: "9no", paralelo: "A",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  await cliente.mutation(api.nucleo.definirPeriodos, {
    cursoId: curso.id,
    periodos: [
      { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-05-04", fechaFin: "2026-09-01" },
      { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-09-20", fechaFin: "2026-11-30" },
    ],
  });
  await expect(cliente.mutation(api.conducta.publicarComunicado, {
    cursoId: curso.id, tipo: "NOTA_PROFESOR", alcance: "CURSO", titulo: "Aviso", contenido: "Mañana no hay clases",
  })).resolves.toBeDefined();
});

it("publicarComunicado notifica a las familias del curso, y solo a la del estudiante en alcance ESTUDIANTE", async () => {
  const t = convexTest(schema, modules);
  const e = await sembrar(t);
  const perfilCurso = await conRepresentante(t, e.estudianteId, "familia_comunicado_curso");

  await e.docente.mutation(api.conducta.publicarComunicado, {
    cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "CURSO", titulo: "Recordatorio", contenido: "Traer el uniforme de deportes",
  });
  const deCurso = await t.run((ctx) => ctx.db.query("notificacion")
    .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfilCurso)).collect());
  expect(deCurso).toHaveLength(1);
  expect(deCurso[0]).toMatchObject({ tipo: "NOTA_DOCENTE", titulo: "Recordatorio", entidadId: e.estudianteId });

  await e.docente.mutation(api.conducta.publicarComunicado, {
    cursoId: e.cursoId, tipo: "EVENTO", alcance: "ESTUDIANTE", estudianteId: e.estudianteId,
    titulo: "Reunión individual", contenido: "Sobre su progreso", fechaEvento: "2026-09-20",
  });
  const trasEvento = await t.run((ctx) => ctx.db.query("notificacion")
    .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfilCurso)).collect());
  expect(trasEvento).toHaveLength(2);
  expect(trasEvento[1]).toMatchObject({ tipo: "COMUNICADO", titulo: "Reunión individual" });
});

describe("comunicadosVigentes — lo que lee la familia", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  it("devuelve una nota vigente y la excluye pasada su ventana", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    const perfilUsuarioId = await conRepresentante(t, e.estudianteId, "familia_vigente_1");
    await e.docente.mutation(api.conducta.publicarComunicado, {
      cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "CURSO", titulo: "Aviso de hoy", contenido: "Texto", diasVisible: 1,
    });

    const vigentes = await t.withIdentity({ subject: "familia_vigente_1" })
      .query(api.conducta.comunicadosVigentes, { estudianteId: e.estudianteId });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]).toMatchObject({ tipo: "NOTA_PROFESOR", titulo: "Aviso de hoy" });
    void perfilUsuarioId;

    vi.setSystemTime(new Date("2026-09-17T15:00:00Z"));
    const yaExpirado = await t.withIdentity({ subject: "familia_vigente_1" })
      .query(api.conducta.comunicadosVigentes, { estudianteId: e.estudianteId });
    expect(yaExpirado).toHaveLength(0);
  });

  it("un evento con plazo sigue visible después del día del evento, hasta el fin del plazo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_plazo_1");
    await e.docente.mutation(api.conducta.publicarComunicado, {
      cursoId: e.cursoId, tipo: "EVENTO", alcance: "CURSO", titulo: "Semana cultural",
      contenido: "Actividades toda la semana", fechaEvento: "2026-09-14", fechaEventoFin: "2026-09-18",
    });

    // El día del evento ya pasó (hoy es el 15), pero el plazo sigue abierto.
    const vigentes = await t.withIdentity({ subject: "familia_plazo_1" })
      .query(api.conducta.comunicadosVigentes, { estudianteId: e.estudianteId });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]).toMatchObject({ fechaEvento: "2026-09-14", fechaEventoFin: "2026-09-18" });
  });

  it("un comunicado dirigido a otro estudiante no aparece", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ajena_1");
    const otroEstudianteId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("estudiante", {
        institucionId: (await ctx.db.get(e.estudianteId))!.institucionId,
        nombres: "Luis", apellidos: "Mora", tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "",
        origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
      });
      await ctx.db.insert("matricula", { estudianteId: id, cursoId: e.cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: Date.now() });
      return id;
    });
    await e.docente.mutation(api.conducta.publicarComunicado, {
      cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "ESTUDIANTE", estudianteId: otroEstudianteId,
      titulo: "Solo para Luis", contenido: "Texto",
    });

    const vigentes = await t.withIdentity({ subject: "familia_ajena_1" })
      .query(api.conducta.comunicadosVigentes, { estudianteId: e.estudianteId });
    expect(vigentes).toHaveLength(0);
  });
});

describe("reporteDeHoy en vivo — antes de que exista la fotografía del día", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  it("muestra las acciones de hoy sin esperar a que se publique el reporte general", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_en_vivo_1");
    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpió la clase", puntosAplicados: -1,
    });

    const hoy = await t.withIdentity({ subject: "familia_en_vivo_1" })
      .query(api.conducta.reporteDeHoy, { estudianteId: e.estudianteId });
    expect(hoy.hay).toBe(true);
    expect(hoy.reporte?.id).toBeNull();
    expect(hoy.reporte?.acciones).toHaveLength(1);
    expect(hoy.reporte?.acciones[0]).toMatchObject({ descripcion: "Interrumpió la clase" });
    expect(hoy.reporte?.general).toEqual([]);
  });

  it("sin ninguna acción ni asistencia todavía, sigue diciendo que no hay reporte", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_en_vivo_2");

    const hoy = await t.withIdentity({ subject: "familia_en_vivo_2" })
      .query(api.conducta.reporteDeHoy, { estudianteId: e.estudianteId });
    expect(hoy).toMatchObject({ hay: false, reporte: null });
  });

  it("una vez publicado el reporte general, reemplaza la vista en vivo por la fotografía real", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_en_vivo_3");
    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Se equivocó de fila", puntosAplicados: -1,
    });
    await e.docente.mutation(api.conducta.publicarReporteGeneral, { cursoId: e.cursoId });

    const hoy = await t.withIdentity({ subject: "familia_en_vivo_3" })
      .query(api.conducta.reporteDeHoy, { estudianteId: e.estudianteId });
    expect(hoy.hay).toBe(true);
    expect(hoy.reporte?.id).not.toBeNull();
    expect(hoy.reporte?.acciones).toHaveLength(1);
  });
});

/**
 * QA del 27 de septiembre: "que la app sea un motivador para que los padres
 * estén acompañando". `fraseDeAliento` (lib/insights.test.ts) ya cubre las
 * reglas de la frase en sí; esto verifica solo el cableado real -- que
 * `reporteAcumulado` encuentra el parcial anterior por `orden - 1` y le pasa
 * los datos correctos.
 */
describe("reporteAcumulado — frase de aliento", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  it("celebra la mejora encontrando el puntaje del parcial anterior por su orden", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t); // orden 1, puntajeActual 60, sin negativas
    await conRepresentante(t, e.estudianteId, "familia_aliento_1");
    await t.run(async (ctx) => {
      const anio = (await ctx.db.get(e.cursoId))!.anioLectivoId;
      const anteriorId = await ctx.db.insert("periodoAcademico", {
        anioLectivoId: anio, nombre: "P0", orden: 0,
        fechaInicio: "2025-01-01", fechaFin: "2025-12-31", estado: "CERRADO", actualizadoEn: Date.now(),
      });
      await ctx.db.insert("puntajePeriodo", {
        matriculaId: e.matriculaId, periodoAcademicoId: anteriorId,
        puntajeBase: 60, puntosPositivos: 0, puntosNegativos: -5, puntajeActual: 55,
        congelado: true, recalculadoEn: Date.now(),
      });
    });

    const acumulado = await t.withIdentity({ subject: "familia_aliento_1" })
      .query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.insight).toBe("Subió 5 puntos desde el parcial anterior — vale la pena celebrarlo en casa.");
  });

  it("sin parcial anterior, cae a la racha desde el inicio del parcial vigente", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t); // orden 1, sin negativas, parcial empieza 2026-01-01
    await conRepresentante(t, e.estudianteId, "familia_aliento_2");

    const acumulado = await t.withIdentity({ subject: "familia_aliento_2" })
      .query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.insight).toBe("Ninguna anotación negativa en lo que va del parcial — se nota el acompañamiento.");
  });

  it("sin ningún parcial vigente hoy, el insight es null y no revienta", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_aliento_3");
    await t.run((ctx) => ctx.db.patch(e.periodoAcademicoId, { fechaInicio: "2020-01-01", fechaFin: "2020-12-31" }));

    const acumulado = await t.withIdentity({ subject: "familia_aliento_3" })
      .query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.insight).toBeNull();
  });

  it("da un consejo cuando una misma categoría negativa se repite, no ante una sola", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_aliento_4");
    // negativaId es de categoría DISCIPLINA (ver `sembrar`).
    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpió", puntosAplicados: -1,
    });

    let acumulado = await t.withIdentity({ subject: "familia_aliento_4" })
      .query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.consejo).toBeNull(); // una sola vez: sin consejo todavía

    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Otra vez", puntosAplicados: -1,
    });
    acumulado = await t.withIdentity({ subject: "familia_aliento_4" })
      .query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.consejo).toContain("cómo se sintió hoy en clase");
  });

  /**
   * El camino completo: `registrarLecturaSensible` escribe
   * `entregaReporte.leidoEn`, y es exactamente lo que `ReporteDeHoy` llama al
   * abrirse (`useLecturaSensible`). La otra vía, "Reportes anteriores"
   * (`marcarReportesVistos`), tiene sus propias pruebas más abajo. Se prueba el
   * camino real, no el atajo de escribir `leidoEn` a mano.
   */
  it("reconoce al representante que ya revisó más de un reporte diario este parcial", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_aliento_5");
    const familia = t.withIdentity({ subject: "familia_aliento_5" });

    for (const fecha of ["2026-09-10", "2026-09-11"]) {
      await e.docente.mutation(api.conducta.registrarAccion, {
        estudianteId: e.estudianteId, tipoAccionId: e.positivaId, descripcion: "Ayudó", puntosAplicados: 1, fechaOcurrencia: fecha,
      });
      await e.docente.mutation(api.conducta.publicarReporteGeneral, { cursoId: e.cursoId, fecha });
    }
    const reportes = await t.run((ctx) => ctx.db.query("reporteEstudiante")
      .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", e.matriculaId)).collect());
    expect(reportes).toHaveLength(2);

    let acumulado = await familia.query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.reconocimiento).toBeNull(); // todavía no abrió ninguno

    for (const reporte of reportes) {
      await familia.mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId, recurso: "REPORTE_ESTUDIANTE", reporteEstudianteId: reporte._id,
      });
    }
    acumulado = await familia.query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    expect(acumulado.reconocimiento).toBe("Revisaste el reporte diario 2 veces este parcial — se nota el acompañamiento.");
  });
});

/**
 * QA del 27 de septiembre: "conocer los 3 estudiantes con más acciones
 * negativas", y "que no falle y salga que es por falta de conexión" cuando
 * todavía no hay nada que mostrar.
 */
describe("panoramaDelCurso", () => {
  it("sin parcial vigente, no revienta: hayPeriodo en false y todo vacío", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await t.run((ctx) => ctx.db.patch(e.periodoAcademicoId, { fechaInicio: "2020-01-01", fechaFin: "2020-12-31" }));

    const panorama = await e.docente.query(api.conducta.panoramaDelCurso, { cursoId: e.cursoId });
    expect(panorama).toMatchObject({ hayPeriodo: false, sinAnotaciones: 0, topNegativos: [] });
  });

  it("con parcial vigente pero sin estudiantes matriculados, tampoco revienta", async () => {
    const t = convexTest(schema, modules);
    const perfilUsuarioId = await t.run((ctx) => ctx.db.insert("perfilUsuario", {
      authSubject: "docente_sin_alumnos", tipoDocumento: "CEDULA", numeroDocumento: "1", actualizadoEn: Date.now(),
    }));
    const docente = t.withIdentity({ subject: "docente_sin_alumnos" });
    await t.run((ctx) => ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() }));
    const curso = await docente.mutation(api.nucleo.crearCurso, {
      nombreInstitucion: "Escuela vacía", nombreCurso: "Primero A", nivel: "1ro", paralelo: "A",
      anioInicio: "2026-05-04", anioFin: "2027-02-26",
    });
    await docente.mutation(api.nucleo.definirPeriodos, {
      cursoId: curso.id,
      periodos: [
        { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-05-04", fechaFin: "2026-09-30" },
        { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-10-01", fechaFin: "2027-02-26" },
      ],
    });

    const panorama = await docente.query(api.conducta.panoramaDelCurso, { cursoId: curso.id });
    expect(panorama).toMatchObject({ totalEstudiantes: 0, sinAnotaciones: 0, topNegativos: [] });
  });

  it("cuenta sin nombrar a quién no tiene ninguna anotación, y nombra solo a quién sí tiene negativas", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    // Un segundo estudiante, matriculado en el mismo curso, sin ninguna acción.
    const otroId = await t.run(async (ctx) => {
      const matricula = (await ctx.db.get(e.matriculaId))!;
      const id = await ctx.db.insert("estudiante", {
        institucionId: (await ctx.db.get(e.estudianteId))!.institucionId,
        nombres: "Luis", apellidos: "Mora", tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "",
        origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
      });
      await ctx.db.insert("matricula", { estudianteId: id, cursoId: matricula.cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: Date.now() });
      return id;
    });
    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpió", puntosAplicados: -1,
    });

    const panorama = await e.docente.query(api.conducta.panoramaDelCurso, { cursoId: e.cursoId });
    expect(panorama.totalEstudiantes).toBe(2);
    expect(panorama.sinAnotaciones).toBe(1); // Luis, sin ninguna
    expect(panorama.topNegativos).toEqual([
      expect.objectContaining({ estudianteId: e.estudianteId, nombre: "Ana Pérez", cantidad: 1 }),
    ]);
    // Luis no tiene ninguna negativa: no aparece nombrado en el top.
    expect(panorama.topNegativos.some((x) => x.estudianteId === otroId)).toBe(false);
  });

  it("el top se limita a 3 y ordena de mayor a menor", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    const otros = await t.run(async (ctx) => {
      const matricula = (await ctx.db.get(e.matriculaId))!;
      const institucionId = (await ctx.db.get(e.estudianteId))!.institucionId;
      const ids = [];
      for (const nombre of ["B", "C", "D"]) {
        const id = await ctx.db.insert("estudiante", {
          institucionId, nombres: nombre, apellidos: "Prueba", tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "",
          origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
        });
        await ctx.db.insert("matricula", { estudianteId: id, cursoId: matricula.cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: Date.now() });
        ids.push(id);
      }
      return ids;
    });
    // Ana (sembrar): 1 negativa. B: 3. C: 2. D: 0 (queda fuera del top).
    const anotar = (estudianteId: Id<"estudiante">, veces: number) => Promise.all(
      Array.from({ length: veces }, (_, i) => e.docente.mutation(api.conducta.registrarAccion, {
        estudianteId, tipoAccionId: e.negativaId, descripcion: `Interrumpió ${i}`, puntosAplicados: -1,
      })),
    );
    await anotar(e.estudianteId, 1);
    await anotar(otros[0], 3);
    await anotar(otros[1], 2);

    const panorama = await e.docente.query(api.conducta.panoramaDelCurso, { cursoId: e.cursoId });
    expect(panorama.topNegativos.map((x) => x.cantidad)).toEqual([3, 2, 1]);
    expect(panorama.topNegativos).toHaveLength(3);
  });

  it("rechaza a un docente que no es titular del curso", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrar(t);
    await t.run(async (ctx) => {
      const p = await ctx.db.insert("perfilUsuario", { authSubject: "docente_ajeno_panorama", tipoDocumento: "CEDULA", numeroDocumento: "9", actualizadoEn: Date.now() });
      await ctx.db.insert("docente", { perfilUsuarioId: p, actualizadoEn: Date.now() });
    });
    await expect(
      t.withIdentity({ subject: "docente_ajeno_panorama" }).query(api.conducta.panoramaDelCurso, { cursoId: e.cursoId }),
    ).rejects.toMatchObject({ data: { codigo: expect.any(String) } });
  });
});

/**
 * QA del 27 de septiembre: "en donde habría un reporte diario los fines de
 * semana... que arriba indique que no es día de clases pero descubra un
 * resumen de lo que sucedió en la semana". Un sábado o domingo, "todavía no
 * hay reporte de hoy" no era cierto -- no es que el docente no cerró el día,
 * es que no hay clases.
 */
describe("reporteDeHoy — resumen del fin de semana", () => {
  // Domingo: mismos sábado/domingo ya usados en las pruebas de la bandera
  // de QA de este archivo (2026-09-05 y 2026-09-06).
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-06T15:00:00Z")));

  it("entre semana, sin reporte todavía, no calcula ningún resumen", async () => {
    vi.setSystemTime(new Date("2026-09-09T15:00:00Z")); // miércoles
    const { t, args } = await fixture();
    await conRepresentante(t, args.estudianteId, "familia_finde_1");

    const hoy = await t.withIdentity({ subject: "familia_finde_1" })
      .query(api.conducta.reporteDeHoy, { estudianteId: args.estudianteId });
    expect(hoy).toMatchObject({ hay: false, finDeSemana: false, resumenSemana: null });
  });

  it("un domingo sin ninguna acción en los últimos 7 días, el resumen sale vacío pero válido", async () => {
    const { t, args } = await fixture();
    await conRepresentante(t, args.estudianteId, "familia_finde_2");

    const hoy = await t.withIdentity({ subject: "familia_finde_2" })
      .query(api.conducta.reporteDeHoy, { estudianteId: args.estudianteId });
    expect(hoy.hay).toBe(false);
    expect(hoy.finDeSemana).toBe(true);
    expect(hoy.resumenSemana).toEqual({
      desde: "2026-08-31", hasta: "2026-09-06", puntosPositivos: 0, puntosNegativos: 0, acciones: [],
    });
  });

  it("un domingo, junta en el resumen las acciones vigentes de los últimos 7 días", async () => {
    const { t, cliente, args } = await fixture();
    await conRepresentante(t, args.estudianteId, "familia_finde_3");
    // Viernes 4: dentro de la ventana de 7 días que termina el domingo 6.
    await cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia: "2026-09-04" });

    const hoy = await t.withIdentity({ subject: "familia_finde_3" })
      .query(api.conducta.reporteDeHoy, { estudianteId: args.estudianteId });
    expect(hoy.resumenSemana?.puntosPositivos).toBe(2);
    expect(hoy.resumenSemana?.acciones).toMatchObject([
      { descripcion: "Acción de prueba", signo: "POSITIVA", fecha: "2026-09-04" },
    ]);
  });

  it("una acción de hace más de 7 días no entra en el resumen del domingo", async () => {
    // Un domingo más adelante (también domingo: 2026-09-06 + 7 días), para
    // que el período de `fixture()` (empieza el 2026-09-01) alcance a cubrir
    // una fecha que sí quede fuera de la ventana de 7 días.
    vi.setSystemTime(new Date("2026-09-13T15:00:00Z"));
    const { t, cliente, args } = await fixture();
    await conRepresentante(t, args.estudianteId, "familia_finde_4");
    await cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia: "2026-09-02" }); // 11 días antes

    const hoy = await t.withIdentity({ subject: "familia_finde_4" })
      .query(api.conducta.reporteDeHoy, { estudianteId: args.estudianteId });
    expect(hoy.resumenSemana?.acciones).toEqual([]);
  });
});

describe("resumen semanal por push", () => {
  // Jueves 24 a las 10:00 de Guayaquil; el resumen sale el sábado 26.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-24T15:00:00Z")));
  const SABADO = "2026-09-26";

  const resumenes = (t: ReturnType<typeof convexTest>) => t.run((ctx) =>
    ctx.db.query("notificacion").filter((q) => q.eq(q.field("tipo"), "RESUMEN_SEMANAL")).collect());

  it("el texto nombra lo bueno primero y no inventa plurales", () => {
    expect(textoResumenSemanal(0, 0)).toBe("Semana sin anotaciones de conducta.");
    expect(textoResumenSemanal(1, 0)).toBe("Esta semana: 1 anotación positiva.");
    expect(textoResumenSemanal(0, 2)).toBe("Esta semana: 2 anotaciones por mejorar.");
    expect(textoResumenSemanal(4, 1)).toBe("Esta semana: 4 anotaciones positivas y 1 por mejorar.");
  });

  it("le llega a la familia con lo de la semana y abre el reporte del estudiante", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_semana_1");
    const accion = (tipoAccionId: Id<"tipoAccion">, puntosAplicados: number) => e.docente.mutation(
      api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId, descripcion: "Algo", puntosAplicados });
    await accion(e.positivaId, 1); await accion(e.positivaId, 1); await accion(e.negativaId, -1);

    vi.setSystemTime(new Date("2026-09-26T14:00:00Z"));
    expect(await t.mutation(internal.conducta.resumenSemanalDelCurso, { cursoId: e.cursoId, fecha: SABADO })).toBe(1);
    const [aviso, ...otros] = await resumenes(t);
    expect(otros).toEqual([]);
    expect(aviso).toMatchObject({
      titulo: "La semana de Ana", cuerpo: "Esta semana: 2 anotaciones positivas y 1 por mejorar.",
      entidadTipo: "estudiante", entidadId: e.estudianteId,
    });
  });

  it("una semana de clases sin anotaciones también se avisa, como semana tranquila", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_semana_2");
    await t.mutation(internal.conducta.resumenSemanalDelCurso, { cursoId: e.cursoId, fecha: SABADO });
    expect((await resumenes(t)).map((n) => n.cuerpo)).toEqual(["Semana sin anotaciones de conducta."]);
  });

  it("una semana sin clases no se avisa: no hubo semana que resumir", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_semana_3");
    await t.run(async (ctx) => {
      const curso = (await ctx.db.get(e.cursoId))!;
      for (const fecha of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
        await ctx.db.insert("diaNoLectivo", { anioLectivoId: curso.anioLectivoId, fecha, motivo: "Feriado", actualizadoEn: Date.now() });
      }
    });
    expect(await t.mutation(internal.conducta.resumenSemanalDelCurso, { cursoId: e.cursoId, fecha: SABADO })).toBe(0);
    expect(await resumenes(t)).toEqual([]);
  });

  it("un estudiante sin representante vinculado no genera nada", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    expect(await t.mutation(internal.conducta.resumenSemanalDelCurso, { cursoId: e.cursoId, fecha: SABADO })).toBe(0);
  });

  it("el envío general reparte un curso activo por transacción", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await t.run(async (ctx) => {
      const curso = (await ctx.db.get(e.cursoId))!;
      await ctx.db.insert("curso", {
        anioLectivoId: curso.anioLectivoId, nombre: "5B", nivel: "5", paralelo: "B",
        jornada: "MATUTINA", estado: "ARCHIVADO", actualizadoEn: Date.now(),
      });
    });
    expect(await t.mutation(internal.conducta.enviarResumenesSemanales, { fecha: SABADO })).toBe(1);
    const tareas = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(tareas.filter((p) => p.name === "conducta:resumenSemanalDelCurso").map((p) => p.args[0]))
      .toEqual([{ cursoId: e.cursoId, fecha: SABADO }]);
  });
});

/** Un segundo estudiante en el mismo curso, con su propia familia. */
async function otroEstudiante(t: ReturnType<typeof convexTest>, e: Awaited<ReturnType<typeof sembrar>>, nombres: string, familia?: string) {
  const estudianteId = await t.run(async (ctx) => {
    const ana = (await ctx.db.get(e.estudianteId))!;
    const id = await ctx.db.insert("estudiante", {
      institucionId: ana.institucionId, nombres, apellidos: "Zambrano", tipoDocumento: "CEDULA",
      numeroDocumento: `doc-${nombres}`, origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO",
      estado: "ACTIVO", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("matricula", { estudianteId: id, cursoId: e.cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: Date.now() });
    return id;
  });
  if (familia) await conRepresentante(t, estudianteId, familia);
  return estudianteId;
}

describe("constancia de que la familia vio un comunicado", () => {
  // Martes 15 a las 10:00 de Guayaquil.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  const publicar = (e: Awaited<ReturnType<typeof sembrar>>, extra: Record<string, unknown> = {}) =>
    e.docente.mutation(api.conducta.publicarComunicado, {
      cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "CURSO",
      titulo: "Reunión de padres", contenido: "El jueves a las 18:00.", ...extra,
    });

  it("recién publicado nadie lo vio, y se dice quiénes faltan en orden", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno", "familia_bruno");
    await publicar(e);
    const [comunicado] = await e.docente.query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId });
    expect(comunicado).toMatchObject({
      titulo: "Reunión de padres", tipo: "NOTA_PROFESOR", familias: 2, vistos: 0,
      faltan: ["Ana Pérez", "Bruno Zambrano"],
    });
  });

  it("al abrir el reporte donde aparece, esa familia queda como que lo vio, una sola vez", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno", "familia_bruno");
    const comunicadoId = await publicar(e);
    const ana = t.withIdentity({ subject: "familia_ana" });
    expect(await ana.mutation(api.conducta.marcarComunicadosVistos, { estudianteId: e.estudianteId, comunicadoIds: [comunicadoId] })).toBe(1);
    expect(await ana.mutation(api.conducta.marcarComunicadosVistos, { estudianteId: e.estudianteId, comunicadoIds: [comunicadoId] })).toBe(0);
    const [comunicado] = await e.docente.query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId });
    expect(comunicado).toMatchObject({ familias: 2, vistos: 1, faltan: ["Bruno Zambrano"] });
  });

  it("un estudiante sin representante no cuenta como familia", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno");
    await publicar(e);
    const [comunicado] = await e.docente.query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId });
    expect(comunicado).toMatchObject({ familias: 1, faltan: ["Ana Pérez"] });
  });

  it("un aviso a un solo estudiante solo cuenta a su familia, y otra no puede marcarlo", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    const brunoId = await otroEstudiante(t, e, "Bruno", "familia_bruno");
    const comunicadoId = await publicar(e, { alcance: "ESTUDIANTE", estudianteId: brunoId });

    const ana = t.withIdentity({ subject: "familia_ana" });
    expect(await ana.mutation(api.conducta.marcarComunicadosVistos, { estudianteId: e.estudianteId, comunicadoIds: [comunicadoId] })).toBe(0);
    const [comunicado] = await e.docente.query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId });
    expect(comunicado).toMatchObject({ familias: 1, vistos: 0, faltan: ["Bruno Zambrano"] });
  });

  it("nadie marca como visto desde el reporte de un hijo ajeno", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno", "familia_bruno");
    const comunicadoId = await publicar(e);
    await expect(t.withIdentity({ subject: "familia_bruno" }).mutation(api.conducta.marcarComunicadosVistos, {
      estudianteId: e.estudianteId, comunicadoIds: [comunicadoId],
    })).rejects.toThrow("No tienes acceso");
  });

  it("un aviso que ya dejó de mostrarse no se puede marcar, pero sigue en la constancia", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    const comunicadoId = await publicar(e);
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    expect(await t.withIdentity({ subject: "familia_ana" }).mutation(api.conducta.marcarComunicadosVistos, {
      estudianteId: e.estudianteId, comunicadoIds: [comunicadoId],
    })).toBe(0);
    const [comunicado] = await e.docente.query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId });
    expect(comunicado).toMatchObject({ vistos: 0, faltan: ["Ana Pérez"], visibleHasta: "2026-09-16" });
  });

  it("solo el titular del curso ve la constancia", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await t.run(async (ctx) => {
      const p = await ctx.db.insert("perfilUsuario", { authSubject: "docente_2", tipoDocumento: "CEDULA", numeroDocumento: "9", actualizadoEn: Date.now() });
      await ctx.db.insert("docente", { perfilUsuarioId: p, actualizadoEn: Date.now() });
    });
    await expect(t.withIdentity({ subject: "docente_2" }).query(api.conducta.comunicadosPublicados, { cursoId: e.cursoId }))
      .rejects.toThrow("No eres el docente titular de este curso");
  });
});

describe("quién abrió el reporte del día", () => {
  // Martes 15 a las 10:00 de Guayaquil.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  const publicarReporte = (e: Awaited<ReturnType<typeof sembrar>>, fecha?: string) =>
    e.docente.mutation(api.conducta.publicarReporteGeneral, { cursoId: e.cursoId, ...(fecha ? { fecha } : {}) });
  const reporteDe = (t: Awaited<ReturnType<typeof fixture>>["t"], estudianteId: Id<"estudiante">) => t.run(async (ctx) => {
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", estudianteId).eq("estado", "CURSANDO")).unique();
    return (await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula!._id)).collect())[0]._id;
  });

  it("recién publicado nadie lo abrió, y se dice quiénes faltan", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno", "familia_bruno");
    await publicarReporte(e);
    expect(await e.docente.query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId })).toEqual([
      { fecha: "2026-09-15", familias: 2, abiertos: 0, faltan: ["Ana Pérez", "Bruno Zambrano"] },
    ]);
  });

  it("cuenta el reporte abierto el mismo día y el abierto después en Reportes anteriores", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    const brunoId = await otroEstudiante(t, e, "Bruno", "familia_bruno");
    await publicarReporte(e);
    // Ana lo abre el mismo día, desde el reporte del día.
    await t.withIdentity({ subject: "familia_ana" }).mutation(api.auditoria.registrarLecturaSensible, {
      estudianteId: e.estudianteId, recurso: "REPORTE_ESTUDIANTE", reporteEstudianteId: await reporteDe(t, e.estudianteId),
    });
    // Bruno, a la mañana siguiente, en "Reportes anteriores".
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    const bruno = t.withIdentity({ subject: "familia_bruno" });
    const suyo = await reporteDe(t, brunoId);
    expect(await bruno.mutation(api.conducta.marcarReportesVistos, { estudianteId: brunoId, reporteEstudianteIds: [suyo] })).toBe(1);
    expect(await bruno.mutation(api.conducta.marcarReportesVistos, { estudianteId: brunoId, reporteEstudianteIds: [suyo] })).toBe(0);
    expect(await e.docente.query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId })).toEqual([
      { fecha: "2026-09-15", familias: 2, abiertos: 2, faltan: [] },
    ]);
  });

  it("nadie marca el reporte de otro estudiante, ni desde el suyo ni desde el ajeno", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    const brunoId = await otroEstudiante(t, e, "Bruno", "familia_bruno");
    await publicarReporte(e);
    const ana = t.withIdentity({ subject: "familia_ana" });
    const deBruno = await reporteDe(t, brunoId);
    // Desde su propio hijo, con el id del reporte ajeno: se ignora.
    expect(await ana.mutation(api.conducta.marcarReportesVistos, { estudianteId: e.estudianteId, reporteEstudianteIds: [deBruno] })).toBe(0);
    // Y pidiendo por el hijo ajeno, ni siquiera entra.
    await expect(ana.mutation(api.conducta.marcarReportesVistos, { estudianteId: brunoId, reporteEstudianteIds: [deBruno] }))
      .rejects.toThrow("No tienes acceso");
    const [dia] = await e.docente.query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId });
    expect(dia.faltan).toContain("Bruno Zambrano");
  });

  it("los últimos cinco días publicados, del más reciente al más antiguo", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    for (const fecha of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"]) {
      await publicarReporte(e, fecha);
    }
    const dias = await e.docente.query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId });
    expect(dias.map((d) => d.fecha)).toEqual(["2026-09-14", "2026-09-11", "2026-09-10", "2026-09-09", "2026-09-08"]);
  });

  it("un estudiante sin representante no cuenta como familia", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_ana");
    await otroEstudiante(t, e, "Bruno");
    await publicarReporte(e);
    const [dia] = await e.docente.query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId });
    expect(dia).toMatchObject({ familias: 1, faltan: ["Ana Pérez"] });
  });

  it("solo el titular del curso ve quién abrió", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await t.run(async (ctx) => {
      const p = await ctx.db.insert("perfilUsuario", { authSubject: "docente_2", tipoDocumento: "CEDULA", numeroDocumento: "9", actualizadoEn: Date.now() });
      await ctx.db.insert("docente", { perfilUsuarioId: p, actualizadoEn: Date.now() });
    });
    await expect(t.withIdentity({ subject: "docente_2" }).query(api.conducta.lecturasDeReportes, { cursoId: e.cursoId }))
      .rejects.toThrow("No eres el docente titular de este curso");
  });
});

describe("informe imprimible del acumulado", () => {
  // Martes 15 a las 10:00 de Guayaquil.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  /** Premium vigente para ese perfil: el mismo entitlement que vende RevenueCat. */
  async function hacerPremium(t: Awaited<ReturnType<typeof fixture>>["t"], perfilUsuarioId: Id<"perfilUsuario">) {
    await t.run(async (ctx) => {
      const planId = await ctx.db.insert("plan", {
        codigo: "REP_PREMIUM_MENSUAL", nombre: "Representante — Premium mensual", audiencia: "REPRESENTANTE",
        entitlementRevenuecat: "premium", periodicidad: "MENSUAL", sinPublicidad: true,
        limites: { exportarPdf: "LIBRE" }, activo: true, actualizadoEn: Date.now(),
      });
      await ctx.db.insert("suscripcion", {
        perfilUsuarioId, planId, origen: "GOOGLE_PLAY", estado: "ACTIVA", iniciaEn: Date.now(),
        renovacionAutomatica: true, actualizadoEn: Date.now(),
      });
    });
  }
  const exportaciones = (t: Awaited<ReturnType<typeof fixture>>["t"]) => t.run(async (ctx) =>
    (await ctx.db.query("auditoria").collect()).filter((a) => a.accion === "EXPORTAR"));

  it("con Premium sale directo, dice de quién es y queda en la auditoría como EXPORTAR", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await hacerPremium(t, await conRepresentante(t, e.estudianteId, "familia_informe_1"));
    const informe = await t.withIdentity({ subject: "familia_informe_1" })
      .mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId });
    expect(informe).toMatchObject({
      estudiante: "Ana Pérez", curso: "5A", institucion: "Piloto", puntaje: 60, generadoEn: Date.now(),
    });
    const [exportacion, ...otras] = await exportaciones(t);
    expect(otras).toEqual([]);
    expect(exportacion).toMatchObject({
      entidadTipo: "estudiante", entidadId: e.estudianteId,
      datosDespues: { recurso: "INFORME_ACUMULADO", conAnuncio: false },
    });
  });

  it("en el plan gratuito, sin ver el anuncio no hay informe ni exportación", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_informe_2");
    await expect(t.withIdentity({ subject: "familia_informe_2" })
      .mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId }))
      .rejects.toThrow("Mira el anuncio para desbloquear el informe");
    expect(await exportaciones(t)).toEqual([]);
  });

  it("ver el anuncio desbloquea un informe, y uno solo", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_informe_3");
    const familia = t.withIdentity({ subject: "familia_informe_3" });
    const primero = await familia.mutation(api.conducta.otorgarDesbloqueo, { recurso: "EXPORTAR_PDF_ACUMULADO" });
    // Ver el anuncio dos veces antes de exportar no acumula informes.
    expect(await familia.mutation(api.conducta.otorgarDesbloqueo, { recurso: "EXPORTAR_PDF_ACUMULADO" })).toBe(primero);
    await familia.mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId });
    await expect(familia.mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId }))
      .rejects.toThrow("Mira el anuncio para desbloquear el informe");
    const [exportacion] = await exportaciones(t);
    expect(exportacion.datosDespues).toEqual({ recurso: "INFORME_ACUMULADO", conAnuncio: true });
  });

  it("lo que se gana con el anuncio vence a los 30 minutos", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_informe_4");
    const familia = t.withIdentity({ subject: "familia_informe_4" });
    await familia.mutation(api.conducta.otorgarDesbloqueo, { recurso: "EXPORTAR_PDF_ACUMULADO" });
    vi.setSystemTime(new Date("2026-09-15T15:31:00Z"));
    await expect(familia.mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId }))
      .rejects.toThrow("Mira el anuncio para desbloquear el informe");
  });

  it("nadie exporta el informe de un hijo ajeno, ni con Premium", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await conRepresentante(t, e.estudianteId, "familia_informe_5");
    const ajena = await t.run(async (ctx) => {
      const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
        authSubject: "familia_ajena", tipoDocumento: "CEDULA", numeroDocumento: "familia_ajena", actualizadoEn: Date.now(),
      });
      await ctx.db.insert("representante", { perfilUsuarioId, actualizadoEn: Date.now() });
      return perfilUsuarioId;
    });
    await hacerPremium(t, ajena);
    await expect(t.withIdentity({ subject: "familia_ajena" })
      .mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId }))
      .rejects.toThrow("No tienes acceso");
  });

  it("el informe dice lo mismo que el acumulado de la pantalla", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await hacerPremium(t, await conRepresentante(t, e.estudianteId, "familia_informe_6"));
    await e.docente.mutation(api.conducta.registrarAccion, {
      estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -2,
    });
    const familia = t.withIdentity({ subject: "familia_informe_6" });
    const pantalla = await familia.query(api.conducta.reporteAcumulado, { estudianteId: e.estudianteId });
    const informe = await familia.mutation(api.conducta.prepararInforme, { estudianteId: e.estudianteId });
    expect(informe).toMatchObject({
      periodo: pantalla.periodo, puntaje: pantalla.puntaje, franja: pantalla.franja, bitacora: pantalla.bitacora,
    });
    expect(informe.bitacora).toHaveLength(1);
  });

  it("el premio del anuncio es solo para representantes", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await expect(e.docente.mutation(api.conducta.otorgarDesbloqueo, { recurso: "EXPORTAR_PDF_ACUMULADO" }))
      .rejects.toThrow("solo para representantes");
  });
});

