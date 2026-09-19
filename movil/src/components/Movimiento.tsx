/**
 * Las primitivas de movimiento: **entrada** y **esqueleto de carga**.
 *
 * Los valores viven en `theme/Movimiento.ts`, igual que los colores viven en
 * `Theme.ts`. Aquí solo está el comportamiento.
 *
 * ## El esqueleto no es decoración
 *
 * `PatronCarga` lleva declarado en el tema desde la dirección visual, con tres
 * patrones y su regla de uso —esqueleto al cambiar de sección, spinner para
 * micro-interacciones, híbrido para lo que calcula— y **no se usaba en
 * ninguna parte**: todas las pantallas cargaban con el mismo disco girando.
 * Esto construye el que faltaba.
 *
 * La diferencia no es estética. Un spinner dice "espera" y nada más. Un
 * esqueleto dice **qué** estás esperando y cuánto va a ocupar, así que la
 * pantalla no da un salto cuando llega el dato, y la espera se siente más
 * corta aunque dure exactamente lo mismo.
 *
 * ## Todo esto se apaga solo
 *
 * Con "reducir movimiento" activado en el teléfono, `Aparece` no anima: pinta
 * el contenido ya colocado, y el esqueleto se queda quieto en vez de latir.
 * Nada parpadea, nada se desplaza. Ver la cabecera de `theme/Movimiento.ts`
 * para por qué eso no es opcional.
 */

import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { Espacio, Radio, Superficie } from "../theme/Theme";
import {
  Curva,
  Desplazamiento,
  Duracion,
  ESCALONADO,
  MAXIMO_ESCALONADO,
} from "../theme/Movimiento";

/**
 * ¿El sistema pide reducir el movimiento?
 *
 * Se consulta al montar y se queda escuchando: alguien puede activarlo desde
 * los ajustes con la aplicación abierta, y lo normal es que lo active
 * justamente porque algo le acaba de marear.
 *
 * Si la plataforma no responde —o no existe, como en las pruebas— se asume
 * `false` y las animaciones corren con normalidad.
 */
export function useReduceMotion(): boolean {
  const [reducir, setReducir] = useState(false);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo?.isReduceMotionEnabled?.()
      .then((valor) => {
        if (vivo) setReducir(valor);
      })
      .catch(() => {});

    const suscripcion = AccessibilityInfo?.addEventListener?.(
      "reduceMotionChanged",
      setReducir,
    );
    return () => {
      vivo = false;
      suscripcion?.remove?.();
    };
  }, []);

  return reducir;
}

/**
 * Entrada: aparece subiendo unos píxeles.
 *
 * `orden` escalona la entrada dentro de una lista. Se pasa el índice del
 * elemento y este componente calcula el retraso, con tope en
 * `MAXIMO_ESCALONADO` para que una lista de 40 no tarde dos segundos en
 * terminar de entrar.
 *
 * El contenido **nunca se queda invisible**: la animación arranca en el mismo
 * efecto que la monta, y con movimiento reducido ni siquiera se crea. Un
 * componente que deja el contenido en `opacity: 0` esperando algo es un
 * componente que un día deja la pantalla en blanco.
 */
