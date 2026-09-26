/**
 * El menú lateral, hecho a mano.
 *
 * ## Por qué no `@react-navigation/drawer`
 *
 * Costaría tres dependencias —el cajón, `gesture-handler` y `reanimated`— y
 * **dos de ellas son nativas**. Eso significa APK nuevo, y hoy no se puede
 * compilar desde `main` sin reintroducir el fallo del alta que arregla el
 * #98. Un panel deslizante es una vista posicionada y una animación de
 * `translateX`: con el `Animated` del núcleo sale igual y **viaja por el
 * aire**, sin recompilar nada.
 *
 * Lo que se pierde: **abrir deslizando desde el borde**. Eso sí necesita
 * `gesture-handler`. Se abre con el botón de hamburguesa, que es la
 * afordancia estándar y la que descubre todo el mundo; el gesto es un atajo
 * para quien ya sabe que el cajón existe. Cuando haya una build nueva se
 * puede añadir sin tocar nada de esto.
 *
 * ## Qué sí hace
 *
 * Cierra tocando el velo, con el botón de atrás de Android y al elegir
 * cualquier destino. Se desmonta cuando termina de cerrarse, para no quedarse
 * interceptando toques invisible por encima de la pantalla. Y con "reducir
 * movimiento" aparece sin deslizarse.
 */

import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Icono, type PropsIcono } from "../theme/Icono";
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
import { Curva, Duracion } from "../theme/Movimiento";
import { useReduceMotion } from "./Movimiento";

/** Ancho del panel. Deja ver un borde de la pantalla: recuerda que hay algo detrás. */
const ANCHO = 292;

