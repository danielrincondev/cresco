/**
 * Datos de demostración para grabar el video del Shipaton.
 *
 * Carga, en las dos cuentas que se le indiquen (una docente y una familia,
 * **recién creadas**), un curso con aspecto real: 20 estudiantes ficticios con
 * sus familias, una semana de anotaciones, asistencia y reportes publicados,
 * dos avisos que parte de las familias ya vio, horario de atención, citas en
 * varios estados y un reclamo abierto.
 *
 * Solo se corre a mano, contra el despliegue de **desarrollo**:
 *
 *     npx convex run demo:cargar '{"docentePerfilId":"…","representantePerfilId":"…"}'
 *
 * Nunca contra producción. Todo cuelga de una escuela que se llama "Escuela
 * Fiscal de Demostración": ninguna persona, escuela ni documento es real, y
 * las familias ficticias no tienen cuenta (su `authSubject` empieza por
 * `demo|`, que Clerk nunca emite).
 *
 * ## Por qué no llama a las mutations de la app
 *
 * `registrarAccion` y el cierre de reportes avisan a la familia por cada
 * anotación y cada reporte: cargar una semana así mandaría decenas de avisos
 * al teléfono de la cuenta de la familia, y `cierreNocturno` recorre además
 * los cursos de todo el despliegue. Aquí se escriben las mismas filas, con la
 * misma forma que esas funciones, sin avisar a nadie y solo en este curso. El
 * puntaje se calcula con `recalcularPuntaje`, el mismo de la app, y
 * `demo.test.ts` comprueba que cada pantalla lee estos datos sin errores.
 *
 * Las fechas son relativas al día en que se corre: el curso siempre tiene la
 * última semana de clases detrás y su horario de atención por delante.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { recalcularPuntaje } from "./conducta";
import { REGLAS } from "./lib/enums";
import { calcularPuntaje, esFinDeSemana, hoyEnGuayaquil, sumarDias } from "./lib/guardas";

const NOMBRE_ESCUELA = "Escuela Fiscal de Demostración";
/** La versión vigente del consentimiento (`VERSION_CONSENTIMIENTO` en `nucleo.ts`). */
const VERSION_CONSENTIMIENTO = "2026-09-v2";
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

/** Un instante del día en Guayaquil (UTC−5 todo el año). */
const enGuayaquil = (fecha: string, hora: string) => Date.parse(`${fecha}T${hora}:00-05:00`);

/** Aleatorio con semilla: la demostración sale igual cada vez que se carga. */
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Estudiante, apellidos y quién es su representante. El primero es el hijo de
 * la cuenta de la familia; los demás tienen un representante ficticio.
 */
const FAMILIAS: { nombres: string; apellidos: string; representante: string | null; parentesco: "MADRE" | "PADRE" | "ABUELO_A" | "TIO_A" }[] = [
  { nombres: "Mateo", apellidos: "Andrade Mendoza", representante: null, parentesco: "MADRE" },
  { nombres: "Valentina", apellidos: "Cedeño Mora", representante: "Gloria Mora", parentesco: "MADRE" },
  { nombres: "Santiago", apellidos: "Bravo Vera", representante: "Luis Bravo", parentesco: "PADRE" },
  { nombres: "Isabella", apellidos: "Castro Plúas", representante: "Carmen Plúas", parentesco: "MADRE" },
  { nombres: "Thiago", apellidos: "Moreira Solís", representante: "Patricia Solís", parentesco: "MADRE" },
  { nombres: "Emily", apellidos: "Zambrano Ruiz", representante: "Jorge Zambrano", parentesco: "PADRE" },
  { nombres: "Joaquín", apellidos: "Villamar León", representante: "Martha León", parentesco: "ABUELO_A" },
  { nombres: "Camila", apellidos: "Quiñónez Arias", representante: "Diana Arias", parentesco: "MADRE" },
  { nombres: "Sebastián", apellidos: "Ortega Palma", representante: "Ricardo Ortega", parentesco: "PADRE" },
  { nombres: "Ariana", apellidos: "Macías Bajaña", representante: "Lucía Bajaña", parentesco: "MADRE" },
  { nombres: "Matías", apellidos: "Guerrero Tomalá", representante: "Fernando Guerrero", parentesco: "PADRE" },
  { nombres: "Danna", apellidos: "Pincay Suárez", representante: "Rocío Suárez", parentesco: "MADRE" },
  { nombres: "Benjamín", apellidos: "Alvarado Chóez", representante: "Mónica Chóez", parentesco: "MADRE" },
  { nombres: "Nicole", apellidos: "Espinoza Vélez", representante: "Andrés Espinoza", parentesco: "PADRE" },
  { nombres: "Samuel", apellidos: "Figueroa Lino", representante: "Teresa Lino", parentesco: "TIO_A" },
  { nombres: "Antonella", apellidos: "Jaramillo Mera", representante: "Silvia Mera", parentesco: "MADRE" },
  { nombres: "Adrián", apellidos: "Holguín Reyes", representante: "Pedro Holguín", parentesco: "PADRE" },
  { nombres: "Sofía", apellidos: "Intriago Peña", representante: "Verónica Peña", parentesco: "MADRE" },
  { nombres: "Gabriel", apellidos: "Mendieta Cobeña", representante: "Manuel Mendieta", parentesco: "PADRE" },
  { nombres: "Mía", apellidos: "Tumbaco Rivas", representante: "Julia Rivas", parentesco: "MADRE" },
];

