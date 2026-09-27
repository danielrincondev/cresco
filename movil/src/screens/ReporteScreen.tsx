/**
 * P4, P5 y P6 — lo que un representante abre la aplicacion para ver.
 *
 * P4 es, segun el propio issue #32, "la mas importante de todas": el reporte
 * del dia de su hijo. Las otras dos son el historial y el acumulado del
 * parcial.
 *
 * ## La decision que atraviesa las tres
 *
 * **No haber recibido nada no es un error, y hay que decirlo distinto.** Un
 * dia sin novedades es el dia normal de un estudiante: la mayoria de los dias
 * no pasa nada digno de anotarse. Si esa pantalla se lee como un fallo de
 * carga, el representante abre la aplicacion cada tarde para ver algo roto y
 * deja de abrirla. Por eso "todavia no hay reporte de hoy" y "hoy no hubo
 * novedades" son dos mensajes distintos, y ninguno es una pantalla vacia.
 *
 * ## Por que el puntaje nunca aparece solo
 *
 * C3: la franja siempre lleva el numero dentro del texto, y eso lo garantiza
 * `etiquetaFranja` en `lib/estados.ts`. Un color sin cifra no dice nada, y una
 * cifra sin la frase de la franja se lee como una nota escolar, que es
 * justamente lo que Cresco **no** es (el puntaje de conducta no entra en el
 * expediente academico).
 */

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AnuncioBanner } from "../components/AnuncioBanner";
import { HijoActivo } from "../components/SelectorDeHijo";
import { Chip, Chips, EstadoVacio } from "../components/Estado";
import { EsqueletoPagina } from "../components/Movimiento";
import {
  Aviso,
  Boton,
  Cargando,
  Cuerpo,
  Pagina,
  Subtitulo,
  Tarjeta,
} from "../components/NucleoUI";
import { Icono } from "../theme/Icono";
import { etiquetaAccion, etiquetaFranja } from "../lib/estados";
import type { AccionDeLaBitacora } from "./ReclamarScreen";
import { fechaLegible, hoyISO } from "../lib/fechas";
import { useRegistrarVistos } from "../lib/useRegistrarVistos";
import { useLecturaSensible } from "../lib/useLecturaSensible";
import { Espacio, Franja, Marca, Radio, Superficie, Tamano, Texto, TonoEstado } from "../theme/Theme";

type Reporte = NonNullable<
  FunctionReturnType<typeof api.conducta.reporteDeHoy>["reporte"]
>;
type Comunicado = FunctionReturnType<typeof api.conducta.comunicadosVigentes>[number];

/**
 * Notas y eventos del curso, vigentes hoy — QA del 26 de septiembre: "los
 * eventos no se reflejan en el reporte diario". No era que se reflejaran mal:
 * nada del lado de la familia leía `comunicadoCurso`, así que no se veían en
 * ningún sitio. Van después de las acciones del día, nunca antes: son avisos
 * del curso, no lo que le pasó al estudiante.
 */
function NovedadesDelCurso({ comunicados }: { comunicados: Comunicado[] }) {
  if (comunicados.length === 0) return null;
  return (
    <Tarjeta>
      <Subtitulo>Novedades del curso</Subtitulo>
      {comunicados.map((c) => (
        <View key={c.id} style={r.comunicado}>
          <View style={r.comunicadoEncabezado}>
            {c.tipo === "EVENTO" && (
              <Icono nombre="calendar-blank" color={Marca.base} decorativo />
            )}
            <Text style={r.comunicadoTitulo}>{c.titulo}</Text>
          </View>
          {c.tipo === "EVENTO" && c.fechaEvento && (
            <Text style={r.etiqueta}>
              {c.fechaEventoFin && c.fechaEventoFin !== c.fechaEvento
                ? `Del ${fechaLegible(c.fechaEvento)} al ${fechaLegible(c.fechaEventoFin)}`
                : fechaLegible(c.fechaEvento)}
              {c.horaEvento ? ` · ${c.horaEvento}` : ""}
            </Text>
          )}
          <Cuerpo>{c.contenido}</Cuerpo>
        </View>
      ))}
    </Tarjeta>
  );
}

