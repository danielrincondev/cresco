/**
 * Un campo de fecha que se puede **escribir o elegir**.
 *
 * Hasta ahora las fechas de los parciales se escribían a mano en formato
 * `AAAA-MM-DD`. Un docente de pie, entre clases, tecleando cuatro fechas con
 * guiones y sin equivocarse en el mes: es donde más errores se cometen y el
 * único aviso llega al guardar.
 *
 * ## Por qué no `@react-native-community/datetimepicker`
 *
 * Es un módulo **nativo**: obligaría a recompilar el APK, y hoy no se puede
 * compilar desde `main` sin reintroducir el fallo del alta que arregla el #98.
 * Una rejilla de mes son treinta y pico botones y aritmética de fechas: sale
 * en JavaScript y **viaja por el aire**.
 *
 * Tiene además una ventaja sobre el nativo: se ve igual en todos los
 * teléfonos, y el diálogo de Android cambia bastante entre versiones.
 *
 * ## El campo de texto no desaparece
 *
 * Quien sabe la fecha la escribe más rápido de lo que la busca. El calendario
 * es la otra puerta, no la única — por eso el icono va **dentro** del campo y
 * no lo sustituye.
 */

import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Icono } from "../theme/Icono";
import {
  AREA_TACTIL_MINIMA,
  Espacio,
  Marca,
  Radio,
  Superficie,
  Tamano,
  Texto,
} from "../theme/Theme";
import { Boton, Campo, Cuerpo, Subtitulo } from "./NucleoUI";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
/** Empieza en lunes: es como se lee un calendario escolar. */
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/** `AAAA-MM-DD` con ceros, sin pasar por `Date` para no arrastrar zona horaria. */
function aTexto(anio: number, mes: number, dia: number) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Lee `AAAA-MM-DD`, o `null` si no lo es.
 *
 * Se comprueba que los componentes sobrevivan al viaje de ida y vuelta: así
 * un "2026-02-31" se rechaza en vez de convertirse en el 3 de marzo, que es
 * lo que haría `new Date` sin protestar.
 */
export function leerFecha(texto: string): { anio: number; mes: number; dia: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!partes) return null;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]) - 1;
  const dia = Number(partes[3]);
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes || d.getUTCDate() !== dia) {
    return null;
  }
  return { anio, mes, dia };
}