/** Qué escribe un docente en cada tipo de anotación del catálogo sembrado. */
const FRASES: Record<string, string[]> = {
  POS_DESEMPENIO: [
    "Resolvió los ejercicios de fracciones sin ayuda.",
    "Leyó en voz alta con muy buena entonación.",
    "Entregó un dibujo del ecosistema lleno de detalles.",
  ],
  POS_CONVIVENCIA: [
    "Compartió sus materiales con un compañero que no tenía.",
    "Resolvió un desacuerdo conversando, sin pelear.",
  ],
  POS_RESPONSABILIDAD: [
    "Trajo todas las tareas de la semana completas.",
    "Cuidó el aula como encargado del día.",
  ],
  POS_PUNTUALIDAD: ["Llegó puntual toda la semana."],
  NEG_IRRESPONSABILIDAD: [
    "No trajo el cuaderno de ciencias.",
    "No entregó la tarea de lengua.",
  ],
  NEG_INDISCIPLINA: ["Conversó durante la explicación y distrajo a su grupo."],
};

/** El reporte del curso de cada día: anuncios, novedades, tareas y consejo. */
const DIAS_DE_CLASE = [
  {
    ANUNCIOS: "Recuerden forrar el cuaderno de caligrafía.",
    NOVEDADES: "Trabajamos fracciones con material concreto. El grupo participó mucho.",
    TAREAS: "Libro de matemáticas, página 45, ejercicios 1 al 6.",
    CONSEJO: "Pregúntele qué fue lo que más le gustó del día.",
  },
  {
    ANUNCIOS: "El jueves a las 07:30 es la reunión de representantes.",
    NOVEDADES: "Tuvimos simulacro de evacuación: todos salieron con calma y en orden.",
    TAREAS: "Traer una hoja seca para la clase de ciencias.",
    CONSEJO: "Lean juntos quince minutos antes de dormir.",
  },
  {
    ANUNCIOS: "Mañana hay educación física: vengan con el uniforme deportivo.",
    NOVEDADES: "Empezamos la unidad de los seres vivos con una salida al patio.",
    TAREAS: "Dibujar un animal del patio y escribir dónde vive.",
    CONSEJO: "Revisen juntos la mochila la noche anterior.",
  },
  {
    ANUNCIOS: "Gracias a las familias que ya enviaron el material de reciclaje.",
    NOVEDADES: "Practicamos lectura en voz alta por turnos.",
    TAREAS: "Leer el cuento de la página 30 y contarlo en casa.",
    CONSEJO: "Celebre los pequeños avances, no solo las notas.",
  },
  {
    ANUNCIOS: "La casa abierta de Ciencias se acerca: vean el aviso del curso.",
    NOVEDADES: "Presentaron sus maquetas del sistema solar en grupos.",
    TAREAS: "Repasar las tablas del 6 y del 7.",
    CONSEJO: "Un desayuno completo ayuda a concentrarse.",
  },
  {
    ANUNCIOS: "Esta semana cerramos la unidad de fracciones.",
    NOVEDADES: "Repasamos las tablas de multiplicar jugando en parejas.",
    TAREAS: "Terminar la ficha de fracciones que empezamos en clase.",
    CONSEJO: "Pídale que le enseñe algo que aprendió hoy.",
  },
];