/** La tarjeta de un reporte diario, que se reusa en P4 y en P5. */
function TarjetaReporte({ reporte }: { reporte: Reporte }) {
  return (
    <Tarjeta>
      <Subtitulo>{fechaLegible(reporte.fecha)}</Subtitulo>

      {reporte.franja && reporte.puntaje !== undefined && reporte.puntaje !== null && (
        <Chip etiqueta={etiquetaFranja(reporte.franja.nombre, reporte.puntaje)} />
      )}
      {reporte.franja && <Cuerpo>{reporte.franja.frase}</Cuerpo>}

      {reporte.asistencia && (
        <Text style={r.etiqueta}>Asistencia: {reporte.asistencia.toLowerCase()}</Text>
      )}

      {reporte.acciones.length === 0 ? (
        // El dia normal de un estudiante. Se dice con palabras porque una
        // tarjeta sin contenido se lee como un fallo.
        <Cuerpo>Hoy no hubo anotaciones de conducta.</Cuerpo>
      ) : (
        reporte.acciones.map((accion) => (
          <View key={accion.id} style={r.accion}>
            <Chips>
              <Chip etiqueta={etiquetaAccion(accion.estado)} />
              <Text style={r.etiqueta}>
                {accion.categoria} · {accion.puntos > 0 ? `+${accion.puntos}` : accion.puntos}
              </Text>
            </Chips>
            {/* Lo que el docente escribio con sus palabras: es la parte que
                una familia acepta o discute, no el numero. */}
            <Cuerpo>{accion.descripcion}</Cuerpo>
          </View>
        ))
      )}

      {reporte.general.map((campo) => (
        <View key={campo.etiqueta} style={r.accion}>
          <Text style={r.etiqueta}>{campo.etiqueta}</Text>
          <Cuerpo>{campo.texto}</Cuerpo>
        </View>
      ))}
    </Tarjeta>
  );
}

type ResumenSemana = NonNullable<
  FunctionReturnType<typeof api.conducta.reporteDeHoy>["resumenSemana"]
>;

/**
 * QA del 27 de septiembre: un sábado o domingo no hay reporte porque no hay
 * clases, no porque el docente no lo haya publicado todavía — "todavía no
 * hay reporte de hoy" decía algo que no era cierto. En su lugar, lo que pasó
 * en la semana.
 */
function ResumenSemanal({ resumen, otroDia = false }: { resumen: ResumenSemana; otroDia?: boolean }) {
  return (
    <Tarjeta>
      <Subtitulo>{otroDia ? "Ese día no hubo clases" : "Hoy no es día de clases"}</Subtitulo>
      <Cuerpo>
        {`Esto es lo que pasó del ${fechaLegible(resumen.desde)} al ${fechaLegible(resumen.hasta)}.`}
      </Cuerpo>
      {resumen.acciones.length === 0 ? (
        // El mismo criterio que "hoy no hubo anotaciones": una semana sin
        // novedades es la semana normal de un estudiante, no un hueco.
        <Cuerpo>Sin novedades de conducta esta semana.</Cuerpo>
      ) : (
        <>
          <Text style={r.etiqueta}>
            {`Suma ${resumen.puntosPositivos > 0 ? `+${resumen.puntosPositivos}` : 0} · Resta ${resumen.puntosNegativos}`}
          </Text>
          {resumen.acciones.map((accion) => (
            <View key={accion.id} style={r.accion}>
              <Chips>
                <Chip etiqueta={etiquetaAccion(accion.estado)} />
                <Text style={r.etiqueta}>
                  {`${fechaLegible(accion.fecha)} · ${accion.categoria} · ${accion.puntos > 0 ? `+${accion.puntos}` : accion.puntos}`}
                </Text>
              </Chips>
              <Cuerpo>{accion.descripcion}</Cuerpo>
            </View>
          ))}
        </>
      )}
    </Tarjeta>
  );
}

