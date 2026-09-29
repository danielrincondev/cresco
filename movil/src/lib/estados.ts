/**
 * De un estado del dominio a lo que se le enseña a una persona.
 *
 * El issue #5 pedía, para el chip de estado, *«una mecánica reutilizable, no 15
 * chips distintos»*. Esta es la mecánica: hay **cinco tonos** y nada más, y cada
 * familia de estados es una tabla corta que dice a qué tono cae y con qué
 * palabras se nombra. Un estado nuevo se agrega en una línea; un tono nuevo hay
 * que justificarlo.
 *
 * Los textos están aquí y no repartidos por las pantallas a propósito: son lo
 * que un docente y un representante leen sobre la conducta de un niño, y
 * conviene poder revisarlos todos juntos en una pantalla de código.
 */

import type {
  MODALIDAD,
  MOTIVO_INCONFORMIDAD,
  TIPO_ALERTA,
} from "../../convex/lib/enums";
import type {
  EstadoAccion,
  EstadoCita,
  EstadoInconformidad,
} from "../../convex/lib/enums";

// `enums.ts` exporta el tipo de algunos dominios y de otros no. Los que faltan
// se derivan aqui en vez de agregarlos alli: `lib/enums.ts` es superficie
// compartida y tocarla pide la aprobacion de los tres por tres alias de tipo.
type Modalidad = (typeof MODALIDAD)[number];
type MotivoInconformidad = (typeof MOTIVO_INCONFORMIDAD)[number];
type TipoAlerta = (typeof TIPO_ALERTA)[number];

export type Tono =
  /** Sin carga: informativo, en curso, o el punto de partida. */
  | "neutro"
  /** Algo salió bien, o quedó cerrado a favor. */
  | "positivo"
  /** Pide acción de quien lo ve, todavía sin gravedad. */
  | "atencion"
  /** Algo negativo registrado, o cerrado en contra. */
  | "negativo"
  /** Solo emergencias reales. Escaso a propósito. */
  | "critico";

export type Etiqueta = { tono: Tono; texto: string };

/* --------------------------------------------------------------------------
 * Franjas de conducta
 * ----------------------------------------------------------------------- */

/**
 * C3 de la sesión visual: **la franja nunca se distingue solo por color.**
 * Entre el 5 y el 8 % de los hombres tiene daltonismo, y el sol en pantalla
 * afecta a todos. Por eso esta función devuelve siempre el número dentro del
 * texto, y no hay forma de pedir la franja sin él.
 */
export function etiquetaFranja(nombreFranja: string, puntaje: number): Etiqueta {
  const tono: Tono =
    puntaje >= 80
      ? "positivo"
      : puntaje >= 60
        ? "neutro"
        : puntaje >= 40
          ? "atencion"
          : "negativo";
  return { tono, texto: `${nombreFranja} · ${puntaje}` };
}

/* --------------------------------------------------------------------------
 * Acciones registradas
 * ----------------------------------------------------------------------- */

const ACCION: Record<EstadoAccion, Etiqueta> = {
  // F4: MODIFICADA y ANULADA valen las dos 0 puntos, pero se le muestran
  // distinto al representante — una es "el docente lo revisó y lo corrigió" y
  // la otra "no debió registrarse". Confundirlas borra esa diferencia.
  VIGENTE: { tono: "neutro", texto: "Vigente" },
  MODIFICADA: { tono: "atencion", texto: "Modificada tras tu reclamo" },
  ANULADA: { tono: "positivo", texto: "Anulada" },
};

export const etiquetaAccion = (estado: EstadoAccion): Etiqueta => ACCION[estado];

/* --------------------------------------------------------------------------
 * Citas
 * ----------------------------------------------------------------------- */

const CITA: Record<EstadoCita, Etiqueta> = {
  // F2: reservar no cierra nada. "Solicitada" tiene que leerse como pendiente,
  // o el representante se presenta a una cita que el docente nunca aceptó.
  SOLICITADA: { tono: "atencion", texto: "Esperando confirmación" },
  CONFIRMADA: { tono: "positivo", texto: "Confirmada" },
  RECHAZADA: { tono: "negativo", texto: "No confirmada" },
  REPROGRAMADA: { tono: "atencion", texto: "Reprogramada" },
  CANCELADA: { tono: "neutro", texto: "Cancelada" },
  ATENDIDA: { tono: "positivo", texto: "Atendida" },
  NO_ASISTIO: { tono: "negativo", texto: "No asistió" },
};

