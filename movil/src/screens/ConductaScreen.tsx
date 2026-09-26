/**
 * D11 — Anotar la conducta de un estudiante.
 *
 * Es el primer movimiento del ciclo entero del producto: el docente anota, el
 * representante lo recibe, y puede reclamarlo. Todo lo demas de Cresco existe
 * alrededor de esta pantalla.
 *
 * ## Tres decisiones que la pantalla toma
 *
 * **El mensaje es obligatorio y va antes que los puntos.** De las entrevistas
 * del 1 de septiembre salio que el problema no es informar, es que la familia
 * **no acepta** lo que se le informa. Un numero sin explicacion es exactamente
 * lo que no se acepta; lo que el docente escriba con sus palabras es la parte
 * que sirve. Por eso el campo esta arriba y el envio no se habilita sin el.
 *
 * **Los puntos vienen propuestos, no en blanco.** Cada tipo trae su
 * `puntosDefecto` y su rango. Obligar a elegir un numero cada vez es pedirle
 * al docente que decida algo que el catalogo ya decidio, de pie y entre clases.
 *
 * **Se avisa de lo que el representante va a poder hacer.** Si el tipo admite
 * inconformidad, la pantalla lo dice antes de enviar. Que el docente sepa que
 * esto se le puede reclamar cambia como lo escribe, y eso es deseable.
 */

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Chip, EstadoVacio } from "../components/Estado";
import { etiquetaAccion } from "../lib/estados";
import { fechaLegible } from "../lib/fechas";
import { EsqueletoPagina } from "../components/Movimiento";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Cuerpo,
  ErrorMensaje,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import { Espacio, Tamano, Texto } from "../theme/Theme";

type Catalogo = FunctionReturnType<typeof api.nucleo.catalogoDeAcciones>;
type Tipo = Catalogo[number]["tipos"][number];
type Estudiante = {
  estudianteId: Id<"estudiante">;
  nombres: string;
  apellidos: string;
};

/** Los puntos elegibles para un tipo, de su minimo a su maximo. */
function opcionesDePuntos(tipo: Tipo) {
  const desde = Math.min(tipo.puntosMin, tipo.puntosMax);
  const hasta = Math.max(tipo.puntosMin, tipo.puntosMax);
  const valores: number[] = [];
  for (let n = desde; n <= hasta; n++) valores.push(n);
  // Se enseñan de mayor a menor severidad: para una negativa, leer -3 antes
  // que -1 es como piensa el docente, que decide "una grave" o "una leve", no
  // en el signo del numero.
  return (tipo.signo === "NEGATIVA" ? valores : valores.reverse()).map((n) => ({
    valor: String(n),
    texto: n > 0 ? `+${n}` : String(n),
  }));
}

export function AnotarConducta({
  cursoId,
  onVolver,
}: {
  cursoId: Id<"curso">;
  onVolver: () => void;
}) {
  const { results: estudiantes, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarEstudiantes,
    { cursoId },
    { initialNumItems: 40 },
  );
  const catalogo = useQuery(api.nucleo.catalogoDeAcciones, { cursoId });
  const [elegido, setElegido] = useState<Estudiante>();

  if (elegido) {
    return (
      <FormularioAccion
        estudiante={elegido}
        catalogo={catalogo}
        onCerrar={() => setElegido(undefined)}
      />
    );
  }

  return (
    <Pagina
      titulo="Anotar conducta"
      descripcion="Elige al estudiante. Después la categoría y lo que pasó."
    >
      {status === "LoadingFirstPage" ? (
        <Cargando mensaje="Cargando el curso..." />
      ) : estudiantes.length === 0 ? (
        <EstadoVacio icono="account-group" titulo="Todavía no hay estudiantes aprobados">
          Cuando apruebes los registros de las familias, vas a poder anotar aquí.
        </EstadoVacio>
      ) : (
        <>
          {estudiantes.map((e, i) => (
            <Tarjeta key={e.estudianteId} orden={i}>
              <Subtitulo>
                {e.nombres} {e.apellidos}
              </Subtitulo>
              <Boton secundario onPress={() => setElegido(e)}>
                Anotar
              </Boton>
            </Tarjeta>
          ))}
          {status === "CanLoadMore" && (
            <Boton secundario onPress={() => loadMore(40)}>
              Ver más estudiantes
            </Boton>
          )}
        </>
      )}
      <Boton secundario onPress={onVolver}>
        Volver al curso
      </Boton>
    </Pagina>
  );
}