/** P4 — Inicio: el reporte del dia. */
export function ReporteDeHoy({
  estudianteId,
  nombre,
  fecha,
  hijos,
  onCambiarHijo,
  onVerAnteriores,
  onVerAcumulado,
  onVerHoy,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
  /**
   * El día que se quiere ver, si no es hoy. Llega desde un aviso: el del
   * reporte de las 22:00 que se toca a la mañana siguiente tiene que abrir
   * **ese** reporte, no el de un día que todavía no empieza.
   */
  fecha?: string;
  /** Todos los hijos aprobados, para poder cambiar sin salir de la pantalla. */
  hijos?: { estudianteId: string; nombre: string }[];
  onCambiarHijo?: (estudianteId: string, nombre: string) => void;
  onVerAnteriores: () => void;
  onVerAcumulado: () => void;
  /** Volver al reporte de hoy cuando se está mirando el de otro día. */
  onVerHoy?: () => void;
}) {
  const hoy = useQuery(
    api.conducta.reporteDeHoy,
    fecha ? { estudianteId, fecha } : { estudianteId },
  );
  const otroDia = fecha !== undefined && fecha !== hoyISO();
  const comunicados = useQuery(api.conducta.comunicadosVigentes, { estudianteId });
  // Constancia para el docente de que esta familia ya tuvo los avisos del
  // curso en pantalla: ver `comunicadosPublicados`.
  const marcarComunicados = useMutation(api.conducta.marcarComunicadosVistos);
  useRegistrarVistos(
    estudianteId,
    comunicados?.map((c) => c.id),
    (comunicadoIds) => marcarComunicados({ estudianteId, comunicadoIds }),
    "comunicados",
  );
  // DP-006: abrir el reporte de un menor es una lectura sensible. Cuando ya
  // es una fotografía real (no la vista en vivo, que no tiene id todavía),
  // esto también marca el reporte como leído -- ver `fraseDeLecturas`.
  useLecturaSensible(estudianteId, "REPORTE_ESTUDIANTE", hoy?.hay ? hoy.reporte.id : null);

  if (hoy === undefined) return <EsqueletoPagina etiqueta="Cargando el reporte" />;

  return (
    <Pagina
      titulo={nombre}
      descripcion={
        otroDia && fecha
          ? `Lo del ${fechaLegible(fecha)}, contado por su docente.`
          : "Lo de hoy, contado por su docente."
      }
    >
      {/* Con dos hijos, los dos reportes se parecen mucho: saber de quién es
          lo que se lee no es un adorno. Con uno solo, esto es el nombre y
          nada más. */}
      {hijos && hijos.length > 0 && (
        <HijoActivo
          hijos={hijos}
          activo={estudianteId}
          onCambiar={(id) => {
            const elegido = hijos.find((h) => h.estudianteId === id);
            if (elegido) onCambiarHijo?.(id, elegido.nombre);
          }}
        />
      )}
      {hoy.hay ? (
        <TarjetaReporte reporte={hoy.reporte} />
      ) : hoy.finDeSemana && hoy.resumenSemana ? (
        <ResumenSemanal resumen={hoy.resumenSemana} otroDia={otroDia} />
      ) : otroDia ? (
        <EstadoVacio icono="file-document-outline" titulo="No hay reporte de ese día">
          Puede que el docente no lo haya publicado. Los que sí se publicaron
          están en "Reportes anteriores".
        </EstadoVacio>
      ) : (
        // Distinto de "no hubo novedades": aqui el docente todavia no ha
        // cerrado el dia. Confundirlos haria que una madre creyera que a su
        // hijo no le pasa nada cuando en realidad nadie ha escrito aun.
        <EstadoVacio icono="clock-outline" titulo="Todavía no hay reporte de hoy">
          El docente lo publica al terminar la jornada. Cuando esté, te avisamos.
        </EstadoVacio>
      )}

      {/* Después de lo del estudiante, nunca antes: son avisos del curso, no
          lo que le pasó a él o ella hoy. */}
      <NovedadesDelCurso comunicados={comunicados ?? []} />

      {otroDia && onVerHoy && (
        <Boton secundario onPress={onVerHoy}>
          Ver el reporte de hoy
        </Boton>
      )}
      <Boton secundario onPress={onVerAcumulado}>
        Ver el acumulado del parcial
      </Boton>
      <Boton secundario onPress={onVerAnteriores}>
        Ver reportes anteriores
      </Boton>

      {/* Solo el representante llega a este componente — el docente nunca
          importa ReporteScreen.tsx. Así la regla "los maestros no ven
          publicidad" se cumple por construcción. */}
      <AnuncioBanner />
    </Pagina>
  );
}

