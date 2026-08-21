/**
 * Sistema de diseño de Cresco. Dueño del archivo: Persona A (decisión del 3 de
 * agosto — A construye las pantallas con más variedad de componentes).
 *
 * Cada valor de aquí sale de una decisión escrita, no de un criterio de quien
 * programó la pantalla. Las fuentes son
 * `docs/00-producto/cuestionario-direccion-visual.md` y el bloque 2 de
 * `docs/00-producto/decisiones-pendientes.md`.
 *
 * **Regla de uso: ningún `#hex` fuera de este archivo.** El criterio para saber
 * que el sistema funciona es que alguien pueda construir una pantalla nueva sin
 * preguntar ningún color ni ningún espaciado.
 *
 * ── Restricciones del producto que explican varias decisiones ───────────────
 *  · El docente usa la app de pie, con una mano, con 30 niños haciendo ruido.
 *  · El representante promedio no lee gráficos estadísticos.
 *  · Se usa en aulas y patios, a veces con sol: el contraste es legibilidad,
 *    no un detalle de accesibilidad.
 *  · Entre los representantes hay abuelos (`PARENTESCO` incluye `ABUELO_A`):
 *    el cuerpo nunca baja de 16.
 */

/* --------------------------------------------------------------------------
 * COLOR
 * ----------------------------------------------------------------------- */

/** Marca. Azul institucional: la app da noticias que importan sobre un hijo. */
export const Marca = {
  claro: "#EBF4FA",
  base: "#00509E",
  oscuro: "#002A5C",
} as const;

export const Superficie = {
  /** Fondo de pantalla. */
  fondo: Marca.claro,
  /** Fondo de tarjeta: blanco, para contraste y limpieza. */
  tarjeta: "#FFFFFF",
  borde: "#E2E8F0",
  separador: "#E2E8F0",
} as const;

export const Texto = {
  primario: Marca.oscuro,
  /**
   * Corregido el 14 de agosto: era `#718096`, que daba ~3.9:1 sobre el fondo
   * claro — por debajo del mínimo AA de 4.5:1 y, por tanto, difícil de leer
   * con sol. `#4A5568` da ~6.8:1 sobre el fondo y ~7.5:1 sobre tarjeta blanca,
   * conservando la jerarquía frente al texto primario.
   */
  secundario: "#4A5568",
  deshabilitado: "#A0AEC0",
  /** Sobre `Marca.base`: botones y barras. */
  sobreColor: "#FFFFFF",
} as const;

/**
 * Los tres rojos.
 *
 * El representante ve estas tres cosas en la misma pantalla y no puede
 * confundirlas: una anotación de su hijo, un error del formulario y una alerta
 * de emergencia son avisos de gravedad muy distinta.
 *
 * Todos tienen matiz ~0° (rojo puro), deliberadamente separados del matiz
 * rojo-naranja (~5–16°) de las franjas `CRITICA` y `MUY_BAJO`.
 */
export const Semantico = {
  /**
   * Acción negativa registrada al estudiante.
   *
   * ⚠️ Da 3.7:1 sobre el fondo claro y 4.1:1 con texto blanco encima: **los dos
   * por debajo de AA**. Úsalo como fondo de chip con texto oscuro, nunca como
   * texto suelto ni con texto blanco encima.
   */
  negativa: "#E53E3E",
  /** Error de formulario o de carga. 5.5:1 con texto blanco — pasa AA. */
  error: "#C53030",
  /** Alerta de emergencia. 7.5:1 con texto blanco — pasa AAA. */
  emergencia: "#9B2C2C",
  /**
   * Acción positiva. Matiz ~142°, elegido a propósito lejos del ~156–164° de
   * las franjas `BUENO` y `EXCELENTE`: un verde más saturado con el mismo
   * matiz se confundiría con ellas de reojo.
   */
  positiva: "#16A34A",
} as const;

/**
 * Las seis franjas de conducta (C7).
 *
 * Estos valores **también viven en `convex/semillas.ts`**, porque
 * `franjaConducta.colorHex` es un dato de la base: el representante los ve en
 * el reporte y una institución podría personalizarlos. Si cambia uno, cambian
 * los dos sitios.
 *
 * C3 de la sesión visual: la franja nunca se distingue solo por color. Siempre
 * va acompañada del puntaje numérico — entre el 5 y el 8 % de los hombres
 * tiene daltonismo, y el sol en pantalla afecta a todos.
 */
export const Franja = {
  CRITICA: "#B3453A",
  MUY_BAJO: "#D0714F",
  BAJO: "#E0A44A",
  /** Neutro a propósito: aquí arranca cada estudiante en cada parcial. */
  BASE: "#A8AFA4",
  BUENO: "#6FAE95",
  EXCELENTE: "#2E8B72",
} as const;

/* --------------------------------------------------------------------------
 * TIPOGRAFÍA
 * ----------------------------------------------------------------------- */

/**
 * Fuente cargada con `expo-font`, no la del sistema. Implica manejar un estado
 * de "fuente no lista" al arrancar: la app no debe pintar texto hasta que
 * `useFonts` termine, o se ve un salto de tipografía.
 */
