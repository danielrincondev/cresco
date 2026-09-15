/**
 * P7 — El detalle de una anotación, y el derecho a reclamarla.
 *
 * Es el otro extremo del ciclo que empieza en D11: el docente anota, la
 * familia lo lee aquí, y **puede no estar de acuerdo**. De las entrevistas del
 * 1 de septiembre salió que el problema no es informar, sino que la familia no
 * acepta lo que se le informa; esta pantalla es la respuesta a eso.
 *
 * ## Tres decisiones
 *
 * **El reclamo no se esconde detrás de nada.** Si la acción se puede reclamar,
 * el botón está a la vista. Una aplicación que presume de derecho a réplica y
 * lo entierra en un submenú no lo está dando.
 *
 * **Cuando no se puede, se dice por qué.** Una positiva no se disputa y una ya
 * anulada no tiene nada que reclamar. Enseñar un botón apagado sin explicación
 * es peor que no enseñarlo: la persona piensa que la aplicación falla.
 *
 * **El motivo va antes que el mensaje.** Elegir de una lista corta es más
 * fácil que arrancar a escribir, y el motivo le da al docente el marco para
 * leer lo que viene después.
 */

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Chip } from "../components/Estado";
import {
  Aviso,
  Boton,
  Campo,
  Cuerpo,
  ErrorMensaje,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import { etiquetaAccion } from "../lib/estados";
import { fechaLegible } from "../lib/fechas";

/** Una fila de la bitácora de P6, que es de donde se llega aquí. */
export type AccionDeLaBitacora = {
  id: Id<"accionRegistrada">;
  fecha: string;
  signo: "POSITIVA" | "NEGATIVA";
  puntos: number;
  descripcion: string;
  estado: "VIGENTE" | "ANULADA" | "MODIFICADA";
};

const MOTIVOS = [
  { valor: "NO_OCURRIO", texto: "No ocurrió" },
  { valor: "CONTEXTO_INCOMPLETO", texto: "Falta contexto" },
  { valor: "SANCION_DESPROPORCIONADA", texto: "Desproporcionada" },
  { valor: "SOLICITA_REUNION", texto: "Pido reunión" },
  { valor: "OTRO", texto: "Otro" },
] as const;

type Motivo = (typeof MOTIVOS)[number]["valor"];

/** C8: solo una negativa vigente se puede disputar. */
function porQueNoSePuede(accion: AccionDeLaBitacora): string | null {
  if (accion.signo === "POSITIVA") {
    return "Esta anotación es positiva. Lo bueno no se reclama.";
  }
  if (accion.estado === "ANULADA") {
    return "Esta anotación ya fue anulada: no cuenta para el puntaje.";
  }
  if (accion.estado === "MODIFICADA") {
    return "Esta anotación ya fue modificada tras un reclamo anterior.";
  }
  return null;
}

export function DetalleAccion({
  accion,
  nombre,
  onVolver,
}: {
  accion: AccionDeLaBitacora;
  nombre: string;
  onVolver: () => void;
}) {
  const abrir = useMutation(api.interaccion.abrirInconformidad);
  const [reclamando, setReclamando] = useState(false);
  const [motivo, setMotivo] = useState<Motivo>("NO_OCURRIO");
  const [mensaje, setMensaje] = useState("");
  const [enviado, setEnviado] = useState(false);
  const op = useOperacion();

  const impedimento = porQueNoSePuede(accion);

  async function enviar() {
    const r = await op.ejecutar(() =>
      abrir({ accionRegistradaId: accion.id, motivo, mensaje: mensaje.trim() }),
    );
    if (r.ok) setEnviado(true);
  }

  if (enviado) {
    return (
      <Pagina titulo="Reclamo enviado">
        <Tarjeta>
          <Cuerpo>
            El docente tiene 30 días para responderte por escrito, y te avisamos
            cuando lo haga.
          </Cuerpo>
          <Cuerpo>
            Mientras tanto la anotación sigue contando. Si el docente la anula o
            la modifica, deja de contar.
          </Cuerpo>
        </Tarjeta>
        <Boton onPress={onVolver}>Volver</Boton>
      </Pagina>
    );
  }

  return (
    <Pagina titulo={`Anotación de ${nombre}`} descripcion={fechaLegible(accion.fecha)}>
      <Tarjeta>
        <Chip etiqueta={etiquetaAccion(accion.estado)} />
        <Subtitulo>
          {accion.puntos > 0 ? `+${accion.puntos}` : accion.puntos} puntos
        </Subtitulo>
        {/* Lo que el docente escribió con sus palabras: es lo que se acepta o
            se discute, no el número. */}
        <Cuerpo>{accion.descripcion}</Cuerpo>
      </Tarjeta>

      {impedimento ? (
        // Se dice por qué, en vez de enseñar un botón apagado que se lee como
        // un fallo de la aplicación.
        <Aviso>{impedimento}</Aviso>
      ) : !reclamando ? (
        <>
          <Tarjeta>
            <Subtitulo>¿No estás de acuerdo?</Subtitulo>
            <Cuerpo>
              Puedes reclamarla. El docente tiene que responderte por escrito, y
              puede mantenerla, modificarla o anularla.
            </Cuerpo>
          </Tarjeta>
          <Boton onPress={() => setReclamando(true)}>Reclamar esta anotación</Boton>
        </>
      ) : (
        <>
          <Tarjeta>
            <Subtitulo>¿Por qué?</Subtitulo>
            <Opciones
              valor={motivo}
              opciones={MOTIVOS}
              onChange={(v) => setMotivo(v as Motivo)}
              disabled={op.pendiente}
            />
          </Tarjeta>
          <Tarjeta>
            <Campo
              etiqueta="Cuéntalo con tus palabras"
              value={mensaje}
              onChangeText={setMensaje}
              multiline
              maxLength={1000}
              ayuda="Lo lee el docente que puso la anotación."
              editable={!op.pendiente}
            />
          </Tarjeta>
          <ErrorMensaje mensaje={op.error} />
          <Boton
            onPress={() => void enviar()}
            pendiente={op.pendiente}
            disabled={!mensaje.trim()}
          >
            Enviar el reclamo
          </Boton>
          <Boton secundario onPress={() => setReclamando(false)} disabled={op.pendiente}>
            Cancelar
          </Boton>
        </>
      )}

      <Boton secundario onPress={onVolver} disabled={op.pendiente}>
        Volver
      </Boton>
    </Pagina>
  );
}