/** P5 — Reportes anteriores, con el limite del plan. */
export function ReportesAnteriores({
  estudianteId,
  nombre,
  onVolver,
  onVerPlan,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
  onVolver: () => void;
  onVerPlan: () => void;
}) {
  const datos = useQuery(api.conducta.reportesAnteriores, { estudianteId });
  useLecturaSensible(estudianteId, "REPORTE_ESTUDIANTE");
  // Un reporte que sale a las 22:00 casi siempre se lee al día siguiente, y
  // entonces ya está aquí, no en el reporte del día: sin esto, el docente
  // vería como "sin abrir" justo los reportes que sí se leyeron.
  const marcarReportes = useMutation(api.conducta.marcarReportesVistos);
  useRegistrarVistos(
    estudianteId,
    datos?.reportes.map((r) => r.id),
    (reporteEstudianteIds) => marcarReportes({ estudianteId, reporteEstudianteIds }),
    "reportes",
  );

  if (datos === undefined) return <EsqueletoPagina etiqueta="Cargando el historial" />;

  return (
    <Pagina titulo="Reportes anteriores" descripcion={nombre}>
      {datos.reportes.length === 0 ? (
        <EstadoVacio icono="file-document-outline" titulo="Todavía no hay reportes anteriores">
          El primero aparece aquí al día siguiente de publicarse.
        </EstadoVacio>
      ) : (
        datos.reportes.map((reporte) => (
          <TarjetaReporte key={reporte.id} reporte={reporte} />
        ))
      )}

      {/* El limite se dice siempre, no solo al chocar con el: una lista que
          se corta en silencio se lee como que no hay mas. */}
      {!datos.premium && (
        <Aviso>
          {`Tu plan muestra los últimos ${datos.limite} reportes. Con el plan de pago se ven más.`}
        </Aviso>
      )}
      {!datos.premium && (
        <Boton secundario onPress={onVerPlan}>
          Ver los planes
        </Boton>
      )}
      <Boton secundario onPress={onVolver}>
        Volver
      </Boton>
    </Pagina>
  );
}

/**
 * Los seis tramos de la escala, en orden y con el ancho real de cada uno —
 * no seis franjas iguales, porque no lo son: la de partida mide 10 puntos
 * (51 a 60) y la excelente mide 20 (81 a 100). Los límites y los colores
 * están duplicados a propósito desde `convex/semillas.ts`, que es la fuente:
 * si algún día cambian ahí, este es el otro sitio que hay que tocar.
 */
const TRAMOS_FRANJA = [
  { color: Franja.CRITICA, hasta: 15 },
  { color: Franja.MUY_BAJO, hasta: 30 },
  { color: Franja.BAJO, hasta: 50 },
  { color: Franja.BASE, hasta: 60 },
  { color: Franja.BUENO, hasta: 80 },
  { color: Franja.EXCELENTE, hasta: 100 },
] as const;

/**
 * La evolución del estudiante en una sola barra: la escala completa de 0 a
 * 100 coloreada por franja, con un marcador en el puntaje de hoy.
 *
 * Existe **incluso sin una sola acción registrada** — un estudiante recién
 * aprobado empieza en el punto de partida (51-60), y ese es un tramo de la
 * escala como cualquier otro, no la ausencia de datos. Por C3 el número
 * sigue estando aparte, en el chip de arriba: esta barra es la ubicación
 * visual, no reemplaza a la cifra.
 */