export const Fuente = {
  familia: "Inter",
  peso: { regular: "400", medio: "500", semibold: "600" },
} as const;

export const Tamano = {
  xs: 12,
  sm: 14,
  /** Mínimo para el cuerpo en la app del representante. No bajar de aquí. */
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  /** El número grande de P6: el elemento más importante de la app del padre. */
  puntaje: 56,
} as const;

/* --------------------------------------------------------------------------
 * ESPACIADO Y FORMA
 * ----------------------------------------------------------------------- */

export const Espacio = {
  /** Entre un icono y el texto de al lado. */
  xs: 4,
  /** Entre un título y su subtítulo. */
  sm: 8,
  /** Interior de una etiqueta pequeña. */
  md: 12,
  /** Estándar: márgenes generales desde el borde de la pantalla. */
  base: 16,
  /** Entre secciones de una misma tarjeta. */
  lg: 24,
  /** Entre bloques grandes de contenido. */
  xl: 32,
  /** Entre zonas muy distintas de la pantalla. */
  xxl: 48,
  xxxl: 64,
} as const;

export const Radio = {
  /** Casillas de verificación, indicadores de estado. */
  sm: 4,
  /** Botones y campos de texto: estructurado y serio. */
  base: 8,
  /** Tarjetas y modales: suaviza los bloques grandes sin perder el estilo. */
  lg: 16,
  /** Chips, etiquetas y avatares. Se distinguen de los botones a propósito. */
  pill: 999,
} as const;

/**
 * G4 — no es una preferencia, es un requisito: el docente usa la app de pie y
 * con una mano. Ninguna zona tocable baja de 44×44.
 */
export const AREA_TACTIL_MINIMA = 44;

/**
 * G3 — profundidad con borde y fondo, sin sombra. En Android las sombras se
 * hacen con `elevation` y se comportan distinto que en iOS; borde + fondo es
 * más barato y se ve igual en gama media, que es el equipo del piloto.
 */
export const Profundidad = { borde: 1 } as const;

/* --------------------------------------------------------------------------
 * ESTADOS DE CARGA
 * ----------------------------------------------------------------------- */

/**
 * H1. Los tres patrones, con su regla de uso. La definición de "terminado"
 * exige manejar cargando, vacío y error en **cada** pantalla.
 *
 *  esqueleto — al cambiar de pestaña o sección principal
 *  spinner   — micro-interacciones: guardar, enviar, confirmar
 *  hibrido   — procesos que calculan (ej. el acumulado del parcial):
 *              esqueleto de la estructura + spinner al centro
 */
export const PatronCarga = {
  esqueleto: "esqueleto",
  spinner: "spinner",
  hibrido: "hibrido",
} as const;
export type PatronCarga = (typeof PatronCarga)[keyof typeof PatronCarga];

/* --------------------------------------------------------------------------
 * ICONOGRAFÍA
 * ----------------------------------------------------------------------- */

/**
 * Google Material Symbols, **no** `@expo/vector-icons`.
 *
 * Ese paquete trae Material Icons clásico, donde contorno y relleno son
 * familias separadas — no tiene el eje variable `FILL` que necesita la regla
 * de abajo. Hay que descargar la fuente variable de Google Fonts y cargarla
 * con `expo-font`, igual que Inter.
 *
 * Regla: contorno (`FILL 0`) en todo el menú y los botones inactivos; relleno
 * (`FILL 1`) exclusivamente en la pestaña o sección donde está el usuario.
 *
 * ⚠️ Probar en un Android real antes de construir toda la navegación sobre
 * esto: el soporte de `fontVariationSettings` en React Native no es parejo
 * entre versiones.
 */
export const Icono = {
  familia: "MaterialSymbolsOutlined",
  fill: { inactivo: "'FILL' 0", activo: "'FILL' 1" },
} as const;

/* --------------------------------------------------------------------------
 * VARIANTES POR APP (A1)
 * ----------------------------------------------------------------------- */

/**
 * Un solo núcleo de tema, dos densidades. La diferencia entre las dos apps se
 * resuelve con espaciado y tamaño, nunca con dos paletas: tienen que verse del
 * mismo producto.
 *
 *  docente       — 40 nombres en pantalla, necesita densidad
 *  representante — una noticia sobre su hijo, necesita respiro
 */
export const Densidad = {
  docente: {
    espacioSeccion: Espacio.base,
    espacioItem: Espacio.sm,
    tamanoCuerpo: Tamano.sm,
  },
  representante: {
    espacioSeccion: Espacio.lg,
    espacioItem: Espacio.base,
    tamanoCuerpo: Tamano.base,
  },
} as const;

/** A2: sin modo oscuro en la v1. Los tokens ya son semánticos por si entra en v2. */
export const Tema = {
  Marca,
  Superficie,
  Texto,
  Semantico,
  Franja,
  Fuente,
  Tamano,
  Espacio,
  Radio,
  Profundidad,
  Icono,
  Densidad,
  AREA_TACTIL_MINIMA,
} as const;

export default Tema;