export function MenuLateral({
  abierto,
  onCerrar,
  children,
}: PropsWithChildren<{ abierto: boolean; onCerrar: () => void }>) {
  const reducir = useReduceMotion();
  const progreso = useRef(new Animated.Value(0)).current;
  // `montado` sobrevive al cierre hasta que la animación termina. Sin esto el
  // panel desaparecería de golpe en vez de salirse.
  const [montado, setMontado] = useState(abierto);

  useEffect(() => {
    if (abierto) setMontado(true);
    if (reducir) {
      progreso.setValue(abierto ? 1 : 0);
      if (!abierto) setMontado(false);
      return;
    }
    const animacion = Animated.timing(progreso, {
      toValue: abierto ? 1 : 0,
      duration: abierto ? Duracion.base : Duracion.rapida,
      easing: abierto ? Curva.entrada : Curva.salida,
      useNativeDriver: true,
    });
    animacion.start(({ finished }) => {
      if (finished && !abierto) setMontado(false);
    });
    return () => animacion.stop?.();
  }, [abierto, reducir, progreso]);

  if (!montado) return null;

  return (
    <View style={m.capa} accessibilityViewIsModal>
      <Animated.View style={[m.velo, { opacity: progreso }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar el menú"
          onPress={onCerrar}
          style={m.veloTactil}
        />
      </Animated.View>
      <Animated.View
        style={[
          m.panel,
          {
            transform: [
              {
                translateX: progreso.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-ANCHO, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* `flexGrow: 1` para que `PieMenu` pueda empujarse al fondo con
            `marginTop: auto` cuando el contenido no llena el panel. */}
        <ScrollView contentContainerStyle={m.contenido}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * Quién eres, arriba del todo.
 *
 * Un cajón que empieza directamente en "Cursos" se lee como una lista de
 * enlaces. Con el nombre y el rol se lee como **tu** cuenta, y de paso llena
 * el hueco que quedaba bajo la cabecera.
 *
 * El rol importa más de lo que parece: una misma persona puede ser docente y
 * representante, y saber en cuál está evita anotar conducta creyendo que
 * estás mirando a tu hijo.
 */
export function EncabezadoPerfil({
  nombre,
  rol,
}: {
  nombre: string;
  rol: string;
}) {
  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View style={m.perfil}>
      <View style={m.avatar}>
        <Text style={m.avatarTexto}>{iniciales || "?"}</Text>
      </View>
      <View style={m.perfilTextos}>
        <Text style={m.perfilNombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={m.perfilRol}>{rol}</Text>
      </View>
    </View>
  );
}

/**
 * Lo que va pegado abajo del panel.
 *
 * Cerrar sesión no es un destino más: es la única entrada del menú de la que
 * no se vuelve solo. Va abajo, separada, y en rojo — lejos del dedo que
 * navega.
 */
export function PieMenu({ children }: PropsWithChildren) {
  return <View style={m.pie}>{children}</View>;
}

/**
 * Encabezado de sección dentro del menú.
 *
 * Separa lo que es del curso abierto de lo que es de la cuenta. Sin esa línea,
 * "Pasar lista" y "Tu plan" parecen la misma clase de cosa y no lo son: una
 * deja de existir cuando sales del curso.
 */
export function SeccionMenu({ titulo }: { titulo: string }) {
  return (
    <Text accessibilityRole="header" style={m.seccion}>
      {titulo}
    </Text>
  );
}

/**
 * Una entrada del menú.
 *
 * `activo` pinta el icono relleno y el fondo marcado: es el "estás aquí" que
 * el tema resolvió con los pares de `MaterialCommunityIcons`.
 */
export function ItemMenu({
  icono,
  texto,
  activo = false,
  peligro = false,
  onPress,
}: {
  icono: PropsIcono["nombre"];
  texto: string;
  activo?: boolean;
  /** Rojo, para lo que no se deshace solo: hoy únicamente cerrar sesión. */
  peligro?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={({ pressed }) => [
        m.item,
        activo && m.itemActivo,
        pressed && m.itemPresionado,
      ]}
    >
      <Icono
        nombre={icono}
        activo={activo}
        color={peligro ? Semantico.error : activo ? Marca.base : Texto.secundario}
        decorativo
      />
      <Text
        style={[
          m.itemTexto,
          activo && m.itemTextoActivo,
          peligro && m.itemTextoPeligro,
        ]}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

/** Raya de separación entre secciones. */
export function SeparadorMenu() {
  return <View style={m.separador} />;
}

const m = StyleSheet.create({
  capa: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 20,
    flexDirection: "row",
  },
  velo: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    // El unico color fuera de Theme.ts en todo src/, y es a proposito: un
    // velo necesita alfa, y el tema no define colores translucidos.
    backgroundColor: "rgba(0, 42, 92, 0.45)",
  },
  veloTactil: { flex: 1 },
  panel: {
    width: ANCHO,
    maxWidth: "86%",
    height: "100%",
    backgroundColor: Superficie.tarjeta,
    borderRightWidth: 1,
    borderRightColor: Superficie.borde,
  },
  // `flexGrow` deja que el pie se empuje al fondo; el `paddingTop` largo es
  // el aire que el menu pedia bajo la cabecera de la aplicacion.
  contenido: {
    flexGrow: 1,
    paddingTop: Espacio.lg,
    paddingBottom: Espacio.base,
    gap: Espacio.sm,
  },
  perfil: {
    flexDirection: "row",
    alignItems: "center",
    gap: Espacio.md,
    paddingHorizontal: Espacio.base,
    paddingBottom: Espacio.base,
  },
  avatar: {
    width: AREA_TACTIL_MINIMA,
    height: AREA_TACTIL_MINIMA,
    borderRadius: Radio.pill,
    backgroundColor: Marca.claro,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
  perfilTextos: { flex: 1 },
  perfilNombre: {
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
    lineHeight: 22,
  },
  perfilRol: {
    color: Texto.secundario,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
    lineHeight: 20,
  },
  // `marginTop: auto` con el `flexGrow` de arriba: se pega al fondo cuando
  // sobra sitio, y fluye con el contenido cuando no.
  pie: {
    marginTop: "auto",
    paddingTop: Espacio.base,
    borderTopWidth: 1,
    borderTopColor: Superficie.borde,
    marginHorizontal: Espacio.base,
  },
  seccion: {
    color: Texto.secundario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: Espacio.base,
    paddingTop: Espacio.md,
    paddingBottom: Espacio.xs,
  },
  item: {
    minHeight: AREA_TACTIL_MINIMA,
    flexDirection: "row",
    alignItems: "center",
    gap: Espacio.md,
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.base,
    marginHorizontal: Espacio.sm,
    borderRadius: Radio.base,
  },
  itemActivo: { backgroundColor: Marca.claro },
  itemPresionado: { backgroundColor: Superficie.fondo },
  itemTexto: {
    flex: 1,
    color: Texto.primario,
    fontFamily: "Inter",
    fontSize: Tamano.base,
    lineHeight: 22,
  },
  itemTextoActivo: { fontFamily: "Inter-Semibold", color: Marca.base },
  itemTextoPeligro: { color: Semantico.error },
  separador: {
    height: 1,
    backgroundColor: Superficie.borde,
    marginVertical: Espacio.sm,
    marginHorizontal: Espacio.base,
  },
});
