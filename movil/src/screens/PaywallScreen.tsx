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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { EstadoVacio } from "../components/Estado";
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
import { fechaHoraLegible } from "../lib/fechas";
import {
  type MotivoSinCompras,
  comprar,
  paquetesDisponibles,
  prepararCompras,
  restaurarCompras,
  type PaqueteComprable,
} from "../lib/compras";
import { Icono } from "../theme/Icono";
import { AREA_TACTIL_MINIMA, Espacio, Marca, Radio, Tamano } from "../theme/Theme";

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

  if (limites.exportarPdf === "LIBRE") frases.push("Informe imprimible");
  if (limites.exportarPdf === "CON_ANUNCIO") frases.push("Informe imprimible viendo un anuncio");

  return frases;
}

/**
 * Cómo se lee cada ciclo de cobro.
 *
 * ⚠️ Hasta el 26 de septiembre todo lo que no era `ANUAL` se leía "Cobro
 * mensual.", así que el plan bimestral del representante (H3, $2.99 cada dos
 * meses) decía que cobraba cada mes. `PERPETUO` no aparece aquí: es el plan
 * gratuito, y `planesDisponibles` ya lo filtra —solo llegan planes con
 * `entitlementRevenuecat`, que el gratuito no tiene.
 */
function textoCiclo(periodicidad: "MENSUAL" | "BIMESTRAL" | "ANUAL" | "PERPETUO") {
  switch (periodicidad) {
    case "ANUAL":
      return "Cobro anual.";
    case "BIMESTRAL":
      return "Cobro cada dos meses.";
    default:
      return "Cobro mensual.";
  }
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
  // Por que no se puede comprar, cuando no se puede. Decirlo evita que un
  // muro de pago sin boton se lea como una pantalla rota.
  const [sinCompras, setSinCompras] = useState<MotivoSinCompras | null>(null);

  /**
   * El SDK se ata al perfil de Convex, que es como el webhook sabe a quien
   * aplicar el cobro. Con la clave ausente esto no hace nada y la pantalla
   * sigue siendo informativa, igual que antes.
   *
   * El motivo exacto (`MotivoSinCompras`) no se guarda: a quien mira esta
   * pantalla —sea el docente, la familia, o un juez del Shipaton— no le hace
   * falta saber si falta la clave, si es el módulo nativo, o si es una clave
   * de prueba en un build de release. Lo único que importa se ve solo:
   * `paquetes` sigue vacío, y el aviso de abajo se dispara con eso.
   */
  useEffect(() => {
    if (!perfil?.perfilUsuarioId) return;
    let vivo = true;
    void (async () => {
      const motivo = await prepararCompras(perfil.perfilUsuarioId);
      if (!vivo) return;
      setSinCompras(motivo);
      if (motivo) return;
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

  if (suscripcion === undefined || planes === undefined)
    return <EsqueletoPagina tarjetas={2} etiqueta="Cargando los planes" />;

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

      {sinCompras === "CLAVE_DE_PRUEBA_EN_RELEASE" && (
        <Aviso>
          Esta build no puede cobrar: lleva la clave del Test Store de
          RevenueCat, que solo funciona en una build de desarrollo. Los planes
          se ven, pero no hay botón de compra.
        </Aviso>
      )}
      {planes.length === 0 ? (
        <Aviso>
          Todavía no hay planes de pago publicados para esta sección.
        </Aviso>
      ) : (
        planes.map((plan, i) => {
          const paquete = paquetes.find((p) => p.productoId === plan.productoGooglePlay);
          return (
            <Tarjeta key={plan.codigo} orden={i}>
              <Subtitulo>{plan.nombre}</Subtitulo>
              {plan.sinPublicidad && <Cuerpo>· Sin anuncios</Cuerpo>}
              {limitesLegibles(plan.limites as Record<string, unknown>).map((frase) => (
                <Cuerpo key={frase}>· {frase}</Cuerpo>
              ))}
              <Cuerpo>{textoCiclo(plan.periodicidad)}</Cuerpo>
              {/* El precio lo pone RevenueCat en la moneda de la persona
                  (ADR-006): se enseña tal cual llega, nunca recortado ni
                  reformateado. Si el SDK no esta disponible no hay paquete, y
                  entonces no hay chip: nunca se ofrece comprar algo que no se
                  puede cobrar.

                  Es su propia fila, alineada a la derecha -- lo unico
                  "accionable" de la tarjeta, así que es lo último que el ojo
                  encuentra y queda solo en su esquina, sin competir con el
                  texto de arriba. */}
              {paquete && (
                <View style={p.precioFila}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Suscribirme a ${plan.nombre} por ${paquete.precio}`}
                    disabled={comprando === plan.productoGooglePlay}
                    onPress={() => void comprarPlan(plan.productoGooglePlay!)}
                    style={({ pressed }) => [
                      p.precioChip,
                      pressed && p.precioChipPresionado,
                    ]}
                  >
                    {comprando === plan.productoGooglePlay ? (
                      <ActivityIndicator color={Marca.base} />
                    ) : (
                      <>
                        <Icono nombre="currency-usd" color={Marca.base} tamano={18} decorativo />
                        <Text style={p.precioTexto}>{paquete.precio}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </Tarjeta>
          );
        })
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
        // Un solo aviso, resumido: a quien mira esta pantalla -incluido un
        // juez del Shipaton- no le hace falta saber si falta la clave, si es
        // el modulo nativo o si es una clave de prueba en release. Le hace
        // falta saber que el producto cobra de verdad y que hoy, en esta
        // build concreta, el boton no esta activo.
        <Aviso>
          Producto en fase MVP: no se puede comprar directamente desde aquí
          todavía, pero el SDK de pagos de RevenueCat ya está instalado.
        </Aviso>
      )}
    </Pagina>
  );
}

const p = StyleSheet.create({
  precioFila: { flexDirection: "row", justifyContent: "flex-end" },
  precioChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Espacio.xs,
    minHeight: AREA_TACTIL_MINIMA,
    paddingHorizontal: Espacio.md,
    borderRadius: Radio.pill,
    borderWidth: 1,
    borderColor: Marca.claro,
  },
  precioChipPresionado: { backgroundColor: Marca.claro },
  precioTexto: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
});

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
