// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./conducta.ts", "./_generated/*.js"]);

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
    return { estudianteId, matriculaId, periodoAcademicoId, negativaId, positivaId };
  });
  return { ...ids, docente: t.withIdentity({ subject: "docente_1" }) };
}

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

describe("conducta", () => {
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
});
