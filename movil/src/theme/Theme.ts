/**
 * Sistema de diseño de Cresco.
 *
 * Dueño del archivo: **Persona C**. Lo fue Persona A por la decisión del 3 de
 * agosto —A construía las pantallas con más variedad de componentes—, y pasó a
 * C el 10 de septiembre con DP-012, junto con el resto de la interfaz. Ver
 * `.github/CODEOWNERS`.
 *
 * El movimiento vive aparte, en `Movimiento.ts`: mismos criterios, misma regla
 * de "ningún valor mágico fuera del tema".
 *
 * Cada valor de aquí sale de una decisión escrita, no de un criterio de quien
 * programó la pantalla. Las fuentes son `cuestionario-direccion-visual.md` y
 * el bloque 2 de `decisiones-pendientes.md`, que ya no están en el árbol:
 * siguen en `git show c5ce997:docs/99-archivo/<archivo>`.
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

import { modoOscuro } from "./modo";

/* --------------------------------------------------------------------------
 * COLOR
 * ----------------------------------------------------------------------- */

/*
 * Dos paletas con los mismos nombres (DP-014). La clara es la de siempre: la
 * ve todo el mundo mientras no active el modo oscuro en Ajustes, y ninguno de
 * sus valores cambió. Las pantallas no eligen paleta: importan `Marca`,
 * `Superficie`, `Texto`, `Semantico` y `TonoEstado`, que al final de esta
 * sección ya salen de la que toca según `modo.ts`.
 *
 * La oscura invierte una regla de la clara: en ella los botones y los
 * rellenos de color son **claros con texto oscuro** (`Texto.sobreColor` pasa
 * a ser casi negro), como en el tema oscuro de Material Design. No hay otra
 * forma de que `Marca.base` sirva a la vez de texto sobre el fondo y de fondo
 * de un botón: un azul que da 4.5:1 frente al blanco no llega a 4.5:1 frente
 * a un fondo oscuro, y al revés. Todas las parejas de texto y fondo que usan
 * las pantallas pasan AA en las dos paletas; `Theme.test.ts` lo comprueba.
 */

type Paleta = {
  readonly Marca: { readonly claro: string; readonly base: string; readonly oscuro: string };
  readonly Superficie: {
    readonly fondo: string;
    readonly tarjeta: string;
    readonly borde: string;
    readonly separador: string;
  };
  readonly Texto: {
    readonly primario: string;
    readonly secundario: string;
    readonly deshabilitado: string;
    readonly sobreColor: string;
  };
  readonly Semantico: {
    readonly negativa: string;
    readonly error: string;
    readonly emergencia: string;
    readonly positiva: string;
  };
  readonly TonoEstado: Readonly<
    Record<
      "neutro" | "positivo" | "atencion" | "negativo" | "critico",
      { readonly fondo: string; readonly borde: string; readonly texto: string }
    >
  >;
};

/** Marca. Azul institucional: la app da noticias que importan sobre un hijo. */
const MARCA_CLARA = {
  claro: "#EBF4FA",
  base: "#00509E",
  oscuro: "#002A5C",
};

/**
 * En oscuro, `claro` es el resaltado de lo elegido o presionado sobre una
 * tarjeta; `base`, el azul de enlaces, iconos y botones; y `oscuro`, el
 * relleno más fuerte (la opción elegida), que también se lee como texto.
 */
const MARCA_OSCURA = {
  claro: "#1F3A5C",
  base: "#7DB7EE",
  oscuro: "#B9D8F7",
};

const SUPERFICIE_CLARA = {
  /** Fondo de pantalla. */
  fondo: MARCA_CLARA.claro,
  /** Fondo de tarjeta: blanco, para contraste y limpieza. */
  tarjeta: "#FFFFFF",
  borde: "#E2E8F0",
  separador: "#E2E8F0",
};

const SUPERFICIE_OSCURA = {
  fondo: "#0E1726",
  tarjeta: "#172336",
  /** También es la pista apagada del interruptor: la bolita (tarjeta) tiene que verse encima. */
  borde: "#3A4C66",
  separador: "#3A4C66",
};