function BarraDeFranjas({ puntaje }: { puntaje: number }) {
  const posicion = Math.min(100, Math.max(0, puntaje));
  return (
    <View style={r.barra} accessibilityElementsHidden>
      <View style={r.barraPista}>
        {TRAMOS_FRANJA.map((tramo, i) => (
          <View
            key={tramo.color}
            style={{
              flex: tramo.hasta - (i === 0 ? 0 : TRAMOS_FRANJA[i - 1].hasta),
              backgroundColor: tramo.color,
            }}
          />
        ))}
      </View>
      <View style={[r.barraMarcador, { left: `${posicion}%` }]} />
    </View>
  );
}

/** P6 — El acumulado del parcial, con la bitacora completa. */
export function ReporteAcumulado({
  estudianteId,
  nombre,
  hijos,
  onCambiarHijo,
  onVolver,
  onVerAccion,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
  /** Todos los hijos aprobados, para poder cambiar sin salir de la pantalla. */
  hijos?: { estudianteId: string; nombre: string }[];
  onCambiarHijo?: (estudianteId: string, nombre: string) => void;
  onVolver: () => void;
  onVerAccion: (accion: AccionDeLaBitacora) => void;
}) {
  const datos = useQuery(api.conducta.reporteAcumulado, { estudianteId });
  // La lectura mas sensible de toda la app del representante: cada anotacion
  // del parcial, con lo que escribio el docente y cuanto resto. La bitacora
  // la agrupa en ventanas de cinco minutos, asi que abrir y cerrar no la
  // llena de filas repetidas.
  useLecturaSensible(estudianteId, "BITACORA_ACCIONES");

  if (datos === undefined) return <EsqueletoPagina etiqueta="Cargando el acumulado" />;

  return (
    <Pagina titulo={datos.periodo ? `${nombre} · ${datos.periodo.nombre}` : nombre}>
      {hijos && hijos.length > 0 && (
        <HijoActivo
          hijos={hijos}
          activo={estudianteId}
          onCambiar={(id) => {
            const elegido = hijos.find((h) => h.estudianteId === id);
            if (elegido) onCambiarHijo?.(id, elegido.nombre);
          }}
        />
      )}
      <Tarjeta>
        <Chip
          etiqueta={etiquetaFranja(datos.franja?.nombre ?? "Sin franja", datos.puntaje)}
        />
        {/* La barra completa de 0 a 100: no solo el color de hoy, sino dónde
            cae ese número dentro de las seis franjas posibles. Existe incluso
            sin una sola acción registrada -- el punto de partida (51-60) es
            una franja como cualquier otra, no una ausencia de datos. */}
        <BarraDeFranjas puntaje={datos.puntaje} />
        {datos.franja && <Cuerpo>{datos.franja.frase}</Cuerpo>}
        <Text style={r.etiqueta}>
          {`Suma ${datos.puntosPositivos > 0 ? `+${datos.puntosPositivos}` : 0} · Resta ${datos.puntosNegativos}`}
        </Text>
        {/* QA del 27 de septiembre: motivar el acompañamiento, no calificar
            dos veces. Las tres son calculadas del lado del servidor
            (lib/insights.ts), nunca generadas, y cada una se queda en
            silencio en vez de forzar algo que no aplica. La del progreso
            habla del estudiante; el consejo, de qué hacer; la de lecturas,
            del propio representante -- por eso pueden aparecer las tres
            juntas sin repetirse. */}
        {datos.insight && (
          <View style={r.aliento}>
            <Text style={r.alientoTexto}>{datos.insight}</Text>
          </View>
        )}
        {datos.consejo && (
          <View style={r.aliento}>
            <Text style={r.alientoTexto}>{datos.consejo}</Text>
          </View>
        )}
        {datos.reconocimiento && (
          <View style={r.aliento}>
            <Text style={r.alientoTexto}>{datos.reconocimiento}</Text>
          </View>
        )}
        {!datos.periodo && (
          // Sin parcial vigente hoy -- entre dos parciales, o el docente
          // todavia no definio ninguno-- la familia sigue viendo el punto de
          // partida de su hijo, no un error. Distinto de "cerrado": aqui
          // puede que ni haya empezado.
          <Aviso>
            Hoy no hay un parcial en curso. En cuanto el docente tenga uno
            activo, aquí vas a ver su evolución.
          </Aviso>
        )}
        {datos.congelado && (
          // El parcial cerro: el numero ya no se mueve. Decirlo evita que una
          // familia espere un cambio que no va a llegar.
          <Aviso>Este parcial ya cerró. El puntaje no cambia.</Aviso>
        )}
        <Cuerpo>
          El puntaje de conducta de Cresco no es una calificación y no entra en
          el expediente académico.
        </Cuerpo>
      </Tarjeta>

      <Subtitulo>Todo lo del parcial</Subtitulo>
      {datos.bitacora.length === 0 ? (
        <EstadoVacio icono="notebook-outline" titulo="Sin anotaciones este parcial">
          No hay nada registrado todavía.
        </EstadoVacio>
      ) : (
        datos.bitacora.map((accion, i) => (
          <Tarjeta key={accion.id} orden={i}>
            {/* Cada anotacion abre su detalle, que es donde vive el derecho a
                reclamar (P7). Enterrarlo en un submenu seria no darlo. */}
            <Chips>
              <Chip etiqueta={etiquetaAccion(accion.estado)} />
              <Text style={r.etiqueta}>
                {fechaLegible(accion.fecha)} ·{" "}
                {accion.puntos > 0 ? `+${accion.puntos}` : accion.puntos}
              </Text>
            </Chips>
            <Cuerpo>{accion.descripcion}</Cuerpo>
            <Boton secundario onPress={() => onVerAccion(accion)}>
              Ver y reclamar
            </Boton>
          </Tarjeta>
        ))
      )}

      <Boton secundario onPress={onVolver}>
        Volver
      </Boton>
    </Pagina>
  );
}

