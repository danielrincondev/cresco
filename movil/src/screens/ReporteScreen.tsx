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
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
import { etiquetaAccion, etiquetaFranja } from "../lib/estados";
import type { AccionDeLaBitacora } from "./ReclamarScreen";
import { fechaLegible } from "../lib/fechas";
import { useLecturaSensible } from "../lib/useLecturaSensible";
import { Espacio, Tamano, Texto } from "../theme/Theme";

type Reporte = NonNullable<
  FunctionReturnType<typeof api.conducta.reporteDeHoy>["reporte"]
>;

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
        <Text style={r.dato}>Asistencia: {reporte.asistencia.toLowerCase()}</Text>
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
              <Text style={r.dato}>
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
          <Text style={r.dato}>{campo.etiqueta}</Text>
          <Cuerpo>{campo.texto}</Cuerpo>
        </View>
      ))}
    </Tarjeta>
  );
}

/** P4 — Inicio: el reporte del dia. */
export function ReporteDeHoy({
  estudianteId,
  nombre,
  onVerAnteriores,
  onVerAcumulado,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
  onVerAnteriores: () => void;
  onVerAcumulado: () => void;
}) {
  const hoy = useQuery(api.conducta.reporteDeHoy, { estudianteId });
  // DP-006: abrir el reporte de un menor es una lectura sensible.
  useLecturaSensible(estudianteId, "REPORTE_ESTUDIANTE");

  if (hoy === undefined) return <EsqueletoPagina etiqueta="Cargando el reporte" />;

  return (
    <Pagina titulo={nombre} descripcion="Lo de hoy, contado por su docente.">
      {hoy.hay ? (
        <TarjetaReporte reporte={hoy.reporte} />
      ) : (
        // Distinto de "no hubo novedades": aqui el docente todavia no ha
        // cerrado el dia. Confundirlos haria que una madre creyera que a su
        // hijo no le pasa nada cuando en realidad nadie ha escrito aun.
        <EstadoVacio icono="clock-outline" titulo="Todavía no hay reporte de hoy">
          El docente lo publica al terminar la jornada. Cuando esté, te avisamos.
        </EstadoVacio>
      )}

      <Boton secundario onPress={onVerAcumulado}>
        Ver el acumulado del parcial
      </Boton>
      <Boton secundario onPress={onVerAnteriores}>
        Ver reportes anteriores
      </Boton>
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

/** P6 — El acumulado del parcial, con la bitacora completa. */
export function ReporteAcumulado({
  estudianteId,
  nombre,
  onVolver,
  onVerAccion,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
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
    <Pagina titulo={`${nombre} · ${datos.periodo.nombre}`}>
      <Tarjeta>
        <Chip
          etiqueta={etiquetaFranja(datos.franja?.nombre ?? "Sin franja", datos.puntaje)}
        />
        {datos.franja && <Cuerpo>{datos.franja.frase}</Cuerpo>}
        <Text style={r.dato}>
          {`Suma ${datos.puntosPositivos > 0 ? `+${datos.puntosPositivos}` : 0} · Resta ${datos.puntosNegativos}`}
        </Text>
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
              <Text style={r.dato}>
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
  accion: { gap: Espacio.sm },
  dato: {
    color: Texto.secundario,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
    lineHeight: 22,
  },
});
