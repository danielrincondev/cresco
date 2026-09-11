/**
 * Fechas y horas para la interfaz, siempre en la zona del piloto.
 *
 * ── Por qué no se usa `Intl` con `timeZone` ─────────────────────────────────
 *
 * En el servidor sí se usa: `convex/lib/guardas.ts` resuelve `hoyEnGuayaquil()`
 * con `toLocaleDateString("en-CA", { timeZone })`, y ahí el runtime tiene el
 * `Intl` completo. En el teléfono el motor es Hermes, y su soporte de zonas
 * horarias no es parejo entre versiones de Android — el mismo tipo de riesgo
 * que tumbó los ejes variables de fuente en el issue #21, descubierto tarde.
 *
 * Ecuador continental es **UTC-5 todo el año** y no cambia de hora. Así que la
 * conversión es una resta fija y no hace falta ninguna tabla de zonas. Si algún
 * día el piloto sale de Ecuador continental, esto es lo primero que hay que
 * cambiar, y por eso está en un solo archivo.
 */

const DESFASE_GUAYAQUIL_MS = 5 * 60 * 60 * 1000;

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Descompone un instante en sus partes de calendario **en Guayaquil**.
 *
 * Se corre el instante y después se leen las partes en UTC: así ni el reloj ni
 * la zona del teléfono entran en la cuenta. Un representante que viaja no ve
 * las citas de su hijo movidas de hora.
 */
function partesEnGuayaquil(instante: number) {
  const d = new Date(instante - DESFASE_GUAYAQUIL_MS);
  return {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  };
}

/** "YYYY-MM-DD" del instante, en Guayaquil. */
export function fechaISO(instante: number): string {
  const { anio, mes, dia } = partesEnGuayaquil(instante);
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/** Hoy en Guayaquil. Es el mismo valor que calcula el servidor. */
export const hoyISO = (ahora: number = Date.now()) => fechaISO(ahora);

/** "HH:MM" del instante, en Guayaquil. */
export function horaISO(instante: number): string {
  const { hora, minuto } = partesEnGuayaquil(instante);
  return `${dosDigitos(hora)}:${dosDigitos(minuto)}`;
}

/**
 * "jueves 10 de septiembre" a partir de "YYYY-MM-DD".
 *
 * Sin año: en la app siempre se habla del año lectivo en curso, y el año de
 * más solo alarga una línea que el docente lee de pie.
 */
export function fechaLegible(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  if (!anio || !mes || !dia) return iso;
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[diaSemana]} ${dia} de ${MESES[mes - 1]}`;
}

/** "jueves 10 de septiembre, 12:30" a partir de un instante. */
export function fechaHoraLegible(instante: number): string {
  return `${fechaLegible(fechaISO(instante))}, ${horaISO(instante)}`;
}

/** Medianoche UTC del día que nombra una fecha "YYYY-MM-DD". */
function comoDia(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/**
 * Días de calendario entre dos instantes, contados en Guayaquil.
 *
 * Se comparan **días**, no milisegundos: de las 23:00 de hoy a las 01:00 de
 * mañana hay dos horas, pero es un día de diferencia, y es el día lo que se le
 * enseña a una persona.
 */
export function diasEntre(desde: number, hasta: number): number {
  return Math.round((comoDia(fechaISO(hasta)) - comoDia(fechaISO(desde))) / 86_400_000);
}

/**
 * "vence en 5 días" / "vence mañana" / "vence hoy" / "venció hace 2 días".
 *
 * En días de calendario, no en horas: al representante le importa el día, y
 * "en 23 horas" cuando son las 11 de la noche se lee peor que "mañana".
 */
export function plazoLegible(venceEn: number, ahora: number = Date.now()): string {
  const dias = diasEntre(ahora, venceEn);
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  if (dias > 1) return `vence en ${dias} días`;
  if (dias === -1) return "venció ayer";
  return `venció hace ${Math.abs(dias)} días`;
}