export const etiquetaCita = (estado: EstadoCita): Etiqueta => CITA[estado];

/**
 * La etiqueta de una cita **a una hora dada**. Una solicitud cuya hora pasó
 * sin que nadie respondiera ya no está "esperando" nada: seguir diciéndolo
 * invita a presentarse a una cita que nunca se confirmó, justo lo que la
 * tabla de arriba intenta evitar.
 */
export const etiquetaCitaAl = (
  estado: EstadoCita,
  fechaHoraInicio: number,
  ahora: number,
): Etiqueta =>
  estado === "SOLICITADA" && fechaHoraInicio <= ahora
    ? { tono: "neutro", texto: "Sin respuesta" }
    : CITA[estado];

/* --------------------------------------------------------------------------
 * Reclamos (inconformidades)
 * ----------------------------------------------------------------------- */

const RECLAMO: Record<EstadoInconformidad, Etiqueta> = {
  ABIERTA: { tono: "atencion", texto: "Sin responder" },
  EN_REVISION: { tono: "atencion", texto: "En revisión" },
  RESUELTA_MANTENIDA: { tono: "neutro", texto: "Resuelto: se mantiene" },
  RESUELTA_MODIFICADA: { tono: "positivo", texto: "Resuelto: se modificó" },
  RESUELTA_ANULADA: { tono: "positivo", texto: "Resuelto: se anuló" },
  // F3: no desaparece al vencer, sube de prioridad. El tono lo dice.
  VENCIDA: { tono: "negativo", texto: "Venció sin respuesta" },
};

export const etiquetaReclamo = (estado: EstadoInconformidad): Etiqueta =>
  RECLAMO[estado];

/** Un reclamo se puede responder mientras no esté resuelto — vencido incluido. */
export const reclamoRespondible = (estado: EstadoInconformidad): boolean =>
  !estado.startsWith("RESUELTA_");

/* --------------------------------------------------------------------------
 * Textos sueltos del dominio
 * ----------------------------------------------------------------------- */

const MOTIVO: Record<MotivoInconformidad, string> = {
  NO_OCURRIO: "No ocurrió",
  CONTEXTO_INCOMPLETO: "Falta contexto",
  SANCION_DESPROPORCIONADA: "La sanción es desproporcionada",
  SOLICITA_REUNION: "Pido una reunión",
  OTRO: "Otro motivo",
};

export const textoMotivo = (motivo: MotivoInconformidad): string => MOTIVO[motivo];

const MODALIDAD_TEXTO: Record<Modalidad, string> = {
  PRESENCIAL: "Presencial",
  VIRTUAL: "Virtual",
  TELEFONICA: "Telefónica",
};

export const textoModalidad = (modalidad: Modalidad): string =>
  MODALIDAD_TEXTO[modalidad];

const ALERTA: Record<TipoAlerta, string> = {
  EVACUACION: "Evacuación",
  SUSPENSION_CLASES: "Suspensión de clases",
  ACCIDENTE: "Accidente",
  RETIRO_ANTICIPADO: "Retiro anticipado",
  SALUD: "Salud",
  SIMULACRO: "Simulacro",
  OTRO: "Otro",
};

export const textoTipoAlerta = (tipo: TipoAlerta): string => ALERTA[tipo];

/**
 * Un simulacro **nunca** se pinta como una alerta real.
 *
 * Está en el issue #18 y es la razón de que exista el tipo: si la pantalla de
 * un simulacro es idéntica a la de una emergencia, se entrena al representante
 * a ignorar las de verdad. El día que haya una, no la va a abrir.
 */
export function etiquetaAlerta(tipo: TipoAlerta, esSimulacro: boolean): Etiqueta {
  return esSimulacro
    ? { tono: "neutro", texto: "Simulacro — no es una emergencia" }
    : { tono: "critico", texto: textoTipoAlerta(tipo) };
}
