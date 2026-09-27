/**
 * D12, D13 y D14 — lo que el docente hace al cerrar el día.
 *
 * D12 toma asistencia, D13 redacta el reporte general del curso y D14 publica
 * una nota o un evento. Las tres cuelgan del mismo sitio porque son la misma
 * rutina: terminar la jornada y dejar dicho lo que pasó.
 *
 * ## Dos decisiones que atraviesan las tres
 *
 * **Guardar y publicar no son lo mismo, y se ven distinto.** El reporte se
 * guarda como borrador tantas veces como haga falta y **se publica una vez**.
 * Mezclarlos haría que un docente escribiendo a media tarde mandara media
 * frase a cuarenta familias. Por eso el botón de publicar avisa de que se
 * envía, y el de guardar no promete nada que no haga.
 *
 * **Nada se marca solo.** La asistencia empieza con todos sin marcar, no con
 * todos presentes. Un "presente" por defecto convierte el descuido en un dato
 * falso sobre un menor, y el docente ni se entera de que lo firmó.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CampoFecha } from "../components/CampoFecha";
import { Chip, Chips, EstadoVacio } from "../components/Estado";
import { EsqueletoPagina } from "../components/Movimiento";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Cuerpo,
  ErrorMensaje,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import { fechaISO, fechaLegible, hoyISO } from "../lib/fechas";

type EstadoAsistencia = "PRESENTE" | "AUSENTE" | "ATRASO" | "JUSTIFICADA" | "PERMISO";

/**
 * Las cinco marcas, abreviadas para que quepan en una fila.
 *
 * El docente pasa lista de pie y con el telefono en una mano: si cada
 * estudiante ocupa dos lineas, cuarenta estudiantes son ochenta.
 */
const MARCAS = [
  { valor: "PRESENTE", texto: "Presente" },
  { valor: "AUSENTE", texto: "Ausente" },
  { valor: "ATRASO", texto: "Atraso" },
  { valor: "JUSTIFICADA", texto: "Justif." },
  { valor: "PERMISO", texto: "Permiso" },
] as const;

/* =======================================================================
 * D12 — Tomar asistencia
 * ======================================================================= */

export function TomarAsistencia({
  cursoId,
  onVolver,
}: {
  cursoId: Id<"curso">;
  onVolver: () => void;
}) {
  const datos = useQuery(api.conducta.asistenciaDelDia, { cursoId });
  const guardar = useMutation(api.conducta.tomarAsistencia);
  const [marcas, setMarcas] = useState<Record<string, EstadoAsistencia>>({});
  const [guardada, setGuardada] = useState(false);
  const op = useOperacion();

  // Lo ya marcado hoy se precarga: repetir la lista corrige, no duplica, y el
  // docente tiene que ver lo que puso antes de cambiarlo.
  useEffect(() => {
    if (!datos) return;
    const previas: Record<string, EstadoAsistencia> = {};
    for (const e of datos.estudiantes) {
      if (e.estado) previas[e.estudianteId] = e.estado as EstadoAsistencia;
    }
    setMarcas(previas);
  }, [datos]);

  if (datos === undefined) return <EsqueletoPagina etiqueta="Cargando la lista" />;

  const sinMarcar = datos.estudiantes.filter((e) => !marcas[e.estudianteId]).length;

  async function enviar() {
    setGuardada(false);
    const r = await op.ejecutar(() =>
      guardar({
        cursoId,
        marcas: Object.entries(marcas).map(([estudianteId, estado]) => ({
          estudianteId: estudianteId as Id<"estudiante">,
          estado,
        })),
      }),
    );
    if (r.ok) setGuardada(true);
  }

  return (
    <Pagina
      titulo="Asistencia"
      descripcion={fechaLegible(hoyISO())}
      atras={{ onPress: onVolver }}
    >
      {datos.estudiantes.length === 0 ? (
        <EstadoVacio icono="account-group" titulo="Todavía no hay estudiantes aprobados">
          Cuando apruebes los registros de las familias, vas a poder pasar lista.
        </EstadoVacio>
      ) : (
        <>
          {datos.estudiantes.map((e, i) => (
            <Tarjeta key={e.estudianteId} orden={i}>
              <Subtitulo>
                {e.nombres} {e.apellidos}
              </Subtitulo>
              <Opciones
                valor={marcas[e.estudianteId] ?? ""}
                opciones={MARCAS}
                onChange={(valor) =>
                  setMarcas((previo) => ({
                    ...previo,
                    [e.estudianteId]: valor as EstadoAsistencia,
                  }))
                }
                disabled={op.pendiente}
              />
            </Tarjeta>
          ))}

          {/* Nada se marca solo: se dice cuántos faltan en vez de rellenarlos
              con "presente", que convertiría un descuido en un dato falso. */}
          {sinMarcar > 0 && (
            <Aviso>
              {sinMarcar === 1
                ? "Queda 1 estudiante sin marcar. Solo se guarda lo que marques."
                : `Quedan ${sinMarcar} estudiantes sin marcar. Solo se guarda lo que marques.`}
            </Aviso>
          )}

          <ErrorMensaje mensaje={op.error} />
          {guardada && !op.error && <Aviso>Asistencia guardada.</Aviso>}
          <Boton
            onPress={() => void enviar()}
            pendiente={op.pendiente}
            disabled={Object.keys(marcas).length === 0}
          >
            Guardar asistencia
          </Boton>
        </>
      )}
    </Pagina>
  );
}

