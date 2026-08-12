import { responderError } from "@/lib/http";
import { exigirSesion } from "@/lib/sesion";
import { definirPeriodosCurso } from "@cresco/db/acceso";
import { NextResponse } from "next/server";
import { z } from "zod";

const entradaSchema = z.object({
 periodos: z
  .array(
   z
    .object({
     nombre: z.string().trim().min(1),
     orden: z.number().int().positive(),
     fecha_inicio: z.iso.date(),
     fecha_fin: z.iso.date(),
    })
    .refine((periodo) => periodo.fecha_fin > periodo.fecha_inicio, {
     message: "La fecha final debe ser posterior a la inicial.",
     path: ["fecha_fin"],
    }),
  )
  .min(2)
  .max(3),
});

export async function POST(
 request: Request,
 context: { params: Promise<{ cursoId: string }> },
): Promise<NextResponse> {
 try {
  const sesion = await exigirSesion(request);
  const { cursoId } = await context.params;
  z.uuid().parse(cursoId);
  const entrada = entradaSchema.parse(await request.json());
  const periodos = await definirPeriodosCurso(
   sesion.userId,
   cursoId,
   entrada.periodos.map((periodo) => ({
    nombre: periodo.nombre,
    orden: periodo.orden,
    fechaInicio: periodo.fecha_inicio,
    fechaFin: periodo.fecha_fin,
   })),
  );

  return NextResponse.json({ periodos }, { status: 201 });
 } catch (error) {
  return responderError(error);
 }
}
