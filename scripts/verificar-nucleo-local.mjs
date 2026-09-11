/** Smoke test con datos sintéticos. Solo usa el backend local de este checkout. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const movil = fileURLToPath(new URL("../movil/", import.meta.url));
const config = JSON.parse(await readFile(new URL("../movil/.convex/local/default/config.json", import.meta.url), "utf8"));
assert(Number.isInteger(config.ports.cloud));
const url = `http://127.0.0.1:${config.ports.cloud}`;
const sufijo = randomUUID().slice(0, 8);
const docente = `prueba-docente-${sufijo}`;
const representante = `prueba-representante-${sufijo}`;
const otro = `prueba-otro-${sufijo}`;
function cliente(subject) {
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAdminAuth(config.adminKey, { subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });
  return client;
}
const alta = { tipoDocumento: "PASAPORTE", numeroDocumento: `DOC-${sufijo}`, roles: ["DOCENTE"] };
const perfiles = await Promise.all(Array.from({ length: 3 }, () => cliente(docente).mutation(anyApi.nucleo.completarPerfil, alta)));
assert(perfiles.every((p) => p.perfilUsuarioId === perfiles[0].perfilUsuarioId));
for (const [subject, documento] of [[representante, `REP-${sufijo}`], [otro, `OTR-${sufijo}`]]) {
  await cliente(subject).mutation(anyApi.nucleo.completarPerfil, { tipoDocumento: "PASAPORTE", numeroDocumento: documento, roles: ["REPRESENTANTE"] });
}
const anio = new Date().getUTCFullYear();
const curso = await cliente(docente).mutation(anyApi.nucleo.crearCurso, {
  nombreInstitucion: "Escuela sintética de pruebas", nombreCurso: "Curso de prueba", nivel: "5", paralelo: "A",
  anioInicio: `${anio}-01-01`, anioFin: `${anio + 1}-12-31`,
});
await cliente(docente).mutation(anyApi.nucleo.definirPeriodos, { cursoId: curso.id, periodos: [
  { nombre: "Actual", orden: 1, fechaInicio: `${anio}-01-01`, fechaFin: `${anio}-12-31` },
  { nombre: "Próximo", orden: 2, fechaInicio: `${anio + 1}-01-01`, fechaFin: `${anio + 1}-12-31` },
] });
const invitaciones = await Promise.all(Array.from({ length: 3 }, () => cliente(docente).mutation(anyApi.nucleo.crearInvitacion, { cursoId: curso.id })));
assert(invitaciones.every((i) => i.invitacionId === invitaciones[0].invitacionId));
const solicitud = {
  credencial: { codigo: invitaciones[0].codigo }, solicitudId: randomUUID(),
  estudiante: { tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "", nombres: "Estudiante", apellidos: "Sintético" },
  parentesco: "TUTOR_LEGAL", aceptaTratamiento: true, declaraRepresentanteLegal: true, versionDocumento: "2026-09-v2",
};
const registros = await Promise.all(Array.from({ length: 5 }, () => cliente(representante).mutation(anyApi.nucleo.canjearInvitacion, solicitud)));
assert(registros.every((r) => r.estudianteId === registros[0].estudianteId));
const estudianteId = registros[0].estudianteId;
const paginationOpts = { numItems: 20, cursor: null };
const pendientes = await cliente(docente).query(anyApi.nucleo.listarPendientes, { cursoId: curso.id, paginationOpts });
assert.equal(pendientes.page.length, 1);
await assert.rejects(cliente(otro).query(anyApi.nucleo.listarEstudiantes, { cursoId: curso.id, paginationOpts }), /SIN_PERMISO/);
const aprobaciones = await Promise.all(Array.from({ length: 5 }, () => cliente(docente).mutation(anyApi.nucleo.aprobarEstudiante, { cursoId: curso.id, estudianteId })));
assert(aprobaciones.every((a) => a.matriculaId === aprobaciones[0].matriculaId));
const alumnos = await cliente(docente).query(anyApi.nucleo.listarEstudiantes, { cursoId: curso.id, paginationOpts });
assert.equal(alumnos.page.length, 1);
const propios = await cliente(representante).query(anyApi.nucleo.listarMisEstudiantes, { paginationOpts });
assert.equal(propios.page[0].estadoVerificacion, "APROBADO");
assert.equal((await cliente(otro).query(anyApi.nucleo.listarMisEstudiantes, { paginationOpts })).page.length, 0);
assert.equal((await cliente(docente).query(anyApi.nucleo.listarPendientes, { cursoId: curso.id, paginationOpts })).page.length, 0);

// Lectura administrativa exclusivamente local: verifica las escrituras de la transacción.
const consulta = `
const estudianteId = ${JSON.stringify(estudianteId)};
const matriculaId = ${JSON.stringify(aprobaciones[0].matriculaId)};
const puntajes = await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", q => q.eq("matriculaId", matriculaId)).collect();
const auditoria = await ctx.db.query("auditoria").withIndex("por_entidad", q => q.eq("entidadTipo", "estudiante").eq("entidadId", estudianteId)).collect();
const vinculos = await ctx.db.query("vinculoRepresentacion").withIndex("por_estudiante_estado", q => q.eq("estudianteId", estudianteId)).collect();
return { puntajes: puntajes.map(p => p.puntajeActual), auditoria: auditoria.length, vinculos: vinculos.length };
`;
const salida = execFileSync(process.execPath, [fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url)), "run", "--inline-query", consulta], { cwd: movil, encoding: "utf8", env: {
  ...process.env, CONVEX_DEPLOYMENT: "", CONVEX_DEPLOY_KEY: "",
  CONVEX_SELF_HOSTED_URL: url, CONVEX_SELF_HOSTED_ADMIN_KEY: config.adminKey,
} });
assert.deepEqual(JSON.parse(salida), { auditoria: 1, puntajes: [60, 60], vinculos: 1 });
console.log("PASS: backend Convex real; altas, invitaciones, 5 canjes y 5 aprobaciones concurrentes; un vínculo, una matrícula, una auditoría y puntajes de 60.");
