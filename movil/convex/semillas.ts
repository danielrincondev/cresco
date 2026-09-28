/**
 * Datos semilla del sistema.
 *
 * Era el bloqueo número uno del equipo desde el 8 de agosto: sin los tipos de
 * acción, las franjas, los planes y una plantilla de reporte, nadie podía
 * probar nada. Sobre Postgres exigía base levantada, proveedor elegido y
 * migraciones aplicadas. Aquí es una mutation que se ejecuta desde el panel de
 * Convex, o con:
 *
 *     npx convex run semillas:cargar
 *
 * Es **idempotente**: si ya hay filas, no duplica nada. Se puede correr las
 * veces que haga falta.
 *
 * Los valores salen de `decisiones-pendientes.md` (sesión del 14 de agosto) y
 * de `cuestionario-direccion-visual.md` (bloque C1), que ya no están en el
 * árbol: siguen en `git show c5ce997:docs/99-archivo/<archivo>`.
 *
 * `institucionId` va ausente en todas: son el catálogo del sistema, común a
 * todas las instituciones. Una escuela que quiera el suyo propio inserta filas
 * con su `institucionId`, y esas ganan.
 */

import { internalMutation } from "./_generated/server";
import { REGLAS } from "./lib/enums";

// ---------------------------------------------------------------------------
// Franjas de conducta (C7)
// Colores del bloque C1 del cuestionario visual; frases de la decisión 1.3.
// ---------------------------------------------------------------------------
const FRANJAS = [
  {
    codigo: "CRITICA",
    nombre: "Situación crítica",
    puntajeDesde: 0,
    puntajeHasta: 15,
    colorHex: "#B3453A",
    fraseRepresentante:
      "Requiere acompañamiento prioritario: Unamos fuerzas para apoyarlo.",
  },
  {
    codigo: "MUY_BAJO",
    nombre: "Muy por debajo",
    puntajeDesde: 16,
    puntajeHasta: 30,
    colorHex: "#D0714F",
    fraseRepresentante:
      "Refuerzo necesario: Su guía en casa marcará una gran diferencia.",
  },
  {
    codigo: "BAJO",
    nombre: "Por debajo de lo esperado",
    puntajeDesde: 31,
    puntajeHasta: 50,
    colorHex: "#E0A44A",
    fraseRepresentante:
      "En proceso de mejora: Con un poco más de práctica en casa, logrará avanzar.",
  },
  {
    /**
     * C7 + decisión visual C4: es donde arranca todo estudiante cada parcial,
     * así que el color es un gris neutro a propósito. Si se viera ámbar, cada
     * representante empezaría el parcial creyendo que su hijo va mal.
     */
    codigo: "BASE",
    nombre: "En el punto de partida",
    puntajeDesde: 51,
    puntajeHasta: 60,
    colorHex: "#A8AFA4",
    fraseRepresentante:
      "Bases alcanzadas: ¡Es el momento ideal para impulsarlo a seguir creciendo!",
  },
  {
    codigo: "BUENO",
    nombre: "Buen desempeño",
    puntajeDesde: 61,
    puntajeHasta: 80,
    colorHex: "#6FAE95",
    fraseRepresentante: "¡Buen progreso! Sigamos motivando su esfuerzo diario.",
  },
  {
    codigo: "EXCELENTE",
    nombre: "Excelente",
    puntajeDesde: 81,
    puntajeHasta: 100,
    colorHex: "#2E8B72",
    fraseRepresentante:
      "¡Excelente nivel! Celebremos sus logros y mantengamos este ritmo.",
  },
] as const;

// ---------------------------------------------------------------------------
// Categorías de acción
//
// NUEVO 2026-08-14: el catálogo dejó de ser una lista de frases fijas ("No
// trajo la tarea"). El docente elige **categoría** y escribe él mismo el
// mensaje. Por eso hay una categoría por concepto, no una fila por frase.
//
// Los nombres llevan tildes y ñ: son lo que lee el docente en pantalla.
// ---------------------------------------------------------------------------
const CATEGORIAS = [
  // Positivas
  { codigo: "DESEMPENIO", nombre: "Desempeño", orden: 1 },
  { codigo: "CONVIVENCIA", nombre: "Convivencia", orden: 2 },
  { codigo: "RESPONSABILIDAD", nombre: "Responsabilidad", orden: 3 },
  { codigo: "PUNTUALIDAD", nombre: "Puntualidad", orden: 4 },
  // Negativas
  { codigo: "DISCIPLINA", nombre: "Indisciplina", orden: 5 },
  { codigo: "DESHONESTIDAD", nombre: "Deshonestidad", orden: 6 },
] as const;

