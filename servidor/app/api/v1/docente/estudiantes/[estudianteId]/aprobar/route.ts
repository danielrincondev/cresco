import { responderError } from "@/lib/http";
import { exigirSesion } from "@/lib/sesion";
import { decidirEstudiantePendiente } from "@cresco/db/acceso";
import { NextResponse } from "next/server";
import { z } from "zod";

const entradaSchema = z.object({
 decision: z.enum(["APROBAR", "RECHAZAR"]),
 nombres: z.string().trim().min(1).optional(),
 apellidos: z.string().trim().min(1).optional(),
 numero_lista: z.number().int().optional(),
 motivo_rechazo: z.string().trim().min(1).optional(),
});

export async function POST(
 request: Request,
 context: { params: Promise<{ estudianteId: string }> },
): Promise<NextResponse> {
 try {
  const sesion = await exigirSesion(request);
  const { estudianteId } = await context.params;
  z.uuid().parse(estudianteId);
  const entrada = entradaSchema.parse(await request.json());
  const resultado = await decidirEstudiantePendiente(sesion.userId, estudianteId, {
   decision: entrada.decision,
   nombres: entrada.nombres,
   apellidos: entrada.apellidos,
   numeroLista: entrada.numero_lista,
   motivoRechazo: entrada.motivo_rechazo,
  });

  return NextResponse.json(resultado);
 } catch (error) {
  return responderError(error);
 }
}
