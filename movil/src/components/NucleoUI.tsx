import {
  Component,
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { ConvexError } from "convex/values";
import { Aparece, useEntrada } from "./Movimiento";
import { Icono } from "../theme/Icono";
import {
  AREA_TACTIL_MINIMA,
  Espacio,
  Marca,
  Radio,
  Semantico,
  Superficie,
  Tamano,
  Texto,
} from "../theme/Theme";

export function mensajeError(error: unknown) {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "mensaje" in error.data &&
    typeof error.data.mensaje === "string"
  )
    return error.data.mensaje;
  return "No pudimos completar la solicitud. Revisa tu conexión e inténtalo de nuevo.";
}

export function useOperacion() {
  const enCurso = useRef(false);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ejecutar<T>(
    fn: () => Promise<T>,
  ): Promise<{ ok: true; valor: T } | { ok: false; causa?: unknown }> {
    if (enCurso.current) return { ok: false };
    enCurso.current = true;
    setPendiente(true);
    setError(null);
    try {
      return { ok: true, valor: await fn() };
    } catch (causa) {
      setError(mensajeError(causa));
      return { ok: false, causa };
    } finally {
      enCurso.current = false;
      setPendiente(false);
    }
  }
  return { pendiente, error, ejecutar, setError };
}

/**
 * Encabezado de pantalla (componente 5 del issue #5).
 *
 * `atras` y `accion` son opcionales y se omiten en la mayoria de pantallas:
 * la primera de cada rol no tiene a donde volver, y muy pocas tienen una
 * accion de cabecera. Lo que no es opcional es el area tactil -- ambos
 * cumplen `AREA_TACTIL_MINIMA`, porque el docente los usa de pie y con el
 * telefono en una mano.
 *
 * El boton de atras lleva etiqueta de accesibilidad propia: una flecha sola no
 * le dice nada a quien usa lector de pantalla.
 */
