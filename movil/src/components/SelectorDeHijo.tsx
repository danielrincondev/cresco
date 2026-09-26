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

import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Icono } from "../theme/Icono";

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


/**
 * La versión compacta: **quién estás mirando**, arriba de la pantalla.
 *
 * La barra de chips sirve cuando cambiar de hijo es la acción principal. En el
 * reporte del día no lo es —se entra a leer, no a cambiar— pero hace falta
 * saber de quién es lo que se lee: con dos hijos los dos reportes se parecen
 * mucho, y equivocarse de hijo al leer una sanción no es un detalle.
 *
 * Con un solo hijo no hay flecha ni menú: enseña el nombre y ya. Una flecha
 * que abre una lista de una sola opción promete algo que no existe.
 */
export function HijoActivo({
  hijos,
  activo,
  onCambiar,
}: {
  hijos: HijoSeleccionable[];
  activo: string;
  onCambiar: (estudianteId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombre = hijos.find((h) => h.estudianteId === activo)?.nombre ?? "";

  if (hijos.length <= 1) {
    return (
      <View style={e.activoFila}>
        <Text style={e.activoNombre} numberOfLines={1}>
          {nombre}
        </Text>
      </View>
    );
  }

  return (
    <View style={e.activoFila}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Viendo a ${nombre}. Cambiar de hijo`}
        accessibilityState={{ expanded: abierto }}
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [e.activoBoton, pressed && e.activoPresionado]}
      >
        <Text style={e.activoNombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Icono nombre="chevron-right" color={Marca.base} decorativo />
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          style={e.velo}
          onPress={() => setAbierto(false)}
        >
          {/* El de dentro para el toque: sin él, elegir un hijo cerraría por
              propagación antes de que el cambio llegue a la pantalla. */}
          <Pressable style={e.lista} onPress={() => {}}>
            {hijos.map((h) => (
              <Pressable
                key={h.estudianteId}
                accessibilityRole="button"
                accessibilityState={{ selected: h.estudianteId === activo }}
                onPress={() => {
                  onCambiar(h.estudianteId);
                  setAbierto(false);
                }}
                style={({ pressed }) => [
                  e.opcion,
                  h.estudianteId === activo && e.opcionActiva,
                  pressed && e.activoPresionado,
                ]}
              >
                <Text
                  style={[
                    e.opcionTexto,
                    h.estudianteId === activo && e.opcionTextoActiva,
                  ]}
                >
                  {h.nombre}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  activoFila: { flexDirection: "row", justifyContent: "flex-end", width: "100%" },
  activoBoton: {
    minHeight: AREA_TACTIL_MINIMA,
    flexDirection: "row",
    alignItems: "center",
    gap: Espacio.xs,
    paddingHorizontal: Espacio.md,
    borderRadius: Radio.pill,
    borderWidth: 1,
    borderColor: Superficie.borde,
    backgroundColor: Superficie.tarjeta,
    maxWidth: "70%",
  },
  activoPresionado: { backgroundColor: Marca.claro },
  activoNombre: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.sm,
    lineHeight: 20,
    paddingVertical: Espacio.sm,
  },
  velo: {
    flex: 1,
    backgroundColor: "rgba(0, 42, 92, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: Espacio.base,
  },
  lista: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Superficie.tarjeta,
    borderRadius: Radio.lg,
    padding: Espacio.sm,
    gap: Espacio.xs,
  },
  opcion: {
    minHeight: AREA_TACTIL_MINIMA,
    justifyContent: "center",
    paddingHorizontal: Espacio.base,
    borderRadius: Radio.base,
  },
  opcionActiva: { backgroundColor: Marca.claro },
  opcionTexto: { color: Texto.primario, fontFamily: "Inter", fontSize: Tamano.base },
  opcionTextoActiva: { fontFamily: "Inter-Semibold", color: Marca.base },
});