export function Aparece({
  children,
  orden = 0,
  distancia = Desplazamiento.base,
  duracion = Duracion.base,
  style,
}: PropsWithChildren<{
  orden?: number;
  distancia?: number;
  duracion?: number;
  style?: ViewStyle;
}>) {
  const reducir = useReduceMotion();
  const progreso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducir) {
      progreso.setValue(1);
      return;
    }
    const animacion = Animated.timing(progreso, {
      toValue: 1,
      duration: duracion,
      delay: Math.min(orden, MAXIMO_ESCALONADO) * ESCALONADO,
      easing: Curva.entrada,
      useNativeDriver: true,
    });
    animacion.start();
    return () => animacion.stop?.();
  }, [progreso, reducir, orden, duracion]);

  if (reducir) return <View style={style}>{children}</View>;

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progreso,
          transform: [
            {
              translateY: progreso.interpolate({
                inputRange: [0, 1],
                outputRange: [distancia, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Un bloque del esqueleto: una barra gris que late.
 *
 * `ancho` acepta porcentaje porque las líneas de texto de verdad no miden
 * todas lo mismo, y un esqueleto de barras idénticas se lee como una tabla,
 * no como un párrafo.
 */
export function Esqueleto({
  ancho = "100%",
  alto = 16,
  redondeo = Radio.sm,
}: {
  ancho?: number | `${number}%`;
  alto?: number;
  redondeo?: number;
}) {
  const reducir = useReduceMotion();
  const latido = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reducir) return;
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, {
          toValue: 1,
          duration: Duracion.esqueleto / 2,
          easing: Curva.latido,
          useNativeDriver: true,
        }),
        Animated.timing(latido, {
          toValue: 0.45,
          duration: Duracion.esqueleto / 2,
          easing: Curva.latido,
          useNativeDriver: true,
        }),
      ]),
    );
    ciclo.start();
    return () => ciclo.stop?.();
  }, [latido, reducir]);

  const forma = { width: ancho, height: alto, borderRadius: redondeo };

  // Quieto, pero visible: con movimiento reducido el esqueleto sigue
  // comunicando la forma de lo que viene, solo que sin latir.
  if (reducir) return <View style={[m.bloque, forma, { opacity: 0.6 }]} />;

  return <Animated.View style={[m.bloque, forma, { opacity: latido }]} />;
}

/**
 * El esqueleto de una tarjeta, con la forma de las tarjetas de verdad.
 *
 * Reproduce a propósito la geometría de `Tarjeta` en `NucleoUI.tsx` —mismo
 * radio, mismo borde, mismo relleno— porque el valor de un esqueleto está en
 * que lo que llega después ocupe **exactamente** el mismo sitio. Si no, el
 * salto al cargar es peor que no haber puesto nada.
 */
export function EsqueletoTarjeta({ lineas = 3 }: { lineas?: number }) {
  // Anchos decrecientes: la última línea de un párrafo nunca llega al margen.
  const anchos: `${number}%`[] = ["100%", "92%", "68%", "84%", "55%"];
  return (
    <View style={m.tarjeta}>
      <Esqueleto ancho="45%" alto={20} redondeo={Radio.pill} />
      {Array.from({ length: lineas }, (_, i) => (
        <Esqueleto key={i} ancho={anchos[i % anchos.length]} />
      ))}
    </View>
  );
}

/**
 * La pantalla entera mientras carga: título y unas cuantas tarjetas.
 *
 * Es el reemplazo del spinner al **cambiar de sección**, que es exactamente
 * el caso que la dirección visual asignó al patrón `esqueleto`. El spinner se
 * queda donde le toca: guardar, enviar, confirmar.
 *
 * Lleva `accessibilityLabel` porque un lector de pantalla no ve barras grises:
 * necesita que alguien le diga que esto es una espera y no el contenido.
 */
export function EsqueletoPagina({
  tarjetas = 3,
  etiqueta = "Cargando el contenido",
}: {
  tarjetas?: number;
  etiqueta?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={etiqueta}
      accessibilityLiveRegion="polite"
      style={m.pagina}
    >
      <Esqueleto ancho="62%" alto={32} />
      {Array.from({ length: tarjetas }, (_, i) => (
        <Aparece key={i} orden={i}>
          <EsqueletoTarjeta lineas={i === 0 ? 3 : 2} />
        </Aparece>
      ))}
    </View>
  );
}

const m = StyleSheet.create({
  bloque: {
    backgroundColor: Superficie.borde,
  },
  tarjeta: {
    backgroundColor: Superficie.tarjeta,
    borderWidth: 1,
    borderColor: Superficie.borde,
    borderRadius: Radio.lg,
    gap: Espacio.md,
    padding: Espacio.lg,
  },
  pagina: {
    gap: Espacio.base,
    padding: Espacio.lg,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
});