function FormularioAccion({
  estudiante,
  catalogo,
  onCerrar,
}: {
  estudiante: Estudiante;
  catalogo: Catalogo | undefined;
  onCerrar: () => void;
}) {
  const registrar = useMutation(api.conducta.registrarAccion);
  const [tipo, setTipo] = useState<Tipo>();
  const [puntos, setPuntos] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [guardada, setGuardada] = useState(false);
  const op = useOperacion();

  function elegirTipo(nuevo: Tipo) {
    setTipo(nuevo);
    setPuntos(String(nuevo.puntosDefecto));
  }

  async function enviar() {
    if (!tipo) return;
    const r = await op.ejecutar(() =>
      registrar({
        estudianteId: estudiante.estudianteId,
        tipoAccionId: tipo.id,
        descripcion,
        puntosAplicados: Number(puntos),
      }),
    );
    if (r.ok) setGuardada(true);
  }

  if (guardada) {
    return (
      <Pagina titulo="Anotación registrada">
        <Tarjeta>
          <Cuerpo>
            Quedó registrada para {estudiante.nombres} {estudiante.apellidos}.
          </Cuerpo>
          <Cuerpo>
            Su representante la va a ver en la aplicación. El puntaje del período
            se recalcula solo.
          </Cuerpo>
          <Cuerpo>
            ¿Te equivocaste de estudiante? Se corrige desde "Anotaciones
            recientes", en el menú del curso.
          </Cuerpo>
        </Tarjeta>
        <Boton onPress={onCerrar}>Anotar a otro estudiante</Boton>
      </Pagina>
    );
  }

  if (catalogo === undefined) return <EsqueletoPagina etiqueta="Cargando el catálogo" />;

  return (
    <Pagina
      titulo={`${estudiante.nombres} ${estudiante.apellidos}`}
      descripcion="Lo que escribas es lo que va a leer su representante."
    >
      <Tarjeta>
        <Subtitulo>¿Qué pasó?</Subtitulo>
        <Campo
          etiqueta="Cuéntalo con tus palabras"
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          maxLength={500}
          ayuda="Esto es lo que más pesa cuando una familia no está de acuerdo."
          editable={!op.pendiente}
        />
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>¿De qué se trata?</Subtitulo>
        {catalogo.length === 0 ? (
          <Cuerpo>
            El catálogo de acciones de tu institución todavía no está cargado.
          </Cuerpo>
        ) : (
          catalogo.map((categoria) => (
            <View key={categoria.id} style={c.categoria}>
              <Text style={c.etiqueta}>{categoria.nombre}</Text>
              {categoria.tipos.map((t) => (
                <Boton
                  key={t.id}
                  secundario={tipo?.id !== t.id}
                  onPress={() => elegirTipo(t)}
                  disabled={op.pendiente}
                >
                  {t.nombre}
                </Boton>
              ))}
            </View>
          ))
        )}
      </Tarjeta>

      {tipo && (
        <Tarjeta>
          <Subtitulo>Puntos</Subtitulo>
          <Chip
            etiqueta={{
              tono: tipo.signo === "POSITIVA" ? "positivo" : "negativo",
              texto: tipo.signo === "POSITIVA" ? "Suma puntos" : "Resta puntos",
            }}
          />
          {/* Varios tipos del catalogo sembrado tienen minimo y maximo
              iguales -- "Irresponsabilidad" vale exactamente -1 -- y ahi un
              selector de una sola opcion pide una decision que no existe.
              Se dice el valor y se acabo. */}
          {opcionesDePuntos(tipo).length === 1 ? (
            <Cuerpo>
              {`Esta anotación vale ${Number(puntos) > 0 ? `+${puntos}` : puntos} punto${
                Math.abs(Number(puntos)) === 1 ? "" : "s"
              }.`}
            </Cuerpo>
          ) : (
            <Opciones
              valor={puntos}
              opciones={opcionesDePuntos(tipo)}
              onChange={setPuntos}
              disabled={op.pendiente}
            />
          )}
          {tipo.admiteInconformidad && (
            <Aviso>
              El representante va a poder reclamar esta anotación, y tú tendrás
              que responderle por escrito.
            </Aviso>
          )}
        </Tarjeta>
      )}

      <ErrorMensaje mensaje={op.error} />
      <Boton
        onPress={() => void enviar()}
        pendiente={op.pendiente}
        disabled={!tipo || !descripcion.trim() || !puntos}
      >
        Registrar la anotación
      </Boton>
      <Boton secundario onPress={onCerrar} disabled={op.pendiente}>
        Elegir otro estudiante
      </Boton>
    </Pagina>
  );
}


/* =======================================================================
 * Deshacer una anotacion puesta por error
 * ======================================================================= */

type Reciente = FunctionReturnType<typeof api.conducta.anotacionesRecientesDelCurso>[number];

