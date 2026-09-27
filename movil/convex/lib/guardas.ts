/**
 * Guardas de integridad — lo que en Postgres hacían los `CHECK`.
 *
 * El esquema original tenía 57 restricciones CHECK. Al migrar a Convex, 42 de
 * ellas (las de dominio, `col IN (...)`) se convirtieron en validadores
 * `v.union(v.literal(...))` en `schema.ts` y las hace cumplir el motor. Las
 * **15 restantes** eran de rango o de condición entre columnas, y esas no
 * tienen equivalente: son estas funciones, y hay que llamarlas a mano desde
 * las mutations.
 *
 * Cada función lleva el nombre del CHECK original para poder rastrearla hasta
 * `db/migrations/0000_cresco_inicial.sql` en el historial de git.
 *
 * Son puras: no reciben `ctx`, no leen la base. Se pueden probar sin levantar
 * nada — ver `convex/lib/guardas.test.ts`.
 */

import { REGLAS } from "./enums";

/** Error de dominio. El manejador lo traduce al mensaje que ve el usuario. */
export class ErrorDominio extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorDominio";
  }
}

function exigir(condicion: boolean, codigo: string, mensaje: string): void {
  if (!condicion) throw new ErrorDominio(codigo, mensaje);
}

// ---------------------------------------------------------------------------
// Rangos de fechas
// ---------------------------------------------------------------------------

/** ck_anio_fechas · ck_periodo_fechas — el fin va después del inicio. */
export function exigirRangoFechas(inicio: string, fin: string, entidad: string): void {
  exigir(
    fin > inicio,
    "FECHAS_INVALIDAS",
    `La fecha de fin de ${entidad} debe ser posterior a la de inicio.`,
  );
}

/** ck_cita_horas · ck_disponibilidad_horas — el fin va después del inicio. */
export function exigirRangoHoras(inicio: string | number, fin: string | number): void {
  exigir(fin > inicio, "FECHAS_INVALIDAS", "La hora de fin debe ser posterior a la de inicio.");
}

/** ck_comunicado_ventana — la ventana de visibilidad no puede estar invertida. */
export function exigirVentanaComunicado(visibleDesde: string, visibleHasta: string): void {
  exigir(
    visibleHasta >= visibleDesde,
    "FECHAS_INVALIDAS",
    "La fecha de fin de visibilidad no puede ser anterior a la de inicio.",
  );
}

// ---------------------------------------------------------------------------
// Puntaje
// ---------------------------------------------------------------------------

/** ck_institucion_rango — minimo < base < maximo. */
export function exigirRangoPuntaje(minimo: number, base: number, maximo: number): void {
  exigir(
    minimo < base && base < maximo,
    "VALIDACION",
    "El puntaje base debe quedar entre el mínimo y el máximo.",
  );
}

/** ck_franja_rango — la franja no puede estar invertida. */
export function exigirRangoFranja(desde: number, hasta: number): void {
  exigir(desde <= hasta, "VALIDACION", "El rango de la franja está invertido.");
}

/** ck_tipo_rango — puntosMin <= puntosDefecto <= puntosMax. */
export function exigirRangoTipoAccion(min: number, defecto: number, max: number): void {
  exigir(
    min <= defecto && defecto <= max,
    "VALIDACION",
    "Los puntos por defecto deben quedar dentro del rango del tipo de acción.",
  );
}

/**
 * ck_tipo_signo_coherente — el signo y el rango de puntos tienen que
 * coincidir. Se actualizó el 14 de agosto: desapareció el signo NOTA (su caso
 * de uso lo absorbió NOTA_PROFESOR en comunicados).
 */
export function exigirSignoCoherente(
  signo: "POSITIVA" | "NEGATIVA",
  min: number,
  max: number,
): void {
  if (signo === "POSITIVA") {
    exigir(
      min >= REGLAS.POSITIVA_MIN && max <= REGLAS.POSITIVA_MAX,
      "VALIDACION",
      `Una acción positiva debe puntuar entre +${REGLAS.POSITIVA_MIN} y +${REGLAS.POSITIVA_MAX}.`,
    );
  } else {
    exigir(
      max <= REGLAS.DISCIPLINA_MAX && min >= REGLAS.DISCIPLINA_MIN,
      "VALIDACION",
      `Una acción negativa debe puntuar entre ${REGLAS.DISCIPLINA_MIN} y ${REGLAS.DISCIPLINA_MAX}.`,
    );
  }
}

/**
 * C4 — topes diarios. No era un CHECK: la decisión del 3 de agosto dice que se
 * valida en el servidor, no en la base. Aquí está, y devuelve el código de
 * error que el contrato ya declaraba.
 *
 * @param acumuladoHoy suma de puntos ya aplicados al estudiante ese día
 * @param puntosNuevos puntos de la acción que se está registrando
 */
export function exigirTopeDiario(acumuladoHoy: number, puntosNuevos: number): void {
  const total = acumuladoHoy + puntosNuevos;
  if (puntosNuevos > 0) {
    exigir(
      total <= REGLAS.TOPE_DIARIO_POSITIVO,
      "TOPE_DIARIO_ALCANZADO",
      `El estudiante ya alcanzó el tope de +${REGLAS.TOPE_DIARIO_POSITIVO} puntos para hoy.`,
    );
  } else {
    exigir(
      Math.abs(total) <= REGLAS.TOPE_DIARIO_NEGATIVO,
      "TOPE_DIARIO_ALCANZADO",
      `El estudiante ya alcanzó el tope de −${REGLAS.TOPE_DIARIO_NEGATIVO} puntos para hoy.`,
    );
  }
}

