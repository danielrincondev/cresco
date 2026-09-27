import type { FunctionReturnType } from "convex/server";

import type { api } from "../../convex/_generated/api";
import { REGLAS } from "../../convex/lib/enums";
import { etiquetaAccion } from "./estados";
import { fechaHoraLegible, fechaLegible } from "./fechas";

/**
 * El informe imprimible del acumulado (P12): lo que la familia ve en el
 * acumulado del parcial, en un PDF que puede guardar o mandar por WhatsApp.
 *
 * El texto se arma aquí y no en el servidor para que se pueda probar sin
 * teléfono; los datos, en cambio, vienen enteros de `prepararInforme`, que
 * decide quién puede exportar y lo deja en la auditoría.
 */
export type DatosDelInforme = FunctionReturnType<typeof api.conducta.prepararInforme>;

/** Las descripciones las escribe un docente: nada llega al HTML sin escapar. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;");
}

const conSigno = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function htmlDelInforme(datos: DatosDelInforme): string {
  const e = escapar;
  const encabezado = [datos.estudiante, datos.curso, datos.institucion].filter(Boolean).map((t) => e(t!)).join(" · ");
  const parcial = datos.periodo
    ? `${e(datos.periodo.nombre)}, del ${fechaLegible(datos.periodo.fechaInicio)} al ${fechaLegible(datos.periodo.fechaFin)}`
    : "Sin un parcial vigente";
  const filas = datos.bitacora.map((a) => `
      <tr>
        <td>${fechaLegible(a.fecha)}</td>
        <td>${a.signo === "POSITIVA" ? "Positiva" : "Por mejorar"}</td>
        <td>${e(a.descripcion)}${a.estado === "VIGENTE" ? "" : ` <em>(${e(etiquetaAccion(a.estado).texto.toLowerCase())})</em>`}</td>
        <td class="num">${conSigno(a.puntos)}</td>
      </tr>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe del parcial — ${e(datos.estudiante)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 12pt; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; }
  .sub { color: #4b5563; margin: 0 0 14pt; }
  .caja { border: 1px solid #d1d5db; border-radius: 6pt; padding: 10pt 12pt; margin: 0 0 10pt; }
  .puntaje { font-size: 22pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { text-align: left; padding: 6pt 4pt; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { color: #4b5563; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .pie { margin-top: 20pt; color: #6b7280; font-size: 9pt; }
</style>
</head>
<body>
  <h1>Informe del parcial</h1>
  <p class="sub">${encabezado}</p>

  <div class="caja">
    <div><strong>Parcial:</strong> ${parcial}</div>
    ${datos.docente ? `<div><strong>Docente:</strong> ${e(datos.docente)}</div>` : ""}
  </div>

  <div class="caja">
    <div class="puntaje">${datos.puntaje} <span style="font-size:12pt;font-weight:400">de ${REGLAS.PUNTAJE_MAXIMO}</span></div>
    ${datos.franja ? `<div><strong>${e(datos.franja.nombre)}.</strong> ${e(datos.franja.frase)}</div>` : ""}
    <div>Suma ${conSigno(datos.puntosPositivos)} · Resta ${datos.puntosNegativos}</div>
    ${datos.insight ? `<div>${e(datos.insight)}</div>` : ""}
  </div>

  <h2>Anotaciones del parcial</h2>
  ${datos.bitacora.length === 0
    ? "<p>Sin anotaciones en este parcial.</p>"
    : `<table>
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Qué pasó</th><th class="num">Puntos</th></tr></thead>
    <tbody>${filas}
    </tbody>
  </table>`}

  <p class="pie">
    Generado por Cresco el ${fechaHoraLegible(datos.generadoEn)}, a pedido del
    representante. Es lo que la aplicación registró: no reemplaza el expediente
    del plantel.
  </p>
</body>
</html>`;
}

/**
 * Los dos módulos nativos del informe. Se cargan con `import()`, como los
 * SDKs de `AnuncioBanner`: una build anterior a la que los trae tiene que poder
 * decir "actualiza la aplicación" en vez de cerrarse sola.
 */
async function modulosDelInforme() {
  try {
    return { print: await import("expo-print"), sharing: await import("expo-sharing") };
  } catch {
    return null;
  }
}

/** ¿Esta build puede generar el PDF? Se pregunta antes de mostrar un anuncio por él. */
export async function puedeImprimir(): Promise<boolean> {
  return (await modulosDelInforme()) !== null;
}

/** Genera el PDF y abre el menú del teléfono para guardarlo o compartirlo. */
export async function imprimirYCompartir(html: string): Promise<"LISTO" | "SIN_MODULOS"> {
  const modulos = await modulosDelInforme();
  if (modulos === null) return "SIN_MODULOS";
  const { uri } = await modulos.print.printToFileAsync({ html });
  await modulos.sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Compartir el informe",
    UTI: "com.adobe.pdf",
  });
  return "LISTO";
}
