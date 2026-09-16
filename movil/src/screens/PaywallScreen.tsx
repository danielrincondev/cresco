/**
 * D19 y P11 — los dos muros de pago.
 *
 * ## Por qué aquí no hay ni un precio
 *
 * ADR-006: RevenueCat es la fuente de verdad de los pagos, y es quien pone el
 * precio en el dispositivo, con la moneda y el formato de cada país. Escribir
 * "$2,99" en esta pantalla sería tener dos fuentes de verdad para lo único que
 * no las admite — y la que se equivocaría sería esta, porque un cambio de
 * precio en RevenueCat no despliega la aplicación.
 *
 * Mientras el SDK de compras no esté integrado (#13), el botón **no finge**.
 * Un botón de comprar que no cobra es peor que ninguno: la persona lo pulsa,
 * no pasa nada, y deja de creerle a la pantalla. Así que se dice qué incluye
 * cada plan y se avisa de que la compra todavía no está disponible.
 *
 * ## Por qué son dos audiencias y no una
 *
 * Una misma persona puede ser docente y representante a la vez, y sus planes
 * son independientes: un profesor con hijos en el colegio puede tener PRO como
 * docente y seguir en el gratuito como representante. `miSuscripcion` devuelve
 * las dos ramas por eso, y cada paywall lee solo la suya.
 */

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { EstadoVacio } from "../components/Estado";
import {
  Aviso,
  Boton,
  Cargando,
  Cuerpo,
  Pagina,
  Subtitulo,
  Tarjeta,
} from "../components/NucleoUI";
import { fechaHoraLegible } from "../lib/fechas";
import {
  comprar,
  paquetesDisponibles,
  prepararCompras,
  restaurarCompras,
  type PaqueteComprable,
} from "../lib/compras";

type Audiencia = "DOCENTE" | "REPRESENTANTE";

/**
 * Lo que cada límite significa dicho en palabras, no como campo de base de
 * datos.
 *
 * ⚠️ Las claves tienen que coincidir **exactamente** con las que siembra
 * `convex/semillas.ts`, que es la unica fuente. La primera version de esta
 * pantalla leia `limites.cursos` y la semilla escribe `cursosActivos`: el
 * resultado no fue un error visible sino algo peor -- el plan del docente se
 * pintaba sin un solo limite, como si no tuviera ninguno. Un fallo asi no se
 * ve en una captura, se ve cuando alguien pregunta por que su plan no dice
 * nada.
 */
function limitesLegibles(limites: Record<string, unknown>): string[] {
  const frases: string[] = [];

  const previos = limites.reportesPrevios;
  if (typeof previos === "number") {
    frases.push(
      previos <= 1
        ? "Solo el reporte más reciente"
        : `Los últimos ${previos} reportes`,
    );
  }

  const cursos = limites.cursosActivos;
  if (typeof cursos === "number") {
    frases.push(cursos === 1 ? "Un curso a la vez" : `Hasta ${cursos} cursos`);
  }

  const porCurso = limites.estudiantesPorCurso;
  if (typeof porCurso === "number") {
    frases.push(`Hasta ${porCurso} estudiantes por curso`);
  }

  if (limites.exportarPdf === "LIBRE") frases.push("Informe imprimible cuando llegue");
  if (limites.exportarPdf === "CON_ANUNCIO") frases.push("Informe imprimible viendo un anuncio");

  return frases;
}