const TEXTO_CLARO = {
  primario: MARCA_CLARA.oscuro,
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
};

const TEXTO_OSCURO = {
  primario: "#E7EEF6",
  secundario: "#AAB6C6",
  deshabilitado: "#6B7A8F",
  /** Casi negro: en oscuro los rellenos de color son claros (ver arriba). */
  sobreColor: "#0B1A2C",
};

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
const SEMANTICO_CLARO = {
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
};

/**
 * En oscuro los tres rojos se separan por la saturación y no por lo oscuros
 * que son: el error es rosado pálido, la emergencia un rojo saturado (los dos
 * con texto casi negro encima), y la acción negativa queda como borde de un
 * chip de fondo rojo oscuro.
 */
const SEMANTICO_OSCURO = {
  negativa: "#F87171",
  error: "#F2B8B5",
  emergencia: "#FF5A5A",
  positiva: "#4ADE80",
};

/**
 * Las seis franjas de conducta (C7). Iguales en las dos paletas: son un dato
 * de la base, no del tema.
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

/**
 * Los cinco tonos del chip de estado (componente 4 del issue #5).
 *
 * El issue pedia "una mecanica reutilizable, no 15 chips distintos": estos
 * cinco tonos son esa mecanica, y `src/lib/estados.ts` es la tabla que decide
 * que estado del dominio cae en cual. Viven aqui y no en el componente porque
 * la regla del propio issue no admite excepciones: **ningun `#hex` fuera de
 * este archivo**.
 *
 * Todos llevan fondo claro y texto oscuro, menos `critico`. No es estetica:
 * `Semantico.negativa` da 4.1:1 con texto blanco encima, por debajo de AA, y
 * este mismo archivo lo advierte arriba. El unico con texto blanco es
 * `critico`, sobre `Semantico.emergencia`, que da 7.5:1 y pasa AAA — es el
 * tono que tiene que gritar, y por eso es el unico que puede.
 */
const TONO_CLARO: Paleta["TonoEstado"] = {
  /** Sin carga: informativo, en curso, o el punto de partida. */
  neutro: { fondo: SUPERFICIE_CLARA.fondo, borde: SUPERFICIE_CLARA.borde, texto: TEXTO_CLARO.secundario },
  /** Algo salio bien, o quedo cerrado a favor. 8.0:1 sobre su fondo. */
  positivo: { fondo: "#E7F6EE", borde: SEMANTICO_CLARO.positiva, texto: "#14532D" },
  /** Pide accion de quien lo ve, todavia sin gravedad. 7.4:1 sobre su fondo. */
  atencion: { fondo: "#FDF4E3", borde: Franja.BAJO, texto: "#7A4A12" },
  /** Algo negativo registrado, o cerrado en contra. 8.6:1 sobre su fondo. */
  negativo: { fondo: "#FCEAEA", borde: SEMANTICO_CLARO.negativa, texto: "#7A1C1C" },
  /** Solo emergencias reales. Escaso a proposito. */
  critico: {
    fondo: SEMANTICO_CLARO.emergencia,
    borde: SEMANTICO_CLARO.emergencia,
    texto: TEXTO_CLARO.sobreColor,
  },
};

/** Al revés que en la clara: fondo oscuro teñido y texto claro del mismo matiz. */
const TONO_OSCURO: Paleta["TonoEstado"] = {
  neutro: { fondo: "#1C2A3F", borde: SUPERFICIE_OSCURA.borde, texto: TEXTO_OSCURO.secundario },
  positivo: { fondo: "#123524", borde: SEMANTICO_OSCURO.positiva, texto: "#9FE8B8" },
  atencion: { fondo: "#3A2A10", borde: Franja.BAJO, texto: "#F7D49B" },
  negativo: { fondo: "#3D1717", borde: SEMANTICO_OSCURO.negativa, texto: "#FCA5A5" },
  critico: {
    fondo: SEMANTICO_OSCURO.emergencia,
    borde: SEMANTICO_OSCURO.emergencia,
    texto: TEXTO_OSCURO.sobreColor,
  },
};