/**
 * Tipos de acción — uno por categoría y signo.
 *
 * Rangos según C2 y la decisión del 14 de agosto:
 *   Positivas         → +1 por defecto, el docente puede subirla a +2
 *   Irresponsabilidad → fija en −1, sin ajuste  (regla C2 original, conservada)
 *   Indisciplina      → −1 por defecto, hasta −3
 *   Deshonestidad     → −1 por defecto, hasta −3
 *
 * `requiereDescripcion: true` en todos: el docente siempre escribe el mensaje.
 * `admiteInconformidad` solo en las negativas (C8: una positiva no se disputa).
 */
const TIPOS = [
  {
    codigo: "POS_DESEMPENIO", nombre: "Desempeño destacado", categoria: "DESEMPENIO",
    signo: "POSITIVA" as const,
  },
  {
    codigo: "POS_CONVIVENCIA", nombre: "Buena convivencia", categoria: "CONVIVENCIA",
    signo: "POSITIVA" as const,
  },
  {
    codigo: "POS_RESPONSABILIDAD", nombre: "Responsabilidad", categoria: "RESPONSABILIDAD",
    signo: "POSITIVA" as const,
  },
  {
    codigo: "POS_PUNTUALIDAD", nombre: "Puntualidad", categoria: "PUNTUALIDAD",
    signo: "POSITIVA" as const,
  },
  {
    codigo: "NEG_INDISCIPLINA", nombre: "Indisciplina", categoria: "DISCIPLINA",
    signo: "NEGATIVA" as const, min: REGLAS.DISCIPLINA_MIN, max: REGLAS.DISCIPLINA_MAX,
  },
  {
    codigo: "NEG_IRRESPONSABILIDAD", nombre: "Irresponsabilidad", categoria: "RESPONSABILIDAD",
    signo: "NEGATIVA" as const,
    // Fija: min = max = -1. No admite ajuste del docente.
    min: REGLAS.RESPONSABILIDAD_PUNTOS, max: REGLAS.RESPONSABILIDAD_PUNTOS,
  },
  {
    codigo: "NEG_DESHONESTIDAD", nombre: "Deshonestidad", categoria: "DESHONESTIDAD",
    signo: "NEGATIVA" as const, min: REGLAS.DISCIPLINA_MIN, max: REGLAS.DISCIPLINA_MAX,
  },
] as const;