/* =======================================================================
 * D13 — El reporte general del día
 * ======================================================================= */

type Campos = FunctionReturnType<typeof api.conducta.camposDelReporte>;

export function ReporteGeneral({
  cursoId,
  onVolver,
}: {
  cursoId: Id<"curso">;
  onVolver: () => void;
}) {
  const plantilla: Campos | undefined = useQuery(api.conducta.camposDelReporte);
  const guardar = useMutation(api.conducta.guardarReporteGeneral);
  const publicar = useMutation(api.conducta.publicarReporteGeneral);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string>();
  const op = useOperacion();

  if (plantilla === undefined) return <EsqueletoPagina etiqueta="Cargando la plantilla" />;

  const conTexto = plantilla.campos
    .filter((c) => (valores[c.id] ?? "").trim() !== "")
    .map((c) => ({ plantillaCampoId: c.id, valorTexto: valores[c.id].trim() }));

  async function accion(publicando: boolean) {
    setAviso(undefined);
    const r = await op.ejecutar(async () => {
      await guardar({ cursoId, valores: conTexto });
      if (publicando) await publicar({ cursoId });
    });
    if (r.ok) {
      setAviso(
        publicando
          ? "Publicado. Las familias del curso ya pueden verlo."
          : "Guardado como borrador. Todavía no lo ve nadie.",
      );
    }
  }

  return (
    <Pagina
      titulo="Reporte del día"
      descripcion={fechaLegible(hoyISO())}
      atras={{ onPress: onVolver }}
    >
      <Tarjeta>
        <Subtitulo>Lo que las familias van a leer</Subtitulo>
        <Cuerpo>
          Ningún campo es obligatorio. Lo que dejes vacío no aparece.
        </Cuerpo>
      </Tarjeta>

      {plantilla.campos.map((campo) => (
        <Tarjeta key={campo.id}>
          <Campo
            etiqueta={campo.etiqueta}
            value={valores[campo.id] ?? ""}
            onChangeText={(texto) =>
              setValores((previo) => ({ ...previo, [campo.id]: texto }))
            }
            multiline={campo.tipoDato === "TEXTO_LARGO"}
            maxLength={campo.longitudMaxima ?? 500}
            ayuda={campo.textoAyuda ?? undefined}
            editable={!op.pendiente}
          />
        </Tarjeta>
      ))}

      <ErrorMensaje mensaje={op.error} />
      {aviso && !op.error && <Aviso>{aviso}</Aviso>}

      {/* Guardar y publicar no son lo mismo. El borrador se puede repetir; la
          publicacion sale hacia cuarenta familias y ocurre una vez. */}
      <Boton
        secundario
        onPress={() => void accion(false)}
        pendiente={op.pendiente}
        disabled={conTexto.length === 0}
      >
        Guardar borrador
      </Boton>
      <Boton
        onPress={() => void accion(true)}
        pendiente={op.pendiente}
        disabled={conTexto.length === 0}
      >
        Publicar a las familias
      </Boton>
    </Pagina>
  );
}

/* =======================================================================
 * D14 — Nota del profesor o evento
 * ======================================================================= */

const TIPOS = [
  { valor: "NOTA_PROFESOR", texto: "Nota" },
  { valor: "EVENTO", texto: "Evento" },
] as const;

