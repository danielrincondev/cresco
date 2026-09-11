import { Component, type PropsWithChildren, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import {
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

export function Pagina({
  titulo,
  descripcion,
  children,
}: PropsWithChildren<{ titulo: string; descripcion?: string }>) {
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
export function Tarjeta({ children }: PropsWithChildren) {
  return <View style={s.tarjeta}>{children}</View>;
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
export function ErrorMensaje({ mensaje }: { mensaje: string | null }) {
  return mensaje ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={s.error}
    >
      {mensaje}
    </Text>
  ) : null;
}
export function Cargando({ mensaje = "Cargando..." }: { mensaje?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={s.cargando}>
      <ActivityIndicator color={Marca.base} />
      <Cuerpo>{mensaje}</Cuerpo>
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
export function Campo({
  etiqueta,
  ayuda,
  ...props
}: TextInputProps & { etiqueta: string; ayuda?: string }) {
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
          props.style,
        ]}
      />
      {ayuda && <Cuerpo>{ayuda}</Cuerpo>}
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
