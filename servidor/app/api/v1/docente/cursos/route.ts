import { auth } from "@/lib/auth";
import { responderError } from "@/lib/http";
import { exigirSesion } from "@/lib/sesion";
import { crearCursoDocente, verificarCapacidadCurso } from "@cresco/db/acceso";
import { NextResponse } from "next/server";
import { z } from "zod";

const entradaSchema = z
 .object({
  nombre_institucion: z.string().trim().min(1).max(160),
  nombre_curso: z.string().trim().min(1),
  nivel: z.string().trim().min(1),
  paralelo: z.string().trim().min(1),
  jornada: z.enum(["MATUTINA", "VESPERTINA", "NOCTURNA"]).optional(),
  anio_inicio: z.iso.date(),
  anio_fin: z.iso.date(),
 })
 .refine((entrada) => entrada.anio_fin > entrada.anio_inicio, {
  message: "La fecha final debe ser posterior a la inicial.",
  path: ["anio_fin"],
 });

export async function POST(request: Request): Promise<NextResponse> {
 let organizacionCreada: string | null = null;
 try {
  const sesion = await exigirSesion(request);
  const entrada = entradaSchema.parse(await request.json());
  await verificarCapacidadCurso(sesion.userId);
  const organizaciones = await auth.api.listOrganizations({ headers: request.headers });
  const nombreNormalizado = entrada.nombre_institucion.toLocaleLowerCase("es-EC");
  let organizacion = organizaciones.find(
   (item) => item.name.trim().toLocaleLowerCase("es-EC") === nombreNormalizado,
  );

  if (!organizacion) {
   const baseSlug = entrada.nombre_institucion
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "institucion";
   organizacion = await auth.api.createOrganization({
    headers: request.headers,
    body: {
     name: entrada.nombre_institucion,
     slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
    },
   });
   organizacionCreada = organizacion.id;
  }

  const resultado = await crearCursoDocente(sesion.userId, {
   organizationId: organizacion.id,
   nombreInstitucion: entrada.nombre_institucion,
   nombreCurso: entrada.nombre_curso,
   nivel: entrada.nivel,
   paralelo: entrada.paralelo,
   jornada: entrada.jornada,
   anioInicio: entrada.anio_inicio,
   anioFin: entrada.anio_fin,
  });

  return NextResponse.json(resultado, { status: 201 });
 } catch (error) {
  if (organizacionCreada) {
   try {
    await auth.api.deleteOrganization({
     headers: request.headers,
     body: { organizationId: organizacionCreada },
    });
   } catch (cleanupError) {
    console.error("No se pudo revertir la organización creada para un curso fallido.", cleanupError);
   }
  }
  return responderError(error);
 }
}