// ---------------------------------------------------------------------------
// Planes (H1, H2, H3)
//
// Los **precios no viven aquí**: RevenueCat es la fuente de verdad de los
// pagos (ADR-006) y ahí se configuran. Lo que sí vive aquí son los límites,
// porque cambiarlos debe ser actualizar una fila y no volver a desplegar.
//
// Referencia de precios acordada el 14 de agosto, para configurar en el panel:
//   REP_PREMIUM_MENSUAL $1.99 · REP_PREMIUM_BIMESTRAL $2.99 · DOC_PRO $4.99/mes
// ---------------------------------------------------------------------------
const PLANES = [
  {
    codigo: "REP_FREE", nombre: "Representante — Gratuito",
    audiencia: "REPRESENTANTE" as const, periodicidad: "PERPETUO" as const,
    sinPublicidad: false,
    limites: { reportesPrevios: REGLAS.REPORTES_PREVIOS_FREE, exportarPdf: "CON_ANUNCIO" },
  },
  {
    codigo: "REP_PREMIUM_MENSUAL", nombre: "Representante — Premium mensual",
    audiencia: "REPRESENTANTE" as const, periodicidad: "MENSUAL" as const,
    entitlementRevenuecat: "premium", productoGooglePlay: "REP_PREMIUM_MENSUAL",
    sinPublicidad: true,
    limites: { reportesPrevios: REGLAS.REPORTES_PREVIOS_PREMIUM, exportarPdf: "LIBRE" },
  },
  {
    /** H3: "por parcial" se mapea a bimestral — Google Play no tiene ciclo de 6 semanas. */
    codigo: "REP_PREMIUM_BIMESTRAL", nombre: "Representante — Premium bimestral",
    audiencia: "REPRESENTANTE" as const, periodicidad: "BIMESTRAL" as const,
    entitlementRevenuecat: "premium", productoGooglePlay: "REP_PREMIUM_BIMESTRAL",
    sinPublicidad: true,
    limites: { reportesPrevios: REGLAS.REPORTES_PREVIOS_PREMIUM, exportarPdf: "LIBRE" },
  },
  {
    codigo: "DOC_FREE", nombre: "Docente — Gratuito",
    audiencia: "DOCENTE" as const, periodicidad: "PERPETUO" as const,
    sinPublicidad: false,
    limites: {
      cursosActivos: REGLAS.CURSOS_DOCENTE_FREE,
      estudiantesPorCurso: REGLAS.ESTUDIANTES_POR_CURSO_FREE,
    },
  },
  {
    /** Entitlement propio, separado de `premium` (decisión del 14 de agosto). */
    codigo: "DOC_PRO", nombre: "Docente — PRO",
    audiencia: "DOCENTE" as const, periodicidad: "MENSUAL" as const,
    entitlementRevenuecat: "docente_pro", productoGooglePlay: "DOC_PRO",
    sinPublicidad: false,
    limites: {
      cursosActivos: REGLAS.CURSOS_DOCENTE_PRO,
      estudiantesPorCurso: REGLAS.ESTUDIANTES_POR_CURSO_PRO,
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Plantilla del reporte general (E1/E3)
// Los cuatro campos aprobados el 14 de agosto. Ninguno es obligatorio de llenar.
// ---------------------------------------------------------------------------
const CAMPOS_REPORTE = [
  { codigo: "ANUNCIOS", etiqueta: "Anuncios", tipoDato: "TEXTO_LARGO" as const, orden: 1 },
  { codigo: "NOVEDADES", etiqueta: "Novedades del día", tipoDato: "TEXTO_LARGO" as const, orden: 2 },
  { codigo: "TAREAS", etiqueta: "Tareas enviadas", tipoDato: "TEXTO_LARGO" as const, orden: 3 },
  { codigo: "CONSEJO", etiqueta: "Consejo del día", tipoDato: "TEXTO_CORTO" as const, orden: 4 },
] as const;

// ---------------------------------------------------------------------------

export const cargar = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ahora = Date.now();
    const resumen: Record<string, number> = {};

    // --- Franjas ---------------------------------------------------------
    let franjasCreadas = 0;
    for (const f of FRANJAS) {
      const existe = await ctx.db
        .query("franjaConducta")
        .withIndex("por_institucion_codigo", (q) =>
          q.eq("institucionId", undefined).eq("codigo", f.codigo),
        )
        .unique();
      if (existe !== null) continue;

      await ctx.db.insert("franjaConducta", {
        institucionId: undefined,
        codigo: f.codigo,
        nombre: f.nombre,
        puntajeDesde: f.puntajeDesde,
        puntajeHasta: f.puntajeHasta,
        fraseRepresentante: f.fraseRepresentante,
        colorHex: f.colorHex,
        orden: f.puntajeDesde,
        actualizadoEn: ahora,
      });
      franjasCreadas++;
    }
    resumen.franjas = franjasCreadas;

    // --- Categorías ------------------------------------------------------
    const idsPorCategoria = new Map<string, import("./_generated/dataModel").Id<"categoriaAccion">>();
    let categoriasCreadas = 0;
    for (const c of CATEGORIAS) {
      const existe = await ctx.db
        .query("categoriaAccion")
        .withIndex("por_institucion_codigo", (q) =>
          q.eq("institucionId", undefined).eq("codigo", c.codigo),
        )
        .unique();

      if (existe !== null) {
        idsPorCategoria.set(c.codigo, existe._id);
        continue;
      }

      const id = await ctx.db.insert("categoriaAccion", {
        institucionId: undefined,
        codigo: c.codigo,
        nombre: c.nombre,
        aplicaA: "AMBAS", // V2: reservado sin dominio hasta que exista el rol colaborador
        orden: c.orden,
        activa: true,
        actualizadoEn: ahora,
      });
      idsPorCategoria.set(c.codigo, id);
      categoriasCreadas++;
    }
    resumen.categorias = categoriasCreadas;

    // --- Tipos de acción -------------------------------------------------
    let tiposCreados = 0;
    for (const t of TIPOS) {
      const existe = await ctx.db
        .query("tipoAccion")
        .withIndex("por_institucion_codigo", (q) =>
          q.eq("institucionId", undefined).eq("codigo", t.codigo),
        )
        .unique();
      if (existe !== null) continue;

      const categoriaId = idsPorCategoria.get(t.categoria);
      if (categoriaId === undefined) {
        throw new Error(`Falta la categoría ${t.categoria} para el tipo ${t.codigo}`);
      }

      const esPositiva = t.signo === "POSITIVA";
      await ctx.db.insert("tipoAccion", {
        institucionId: undefined,
        categoriaAccionId: categoriaId,
        codigo: t.codigo,
        nombre: t.nombre,
        signo: t.signo,
        puntosDefecto: esPositiva ? REGLAS.POSITIVA_MIN : REGLAS.DISCIPLINA_MAX,
        puntosMin: esPositiva ? REGLAS.POSITIVA_MIN : ("min" in t ? t.min : REGLAS.DISCIPLINA_MIN),
        puntosMax: esPositiva ? REGLAS.POSITIVA_MAX : ("max" in t ? t.max : REGLAS.DISCIPLINA_MAX),
        // El docente siempre escribe el mensaje (decisión del 14 de agosto)
        requiereDescripcion: true,
        // C8: solo las negativas se pueden reclamar
        admiteInconformidad: !esPositiva,
        cuentaEnBitacora: true,
        activa: true,
        actualizadoEn: ahora,
      });
      tiposCreados++;
    }
    resumen.tiposAccion = tiposCreados;

    // --- Planes ----------------------------------------------------------
    let planesCreados = 0;
    for (const p of PLANES) {
      const existe = await ctx.db
        .query("plan")
        .withIndex("por_codigo", (q) => q.eq("codigo", p.codigo))
        .unique();
      if (existe !== null) continue;

      await ctx.db.insert("plan", {
        codigo: p.codigo,
        nombre: p.nombre,
        audiencia: p.audiencia,
        entitlementRevenuecat: "entitlementRevenuecat" in p ? p.entitlementRevenuecat : undefined,
        productoGooglePlay: "productoGooglePlay" in p ? p.productoGooglePlay : undefined,
        periodicidad: p.periodicidad,
        sinPublicidad: p.sinPublicidad,
        limites: p.limites,
        activo: true,
        actualizadoEn: ahora,
      });
      planesCreados++;
    }
    resumen.planes = planesCreados;

    // --- Plantilla de reporte --------------------------------------------
    let plantilla = await ctx.db
      .query("plantillaReporte")
      .withIndex("por_institucion", (q) => q.eq("institucionId", undefined).eq("activa", true))
      .first();

    if (plantilla === null) {
      const plantillaId = await ctx.db.insert("plantillaReporte", {
        institucionId: undefined,
        nombre: "Reporte diario del curso",
        version: 1,
        activa: true,
        actualizadoEn: ahora,
      });

      for (const campo of CAMPOS_REPORTE) {
        await ctx.db.insert("plantillaCampo", {
          plantillaReporteId: plantillaId,
          codigo: campo.codigo,
          etiqueta: campo.etiqueta,
          tipoDato: campo.tipoDato,
          orden: campo.orden,
          activo: true,
        });
      }
      resumen.plantillaCampos = CAMPOS_REPORTE.length;
    } else {
      resumen.plantillaCampos = 0;
    }

    return resumen;
  },
});
