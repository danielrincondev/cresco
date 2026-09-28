import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/** 22:00 Guayaquil (UTC-5): publica borradores y completa reportes del día. */
crons.cron(
  "conducta: cierre nocturno",
  "0 3 * * *",
  internal.conducta.cierreNocturno,
  {},
);

/** Sábado 09:00 Guayaquil (UTC-5): resumen de la semana a cada familia. */
crons.cron(
  "conducta: resumen semanal",
  "0 14 * * 6",
  internal.conducta.enviarResumenesSemanales,
  {},
);

/** 00:30 Guayaquil (UTC-5): los cursos cuyo año lectivo terminó pasan a Finalizado. */
crons.cron(
  "nucleo: finalizar cursos vencidos",
  "30 5 * * *",
  internal.nucleo.finalizarCursosVencidos,
  {},
);

export default crons;
