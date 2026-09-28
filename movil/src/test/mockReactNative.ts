/**
 * El mock de `react-native` que comparten las pruebas de interfaz.
 *
 * ## Por qué existe
 *
 * Había **once copias a mano** del mismo objeto, una por archivo de prueba,
 * que se habían ido separando entre sí: unas declaraban `Modal`, otras
 * `Linking`, otras `BackHandler`, y el `Platform.OS` cambiaba de archivo a
 * archivo sin motivo. Cada primitiva nueva del sistema de diseño obligaba a
 * editar los once.
 *
 * Al introducir el movimiento hacía falta añadir `Animated`,
 * `AccessibilityInfo` y `Easing` en todas. Hacerlo once veces habría fijado el
 * problema para siempre, así que se hace una vez aquí.
 *
 * ## Cómo se usa
 *
 * `vi.mock` se iza por encima de los imports, así que el módulo se carga
 * dentro de la fábrica y no arriba del archivo:
 *
 * ```ts
 * vi.mock("react-native", async () => ({
 *   ...(await import("../test/mockReactNative")).reactNative(),
 *   Platform: { OS: "web" },
 *   Modal: "Modal",
 * }));
 * ```
 *
 * Lo que se pase después del spread gana, que es como cada prueba añade lo
 * suyo sin tocar este archivo.
 *
 * ## Qué imita `Animated`
 *
 * Lo justo para que los componentes se monten y las animaciones se den por
 * terminadas de inmediato. **No mide movimiento**: en `react-test-renderer`
 * no hay hilo de interfaz ni reloj de animación que valga. Lo que se prueba
 * de una animación aquí es lo único comprobable sin un dispositivo — que el
 * contenido se pinte, que `useNativeDriver` no reviente, y que con movimiento
 * reducido se tome el camino sin animar.
 */

type Oyente = (valor: unknown) => void;

/** Una animación que ya terminó. `start` llama al callback en el acto. */
const animacionResuelta = () => ({
  start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
  stop: () => {},
  reset: () => {},
});

class ValorAnimado {
  constructor(private valor: number) {}
  setValue(v: number) {
    this.valor = v;
  }
  interpolate() {
    return this;
  }
  addListener() {
    return "0";
  }
  removeAllListeners() {}
  stopAnimation(cb?: (v: number) => void) {
    cb?.(this.valor);
  }
}

const curva = () => (t: number) => t;

/**
 * El objeto base. Cada prueba lo extiende con lo que necesite.
 *
 * Los componentes se devuelven como cadenas porque es lo que
 * `react-test-renderer` sabe pintar sin un host real, y es lo que las once
 * copias anteriores ya hacían.
 */
export function reactNative() {
  return {
    ActivityIndicator: "ActivityIndicator",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Text: "Text",
    TextInput: "TextInput",
    View: "View",
    Platform: { OS: "android" as const },
    StyleSheet: { create: <T,>(estilos: T) => estilos },

    Animated: {
      View: "Animated.View",
      Text: "Animated.Text",
      Value: ValorAnimado,
      timing: animacionResuelta,
      spring: animacionResuelta,
      sequence: animacionResuelta,
      parallel: animacionResuelta,
      stagger: animacionResuelta,
      // `loop` no se resuelve sola en la app -- late hasta que la desmontan --
      // pero aqui terminar de inmediato es justo lo que evita un test colgado.
      loop: animacionResuelta,
      delay: animacionResuelta,
      // El componente animado es el mismo componente: aquí no hay nada que mover.
      createAnimatedComponent: <T,>(componente: T) => componente,
    },

    /**
     * Los manejadores salen con los nombres de la configuración
     * (`onMoveShouldSetPanResponderCapture`, `onPanResponderRelease`...), para
     * que una prueba los llame con un `gestureState` inventado: sin dedo ni
     * pantalla, es lo único comprobable de un gesto.
     */
    PanResponder: {
      create: (config: Record<string, unknown>) => ({ panHandlers: config }),
    },

    Easing: {
      out: curva,
      in: curva,
      inOut: curva,
      cubic: curva(),
      quad: curva(),
      linear: curva(),
      ease: curva(),
    },

    /**
     * Por defecto **sin** reducción de movimiento: es el ajuste de la mayoría,
     * así que es el camino que conviene ejercitar por omisión. Una prueba que
     * quiera el otro camino sobrescribe `AccessibilityInfo` con un
     * `isReduceMotionEnabled` que resuelva `true`.
     */
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: (_evento: string, _oyente: Oyente) => ({
        remove: () => {},
      }),
      announceForAccessibility: () => {},
    },
  };
}

export default reactNative;
