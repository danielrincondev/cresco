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
 * ## Por qué es absoluta, y no un hijo normal del flex
 *
 * La primera versión era un hijo normal de la columna, y dejaba un hueco en
 * blanco feo entre los iconos y los botones del sistema. La causa: el
 * `SafeAreaView` raíz de `NucleoScreen` **ya reserva** esa franja como
 * relleno de toda la columna, así que un hijo normal ya aparece por encima de
 * ella sin hacer nada — y sumarle su propio margen de sistema encima de eso
 * contaba la franja dos veces.
 *
 * `MenuLateral.tsx` no tenía este problema por la razón contraria: al ser
 * `position: absolute`, sus coordenadas se miden desde el borde del *padding*
 * del padre hacia afuera, así que escapa esa reserva en vez de heredarla —
 * por eso sí necesita pedir sus propios márgenes. Esta barra ahora hace lo
 * mismo a propósito: ser absoluta es lo que permite deslizarla fuera de la
 * pantalla al ocultarla sin dejar un hueco vacío donde estaba (un hijo normal
 * del flex seguiría reservando su sitio aunque se moviera visualmente), y
 * **por eso** —y solo por eso— sí necesita su propio `useSafeAreaInsets`.
 *
 * Como ya no vive en el flujo normal, `Pagina` reserva su alto por su cuenta
 * (`ContextoBarraInferior`, en `NucleoUI.tsx`): sin eso, el último elemento de
 * cada pantalla quedaría tapado mientras la barra está a la vista.
 *
 * ## Esconderse al leer, aparecer al volver arriba
 *
 * `visible` la desliza hacia abajo y la desvanece; `NucleoScreen` decide
 * cuándo, mirando la dirección del scroll de la pantalla abierta. Con
 * "reducir movimiento" no se desliza: aparece o desaparece de golpe, pero
 * sigue haciendo las dos cosas — apagar la animación no puede apagar la
 * función.
 *
 * `pointerEvents="none"` mientras está oculta: deslizada fuera de la pantalla
 * seguiría, si no fuera por esto, interceptando toques sobre lo que haya
 * quedado debajo de su antiguo sitio.
 */

import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "./Movimiento";
import { Icono, type PropsIcono } from "../theme/Icono";
import { Curva, Duracion } from "../theme/Movimiento";
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

/**
 * El alto de la fila de iconos, sin contar el margen del sistema. `Pagina`
 * necesita este número para reservar sitio en cada pantalla; vive aquí, no
 * recalculado a mano en otro archivo, porque si cambia el tamaño de un icono
 * o el relleno de una pestaña, este es el único sitio que hay que tocar.
 */
export const ALTO_CONTENIDO_BARRA = AREA_TACTIL_MINIMA + Espacio.sm * 2;

export type PestanaInferior = {
  clave: string;
  icono: PropsIcono["nombre"];
  etiqueta: string;
  disponible?: boolean;
};

export function BarraInferior({
  pestanas,
  activa,
  visible,
  onCambiar,
}: {
  pestanas: PestanaInferior[];
  activa: string;
  visible: boolean;
  onCambiar: (clave: string) => void;
}) {
  // `?? 0`: en las pruebas el modulo va mockeado y no devuelve medidas.
  const margenes = useSafeAreaInsets();
  const relleno = Math.max(margenes?.bottom ?? 0, Espacio.sm);
  const alto = ALTO_CONTENIDO_BARRA + relleno;

  const reducir = useReduceMotion();
  const progreso = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (reducir) {
      progreso.setValue(visible ? 1 : 0);
      return;
    }
    const animacion = Animated.timing(progreso, {
      toValue: visible ? 1 : 0,
      duration: visible ? Duracion.rapida : Duracion.instantanea,
      easing: visible ? Curva.entrada : Curva.salida,
      useNativeDriver: true,
    });
    animacion.start();
    return () => animacion.stop?.();
  }, [visible, reducir, progreso]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        b.capa,
        {
          height: alto,
          paddingBottom: relleno,
          opacity: progreso,
          transform: [
            {
              translateY: progreso.interpolate({
                inputRange: [0, 1],
                // Se desliza su propio alto hacia abajo: sale entera de la
                // pantalla, no solo se desvanece en el sitio.
                outputRange: [alto, 0],
              }),
            },
          ],
        },
      ]}
      accessibilityRole="tablist"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
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
    </Animated.View>
  );
}

const b = StyleSheet.create({
  capa: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