/**
 * Las anotaciones de la ultima semana, para revisarlas y anular las erroneas.
 *
 * **Anular pide motivo, y lo pide aqui.** Queda en la bitacora como ANULAR y
 * es lo que despues se le enseña a una institucion que pregunte por que
 * desaparecio una sancion. "Me equivoque de alumno" es un motivo perfecto; un
 * campo vacio no lo es.
 *
 * **Una positiva no se anula desde aqui**, y se dice. Es la regla del
 * servidor (`anularAccion`), no una decision de la pantalla: `anulable` viene
 * calculado de alla para que nunca se ofrezca un boton que despues se rechaza.
 */
export function AnotacionesRecientes({
  cursoId,
  onVolver,
  onAnotar,
}: {
  cursoId: Id<"curso">;
  onVolver: () => void;
  onAnotar: () => void;
}) {
  const lista = useQuery(api.conducta.anotacionesRecientesDelCurso, { cursoId });
  const anular = useMutation(api.conducta.anularAccion);
  const [abierta, setAbierta] = useState<Reciente>();
  const [motivo, setMotivo] = useState("");
  const op = useOperacion();

  async function confirmar() {
    if (!abierta) return;
    const r = await op.ejecutar(() =>
      anular({ accionRegistradaId: abierta.id, motivo: motivo.trim() }),
    );
    if (r.ok) {
      setAbierta(undefined);
      setMotivo("");
    }
  }

  if (lista === undefined) return <EsqueletoPagina etiqueta="Cargando las anotaciones" />;

  if (abierta) {
    return (
      <Pagina titulo="Anular anotación" descripcion={abierta.estudiante}>
        <Tarjeta>
          <Subtitulo>{abierta.tipo}</Subtitulo>
          <Cuerpo>{abierta.descripcion}</Cuerpo>
          <Cuerpo>{`${fechaLegible(abierta.fecha)} · ${abierta.puntos} puntos`}</Cuerpo>
        </Tarjeta>
        <Tarjeta>
          <Campo
            etiqueta="¿Por qué la anulas?"
            value={motivo}
            onChangeText={setMotivo}
            multiline
            maxLength={300}
            ayuda="Queda registrado. Por ejemplo: me equivoqué de estudiante."
            editable={!op.pendiente}
          />
        </Tarjeta>
        <Aviso>
          Deja de contar para el puntaje del período, y la familia la verá como
          anulada.
        </Aviso>
        <ErrorMensaje mensaje={op.error} />
        <Boton
          onPress={() => void confirmar()}
          pendiente={op.pendiente}
          disabled={!motivo.trim()}
        >
          Anular la anotación
        </Boton>
        <Boton secundario onPress={() => setAbierta(undefined)} disabled={op.pendiente}>
          Cancelar
        </Boton>
      </Pagina>
    );
  }

  return (
    <Pagina
      titulo="Anotaciones recientes"
      descripcion="Lo que se anotó en el curso esta semana. Si te equivocaste, aquí se corrige."
    >
      {lista.length === 0 ? (
        /* Un estado vacío que solo dice "no hay nada" es un callejón: no
           explica si falta hacer algo o si la pantalla está rota. Estas dos
           frases cubren las dos razones reales de que esté vacía —todavía no
           has anotado, o aún no tienes estudiantes aprobados— y el botón
           lleva al sitio donde se arregla la primera. */
        <EstadoVacio
          icono="notebook"
          titulo="Nada anotado esta semana"
          accion={{ texto: "Anotar conducta", onPress: onAnotar }}
        >
          Aquí aparece lo de los últimos siete días, para corregirlo si hace
          falta. Si acabas de crear el curso, recuerda que solo se puede anotar
          a estudiantes ya aprobados.
        </EstadoVacio>
      ) : (
        lista.map((a, i) => (
          <Tarjeta key={a.id} orden={i}>
            <Subtitulo>{a.estudiante}</Subtitulo>
            <Chip etiqueta={etiquetaAccion(a.estado)} />
            <Cuerpo>{`${a.tipo} · ${a.puntos > 0 ? `+${a.puntos}` : a.puntos} · ${fechaLegible(a.fecha)}`}</Cuerpo>
            <Cuerpo>{a.descripcion}</Cuerpo>
            {a.anulable ? (
              <Boton secundario onPress={() => setAbierta(a)}>
                Anular
              </Boton>
            ) : a.estado === "VIGENTE" ? (
              <Cuerpo>Las positivas no se anulan desde aquí.</Cuerpo>
            ) : null}
          </Tarjeta>
        ))
      )}
      <Boton secundario onPress={onVolver}>
        Volver al curso
      </Boton>
    </Pagina>
  );
}

const c = StyleSheet.create({
  categoria: { gap: Espacio.sm },
  etiqueta: {
    color: Texto.secundario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.sm,
    textTransform: "uppercase",
  },
});