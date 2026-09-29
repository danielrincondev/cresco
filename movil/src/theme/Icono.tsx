/**
 * Icono — la primitiva de iconografía de Cresco.
 *
 * ## Por qué no usamos Material Symbols con el eje FILL
 *
 * La dirección visual decidió "contorno para lo inactivo, relleno sólido para
 * la sección activa", implementado con el eje variable `FILL` de Google
 * Material Symbols. **Eso no se puede hacer en este stack**, y está
 * comprobado, no supuesto (issue #21):
 *
 * 1. **React Native no soporta `fontVariationSettings`.** No existe en sus
 *    tipos ni en su código: no hay forma de mover un eje variable desde un
 *    estilo.
 * 2. **Las fuentes de Material Symbols que se distribuyen por npm son
 *    estáticas.** Se verificó leyendo el directorio de tablas de los `.ttf`:
 *    no tienen tabla `fvar`, así que no contienen ningún eje variable — ni
 *    siquiera si React Native pudiera usarlo.
 *
 * ## Lo que sí funciona, y da el mismo resultado visual
 *
 * `MaterialCommunityIcons` trae **1889 pares** de icono relleno y su versión
 * de contorno, con la convención `nombre` / `nombre-outline`. Es la misma
 * distinción que buscaba la decisión original, resuelta con dos glifos en vez
 * de con un eje variable — y sin depender de nada que el runtime no soporte.
 *
 * No todos los iconos tienen par de contorno (de 7448, 1889 lo tienen). Los
 * que hacen falta para la navegación sí: `home`, `bell`, `account`,
 * `calendar`, `alert`, `account-group`, `file-document`. Si alguno no lo
 * tiene, este componente cae al relleno en vez de romperse.
 *
 * ## Solo los glifos que usa la app (#84)
 *
 * La fuente completa pesaba 1,28 MB —un tercio del paquete— para unas
 * decenas de iconos. `scripts/generar-iconos.py` la recorta a los que aparecen
 * en el código, con sus contornos, y escribe `glifos.ts`. El nombre de un
 * icono se tipa con las claves de ese mapa: usar uno que no esté en el recorte
 * **no compila**, así que no puede llegar a verse un cuadrado vacío.
 */

import createIconSet from "@expo/vector-icons/createIconSet";

import { GLIFOS } from "./glifos";
import { AREA_TACTIL_MINIMA, Tamano, Texto } from "./Theme";

/** El nombre con que se registra la fuente; `App.tsx` la precarga con el mismo. */
export const FAMILIA_ICONOS = "IconosCresco";
export const FUENTE_ICONOS = require("../../assets/fonts/IconosCresco.ttf");

const Glifo = createIconSet(GLIFOS, FAMILIA_ICONOS, FUENTE_ICONOS);

type NombreIcono = keyof typeof GLIFOS;

export type PropsIcono = {
  /** Nombre base del icono, sin el sufijo `-outline`. Ej: `"home"`. */
  nombre: NombreIcono;
  /**
   * `true` pinta el icono **relleno** — se reserva para la pestaña o sección
   * en la que el usuario está. `false` pinta el contorno.
   */
  activo?: boolean;
  tamano?: number;
  color?: string;
  /** Marca el icono como decorativo para los lectores de pantalla. */
  decorativo?: boolean;
  etiqueta?: string;
};

/** ¿Existe la versión de contorno de este icono? */
export function tieneContorno(nombre: string): boolean {
  return `${nombre}-outline` in GLIFOS;
}

export function Icono({
  nombre,
  activo = false,
  tamano = Tamano.lg,
  color = Texto.primario,
  decorativo = false,
  etiqueta,
}: PropsIcono) {
  // Activo = relleno. Inactivo = contorno, si existe; si no, el relleno,
  // que es preferible a no dibujar nada.
  const usaContorno = !activo && tieneContorno(nombre);
  const nombreFinal = (usaContorno ? `${nombre}-outline` : nombre) as NombreIcono;

  return (
    <Glifo
      name={nombreFinal}
      size={tamano}
      color={color}
      accessibilityElementsHidden={decorativo}
      importantForAccessibility={decorativo ? "no-hide-descendants" : "auto"}
      accessibilityLabel={decorativo ? undefined : etiqueta}
    />
  );
}

/**
 * Área táctil mínima para un icono que se puede tocar (G4: 44 dp).
 *
 * Un icono de 24 dp dentro de un contenedor de 44 no se ve más grande, pero
 * se puede tocar con el pulgar. El docente usa la app de pie, con una mano y
 * con treinta niños haciendo ruido: esto no es un detalle de accesibilidad,
 * es de uso.
 */
export const areaTactilIcono = {
  minWidth: AREA_TACTIL_MINIMA,
  minHeight: AREA_TACTIL_MINIMA,
  alignItems: "center",
  justifyContent: "center",
} as const;
