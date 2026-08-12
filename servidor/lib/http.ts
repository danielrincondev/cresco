import { ErrorDominio, type CodigoDominio } from "@cresco/db/acceso";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

const ESTADO_POR_CODIGO: Record<CodigoDominio, number> = {
 CONFLICTO: 409,
 CURSO_NO_ENCONTRADO: 404,
 ESTUDIANTE_NO_ENCONTRADO: 404,
 FECHAS_INVALIDAS: 409,
 INVITACION_AGOTADA: 410,
 INVITACION_EXPIRADA: 410,
 INVITACION_NO_ENCONTRADA: 404,
 LIMITE_PLAN: 402,
 PERFIL_NO_ENCONTRADO: 403,
 SIN_PERMISO: 403,
 VALIDACION: 400,
};

export class ErrorHttp extends Error {
 constructor(
  readonly status: number,
  readonly codigo: string,
  message: string,
 ) {
  super(message);
  this.name = "ErrorHttp";
 }
}

export function responderError(error: unknown): NextResponse {
 if (error instanceof ErrorHttp) {
  return NextResponse.json(
   { codigo: error.codigo, mensaje: error.message },
   { status: error.status },
  );
 }
 if (error instanceof ErrorDominio) {
  return NextResponse.json(
   {
    codigo: error.codigo,
    mensaje: error.message,
    ...(error.detalles ? { detalles: error.detalles } : {}),
   },
   { status: ESTADO_POR_CODIGO[error.codigo] },
  );
 }
 if (error instanceof ZodError) {
  return NextResponse.json(
   {
    codigo: "VALIDACION",
    mensaje: "La solicitud no cumple el contrato.",
    detalles: { campos: error.flatten().fieldErrors },
   },
   { status: 400 },
  );
 }

 console.error(error);
 return NextResponse.json(
  { codigo: "ERROR_INTERNO", mensaje: "No se pudo procesar la solicitud." },
  { status: 500 },
 );
}
