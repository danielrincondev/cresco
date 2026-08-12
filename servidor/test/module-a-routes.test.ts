import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
 exigirSesion: vi.fn(),
 listOrganizations: vi.fn(),
 createOrganization: vi.fn(),
 deleteOrganization: vi.fn(),
 crearCursoDocente: vi.fn(),
 verificarCapacidadCurso: vi.fn(),
 definirPeriodosCurso: vi.fn(),
 reclamarInvitacionCurso: vi.fn(),
 decidirEstudiantePendiente: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
 auth: {
  api: {
   listOrganizations: mocks.listOrganizations,
   createOrganization: mocks.createOrganization,
   deleteOrganization: mocks.deleteOrganization,
  },
 },
}));

vi.mock("@/lib/sesion", () => ({
 exigirSesion: mocks.exigirSesion,
}));

vi.mock("@cresco/db/acceso", async (importOriginal) => {
 const actual = await importOriginal<Record<string, unknown>>();
 return {
  ...actual,
  crearCursoDocente: mocks.crearCursoDocente,
  verificarCapacidadCurso: mocks.verificarCapacidadCurso,
  definirPeriodosCurso: mocks.definirPeriodosCurso,
  reclamarInvitacionCurso: mocks.reclamarInvitacionCurso,
  decidirEstudiantePendiente: mocks.decidirEstudiantePendiente,
 };
});

import { ErrorHttp } from "@/lib/http";
import { POST as aprobarEstudiante } from "@/app/api/v1/docente/estudiantes/[estudianteId]/aprobar/route";
import { POST as crearCurso } from "@/app/api/v1/docente/cursos/route";
import { POST as definirPeriodos } from "@/app/api/v1/docente/cursos/[cursoId]/periodos/route";
import { POST as reclamarInvitacion } from "@/app/api/v1/representante/invitaciones/reclamar/route";

const CURSO_ID = "11111111-1111-4111-8111-111111111111";
const ESTUDIANTE_ID = "22222222-2222-4222-8222-222222222222";

function solicitud(path: string, body: unknown): Request {
 return new Request(`http://localhost${path}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
 });
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.exigirSesion.mockResolvedValue({ userId: "user-docente", activeOrganizationId: null });
});

describe("contratos HTTP del módulo A", () => {
 it("crea el curso con los nombres snake_case del contrato", async () => {
  mocks.listOrganizations.mockResolvedValue([
   { id: "org-1", name: "Escuela Cresco" },
  ]);
  mocks.crearCursoDocente.mockResolvedValue({
   id: CURSO_ID,
   nombre: "Quinto A",
   nivel: "5to de básica",
   paralelo: "A",
   jornada: "MATUTINA",
   institucion: "Escuela Cresco",
   total_estudiantes: 0,
   periodo_vigente: null,
  });

  const response = await crearCurso(solicitud("/api/v1/docente/cursos", {
   nombre_institucion: "Escuela Cresco",
   nombre_curso: "Quinto A",
   nivel: "5to de básica",
   paralelo: "A",
   jornada: "MATUTINA",
   anio_inicio: "2026-05-04",
   anio_fin: "2027-02-26",
  }));

  expect(response.status).toBe(201);
  expect(mocks.crearCursoDocente).toHaveBeenCalledWith("user-docente", {
   organizationId: "org-1",
   nombreInstitucion: "Escuela Cresco",
   nombreCurso: "Quinto A",
   nivel: "5to de básica",
   paralelo: "A",
   jornada: "MATUTINA",
   anioInicio: "2026-05-04",
   anioFin: "2027-02-26",
  });
  expect(await response.json()).toMatchObject({ id: CURSO_ID, total_estudiantes: 0 });
 });

 it("acepta de dos a tres períodos y devuelve 201", async () => {
  const periodos = [
   {
    id: "33333333-3333-4333-8333-333333333333",
    nombre: "Primero",
    orden: 1,
    fecha_inicio: "2026-05-04",
    fecha_fin: "2026-08-07",
    estado: "PLANIFICADO",
   },
   {
    id: "44444444-4444-4444-8444-444444444444",
    nombre: "Segundo",
    orden: 2,
    fecha_inicio: "2026-08-10",
    fecha_fin: "2026-11-13",
    estado: "PLANIFICADO",
   },
  ];
  mocks.definirPeriodosCurso.mockResolvedValue(periodos);

  const response = await definirPeriodos(
   solicitud(`/api/v1/docente/cursos/${CURSO_ID}/periodos`, {
    periodos: periodos.map((periodo) => ({
     nombre: periodo.nombre,
     orden: periodo.orden,
     fecha_inicio: periodo.fecha_inicio,
     fecha_fin: periodo.fecha_fin,
    })),
   }),
   { params: Promise.resolve({ cursoId: CURSO_ID }) },
  );

  expect(response.status).toBe(201);
  expect(mocks.definirPeriodosCurso).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ periodos });
 });

 it("registra al estudiante pendiente solo con consentimiento otorgado", async () => {
  mocks.exigirSesion.mockResolvedValue({ userId: "user-representante", activeOrganizationId: null });
  mocks.reclamarInvitacionCurso.mockResolvedValue({
   estudiante_id: ESTUDIANTE_ID,
   estado_verificacion: "PENDIENTE",
  });

  const response = await reclamarInvitacion(solicitud(
   "/api/v1/representante/invitaciones/reclamar",
   {
    codigo_corto: "CRESCO26",
    parentesco: "MADRE",
    estudiante: {
     tipo_documento: "CEDULA",
     numero_documento: "0956789012",
     nombres: "Estudiante",
     apellidos: "Prueba",
     fecha_nacimiento: "2016-06-15",
    },
    consentimiento: { version_documento: "2026-08-01", otorgado: true },
   },
  ));

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
   estudiante_id: ESTUDIANTE_ID,
   estado_verificacion: "PENDIENTE",
  });
 });

 it("aplica la decisión docente usando estudianteId", async () => {
  mocks.decidirEstudiantePendiente.mockResolvedValue({
   estudiante_id: ESTUDIANTE_ID,
   estado_verificacion: "APROBADO",
  });

  const response = await aprobarEstudiante(
   solicitud(`/api/v1/docente/estudiantes/${ESTUDIANTE_ID}/aprobar`, {
    decision: "APROBAR",
    numero_lista: 12,
   }),
   { params: Promise.resolve({ estudianteId: ESTUDIANTE_ID }) },
  );

  expect(response.status).toBe(200);
  expect(mocks.decidirEstudiantePendiente).toHaveBeenCalledWith(
   "user-docente",
   ESTUDIANTE_ID,
   {
    decision: "APROBAR",
    nombres: undefined,
    apellidos: undefined,
    numeroLista: 12,
    motivoRechazo: undefined,
   },
  );
 });

 it("devuelve el error común de sesión sin ejecutar dominio", async () => {
  mocks.exigirSesion.mockRejectedValue(
   new ErrorHttp(401, "NO_AUTENTICADO", "Debe iniciar sesión."),
  );

  const response = await aprobarEstudiante(
   solicitud(`/api/v1/docente/estudiantes/${ESTUDIANTE_ID}/aprobar`, {
    decision: "APROBAR",
   }),
   { params: Promise.resolve({ estudianteId: ESTUDIANTE_ID }) },
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
   codigo: "NO_AUTENTICADO",
   mensaje: "Debe iniciar sesión.",
  });
  expect(mocks.decidirEstudiantePendiente).not.toHaveBeenCalled();
 });
});
