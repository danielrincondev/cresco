export type CodigoDominio =
  | "CONFLICTO"
  | "CURSO_NO_ENCONTRADO"
  | "ESTUDIANTE_NO_ENCONTRADO"
  | "FECHAS_INVALIDAS"
  | "INVITACION_AGOTADA"
  | "INVITACION_EXPIRADA"
  | "INVITACION_NO_ENCONTRADA"
  | "LIMITE_PLAN"
  | "PERFIL_NO_ENCONTRADO"
  | "SIN_PERMISO"
  | "VALIDACION";

export class ErrorDominio extends Error {
  constructor(
    readonly codigo: CodigoDominio,
    message: string,
    readonly detalles?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErrorDominio";
  }
}