export function PublicarComunicado({
  cursoId,
  onVolver,
}: {
  cursoId: Id<"curso">;
  onVolver: () => void;
}) {
  const publicar = useMutation(api.conducta.publicarComunicado);
  const [tipo, setTipo] = useState<"NOTA_PROFESOR" | "EVENTO">("NOTA_PROFESOR");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [fechaEvento, setFechaEvento] = useState("");
  // Un evento puede ser de un solo día o de un plazo (QA del 26 de
  // septiembre): las dos formas están disponibles, y "es un plazo" solo
  // pide la segunda fecha cuando hace falta.
  const [esPlazo, setEsPlazo] = useState(false);
  const [fechaEventoFin, setFechaEventoFin] = useState("");
  const [publicado, setPublicado] = useState(false);
  const op = useOperacion();

  const faltaFechaEvento = tipo === "EVENTO" && !fechaEvento.trim();

  async function enviar() {
    const r = await op.ejecutar(() =>
      publicar({
        cursoId,
        tipo,
        alcance: "CURSO",
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        // La fecha solo viaja en un evento: una nota no ocurre un día.
        ...(tipo === "EVENTO" ? { fechaEvento: fechaEvento.trim() } : {}),
        ...(tipo === "EVENTO" && esPlazo && fechaEventoFin.trim()
          ? { fechaEventoFin: fechaEventoFin.trim() }
          : {}),
      }),
    );
    if (r.ok) setPublicado(true);
  }

  if (publicado) {
    return (
      <Pagina titulo="Publicado">
        <Tarjeta>
          <Cuerpo>Las familias del curso ya pueden verlo en sus novedades.</Cuerpo>
        </Tarjeta>
        <Boton onPress={onVolver}>Volver al curso</Boton>
        <ComunicadosPublicados cursoId={cursoId} />
      </Pagina>
    );
  }

  return (
    <Pagina
      titulo="Avisar al curso"
      descripcion="Una nota para las familias, o un evento con su fecha."
      atras={{ onPress: onVolver }}
    >
      <Tarjeta>
        <Subtitulo>¿Qué vas a publicar?</Subtitulo>
        <Opciones valor={tipo} opciones={TIPOS} onChange={(v) => setTipo(v)} disabled={op.pendiente} />
        <Chip
          etiqueta={{
            tono: "neutro",
            texto: tipo === "EVENTO" ? "Ocurre un día concreto" : "Sin fecha",
          }}
        />
      </Tarjeta>

      <Tarjeta>
        <Campo
          etiqueta="Título"
          value={titulo}
          onChangeText={setTitulo}
          maxLength={120}
          editable={!op.pendiente}
        />
        <Campo
          etiqueta="Contenido"
          value={contenido}
          onChangeText={setContenido}
          multiline
          maxLength={1000}
          ayuda="Lo leen las familias tal cual lo escribas."
          editable={!op.pendiente}
        />
        {tipo === "EVENTO" && (
          <>
            <CampoFecha
              etiqueta="Fecha del evento"
              valor={fechaEvento}
              onChange={setFechaEvento}
              ayuda="Cuándo empieza. Un evento siempre necesita esta fecha."
              editable={!op.pendiente}
            />
            <Casilla
              texto="Dura varios días (un plazo)"
              marcada={esPlazo}
              onChange={() => setEsPlazo(!esPlazo)}
              disabled={op.pendiente}
            />
            {esPlazo && (
              <CampoFecha
                etiqueta="Hasta"
                valor={fechaEventoFin}
                onChange={setFechaEventoFin}
                ayuda="Último día en que se sigue viendo en el reporte diario."
                editable={!op.pendiente}
              />
            )}
          </>
        )}
      </Tarjeta>

      <Aviso>
        Esto va a todas las familias del curso. No sustituye a una alerta de
        emergencia.
      </Aviso>

      <ErrorMensaje mensaje={op.error} />
      <Boton
        onPress={() => void enviar()}
        pendiente={op.pendiente}
        disabled={!titulo.trim() || !contenido.trim() || faltaFechaEvento}
      >
        Publicar al curso
      </Boton>

      <ComunicadosPublicados cursoId={cursoId} />
    </Pagina>
  );
}

/**
 * Lo que el docente ya publicó en el curso, con cuántas familias lo vieron y
 * quiénes faltan.
 *
 * De las entrevistas del 1 de septiembre: "ya no vale que yo le avisé por
 * WhatsApp". Esto es lo que el docente puede mostrar en su lugar, así que
 * dice exactamente lo que la aplicación sabe — que la familia **vio** el
 * aviso al abrir el reporte donde aparece —, sin prometer que lo leyó.
 */
function ComunicadosPublicados({ cursoId }: { cursoId: Id<"curso"> }) {
  const publicados = useQuery(api.conducta.comunicadosPublicados, { cursoId });
  const [abierto, setAbierto] = useState<string>();

  if (publicados === undefined || publicados.length === 0) return null;
  const hoy = hoyISO();

  return (
    <>
      <Subtitulo>Lo que ya publicaste</Subtitulo>
      <Cuerpo>
        Cuenta como visto cuando la familia abre el reporte de su hijo donde
        aparece el aviso.
      </Cuerpo>
      {publicados.map((c) => (
        <Tarjeta key={c.id}>
          <Chips>
            <Chip etiqueta={{ tono: "neutro", texto: c.tipo === "EVENTO" ? "Evento" : "Nota" }} />
            {c.visibleHasta < hoy && (
              <Chip etiqueta={{ tono: "neutro", texto: "Ya no se muestra" }} />
            )}
          </Chips>
          <Subtitulo>{c.titulo}</Subtitulo>
          <Cuerpo>{`Publicado el ${fechaLegible(fechaISO(c.publicadoEn))}`}</Cuerpo>
          <Cuerpo>
            {c.familias === 0
              ? "Todavía no hay familias vinculadas que puedan verlo."
              : c.vistos === c.familias
                ? `Lo vieron todas las familias (${c.familias}).`
                : `Lo vieron ${c.vistos} de ${c.familias} familias.`}
          </Cuerpo>
          {c.faltan.length > 0 &&
            (abierto === c.id ? (
              <>
                <Cuerpo>{`Faltan: ${c.faltan.join(", ")}.`}</Cuerpo>
                <Boton secundario onPress={() => setAbierto(undefined)}>
                  Ocultar
                </Boton>
              </>
            ) : (
              <Boton secundario onPress={() => setAbierto(c.id)}>
                {`Ver quiénes faltan (${c.faltan.length})`}
              </Boton>
            ))}
        </Tarjeta>
      ))}
    </>
  );
}
