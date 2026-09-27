// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { BANDERAS } from "./lib/flags";
import schema from "./schema";

const modules = import.meta.glob(["./conducta.ts", "./nucleo.ts", "./semillas.ts", "./_generated/*.js"]);
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
