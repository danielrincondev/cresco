import { REGLAS } from "../schema/enums";

const formatoFecha = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: REGLAS.ZONA_HORARIA,
  year: "numeric",
});

export function fechaLocalActual(fecha = new Date()): string {
  const partes = Object.fromEntries(
    formatoFecha.formatToParts(fecha).map(({ type, value }) => [type, value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

export function rangosSeSolapan(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string,
): boolean {
  return inicioA <= finB && inicioB <= finA;
}
