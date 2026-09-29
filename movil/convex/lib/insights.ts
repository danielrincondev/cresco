/**
 * La frase de aliento del reporte acumulado (P6).
 *
 * Pedido del 27 de septiembre: "que la app sea un motivador para que los
 * padres estén acompañando a sus hijos en su educación". No es una frase
 * generada -- es **calculada**, desde datos que el representante ya podía
 * ver en la misma pantalla (el puntaje de hoy, el del parcial anterior, la
 * bitácora). Se queda en `lib/` y sin `ctx` por la misma razón que
 * `guardas.ts`: es pura, y se prueba sin levantar nada.
 *
 * Prioriza celebrar antes que comparar, y se queda en silencio antes que
 * decir algo que suene a regaño: el objetivo es el acompañamiento, no
 * calificar al estudiante una segunda vez sobre la misma pantalla que ya lo
 * hace con la franja y el puntaje.
 */

/** Diferencia en días entre dos fechas "YYYY-MM-DD" (positiva si `hasta` es posterior a `desde`). */
function diferenciaDias(desde: string, hasta: string): number {
  const [a1, a2, a3] = desde.split("-").map(Number);
  const [b1, b2, b3] = hasta.split("-").map(Number);
  const ta = Date.UTC(a1, a2 - 1, a3);
  const tb = Date.UTC(b1, b2 - 1, b3);
  return Math.round((tb - ta) / 86_400_000);
}

/** Por debajo de esto, una racha no dice nada -- dos días sin novedades es lo normal. */
const RACHA_MINIMA_DIAS = 3;

export type DatosDeAliento = {
  puntajeActual: number;
  /** `null` si no hay un parcial anterior con puntaje que comparar. */
  puntajeAnterior: number | null;
  puntosPositivos: number;
  puntosNegativos: number;
  /** Fecha de la última acción negativa VIGENTE de este parcial, o `null` si no hay ninguna. */
  ultimaNegativa: string | null;
  /** Inicio del parcial vigente -- mide la racha cuando no hubo ninguna negativa todavía. */
  inicioParcial: string;
  hoy: string;
};

export function fraseDeAliento(datos: DatosDeAliento): string | null {
  // 1. Mejoró respecto al parcial anterior: la comparación más motivadora que
  //    hay, y la única que vale la pena mostrar en ese sentido -- si bajó o
  //    quedó igual, no hay nada que ganar diciéndolo aquí, así que se pasa a
  //    la siguiente señal en vez de insistir en la comparación.
  if (datos.puntajeAnterior !== null && datos.puntajeActual > datos.puntajeAnterior) {
    const diferencia = datos.puntajeActual - datos.puntajeAnterior;
    return `Subió ${diferencia} ${diferencia === 1 ? "punto" : "puntos"} desde el parcial anterior — vale la pena celebrarlo en casa.`;
  }

  // 2. Una racha sin novedades negativas, con o sin ninguna todavía este parcial.
  const dias = datos.ultimaNegativa
    ? diferenciaDias(datos.ultimaNegativa, datos.hoy)
    : diferenciaDias(datos.inicioParcial, datos.hoy);
  if (dias >= RACHA_MINIMA_DIAS) {
    return datos.ultimaNegativa
      ? `Van ${dias} días sin una anotación negativa — se nota el acompañamiento.`
      : "Ninguna anotación negativa en lo que va del parcial — se nota el acompañamiento.";
  }

  // 3. Lo último que queda antes de callarse: si de plano suma más de lo que resta.
  if (datos.puntosPositivos > 0 && datos.puntosPositivos >= Math.abs(datos.puntosNegativos)) {
    return "Este parcial va sumando más de lo que resta.";
  }

  return null;
}

/**
 * Un consejo concreto, no un sermón -- y solo cuando hay un patrón real, no
 * por un incidente aislado. Las categorías vienen ya filtradas a NEGATIVA y
 * VIGENTE por quien llama; aquí solo se cuenta cuál se repite más.
 *
 * Los textos están escritos a mano, uno por categoría -- no generados -- por
 * la misma razón que `fraseDeAliento`: la frase tiene que decir siempre lo
 * mismo para la misma situación, y alguien del equipo tiene que poder leerla
 * entera antes de que la vea un representante.
 */
const CONSEJOS_POR_CATEGORIA: Partial<Record<string, string>> = {
  DISCIPLINA: "Conversar sobre cómo se sintió hoy en clase puede ayudar a entender qué está pasando.",
  RESPONSABILIDAD: "Revisar juntos la agenda o las tareas pendientes puede ayudar a que no se le escapen.",
  DESHONESTIDAD: "Hablar con calma sobre por qué a veces cuesta decir la verdad ayuda más que un reto.",
  CONVIVENCIA: "Preguntarle cómo se lleva con sus compañeros puede abrir una buena conversación.",
  PUNTUALIDAD: "Repasar juntos la rutina de las mañanas puede ayudar a que llegue a tiempo.",
};

/** Por debajo de esto es un incidente, no un patrón -- no amerita un consejo. */
const REPETICIONES_MINIMAS = 2;

export function consejoPorCategoria(categoriasNegativasVigentes: readonly string[]): string | null {
  const conteo = new Map<string, number>();
  for (const codigo of categoriasNegativasVigentes) {
    conteo.set(codigo, (conteo.get(codigo) ?? 0) + 1);
  }
  let dominante: [string, number] | null = null;
  for (const entrada of conteo) {
    if (dominante === null || entrada[1] > dominante[1]) dominante = entrada;
  }
  if (dominante === null || dominante[1] < REPETICIONES_MINIMAS) return null;
  return CONSEJOS_POR_CATEGORIA[dominante[0]] ?? null;
}

/**
 * Reconoce al representante, no al estudiante -- el pedido explícito fue "que
 * la app sea un motivador para que los padres estén acompañando", y nada lo
 * dice tan directo como contarle a la persona que su propia presencia ya
 * quedó registrada. `vecesLeido` cuenta reportes diarios distintos abiertos
 * este parcial, no aperturas repetidas del mismo día -- calcularlo así es
 * responsabilidad de quien llama, no de esta función.
 */
const LECTURAS_MINIMAS = 2;

export function fraseDeLecturas(vecesLeido: number): string | null {
  if (vecesLeido < LECTURAS_MINIMAS) return null;
  return `Revisaste el reporte diario ${vecesLeido} veces este parcial — se nota el acompañamiento.`;
}