function Paywall({ audiencia, titulo, descripcion }: {
  audiencia: Audiencia;
  titulo: string;
  descripcion: string;
}) {
  const suscripcion = useQuery(api.suscripciones.miSuscripcion);
  const planes = useQuery(api.suscripciones.planesDisponibles, { audiencia });
  const perfil = useQuery(api.nucleo.obtenerPerfil);
  const [paquetes, setPaquetes] = useState<PaqueteComprable[]>([]);
  const [comprando, setComprando] = useState<string>();
  const [aviso, setAviso] = useState<string>();

  /**
   * El SDK se ata al perfil de Convex, que es como el webhook sabe a quien
   * aplicar el cobro. Con la clave ausente esto no hace nada y la pantalla
   * sigue siendo informativa, igual que antes.
   */
  useEffect(() => {
    if (!perfil?.perfilUsuarioId) return;
    let vivo = true;
    void (async () => {
      const motivo = await prepararCompras(perfil.perfilUsuarioId);
      if (!vivo || motivo) return;
      setPaquetes(await paquetesDisponibles());
    })();
    return () => { vivo = false; };
  }, [perfil?.perfilUsuarioId]);

  async function comprarPlan(productoId: string) {
    const paquete = paquetes.find((p) => p.productoId === productoId);
    if (!paquete) return;
    setComprando(productoId);
    setAviso(undefined);
    const r = await comprar(paquete.identificador);
    setComprando(undefined);
    if (r.estado === "COMPRADA") {
      // El acceso no se escribe aqui: lo concede el webhook (ADR-006). La
      // pantalla se actualiza sola cuando `miSuscripcion` lo refleje.
      setAviso("Compra registrada. Tu plan se activa en unos segundos.");
    } else if (r.estado === "ERROR") {
      setAviso(r.mensaje);
    }
    // Cancelar no es un error: quien decide no comprar no merece un mensaje.
  }

  if (suscripcion === undefined || planes === undefined) return <Cargando />;

  const rama = audiencia === "DOCENTE" ? suscripcion.docente : suscripcion.representante;

  // `null` significa que la persona no tiene ese rol. No se le enseña un muro
  // de pago de algo que no usa.
  if (rama === null) {
    return (
      <Pagina titulo={titulo}>
        <EstadoVacio icono="account-off" titulo="Esta sección no es para tu cuenta">
          {audiencia === "DOCENTE"
            ? "Los planes de docente son para quien tiene cursos a su cargo."
            : "Los planes de representante son para quien tiene un hijo registrado."}
        </EstadoVacio>
      </Pagina>
    );
  }

  return (
    <Pagina titulo={titulo} descripcion={descripcion}>
      <Tarjeta>
        <Subtitulo>Tu plan hoy: {rama.plan.nombre}</Subtitulo>
        {rama.acceso ? (
          <>
            <Cuerpo>
              {rama.renovacionAutomatica
                ? "Se renueva solo."
                : "No se renueva automáticamente."}
            </Cuerpo>
            {rama.expiraEn !== null && (
              <Cuerpo>
                {rama.estado === "CANCELADA"
                  ? `Cancelado, pero sigues teniendo acceso hasta el ${fechaHoraLegible(rama.expiraEn)}.`
                  : `Vigente hasta el ${fechaHoraLegible(rama.expiraEn)}.`}
              </Cuerpo>
            )}
          </>
        ) : (
          <Cuerpo>
            {rama.plan.sinPublicidad
              ? "Estás en el plan sin costo."
              : "Estás en el plan sin costo, que muestra anuncios."}
          </Cuerpo>
        )}
        {limitesLegibles(rama.plan.limites as Record<string, unknown>).map((frase) => (
          <Cuerpo key={frase}>· {frase}</Cuerpo>
        ))}
      </Tarjeta>

      {planes.length === 0 ? (
        <Aviso>
          Todavía no hay planes de pago publicados para esta sección.
        </Aviso>
      ) : (
        planes.map((plan) => (
          <Tarjeta key={plan.codigo}>
            <Subtitulo>{plan.nombre}</Subtitulo>
            {plan.sinPublicidad && <Cuerpo>· Sin anuncios</Cuerpo>}
            {limitesLegibles(plan.limites as Record<string, unknown>).map((frase) => (
              <Cuerpo key={frase}>· {frase}</Cuerpo>
            ))}
            <Cuerpo>
              {plan.periodicidad === "ANUAL" ? "Cobro anual." : "Cobro mensual."}
            </Cuerpo>
            {/* El precio lo pone RevenueCat en la moneda de la persona
                (ADR-006). Si el SDK no esta disponible no hay paquete, y
                entonces no hay boton: nunca se ofrece comprar algo que no se
                puede cobrar. */}
            {paquetes.find((p) => p.productoId === plan.productoGooglePlay) ? (
              <Boton
                onPress={() => void comprarPlan(plan.productoGooglePlay!)}
                pendiente={comprando === plan.productoGooglePlay}
              >
                {`Suscribirme por ${paquetes.find((p) => p.productoId === plan.productoGooglePlay)!.precio}`}
              </Boton>
            ) : null}
          </Tarjeta>
        ))
      )}

      {aviso && <Aviso>{aviso}</Aviso>}

      {paquetes.length > 0 ? (
        <Boton
          secundario
          onPress={() => void (async () => {
            const r = await restaurarCompras();
            setAviso(
              r.estado === "COMPRADA"
                ? "Listo. Si tenías un plan activo, ya está aplicado."
                : "No se pudo restaurar ahora mismo.",
            );
          })()}
        >
          Restaurar una compra anterior
        </Boton>
      ) : (
        <Aviso>
          La compra dentro de la aplicación todavía no está disponible en esta
          versión. Cuando lo esté, el precio lo vas a ver aquí en tu moneda, con
          el cobro gestionado por Google Play.
        </Aviso>
      )}
    </Pagina>
  );
}

/** D19 — Paywall del docente. */
export function PaywallDocente() {
  return (
    <Paywall
      audiencia="DOCENTE"
      titulo="Tu plan como docente"
      descripcion="Lo que puedes hacer hoy y lo que añaden los planes de pago."
    />
  );
}

/** P11 — Paywall y suscripción del representante. */
export function PaywallRepresentante() {
  return (
    <Paywall
      audiencia="REPRESENTANTE"
      titulo="Tu plan"
      descripcion="Lo que puedes ver hoy sobre tu representado, y lo que añaden los planes."
    />
  );
}
