/**
 * Los dos componentes base que faltaban del issue #5: **chip de estado** y
 * **estado vacío**. Los otros cuatro (tarjeta, botón, campo de texto y
 * encabezado) viven en `NucleoUI.tsx`, y la barra para cambiar de hijo que
 * completa el encabezado, en `SelectorDeHijo.tsx`.
 *
 * Aquí no hay ni un `#hex`: los cinco tonos del chip son `TonoEstado` en
 * `Theme.ts`, con su razón de contraste anotada al lado. La regla del issue no
 * admitía excepciones y no tenía por qué admitirlas.
 *
 * El chip es el que más variantes necesitaba —6 franjas de conducta, 3 estados
 * de acción, 7 de cita, 6 de reclamo— y el issue pedía explícitamente *«una
 * mecánica reutilizable, no 15 chips distintos»*. La mecánica es: el chip solo
 * conoce **cinco tonos**; qué estado cae en qué tono lo decide `lib/estados.ts`,
 * que es una tabla y no tiene JSX. Así se puede leer de un vistazo todo lo que
 * la app le dice a un padre sobre su hijo, sin abrir una sola pantalla.
 */

import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Etiqueta, Tono } from "../lib/estados";
import { Icono, type PropsIcono } from "../theme/Icono";
import {
  Espacio,
  Marca,
  Radio,
  Superficie,
  Tamano,
  TonoEstado,
} from "../theme/Theme";
import { Boton, Cuerpo, Subtitulo } from "./NucleoUI";

/**
 * Chip de estado.
 *
 * Nunca lleva solo color: el texto dice lo mismo que el tono. Para las franjas
 * de conducta eso incluye el puntaje, que `etiquetaFranja` mete dentro del
 * texto justamente para que no se pueda pedir la franja sin el número (C3).
 */
export function Chip({ etiqueta }: { etiqueta: Etiqueta }) {
  const tono = TonoEstado[etiqueta.tono];
  return (
    <View
      // Un lector de pantalla lee "Estado: sin responder", no un color.
      accessibilityLabel={`Estado: ${etiqueta.texto}`}
      style={[e.chip, { backgroundColor: tono.fondo, borderColor: tono.borde }]}
    >
      <Text style={[e.chipTexto, { color: tono.texto }]}>{etiqueta.texto}</Text>
    </View>
  );
}

/** Varios chips en fila, que se parten solos cuando no caben. */
export function Chips({ children }: PropsWithChildren) {
  return <View style={e.fila}>{children}</View>;
}

/**
 * Estado vacío: icono, frase y —si hay algo que hacer— una acción.
 *
 * El issue #5 lo llama *«el caso más frecuente de toda la app»*, y tiene razón:
 * un curso recién creado, una bandeja sin reclamos, un representante sin
 * alertas. Por eso la frase es obligatoria y el botón opcional — una bandeja
 * vacía porque todo está respondido es una buena noticia, no una tarea, y
 * ofrecer un botón ahí inventa trabajo que no existe.
 */
export function EstadoVacio({
  icono,
  titulo,
  children,
  accion,
}: PropsWithChildren<{
  icono: PropsIcono["nombre"];
  titulo: string;
  accion?: { texto: string; onPress: () => void };
}>) {
  return (
    <View style={e.vacio}>
      <Icono nombre={icono} tamano={40} color={Marca.base} decorativo />
      <Subtitulo>{titulo}</Subtitulo>
      <Cuerpo>{children}</Cuerpo>
      {accion && (
        <Boton secundario onPress={accion.onPress}>
          {accion.texto}
        </Boton>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  fila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Espacio.sm,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radio.pill,
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.xs,
    alignSelf: "flex-start",
  },
  chipTexto: {
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.sm,
    lineHeight: 20,
  },
  vacio: {
    alignItems: "center",
    gap: Espacio.base,
    backgroundColor: Superficie.tarjeta,
    borderWidth: 1,
    borderColor: Superficie.borde,
    borderRadius: Radio.lg,
    padding: Espacio.lg,
  },
});