type Plan = { dia: number; tipo: string; puntos: number; descripcion: string };

/**
 * Lo que le pasó a quien importa en el video, a mano: el hijo de la familia
 * (una semana buena, con un olvido) y el estudiante que concentra las
 * negativas, con un reclamo abierto y una citación. `dia` 0 es el más antiguo.
 */
const PLAN_FIJO: Record<string, Plan[]> = {
  Mateo: [
    { dia: 0, tipo: "POS_DESEMPENIO", puntos: 1, descripcion: "Participó con una exposición muy clara sobre los planetas." },
    { dia: 2, tipo: "NEG_IRRESPONSABILIDAD", puntos: -1, descripcion: "No trajo la tarea de matemáticas." },
    { dia: 4, tipo: "POS_CONVIVENCIA", puntos: 2, descripcion: "Ayudó a un compañero que se lastimó en el recreo." },
    { dia: 5, tipo: "POS_RESPONSABILIDAD", puntos: 1, descripcion: "Trajo todas las tareas completas y ordenadas." },
  ],
  Thiago: [
    { dia: 1, tipo: "NEG_INDISCIPLINA", puntos: -2, descripcion: "Empujó a un compañero en la fila del recreo." },
    { dia: 3, tipo: "NEG_INDISCIPLINA", puntos: -1, descripcion: "Interrumpió varias veces la clase de lengua." },
    { dia: 4, tipo: "NEG_IRRESPONSABILIDAD", puntos: -1, descripcion: "No trajo el libro de lectura." },
    { dia: 5, tipo: "POS_CONVIVENCIA", puntos: 1, descripcion: "Pidió disculpas a su compañero y lo invitó a jugar." },
  ],
};

/** Los últimos `cuantos` días de clase antes de `hoy`, del más antiguo al más reciente. */
function diasDeClaseAntesDe(hoy: string, cuantos: number): string[] {
  const dias: string[] = [];
  for (let atras = 1; dias.length < cuantos; atras++) {
    const dia = sumarDias(hoy, -atras);
    if (!esFinDeSemana(dia)) dias.unshift(dia);
  }
  return dias;
}

/** Los próximos `cuantos` días de clase después de `hoy`. */
function diasDeClaseDespuesDe(hoy: string, cuantos: number): string[] {
  const dias: string[] = [];
  for (let adelante = 1; dias.length < cuantos; adelante++) {
    const dia = sumarDias(hoy, adelante);
    if (!esFinDeSemana(dia)) dias.push(dia);
  }
  return dias;
}