/** Las dos paletas enteras. Las pantallas no las usan: son para las pruebas. */
export const Paletas: { readonly claro: Paleta; readonly oscuro: Paleta } = {
  claro: {
    Marca: MARCA_CLARA,
    Superficie: SUPERFICIE_CLARA,
    Texto: TEXTO_CLARO,
    Semantico: SEMANTICO_CLARO,
    TonoEstado: TONO_CLARO,
  },
  oscuro: {
    Marca: MARCA_OSCURA,
    Superficie: SUPERFICIE_OSCURA,
    Texto: TEXTO_OSCURO,
    Semantico: SEMANTICO_OSCURO,
    TonoEstado: TONO_OSCURO,
  },
};

/** La paleta de esta sesión: la oscura solo si se activó en Ajustes. */
const PALETA = modoOscuro ? Paletas.oscuro : Paletas.claro;

export const Marca = PALETA.Marca;
export const Superficie = PALETA.Superficie;
export const Texto = PALETA.Texto;
export const Semantico = PALETA.Semantico;
export const TonoEstado = PALETA.TonoEstado;
export { modoOscuro };

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
  /**
   * ⚠️ Solo se cargan **dos** pesos en `App.tsx`: `Inter` (400) e
   * `Inter-Semibold` (600). `medio` está declarado pero su fuente no se carga,
   * así que usarlo no da 500 — da 400 sin avisar. O se carga
   * `Inter_500Medium` o se quita de aquí; mientras tanto, no usarlo.
   */
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
  /**
   * ⚠️ **Sin uso, y no hay que dárselo.** Venía de la dirección visual, que
   * pedía el puntaje de P6 como número grande. Una decisión posterior lo
   * anuló: por C3 la cifra va **dentro** del texto de la franja, y
   * `etiquetaFranja` lo garantiza. Como dice la cabecera de `ReporteScreen`,
   * una cifra sin la frase de la franja se lee como una nota escolar, que es
   * justo lo que el puntaje de conducta no es.
   *
   * Se conserva para que quede constancia de por qué no se usa: borrarlo sin
   * más invita a que alguien lo reintroduzca dentro de seis meses.
   */
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
 *
 * Los dos primeros ya existen: `EsqueletoPagina` en `components/Movimiento.tsx`
 * y `Cargando` en `components/NucleoUI.tsx`. El patrón se elige en la llamada,
 * no con esta constante —qué está cargando lo sabe la pantalla, no el tema—,
 * así que estos valores son documentación de la regla, no una API.
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
/**
 * Iconografía.
 *
 * ⚠️ **Cambió el 6 de septiembre de 2026 (issue #21, DP-011).** La decisión
 * original era Google Material Symbols con el eje variable `FILL`. No se puede:
 * React Native no soporta `fontVariationSettings`, y las fuentes de Material
 * Symbols que se distribuyen por npm son estáticas (sin tabla `fvar`). Está
 * comprobado, no supuesto.
 *
 * Lo que sí da el mismo resultado visual: `MaterialCommunityIcons`, que trae
 * 1889 pares `nombre` / `nombre-outline`. La distinción contorno/relleno se
 * resuelve con dos glifos en vez de con un eje variable.
 *
 * **No uses estos valores directamente: usa el componente `Icono.tsx`**, que
 * ya resuelve el par y cae al relleno si un icono no tiene contorno.
 */
export const Icono = {
  familia: "MaterialCommunityIcons",
  /** Sufijo del glifo de contorno. El relleno es el nombre sin sufijo. */
  sufijoContorno: "-outline",
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

/**
 * A2 decía «sin modo oscuro en la v1», y por eso los tokens ya eran semánticos.
 * DP-014 lo reemplaza: modo oscuro opcional desde Ajustes, apagado por defecto.
 */
export const Tema = {
  Marca,
  Superficie,
  Texto,
  Semantico,
  Franja,
  TonoEstado,
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
