/**
 * La barra de pestañas inferior de la app de la familia.
 *
 * ## Por qué solo la familia, y por qué solo tres
 *
 * El docente ya tiene el menú lateral y una jerarquía real (cursos → curso
 * abierto → acción); una barra inferior ahí competiría con esa jerarquía sin
 * añadir nada. La familia, en cambio, vive casi siempre entre tres sitios:
 * qué pasó hoy, con quién habla el profesor, y volver a ver a sus hijos. Eso
 * es exactamente lo que la barra ofrece.
 *
 * ## Solo iconos, sin palabras
 *
 * Con tres destinos y un icono de sobra reconocible cada uno (calendario,
 * casa, documento), el texto no añade información — solo ocupa la línea que
 * en un teléfono de gama baja, con la barra de gestos de Android debajo, ya
 * va apretada. La etiqueta de accesibilidad sigue llevando la palabra
 * completa: el icono se prescinde para el ojo, nunca para quien usa lector de
 * pantalla.
 *
 * ## El círculo activo
 *
 * `activo` pinta el icono relleno (igual que el resto del sistema, vía
 * `Icono`) y lo pone encima de un círculo de `Marca.base` con alfa muy baja.
 * La transparencia es a propósito: el círculo tiene que notarse sin tapar el
 * icono ni convertirse en una mancha sólida azul en cada pestaña activa.
 *
 * ⚠️ `Marca.base` con alfa es el segundo color fuera de `Theme.ts` en todo
 * `src/` (el primero es el velo de `MenuLateral.tsx`). El tema no define
 * tonos translúcidos, y un realce de pestaña activa necesita justamente eso —
 * el mismo azul de marca, pero dejando ver lo que hay detrás.
 *
 * ## Por qué calcula su propio margen inferior
 *
 * `NucleoScreen` ya envuelve toda la pantalla en `SafeAreaView`, que en
 * teoría reserva la franja de gestos de Android para toda la columna. En la
 * práctica **no basta confiar en eso**: `MenuLateral.tsx` tuvo exactamente
 * este problema —un elemento pegado al borde inferior quedando debajo de los
 * botones del sistema— y la causa no fue una excepción de ese componente,
 * fue que la reserva de `SafeAreaView` no siempre alcanza a un hijo que toca
 * el borde. Una barra de pestañas toca el borde por definición.
 *
 * Por eso pide sus propios márgenes con `useSafeAreaInsets` y los suma al
 * relleno interno, en vez de asumir que el padre ya los puso. En un teléfono
 * sin barra de gestos (botones físicos, o la franja ya reservada de verdad)
 * el resultado es el mismo `Espacio.sm` de siempre: `Math.max` nunca resta.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icono, type PropsIcono } from "../theme/Icono";
import {
  AREA_TACTIL_MINIMA,
  Espacio,
  Marca,
  Radio,
  Superficie,
  Tamano,
  Texto,
} from "../theme/Theme";

/**
 * 16 % de opacidad: se nota el realce, se sigue viendo el icono a través.
 * Exportado para que la prueba compare contra el mismo valor, no uno propio.
 */
export const CIRCULO_ACTIVO = `${Marca.base}29`;

export type PestanaInferior = {
  clave: string;
  icono: PropsIcono["nombre"];
  etiqueta: string;
  disponible?: boolean;
};

export function BarraInferior({
  pestanas,
  activa,
  onCambiar,
}: {
  pestanas: PestanaInferior[];
  activa: string;
  onCambiar: (clave: string) => void;
}) {
  // `?? 0`: en las pruebas el modulo va mockeado y no devuelve medidas.
  const margenes = useSafeAreaInsets();
  return (
    <View
      style={[b.barra, { paddingBottom: Math.max(margenes?.bottom ?? 0, Espacio.sm) }]}
      accessibilityRole="tablist"
    >
      {pestanas.map((p) => {
        const esActiva = p.clave === activa;
        const disponible = p.disponible ?? true;
        return (
          <Pressable
            key={p.clave}
            accessibilityRole="tab"
            accessibilityLabel={p.etiqueta}
            accessibilityState={{ selected: esActiva, disabled: !disponible }}
            disabled={!disponible}
            onPress={() => onCambiar(p.clave)}
            style={b.pestana}
          >
            <View style={[b.circulo, esActiva && b.circuloActivo]}>
              <Icono
                nombre={p.icono}
                activo={esActiva}
                tamano={Tamano.xl}
                color={
                  !disponible ? Texto.deshabilitado : esActiva ? Marca.base : Texto.secundario
                }
                decorativo
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const b = StyleSheet.create({
  barra: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Superficie.borde,
    backgroundColor: Superficie.tarjeta,
  },
  pestana: {
    flex: 1,
    minHeight: AREA_TACTIL_MINIMA,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Espacio.sm,
  },
  circulo: {
    width: AREA_TACTIL_MINIMA,
    height: AREA_TACTIL_MINIMA,
    borderRadius: Radio.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  circuloActivo: { backgroundColor: CIRCULO_ACTIVO },
});