/** Cuántos días tiene el mes. El día 0 del siguiente es el último de este. */
function diasDelMes(anio: number, mes: number) {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/** En qué columna cae el día 1, con la semana empezando en lunes. */
function primerHueco(anio: number, mes: number) {
  return (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
}

export function CampoFecha({
  etiqueta,
  valor,
  onChange,
  editable = true,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onChange: (fecha: string) => void;
  editable?: boolean;
  ayuda?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const elegida = leerFecha(valor);
  const hoy = new Date();
  // El calendario abre en el mes de la fecha escrita si la hay; si no, en el
  // actual. Abrir siempre en el mes de hoy obligaría a navegar a mano cuando
  // se está corrigiendo una fecha ya puesta.
  const [anio, setAnio] = useState(elegida?.anio ?? hoy.getFullYear());
  const [mes, setMes] = useState(elegida?.mes ?? hoy.getMonth());

  function abrir() {
    const actual = leerFecha(valor);
    if (actual) {
      setAnio(actual.anio);
      setMes(actual.mes);
    }
    setAbierto(true);
  }

  function mover(delta: number) {
    const total = mes + delta;
    setAnio(anio + Math.floor(total / 12));
    setMes(((total % 12) + 12) % 12);
  }

  const total = diasDelMes(anio, mes);
  const hueco = primerHueco(anio, mes);
  const celdas: (number | null)[] = [
    ...Array.from({ length: hueco }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <View>
      <View style={f.fila}>
        <View style={f.campo}>
          <Campo
            etiqueta={etiqueta}
            placeholder="AAAA-MM-DD"
            maxLength={10}
            value={valor}
            onChangeText={onChange}
            editable={editable}
            ayuda={ayuda}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Elegir ${etiqueta.toLowerCase()} en un calendario`}
          disabled={!editable}
          onPress={abrir}
          style={({ pressed }) => [f.boton, pressed && f.botonPresionado]}
        >
          <Icono nombre="calendar-blank" color={Marca.base} decorativo />
        </Pressable>
      </View>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar el calendario"
          style={f.velo}
          onPress={() => setAbierto(false)}
        >
          {/* El `Pressable` de dentro para el toque: sin él, elegir un día
              cerraría el calendario al propagarse al velo. */}
          <Pressable style={f.tarjeta} onPress={() => {}}>
            <Subtitulo>{etiqueta}</Subtitulo>
            <View style={f.cabecera}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mes anterior"
                onPress={() => mover(-1)}
                style={f.flecha}
              >
                <Icono nombre="chevron-right" decorativo />
              </Pressable>
              <Text style={f.mes}>
                {MESES[mes]} {anio}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mes siguiente"
                onPress={() => mover(1)}
                style={f.flecha}
              >
                <Icono nombre="chevron-right" decorativo />
              </Pressable>
            </View>

            <View style={f.semana}>
              {DIAS.map((d, i) => (
                <Text key={i} style={f.diaSemana}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={f.rejilla}>
              {celdas.map((dia, i) =>
                dia === null ? (
                  <View key={`h${i}`} style={f.celda} />
                ) : (
                  <Pressable
                    key={dia}
                    accessibilityRole="button"
                    accessibilityLabel={`${dia} de ${MESES[mes]} de ${anio}`}
                    accessibilityState={{
                      selected:
                        elegida?.anio === anio &&
                        elegida?.mes === mes &&
                        elegida?.dia === dia,
                    }}
                    onPress={() => {
                      onChange(aTexto(anio, mes, dia));
                      setAbierto(false);
                    }}
                    style={({ pressed }) => [
                      f.celda,
                      f.celdaTactil,
                      elegida?.anio === anio &&
                        elegida?.mes === mes &&
                        elegida?.dia === dia &&
                        f.celdaElegida,
                      pressed && f.celdaPresionada,
                    ]}
                  >
                    <Text
                      style={[
                        f.diaTexto,
                        elegida?.anio === anio &&
                          elegida?.mes === mes &&
                          elegida?.dia === dia &&
                          f.diaTextoElegido,
                      ]}
                    >
                      {dia}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Cuerpo>También puedes escribirla directamente en el campo.</Cuerpo>
            <Boton secundario onPress={() => setAbierto(false)}>
              Cerrar
            </Boton>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const f = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "flex-start", gap: Espacio.sm },
  campo: { flex: 1 },
  boton: {
    minWidth: AREA_TACTIL_MINIMA,
    minHeight: AREA_TACTIL_MINIMA,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Superficie.borde,
    borderRadius: Radio.base,
    backgroundColor: Superficie.tarjeta,
    // Baja el botón a la altura del recuadro, no de la etiqueta de encima.
    marginTop: Espacio.lg,
  },
  botonPresionado: { backgroundColor: Marca.claro },
  velo: {
    flex: 1,
    backgroundColor: "rgba(0, 42, 92, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: Espacio.base,
  },
  tarjeta: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Superficie.tarjeta,
    borderRadius: Radio.lg,
    padding: Espacio.lg,
    gap: Espacio.md,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flecha: {
    minWidth: AREA_TACTIL_MINIMA,
    minHeight: AREA_TACTIL_MINIMA,
    alignItems: "center",
    justifyContent: "center",
  },
  mes: {
    flex: 1,
    textAlign: "center",
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
    textTransform: "capitalize",
  },
  semana: { flexDirection: "row" },
  diaSemana: {
    flex: 1,
    textAlign: "center",
    color: Texto.secundario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.xs,
  },
  rejilla: { flexDirection: "row", flexWrap: "wrap" },
  celda: { width: `${100 / 7}%`, aspectRatio: 1 },
  celdaTactil: { alignItems: "center", justifyContent: "center", borderRadius: Radio.base },
  celdaElegida: { backgroundColor: Marca.base },
  celdaPresionada: { backgroundColor: Marca.claro },
  diaTexto: {
    color: Texto.primario,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
  },
  diaTextoElegido: { color: Texto.sobreColor, fontFamily: "Inter-Semibold" },
});
