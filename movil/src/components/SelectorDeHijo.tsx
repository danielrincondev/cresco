/**
 * La barra para cambiar de hijo, lo último que le faltaba al componente 5 del
 * issue #5.
 *
 * ## Por qué no consulta nada
 *
 * No llama a `listarMisEstudiantes` por dentro. Recibe la lista ya resuelta y
 * avisa del cambio hacia arriba. La razón es que **quién es el hijo activo no
 * es un dato de este componente**: lo necesitan a la vez el reporte, la ficha,
 * las citas y los reclamos, y si cada pantalla lo guardara por su cuenta, el
 * representante cambiaría de hijo en una y volvería a ver al otro en la
 * siguiente. La pantalla lo posee, esto solo lo pinta.
 *
 * ## Por qué desaparece con un solo hijo
 *
 * La mayoría de representantes del piloto tiene uno. Una barra con una sola
 * opción, siempre seleccionada, no es un control: es un adorno que ocupa el
 * alto de pantalla donde debería empezar el reporte. Con uno o ninguno esto no
 * dibuja nada.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AREA_TACTIL_MINIMA, Espacio, Marca, Radio, Superficie, Tamano, Texto } from "../theme/Theme";

export type HijoSeleccionable = {
  estudianteId: string;
  /** Cómo se le llama en la barra. Suele ser solo el nombre de pila. */
  nombre: string;
};

export function SelectorDeHijo({
  hijos,
  activo,
  onCambiar,
}: {
  hijos: HijoSeleccionable[];
  activo: string | null;
  onCambiar: (estudianteId: string) => void;
}) {
  if (hijos.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={e.barra}
      // Una madre con cuatro hijos tiene que poder llegar al cuarto; sin esto
      // la fila se corta en el borde y no hay forma de saber que sigue.
      accessibilityRole="tablist"
      accessibilityLabel="Cambiar de hijo"
    >
      {hijos.map((hijo) => {
        const seleccionado = hijo.estudianteId === activo;
        return (
          <Pressable
            key={hijo.estudianteId}
            onPress={() => onCambiar(hijo.estudianteId)}
            accessibilityRole="tab"
            // El estado va en `selected`, no solo en el color: quien usa lector
            // de pantalla tiene que oír cuál está abierto.
            accessibilityState={{ selected: seleccionado }}
            accessibilityLabel={hijo.nombre}
            style={[e.pestana, seleccionado && e.pestanaActiva]}
          >
            <Text style={[e.texto, seleccionado && e.textoActivo]} numberOfLines={1}>
              {hijo.nombre}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  barra: { flexDirection: "row", gap: Espacio.sm, paddingVertical: Espacio.sm },
  pestana: {
    minHeight: AREA_TACTIL_MINIMA,
    justifyContent: "center",
    paddingHorizontal: Espacio.base,
    borderRadius: Radio.base,
    borderWidth: 1,
    borderColor: Superficie.borde,
    backgroundColor: Superficie.tarjeta,
    maxWidth: 200,
  },
  pestanaActiva: { backgroundColor: Marca.base, borderColor: Marca.base },
  texto: {
    color: Texto.primario,
    fontFamily: "Inter",
    fontSize: Tamano.base,
  },
  textoActivo: { color: Texto.sobreColor, fontFamily: "Inter-Semibold" },
});
