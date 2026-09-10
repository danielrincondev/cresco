/**
 * Tareas programadas. **Convex exige que todas vivan en este único archivo.**
 *
 * Por eso es el segundo sitio del proyecto —después de la superficie
 * compartida— donde dos personas escriben en el mismo archivo. La regla para
 * que no se pisen: cada quien añade su bloque debajo del último, nunca edita
 * el de otro, y el nombre del trabajo lleva el módulo por delante.
 *
 * Las horas se declaran en UTC. Guayaquil es **UTC-5 todo el año** (Ecuador
 * continental no cambia de hora), así que la conversión es fija: hora local
 * + 5 = hora UTC. Se programa de madrugada para que nadie reciba una
 * notificación a media clase.
 */

import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Interacción (Persona C) — F3: el reclamo sin responder en 30 días vence.
 *
 * 03:00 en Guayaquil. No se calcula en la consulta de la bandeja porque
 * `Date.now()` dentro de un `query` de Convex rompe la reactividad: el
 * vencimiento tiene que quedar escrito en el documento.
 */
crons.daily(
  "interaccion: vencer inconformidades",
  { hourUTC: 8, minuteUTC: 0 },
  internal.interaccion.vencerInconformidades,
  {},
);

// Conducta (Persona B) — el reporte nocturno del issue #10 va aquí debajo,
// como un `crons.daily` más. No hace falta tocar nada de lo de arriba.

export default crons;