/**
 * ADR-005 — el puntaje es derivado, nunca un contador.
 *
 * `puntaje = clamp(base + Σ puntos de acciones VIGENTES del período, piso, techo)`
 *
 * Si en algún sitio aparece `puntajeActual = puntajeActual - 1`, está mal: hay
 * que recalcular con esta función desde las acciones vigentes.
 */
export function calcularPuntaje(
  puntosDeAccionesVigentes: readonly number[],
  base: number = REGLAS.PUNTAJE_BASE,
  piso: number = REGLAS.PUNTAJE_MINIMO,
  techo: number = REGLAS.PUNTAJE_MAXIMO,
): number {
  const suma = puntosDeAccionesVigentes.reduce((acc, p) => acc + p, 0);
  return Math.min(techo, Math.max(piso, base + suma));
}

// ---------------------------------------------------------------------------
// Condiciones entre campos
// ---------------------------------------------------------------------------

/** ck_accion_resolucion — anular o modificar exige fecha y motivo. */
export function exigirResolucionCompleta(
  estado: "VIGENTE" | "ANULADA" | "MODIFICADA",
  resueltaEn: number | undefined,
  motivoResolucion: string | undefined,
): void {
  if (estado === "VIGENTE") return;
  exigir(
    resueltaEn !== undefined && !!motivoResolucion,
    "VALIDACION",
    "Anular o modificar una acción exige registrar la fecha y el motivo.",
  );
}

/** ck_inconformidad_resolucion — resolver exige respuesta y fecha. */
export function exigirResolucionInconformidad(
  estado: string,
  respuestaDocente: string | undefined,
  resueltaEn: number | undefined,
): void {
  if (!estado.startsWith("RESUELTA_")) return;
  exigir(
    !!respuestaDocente && resueltaEn !== undefined,
    "VALIDACION",
    "Resolver una inconformidad exige una respuesta del docente y la fecha.",
  );
}

/** ck_alerta_estudiante — el alcance y el destinatario tienen que concordar. */
export function exigirAlcanceCoherente(
  alcance: "CURSO" | "ESTUDIANTE",
  estudianteId: unknown | undefined,
): void {
  if (alcance === "CURSO") {
    exigir(
      estudianteId === undefined,
      "VALIDACION",
      "Una alerta de alcance CURSO no lleva estudiante.",
    );
  } else {
    exigir(
      estudianteId !== undefined,
      "VALIDACION",
      "Una alerta de alcance ESTUDIANTE necesita un estudiante.",
    );
  }
}

/** ck_comunicado_evento_fecha — un EVENTO necesita su fecha. */
export function exigirFechaEvento(tipo: string, fechaEvento: string | undefined): void {
  if (tipo !== "EVENTO") return;
  exigir(!!fechaEvento, "VALIDACION", "Un evento necesita una fecha.");
}

/**
 * Un evento puede ser de un solo día o de un plazo — las dos formas están
 * disponibles. `fechaEventoFin` es opcional; cuando está, no puede quedar
 * antes que el inicio.
 */
export function exigirRangoEventoOpcional(
  fechaEvento: string | undefined,
  fechaEventoFin: string | undefined,
): void {
  if (fechaEventoFin === undefined) return;
  exigir(
    fechaEvento !== undefined && fechaEventoFin >= fechaEvento,
    "FECHAS_INVALIDAS",
    "La fecha de fin del evento no puede ser anterior a la de inicio.",
  );
}

/** ck_reporte_general_publicado — publicar exige la marca de publicación. */
export function exigirPublicacionCompleta(
  estado: string,
  publicadoEn: number | undefined,
): void {
  if (estado !== "PUBLICADO") return;
  exigir(
    publicadoEn !== undefined,
    "VALIDACION",
    "Un reporte publicado necesita su fecha de publicación.",
  );
}

/**
 * NUEVO 2026-08-14 — una nota del profesor dura de 1 a 7 días, lo elige el
 * docente. No venía del esquema viejo: la funcionalidad es nueva.
 */
export function exigirDuracionNota(dias: number): void {
  exigir(
    Number.isInteger(dias) &&
      dias >= REGLAS.NOTA_PROFESOR_DIAS_MIN &&
      dias <= REGLAS.NOTA_PROFESOR_DIAS_MAX,
    "VALIDACION",
    `Una nota del profesor dura entre ${REGLAS.NOTA_PROFESOR_DIAS_MIN} y ${REGLAS.NOTA_PROFESOR_DIAS_MAX} días.`,
  );
}

// ---------------------------------------------------------------------------
// Fechas en la zona del piloto
// ---------------------------------------------------------------------------

/**
 * Fecha de hoy en `America/Guayaquil`, como "YYYY-MM-DD".
 *
 * A4 + E1: **toda** fecha de calendario se calcula así, nunca con el reloj del
 * dispositivo ni con la hora UTC del servidor. En Postgres esto fue un bug
 * real: `now()::date` usaba el timezone de la sesión y una matrícula creada a
 * las 20:00 en Guayaquil quedaba fechada al día siguiente.
 */
export function hoyEnGuayaquil(ahora: number = Date.now()): string {
  return new Date(ahora).toLocaleDateString("en-CA", {
    timeZone: REGLAS.ZONA_HORARIA,
  });
}

/** Suma días a una fecha "YYYY-MM-DD" sin salir de la zona del piloto. */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

/**
 * ¿Cae "YYYY-MM-DD" en sábado o domingo? Misma cuenta que ya usaba
 * `registrarAccion` para la guarda de día no lectivo, extraída aquí para que
 * el reporte del día también pueda usarla sin duplicarla.
 */
export function esFinDeSemana(fecha: string): boolean {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}