export const cargar = internalMutation({
  args: {
    docentePerfilId: v.id("perfilUsuario"),
    representantePerfilId: v.id("perfilUsuario"),
  },
  handler: async (ctx, args) => {
    const docente = await ctx.db.query("docente")
      .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", args.docentePerfilId)).unique();
    const madre = await ctx.db.query("representante")
      .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", args.representantePerfilId)).unique();
    if (docente === null) throw new Error("Esa cuenta no es docente.");
    if (madre === null) throw new Error("Esa cuenta no es representante.");
    // Solo en cuentas nuevas: nada de esto puede caer encima de datos reales.
    const asignaciones = await ctx.db.query("asignacionDocente")
      .withIndex("por_docente", (q) => q.eq("docenteId", docente._id)).first();
    if (asignaciones !== null) throw new Error("Esa docente ya tiene cursos: la demostración se carga en una cuenta nueva.");
    const hijos = await ctx.db.query("vinculoRepresentacion")
      .withIndex("por_representante_estado", (q) => q.eq("representanteId", madre._id)).first();
    if (hijos !== null) throw new Error("Esa familia ya tiene hijos registrados: la demostración se carga en una cuenta nueva.");

    const azar = aleatorio(20260928);
    const elegir = <T,>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)];
    const ahora = Date.now();
    const hoy = hoyEnGuayaquil(ahora);
    const pasados = diasDeClaseAntesDe(hoy, DIAS_DE_CLASE.length);
    const proximos = diasDeClaseDespuesDe(hoy, 8);

    // --- Escuela, año lectivo, parciales y curso (la forma de `crearCurso`) --
    const anioInicio = sumarDias(hoy, -140);
    const anioFin = sumarDias(hoy, 150);
    const institucionId = await ctx.db.insert("institucion", {
      nombreDeclarado: NOMBRE_ESCUELA, verificada: false, regimen: "COSTA_INSULAR", ciudad: "Guayaquil",
      zonaHoraria: REGLAS.ZONA_HORARIA, puntajeBase: REGLAS.PUNTAJE_BASE, puntajeMinimo: REGLAS.PUNTAJE_MINIMO,
      puntajeMaximo: REGLAS.PUNTAJE_MAXIMO, topeDiarioPositivo: REGLAS.TOPE_DIARIO_POSITIVO,
      topeDiarioNegativo: REGLAS.TOPE_DIARIO_NEGATIVO, estado: "ACTIVA", actualizadoEn: ahora,
    });
    const anioLectivoId = await ctx.db.insert("anioLectivo", {
      institucionId, nombre: `${anioInicio.slice(0, 4)}–${anioFin.slice(0, 4)}`,
      fechaInicio: anioInicio, fechaFin: anioFin, estado: "PLANIFICADO", actualizadoEn: ahora,
    });
    // El parcial en curso abarca la semana cargada y las próximas semanas.
    const limites = [
      { nombre: "Primer parcial", desde: anioInicio, hasta: sumarDias(hoy, -61) },
      { nombre: "Segundo parcial", desde: sumarDias(hoy, -60), hasta: sumarDias(hoy, 40) },
      { nombre: "Tercer parcial", desde: sumarDias(hoy, 41), hasta: anioFin },
    ];
    const periodos: Id<"periodoAcademico">[] = [];
    for (const [i, p] of limites.entries()) {
      periodos.push(await ctx.db.insert("periodoAcademico", {
        anioLectivoId, nombre: p.nombre, orden: i + 1, fechaInicio: p.desde, fechaFin: p.hasta,
        estado: "PLANIFICADO", actualizadoEn: ahora,
      }));
    }
    const parcial = periodos[1];
    const cursoId = await ctx.db.insert("curso", {
      anioLectivoId, nombre: "Quinto de Básica A", nivel: "5", paralelo: "A", jornada: "MATUTINA",
      aula: "Aula 12", estado: "ACTIVO", actualizadoEn: ahora,
    });
    await ctx.db.insert("asignacionDocente", {
      cursoId, docenteId: docente._id, rol: "TITULAR", vigenteDesde: anioInicio, actualizadoEn: ahora,
    });
    await ctx.db.patch(docente._id, {
      tituloProfesional: "Licenciada en Educación Básica",
      horarioAtencion: "Martes y jueves, de 10:00 a 11:00, en el aula.",
      actualizadoEn: ahora,
    });
    // El código es único en todo el despliegue, como el de `crearInvitacion`.
    const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let codigoInvitacion = "";
    do {
      codigoInvitacion = `DEMO${Array.from({ length: 8 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("")}`;
    } while (await ctx.db.query("invitacionCurso").withIndex("por_codigo", (q) => q.eq("codigoCorto", codigoInvitacion)).first() !== null);
    const invitacionId = await ctx.db.insert("invitacionCurso", {
      cursoId, emitidaPorDocenteId: docente._id, codigoCorto: codigoInvitacion, token: `demo-${cursoId}`,
      usosRealizados: FAMILIAS.length, estado: "PENDIENTE",
      expiraEn: ahora + REGLAS.INVITACION_DIAS_VIGENCIA * DIA, actualizadoEn: ahora,
    });

    // --- Familias, estudiantes y matrículas (canjear + aprobar) --------------
    const ordenLista = [...FAMILIAS].sort((a, b) => a.apellidos.localeCompare(b.apellidos, "es"));
    const alumnos: { nombres: string; completo: string; estudianteId: Id<"estudiante">; matriculaId: Id<"matricula">; representanteId: Id<"representante"> }[] = [];
    for (const [i, familia] of FAMILIAS.entries()) {
      let representanteId = madre._id;
      let perfilUsuarioId = args.representantePerfilId;
      if (familia.representante !== null) {
        const [nombres, ...resto] = familia.representante.split(" ");
        perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
          authSubject: `demo|representante-${cursoId}-${i}`, nombres, apellidos: resto.join(" "),
          tipoDocumento: "PASAPORTE", numeroDocumento: `DEMO-${cursoId}-${i}`, actualizadoEn: ahora,
        });
        representanteId = await ctx.db.insert("representante", { perfilUsuarioId, actualizadoEn: ahora });
      }
      const estudianteId = await ctx.db.insert("estudiante", {
        institucionId, tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "",
        nombres: familia.nombres, apellidos: familia.apellidos, fechaNacimiento: sumarDias(hoy, -3650 - i * 23),
        origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", aprobadoPorDocenteId: docente._id,
        aprobadoEn: enGuayaquil(anioInicio, "08:00"), estado: "ACTIVO", actualizadoEn: ahora,
      });
      await ctx.db.insert("vinculoRepresentacion", {
        representanteId, estudianteId, parentesco: familia.parentesco, invitacionCursoId: invitacionId,
        estado: "ACTIVO", vigenteDesde: anioInicio, actualizadoEn: ahora,
      });
      await ctx.db.insert("consentimiento", {
        perfilUsuarioId, estudianteId, tipo: "TRATAMIENTO_DATOS_MENOR", versionDocumento: VERSION_CONSENTIMIENTO,
        otorgado: true, otorgadoEn: enGuayaquil(anioInicio, "08:00"),
      });
      const matriculaId = await ctx.db.insert("matricula", {
        estudianteId, cursoId, numeroLista: ordenLista.indexOf(familia) + 1, fechaIngreso: anioInicio,
        estado: "CURSANDO", actualizadoEn: ahora,
      });
      // Como `aprobarEstudiante`: cada parcial que no terminó empieza en 60.
      for (const periodoId of periodos.slice(1)) {
        await ctx.db.insert("puntajePeriodo", {
          matriculaId, periodoAcademicoId: periodoId, puntajeBase: REGLAS.PUNTAJE_BASE, puntosPositivos: 0,
          puntosNegativos: 0, puntajeActual: REGLAS.PUNTAJE_BASE, congelado: false, recalculadoEn: ahora,
        });
      }
      alumnos.push({ nombres: familia.nombres, completo: `${familia.nombres} ${familia.apellidos}`, estudianteId, matriculaId, representanteId });
    }
    const hijo = alumnos[0];
    const porNombre = (nombres: string) => alumnos.find((a) => a.nombres === nombres)!;

    // --- Anotaciones de la semana (la forma de `registrarAccion`) -----------
    const tipos = new Map<string, { _id: Id<"tipoAccion">; categoriaAccionId: Id<"categoriaAccion">; signo: "POSITIVA" | "NEGATIVA"; cuentaEnBitacora: boolean }>();
    for (const tipo of await ctx.db.query("tipoAccion").collect()) {
      if (tipo.institucionId === undefined && tipo.activa) tipos.set(tipo.codigo, tipo);
    }
    if (tipos.size === 0) throw new Error("Faltan los catálogos: corre antes `npx convex run semillas:cargar`.");

    const planes = new Map<Id<"matricula">, Plan[]>();
    for (const alumno of alumnos) planes.set(alumno.matriculaId, [...(PLAN_FIJO[alumno.nombres] ?? [])]);
    // Tres o cuatro anotaciones por día entre el resto del curso, casi todas buenas.
    const resto = alumnos.filter((a) => PLAN_FIJO[a.nombres] === undefined);
    for (let dia = 0; dia < pasados.length; dia++) {
      const cuantos = 3 + Math.floor(azar() * 2);
      const elegidos = [...resto].sort(() => azar() - 0.5).slice(0, cuantos);
      for (const alumno of elegidos) {
        const positiva = azar() < 0.8;
        const tipo = positiva
          ? elegir(["POS_DESEMPENIO", "POS_CONVIVENCIA", "POS_RESPONSABILIDAD", "POS_PUNTUALIDAD"])
          : elegir(["NEG_IRRESPONSABILIDAD", "NEG_INDISCIPLINA"]);
        planes.get(alumno.matriculaId)!.push({ dia, tipo, puntos: positiva ? 1 : -1, descripcion: elegir(FRASES[tipo]) });
      }
    }
    const acciones = new Map<string, Id<"accionRegistrada">>();
    for (const alumno of alumnos) {
      for (const plan of planes.get(alumno.matriculaId)!) {
        const tipo = tipos.get(plan.tipo);
        if (tipo === undefined) throw new Error(`Falta el tipo de acción ${plan.tipo} en el catálogo.`);
        const id = await ctx.db.insert("accionRegistrada", {
          matriculaId: alumno.matriculaId, periodoAcademicoId: parcial, tipoAccionId: tipo._id,
          categoriaAccionId: tipo.categoriaAccionId, signo: tipo.signo, puntosAplicados: plan.puntos,
          cuentaEnBitacora: tipo.cuentaEnBitacora, descripcion: plan.descripcion, fechaOcurrencia: pasados[plan.dia],
          registradaPorDocenteId: docente._id, estado: "VIGENTE", actualizadoEn: enGuayaquil(pasados[plan.dia], "10:30"),
        });
        acciones.set(`${alumno.nombres}|${plan.dia}|${plan.tipo}`, id);
      }
      await recalcularPuntaje(ctx, alumno.matriculaId, parcial);
    }

    // --- Asistencia, reportes del curso y reportes de cada estudiante --------
    const franjas = await ctx.db.query("franjaConducta").collect();
    const franjaDe = (puntaje: number) => franjas.find((f) => puntaje >= f.puntajeDesde && puntaje <= f.puntajeHasta)?._id;
    const plantilla = await ctx.db.query("plantillaReporte")
      .withIndex("por_institucion", (q) => q.eq("institucionId", undefined).eq("activa", true)).first();
    if (plantilla === null) throw new Error("Falta la plantilla del reporte: corre antes `npx convex run semillas:cargar`.");
    const campos = await ctx.db.query("plantillaCampo")
      .withIndex("por_plantilla_codigo", (q) => q.eq("plantillaReporteId", plantilla._id)).collect();

    let reportes = 0;
    for (const [dia, fecha] of pasados.entries()) {
      const publicadoEn = enGuayaquil(fecha, "22:00");
      const generalId = await ctx.db.insert("reporteGeneral", {
        cursoId, periodoAcademicoId: parcial, plantillaReporteId: plantilla._id, fecha, estado: "PUBLICADO",
        publicadoEn, publicadoPorDocenteId: docente._id, actualizadoEn: publicadoEn,
      });
      for (const campo of campos) {
        const texto = (DIAS_DE_CLASE[dia] as Record<string, string>)[campo.codigo];
        if (texto !== undefined) await ctx.db.insert("reporteGeneralValor", { reporteGeneralId: generalId, plantillaCampoId: campo._id, valorTexto: texto });
      }
      // Uno falta y uno llega tarde cada día, nunca el hijo de la familia del video.
      const ausente = elegir(resto).matriculaId;
      const atrasado = elegir(resto).matriculaId;
      for (const alumno of alumnos) {
        const estado = alumno.matriculaId === ausente ? "AUSENTE" : alumno.matriculaId === atrasado ? "ATRASO" : "PRESENTE";
        const asistenciaId = await ctx.db.insert("registroAsistencia", {
          matriculaId: alumno.matriculaId, periodoAcademicoId: parcial, fecha, estado,
          registradoPorDocenteId: docente._id, actualizadoEn: enGuayaquil(fecha, "07:15"),
        });
        const hastaHoy = planes.get(alumno.matriculaId)!.filter((p) => p.dia <= dia).map((p) => p.puntos);
        const puntaje = calcularPuntaje(hastaHoy, REGLAS.PUNTAJE_BASE, REGLAS.PUNTAJE_MINIMO, REGLAS.PUNTAJE_MAXIMO);
        const delDia = planes.get(alumno.matriculaId)!.filter((p) => p.dia === dia);
        const reporteId = await ctx.db.insert("reporteEstudiante", {
          matriculaId: alumno.matriculaId, periodoAcademicoId: parcial, reporteGeneralId: generalId, fecha,
          tieneNovedades: delDia.length > 0, puntajeAlCierre: puntaje, franjaConductaId: franjaDe(puntaje),
          estadoAsistencia: estado, generadoEn: publicadoEn,
        });
        let orden = 0;
        for (const plan of delDia) {
          await ctx.db.insert("reporteEstudianteItem", {
            reporteEstudianteId: reporteId, tipoItem: "ACCION",
            accionRegistradaId: acciones.get(`${alumno.nombres}|${dia}|${plan.tipo}`), orden: orden++,
          });
        }
        await ctx.db.insert("reporteEstudianteItem", { reporteEstudianteId: reporteId, tipoItem: "ASISTENCIA", registroAsistenciaId: asistenciaId, orden });
        // Tres de cada cuatro familias abren el reporte a la mañana siguiente.
        const loAbrio = alumno === hijo || azar() < 0.75;
        await ctx.db.insert("entregaReporte", {
          reporteEstudianteId: reporteId, representanteId: alumno.representanteId, entregadoEn: publicadoEn,
          leidoEn: loAbrio ? publicadoEn + (9 * 60 + Math.floor(azar() * 90)) * MINUTO : undefined,
        });
        reportes++;
      }
    }

    // --- Dos avisos del curso, con quién los vio ----------------------------
    const nota = await ctx.db.insert("comunicadoCurso", {
      cursoId, periodoAcademicoId: parcial, tipo: "NOTA_PROFESOR", alcance: "CURSO",
      titulo: "Reunión de representantes",
      contenido: "Este jueves a las 07:30 nos reunimos en el aula para revisar cómo va el parcial. Si no puede asistir, pídame una cita en Cresco.",
      visibleDesde: sumarDias(hoy, -4), visibleHasta: sumarDias(hoy, 2), creadoPorDocenteId: docente._id,
      activo: true, actualizadoEn: enGuayaquil(sumarDias(hoy, -4), "12:00"),
    });
    const fechaCasaAbierta = proximos[5];
    const evento = await ctx.db.insert("comunicadoCurso", {
      cursoId, periodoAcademicoId: parcial, tipo: "EVENTO", alcance: "CURSO", titulo: "Casa abierta de Ciencias",
      contenido: "Los estudiantes presentarán sus maquetas del sistema solar.\n- Hora: de 09:00 a 11:00\n- Lugar: patio central\n- Las familias están invitadas",
      fechaEvento: fechaCasaAbierta, horaEvento: "09:00", visibleDesde: sumarDias(hoy, -3), visibleHasta: fechaCasaAbierta,
      creadoPorDocenteId: docente._id, activo: true, actualizadoEn: enGuayaquil(sumarDias(hoy, -3), "12:00"),
    });
    for (const [comunicadoId, cuantas] of [[nota, 13], [evento, 9]] as const) {
      const vieron = [hijo, ...[...resto].sort(() => azar() - 0.5).slice(0, cuantas - 1)];
      for (const alumno of vieron) {
        await ctx.db.insert("vistaComunicado", {
          comunicadoCursoId: comunicadoId, representanteId: alumno.representanteId, estudianteId: alumno.estudianteId,
          vistoEn: ahora - Math.floor(azar() * 3 * DIA),
        });
      }
    }

    // --- Horario de atención (bloques de 15 minutos) y citas -----------------
    const bloques = new Map<string, Id<"disponibilidadDocente">>();
    const publicar = async (fecha: string, hora: string, estado: "DISPONIBLE" | "RESERVADO") => {
      const [h, m] = hora.split(":").map(Number);
      const fin = h * 60 + m + REGLAS.CITA_MINUTOS;
      const id = await ctx.db.insert("disponibilidadDocente", {
        docenteId: docente._id, cursoId, fecha, horaInicio: hora,
        horaFin: `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`,
        modalidad: "PRESENCIAL", lugarOEnlace: "Aula 12", estado, actualizadoEn: ahora,
      });
      bloques.set(`${fecha} ${hora}`, id);
      return id;
    };
    const [manana, pasadoManana] = proximos;
    for (const fecha of [manana, pasadoManana]) {
      for (const hora of ["10:00", "10:15", "10:30", "10:45"]) await publicar(fecha, hora, "DISPONIBLE");
    }
    const reservar = async (fecha: string, hora: string) => {
      const id = bloques.get(`${fecha} ${hora}`) ?? await publicar(fecha, hora, "RESERVADO");
      await ctx.db.patch(id, { estado: "RESERVADO" });
      return id;
    };
    const cita = async (alumno: typeof hijo, fecha: string, hora: string, datos: {
      origen: "SOLICITADA_POR_REPRESENTANTE" | "CITACION_DOCENTE";
      estado: "SOLICITADA" | "CONFIRMADA" | "ATENDIDA" | "CANCELADA";
      motivo: string; notasDocente?: string; acuerdos?: string; motivoCancelacion?: string; vistaPorFamiliaEn?: number;
    }) => {
      const libre = datos.estado === "CANCELADA";
      const bloqueId = libre ? bloques.get(`${fecha} ${hora}`) : await reservar(fecha, hora);
      const inicio = enGuayaquil(fecha, hora);
      return await ctx.db.insert("cita", {
        disponibilidadDocenteId: bloqueId, docenteId: docente._id, representanteId: alumno.representanteId,
        estudianteId: alumno.estudianteId, origen: datos.origen, motivo: datos.motivo,
        fechaHoraInicio: inicio, fechaHoraFin: inicio + REGLAS.CITA_MINUTOS * MINUTO, modalidad: "PRESENCIAL",
        estado: datos.estado, notasDocente: datos.notasDocente, acuerdos: datos.acuerdos,
        canceladaPor: libre ? "REPRESENTANTE" : undefined, motivoCancelacion: datos.motivoCancelacion,
        vistaPorFamiliaEn: datos.vistaPorFamiliaEn, actualizadoEn: ahora,
      });
    };
    await cita(porNombre("Valentina"), pasados[3], "10:00", {
      origen: "SOLICITADA_POR_REPRESENTANTE", estado: "ATENDIDA", motivo: "Quiero saber cómo va en lectura.",
      notasDocente: "Confirmado, la espero en el aula.",
      acuerdos: "Leerán juntas quince minutos cada noche. La docente enviará una lectura corta los lunes. Revisamos cómo va en tres semanas.",
    });
    const solicitada = await cita(porNombre("Santiago"), manana, "10:00", {
      origen: "SOLICITADA_POR_REPRESENTANTE", estado: "SOLICITADA", motivo: "Quisiera conversar sobre sus tareas atrasadas.",
    });
    await cita(porNombre("Isabella"), manana, "10:15", {
      origen: "SOLICITADA_POR_REPRESENTANTE", estado: "CONFIRMADA", motivo: "Revisar su avance en matemáticas.",
      notasDocente: "Confirmado. Traiga el cuaderno de matemáticas, por favor.",
    });
    await cita(porNombre("Thiago"), pasadoManana, "10:00", {
      origen: "CITACION_DOCENTE", estado: "SOLICITADA", motivo: "Conversar sobre lo que pasó en el recreo y cómo acompañarlo en casa.",
      vistaPorFamiliaEn: ahora - 2 * 60 * MINUTO,
    });
    await cita(porNombre("Emily"), pasadoManana, "10:15", {
      origen: "SOLICITADA_POR_REPRESENTANTE", estado: "CANCELADA", motivo: "Hablar de su adaptación al grupo.",
      motivoCancelacion: "Tengo turno médico ese día. Pediré otra fecha.",
    });

    // --- Un reclamo abierto (la forma de `abrirInconformidad`) ---------------
    const empujon = acciones.get("Thiago|1|NEG_INDISCIPLINA")!;
    const venceEn = ahora + REGLAS.INCONFORMIDAD_DIAS_PLAZO * DIA;
    const reclamoId = await ctx.db.insert("inconformidad", {
      accionRegistradaId: empujon, representanteId: porNombre("Thiago").representanteId, motivo: "CONTEXTO_INCOMPLETO",
      mensaje: "Mi hijo dice que solo respondió a un empujón. ¿Podemos conversarlo antes de que quede así?",
      estado: "ABIERTA", docenteId: docente._id, venceEn, actualizadoEn: ahora,
    });
    const vencimientoProgramadoId = await ctx.scheduler.runAt(venceEn, internal.interaccion.vencerInconformidad, { inconformidadId: reclamoId });
    await ctx.db.patch(reclamoId, { vencimientoProgramadoId });

    // --- La campana de la docente, sin mandar nada al teléfono ---------------
    await ctx.db.insert("notificacion", {
      perfilUsuarioId: args.docentePerfilId, tipo: "RESPUESTA_INCONFORMIDAD", titulo: "Un representante abrió un reclamo",
      cuerpo: "Mi hijo dice que solo respondió a un empujón. ¿Podemos conversarlo antes de que quede así?",
      entidadTipo: "inconformidad", entidadId: reclamoId,
    });
    await ctx.db.insert("notificacion", {
      perfilUsuarioId: args.docentePerfilId, tipo: "CITACION", titulo: "Nueva solicitud de cita",
      cuerpo: `La familia de ${porNombre("Santiago").completo} pidió una cita para mañana a las 10:00.`,
      entidadTipo: "cita", entidadId: solicitada,
    });

    return {
      cursoId,
      codigoInvitacion,
      estudiantes: alumnos.length,
      hijoDeLaFamilia: hijo.completo,
      anotaciones: acciones.size,
      reportes,
      diasCargados: pasados,
    };
  },
});