export function Pagina({
  titulo,
  descripcion,
  atras,
  accion,
  children,
}: PropsWithChildren<{
  titulo: string;
  descripcion?: string;
  atras?: { onPress: () => void; etiqueta?: string };
  accion?: { texto: string; onPress: () => void; deshabilitada?: boolean };
}>) {
  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.pagina}
      >
        <View style={s.encabezado}>
          {(atras || accion) && (
            <View style={s.barraEncabezado}>
              {atras ? (
                <Pressable
                  onPress={atras.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={atras.etiqueta ?? "Volver"}
                  hitSlop={Espacio.sm}
                  style={s.iconoTactil}
                >
                  <Icono nombre="arrow-left" activo decorativo />
                </Pressable>
              ) : (
                <View style={s.iconoTactil} />
              )}
              {accion && (
                <Pressable
                  onPress={accion.onPress}
                  disabled={accion.deshabilitada}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!accion.deshabilitada }}
                  hitSlop={Espacio.sm}
                  style={s.accionEncabezado}
                >
                  <Text
                    style={[s.textoAccion, accion.deshabilitada && s.deshabilitado]}
                  >
                    {accion.texto}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <Text accessibilityRole="header" style={s.titulo}>
            {titulo}
          </Text>
          {descripcion && <Text style={s.texto}>{descripcion}</Text>}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
/**
 * Tarjeta, que entra subiendo.
 *
 * `orden` es el índice dentro de una lista y escalona la entrada: se pasa
 * `orden={i}` al mapear. Sin él todas entran a la vez, que es lo correcto
 * cuando la tarjeta está sola en la pantalla.
 *
 * La animación vive en `Aparece` y se apaga sola con "reducir movimiento",
 * así que aquí no hay nada que decidir.
 */
export function Tarjeta({ children, orden }: PropsWithChildren<{ orden?: number }>) {
  return (
    <Aparece orden={orden} style={s.tarjeta}>
      {children}
    </Aparece>
  );
}
export function Cuerpo({ children }: PropsWithChildren) {
  return <Text style={s.texto}>{children}</Text>;
}
export function Subtitulo({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.subtitulo}>
      {children}
    </Text>
  );
}
export function Aviso({ children }: PropsWithChildren) {
  return (
    <View style={s.aviso}>
      <Text style={s.texto}>{children}</Text>
    </View>
  );
}
/**
 * El mensaje de error, que entra en vez de aparecer de golpe.
 *
 * Un error que se materializa sin transición se lee como que algo se rompió.
 * Entrando —corto, 200 ms— se lee como que el sistema respondió, que es lo que
 * de verdad pasó: casi todos estos mensajes son validaciones, no averías.
 *
 * Se anima el propio `Text` con `Animated.Text` en lugar de envolverlo: un
 * envoltorio cambiaría el sitio del mensaje dentro del flex de la pantalla, y
 * el error aparece en sitios muy distintos de la aplicación.
 */
export function ErrorMensaje({ mensaje }: { mensaje: string | null }) {
  const entrada = useEntrada();
  return mensaje ? (
    <Animated.Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[s.error, entrada]}
    >
      {mensaje}
    </Animated.Text>
  ) : null;
}
/**
 * Cuantos segundos se espera antes de admitir que algo va mal.
 *
 * Lo bastante largo para no asustar en una conexion lenta de un plantel
 * fiscal, y lo bastante corto para que nadie se quede mirando un disco que
 * gira sin saber si esperar. Ocho segundos es mas de lo que tarda cualquier
 * consulta sana del proyecto.
 */
const SEGUNDOS_ANTES_DE_SOSPECHAR = 8;

/**
 * Cargando, con un limite de paciencia.
 *
 * ## El caso que esto cubre
 *
 * `LimiteError` captura lo que **se lanza**. Pero cuando el telefono se queda
 * sin red, Convex no lanza nada: el websocket no conecta y `useQuery` se queda
 * en `undefined` indefinidamente. La pantalla entonces muestra "Cargando..."
 * para siempre, sin distinguirse de una consulta lenta y sin ninguna salida.
 *
 * Es el estado mas probable del piloto -- una madre abriendo la aplicacion en
 * la puerta del aula, con una barra de cobertura -- y era el unico que la
 * aplicacion no sabia contar. Pasados unos segundos se dice lo que pasa. No se
 * reintenta ni se cancela nada: Convex reconecta solo en cuanto vuelve la red,
 * y entonces esto desaparece porque el dato llega.
 */
export function Cargando({ mensaje = "Cargando..." }: { mensaje?: string }) {
  const [tarda, setTarda] = useState(false);

  useEffect(() => {
    const reloj = setTimeout(() => setTarda(true), SEGUNDOS_ANTES_DE_SOSPECHAR * 1000);
    return () => clearTimeout(reloj);
  }, []);

  return (
    <View accessibilityLiveRegion="polite" style={s.cargando}>
      <ActivityIndicator color={Marca.base} />
      <Cuerpo>{mensaje}</Cuerpo>
      {tarda && (
        <Cuerpo>
          Está tardando más de lo normal. Revisa tu conexión: en cuanto vuelva,
          esto se carga solo.
        </Cuerpo>
      )}
    </View>
  );
}
export function Boton({
  children,
  onPress,
  secundario = false,
  pendiente = false,
  disabled = false,
}: PropsWithChildren<{
  onPress: () => void;
  secundario?: boolean;
  pendiente?: boolean;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || pendiente, busy: pendiente }}
      disabled={disabled || pendiente}
      onPress={onPress}
      style={({ pressed }) => [
        s.boton,
        secundario && s.botonSecundario,
        pressed && s.presionado,
        (disabled || pendiente) && s.deshabilitado,
      ]}
    >
      {pendiente ? (
        <ActivityIndicator color={secundario ? Marca.base : Texto.sobreColor} />
      ) : (
        <Text style={[s.textoBoton, secundario && s.textoBotonSecundario]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
/**
 * Campo de texto (componente 3 del issue #5): etiqueta, ayuda, **mensaje de
 * error** y **contador de caracteres**.
 *
 * El contador solo aparece si el campo tiene `maxLength`, y solo cuando ya
 * queda poco: un "0/500" bajo un campo vacio es ruido, y el numero importa
 * justo cuando el docente esta a punto de quedarse sin espacio describiendo
 * lo que paso.
 *
 * Con `error`, el mensaje sustituye a la ayuda en vez de acumularse: dos
 * lineas de texto bajo un campo, una de las cuales ya no aplica, es como se
 * ignoran los dos.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  ...props
}: TextInputProps & { etiqueta: string; ayuda?: string; error?: string }) {
  const largo = typeof props.value === "string" ? props.value.length : 0;
  const tope = props.maxLength;
  // Se enseña en el ultimo 20% del tope o en los ultimos 20 caracteres,
  // lo que ocurra mas tarde. Un campo vacío nunca muestra el contador.
  const muestraContador =
    tope !== undefined && tope > 0 &&
    largo >= tope - Math.min(20, Math.floor(tope * 0.2));

  return (
    <View style={s.campo}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        placeholderTextColor={Texto.secundario}
        {...props}
        style={[
          s.input,
          props.editable === false && s.deshabilitado,
          error !== undefined && s.inputConError,
          props.style,
        ]}
      />
      <View style={s.pieCampo}>
        {error !== undefined ? (
          <Text style={s.textoError}>{error}</Text>
        ) : ayuda ? (
          <Text style={[s.texto, s.ayudaCampo]}>{ayuda}</Text>
        ) : (
          <View />
        )}
        {muestraContador && (
          <Text
            style={s.contador}
            accessibilityLabel={`${largo} de ${tope} caracteres`}
          >
            {largo}/{tope}
          </Text>
        )}
      </View>
    </View>
  );
}
export function Casilla({
  texto,
  marcada,
  onChange,
  disabled,
}: {
  texto: string;
  marcada: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={texto}
      accessibilityState={{ checked: marcada, disabled }}
      disabled={disabled}
      onPress={onChange}
      style={s.casillaFila}
    >
      <View style={[s.casilla, marcada && s.casillaMarcada]}>
        <Text style={s.check}>{marcada ? "✓" : ""}</Text>
      </View>
      <Text style={[s.texto, s.flex]}>{texto}</Text>
    </Pressable>
  );
}
export function Opciones<T extends string>({
  valor,
  opciones,
  onChange,
  disabled = false,
}: {
  valor: T;
  opciones: readonly { valor: T; texto: string }[];
  onChange: (valor: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={s.opciones}>
      {opciones.map((opcion) => (
        <Pressable
          key={opcion.valor}
          accessibilityRole="radio"
          accessibilityState={{ checked: valor === opcion.valor, disabled }}
          disabled={disabled}
          onPress={() => onChange(opcion.valor)}
          style={[s.opcion, valor === opcion.valor && s.opcionActiva]}
        >
          <Text
            style={[s.texto, valor === opcion.valor && s.opcionTextoActivo]}
          >
            {opcion.texto}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export class LimiteError extends Component<
  PropsWithChildren<{ onVolver?: () => void }>,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <Pagina titulo="No pudimos cargar esta vista">
          <Cuerpo>Revisa tu conexión e inténtalo nuevamente.</Cuerpo>
          <Boton onPress={() => this.setState({ error: false })}>
            Reintentar
          </Boton>
          {this.props.onVolver && (
            <Boton secundario onPress={this.props.onVolver}>
              Volver al inicio
            </Boton>
          )}
        </Pagina>
      );
    return this.props.children;
  }
}

export const s = StyleSheet.create({
  flex: { flex: 1 },
  pagina: {
    flexGrow: 1,
    gap: Espacio.base,
    padding: Espacio.lg,
    paddingBottom: Espacio.xxl,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  encabezado: { gap: Espacio.sm, paddingVertical: Espacio.sm },
  titulo: {
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.xxl,
    lineHeight: 40,
  },
  subtitulo: {
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.lg,
    lineHeight: 28,
  },
  texto: {
    color: Texto.secundario,
    fontFamily: "Inter",
    fontSize: Tamano.base,
    lineHeight: 25,
  },
  tarjeta: {
    backgroundColor: Superficie.tarjeta,
    borderWidth: 1,
    borderColor: Superficie.borde,
    borderRadius: Radio.lg,
    gap: Espacio.base,
    padding: Espacio.lg,
  },
  aviso: {
    backgroundColor: Superficie.tarjeta,
    borderLeftWidth: 4,
    borderLeftColor: Marca.base,
    padding: Espacio.base,
    borderRadius: Radio.base,
  },
  error: {
    backgroundColor: Semantico.error,
    color: Texto.sobreColor,
    fontFamily: "Inter",
    fontSize: Tamano.base,
    lineHeight: 24,
    borderRadius: Radio.base,
    padding: Espacio.base,
  },
  barraEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: AREA_TACTIL_MINIMA,
  },
  iconoTactil: {
    minWidth: AREA_TACTIL_MINIMA,
    minHeight: AREA_TACTIL_MINIMA,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  accionEncabezado: {
    minHeight: AREA_TACTIL_MINIMA,
    justifyContent: "center",
    paddingHorizontal: Espacio.sm,
  },
  textoAccion: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
  pieCampo: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Espacio.sm,
  },
  ayudaCampo: { flexShrink: 1 },
  textoError: {
    flexShrink: 1,
    color: Semantico.error,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
    lineHeight: 22,
  },
  contador: {
    color: Texto.secundario,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
    lineHeight: 22,
  },
  inputConError: { borderColor: Semantico.error },
  cargando: { alignItems: "center", padding: Espacio.lg, gap: Espacio.base },
  boton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Marca.base,
    borderWidth: 1,
    borderColor: Marca.base,
    borderRadius: Radio.base,
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.md,
  },
  botonSecundario: {
    backgroundColor: Superficie.tarjeta,
    borderColor: Superficie.borde,
  },
  textoBoton: {
    fontFamily: "Inter-Semibold",
    color: Texto.sobreColor,
    fontSize: Tamano.base,
    textAlign: "center",
  },
  textoBotonSecundario: { color: Marca.base },
  presionado: { opacity: 0.8 },
  deshabilitado: { opacity: 0.55 },
  campo: { gap: Espacio.sm },
  etiqueta: {
    fontFamily: "Inter-Semibold",
    color: Texto.primario,
    fontSize: Tamano.base,
  },
  input: {
    borderWidth: 1,
    borderColor: Superficie.borde,
    backgroundColor: Superficie.tarjeta,
    color: Texto.primario,
    borderRadius: Radio.base,
    minHeight: 52,
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.md,
    fontSize: Tamano.base,
    fontFamily: "Inter",
  },
  opciones: { flexDirection: "row", flexWrap: "wrap", gap: Espacio.sm },
  opcion: {
    borderWidth: 1,
    borderColor: Superficie.borde,
    backgroundColor: Superficie.tarjeta,
    borderRadius: Radio.pill,
    minHeight: 44,
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.sm,
    justifyContent: "center",
  },
  opcionActiva: { backgroundColor: Marca.oscuro, borderColor: Marca.oscuro },
  opcionTextoActivo: { color: Texto.sobreColor },
  casillaFila: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Espacio.md,
    minHeight: 44,
    paddingVertical: Espacio.sm,
  },
  casilla: {
    height: 26,
    width: 26,
    borderWidth: 2,
    borderColor: Marca.base,
    borderRadius: Radio.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  casillaMarcada: { backgroundColor: Marca.base },
  check: { color: Texto.sobreColor, fontSize: 18 },
});