const r = StyleSheet.create({
  // Con borde superior: separa cada anotación y cada campo general del
  // bloque de arriba y entre sí (QA del 26 de septiembre: "dar énfasis a
  // los subtítulos y contenedores"). Sin esto, dos anotaciones seguidas se
  // leían como un solo bloque de texto.
  accion: {
    gap: Espacio.sm,
    borderTopWidth: 1,
    borderTopColor: Superficie.separador,
    paddingTop: Espacio.sm,
  },
  // Metadato (categoría, puntos, fecha, asistencia): mayúsculas y espaciado
  // de letras para que se lea como una etiqueta y no como una segunda línea
  // de cuerpo — antes usaba casi el mismo tratamiento que `Cuerpo` y las dos
  // cosas se confundían a simple vista.
  etiqueta: {
    color: Texto.secundario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.xs,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    lineHeight: 18,
  },
  aliento: {
    backgroundColor: TonoEstado.positivo.fondo,
    borderLeftWidth: 4,
    borderLeftColor: TonoEstado.positivo.borde,
    borderRadius: Radio.base,
    padding: Espacio.md,
  },
  alientoTexto: {
    color: TonoEstado.positivo.texto,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.sm,
    lineHeight: 21,
  },
  comunicado: {
    gap: Espacio.xs,
    borderTopWidth: 1,
    borderTopColor: Superficie.separador,
    paddingTop: Espacio.sm,
  },
  comunicadoEncabezado: { flexDirection: "row", alignItems: "center", gap: Espacio.xs },
  comunicadoTitulo: {
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
  barra: { paddingVertical: Espacio.sm, width: "100%" },
  barraPista: {
    flexDirection: "row",
    height: 14,
    width: "100%",
    borderRadius: Radio.pill,
    overflow: "hidden",
  },
  barraMarcador: {
    position: "absolute",
    top: -4,
    width: 6,
    height: 22,
    borderRadius: Radio.sm,
    backgroundColor: Texto.primario,
    borderWidth: 2,
    borderColor: Superficie.tarjeta,
    transform: [{ translateX: -3 }],
  },
});
