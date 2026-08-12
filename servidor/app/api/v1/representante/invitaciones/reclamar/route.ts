import { responderError } from "@/lib/http";
import { exigirSesion } from "@/lib/sesion";
import { reclamarInvitacionCurso } from "@cresco/db/acceso";
import { NextResponse } from "next/server";
import { z } from "zod";

const entradaSchema = z.object({
 codigo_corto: z.string().trim().min(1),
 parentesco: z.enum([
  "MADRE",
  "PADRE",
  "ABUELO_A",
  "TIO_A",
  "HERMANO_A",
  "TUTOR_LEGAL",
  "OTRO",
 ]),
 estudiante: z.object({
  tipo_documento: z.enum(["CEDULA", "PASAPORTE", "SIN_DOCUMENTO"]).optional(),
  numero_documento: z.string().trim().min(1),
  nombres: z.string().trim().min(1),
  apellidos: z.string().trim().min(1),
  fecha_nacimiento: z.iso.date().optional(),
 }),
 consentimiento: z.object({
  version_documento: z.string().trim().min(1),
  otorgado: z.literal(true),
 }),
});

export async function POST(request: Request): Promise<NextResponse> {
 try {
  const sesion = await exigirSesion(request);
  const entrada = entradaSchema.parse(await request.json());
  const resultado = await reclamarInvitacionCurso(sesion.userId, {
   codigoCorto: entrada.codigo_corto,
   parentesco: entrada.parentesco,
   estudiante: {
    tipoDocumento: entrada.estudiante.tipo_documento,
    numeroDocumento: entrada.estudiante.numero_documento,
    nombres: entrada.estudiante.nombres,
    apellidos: entrada.estudiante.apellidos,
    fechaNacimiento: entrada.estudiante.fecha_nacimiento,
   },
   consentimiento: {
    versionDocumento: entrada.consentimiento.version_documento,
    otorgado: entrada.consentimiento.otorgado,
   },
  });

  return NextResponse.json(resultado, { status: 201 });
 } catch (error) {
  return responderError(error);
 }
}
