/**
 * De Markdown a texto legible en pantalla.
 *
 * El aviso de privacidad y el texto de consentimiento se escriben en Markdown
 * porque viven en `docs/03-piloto/` y ahí es donde se revisan. Pero la
 * aplicación no tiene renderizador de Markdown, así que hasta ahora un
 * representante veía literalmente `**Esta función no sustituye al ECU 911**` y
 * las filas de una tabla como `| Clerk | Inicio de sesión | Correo |`.
 *
 * No es solo estética. Es el documento con el que se pide consentimiento sobre
 * los datos de un menor: si se lee como código a medio cocinar, la persona no
 * lo lee, y un consentimiento que nadie leyó no vale nada por mucho que
 * guardemos su versión.
 *
 * Esto no es un renderizador: no hay negritas ni títulos con estilo. Es lo
 * mínimo para que el texto se lea como texto. Un renderizador de verdad es
 * trabajo de interfaz, y va cuando haya quien lo haga.
 */

/**
 * `**negrita**`, `*cursiva*`, `` `código` `` → el contenido, sin las marcas.
 *
 * Se aplica **después** de unir las líneas de un párrafo, nunca antes: en el
 * aviso de privacidad hay negritas que cruzan el salto de línea del fuente
 * (`**no ha sido revisado por un profesional del\nderecho**`) y línea por
 * línea no hay nada que emparejar. Hay una prueba sobre el documento real
 * justamente porque el caso se coló la primera vez.
 */
function quitarEnfasis(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    // `[texto](url)` → `texto`. La aplicación no abre enlaces desde este texto,
    // así que la dirección solo estorbaría en medio de una frase.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** `| Clerk | Inicio de sesión |` → `Clerk · Inicio de sesión`. */
function aplanarFila(linea: string): string {
  return linea
    .slice(1, -1)
    .split("|")
    .map((celda) => celda.trim())
    .filter((celda) => celda.length > 0)
    .join(" · ");
}

const esSeparadorDeTabla = (linea: string) => /^\|[\s:|-]+\|$/.test(linea);
const esFilaDeTabla = (linea: string) => linea.startsWith("|") && linea.endsWith("|");
const esSeparadorHorizontal = (linea: string) => /^-{3,}$/.test(linea);
const MARCA_DE_LISTA = /^(?:[-*+]\s+|\d+\.\s+)/;

/**
 * Una línea **entera** en negrita es un subtítulo, no parte del párrafo.
 *
 * El texto de consentimiento los escribe así, sin línea en blanco debajo:
 *
 *     **Qué información se va a guardar sobre su hijo o representado**
 *     Su nombre, documento de identidad y curso. Y, durante el año lectivo...
 *
 * Sin esta distinción quedaban pegados, y en el teléfono se leía «...sobre su
 * hijo o representado Su nombre, documento de identidad y curso». Se vio así
 * en la pantalla de consentimiento: justo el texto que una madre lee antes de
 * autorizar el tratamiento de los datos de su hijo.
 */
const esSubtitulo = (linea: string) => /^\*\*[^*].*[^*]\*\*$/.test(linea);

/** Deja la línea sin su decoración de estructura; el contenido no se toca. */
function limpiarLinea(linea: string): string {
  const sinCita = linea.startsWith(">") ? linea.slice(1).trim() : linea;
  const sinTitulo = sinCita.replace(/^#{1,6}\s+/, "");
  return esFilaDeTabla(sinTitulo) ? aplanarFila(sinTitulo) : sinTitulo;
}

const normalizar = (texto: string) => quitarEnfasis(texto).replace(/\s+/g, " ").trim();

/**
 * Convierte un documento Markdown en párrafos listos para pintar.
 *
 * Cada elemento de lista sale como su propio párrafo, con una viñeta `·`.
 * Unirlos en un solo bloque haría ilegible justo la parte que más se consulta
 * —"quién puede ver la información de un estudiante"—, que en el aviso es una
 * lista y una tabla.
 */
export function parrafosLegibles(markdown: string): string[] {
  const parrafos: string[] = [];

  for (const bloque of markdown.split(/\n\s*\n/)) {
    let acumulado: string[] = [];
    const cerrar = () => {
      if (acumulado.length > 0) {
        const parrafo = normalizar(acumulado.join(" "));
        if (parrafo.length > 0) parrafos.push(parrafo);
        acumulado = [];
      }
    };

    for (const cruda of bloque.split("\n")) {
      const linea = cruda.trim();
      if (linea.length === 0 || esSeparadorHorizontal(linea) || esSeparadorDeTabla(linea)) {
        continue;
      }
      const limpia = limpiarLinea(linea);
      // Se pregunta por el título **antes** de mirar si parece lista: un
      // "## 5. Quién puede ver la información" se queda en "5. Quién puede..."
      // al quitarle las almohadillas, y eso es indistinguible de un elemento
      // de lista numerada. Es un título; la numeración es parte del nombre.
      const eraTitulo = /^>?\s*#{1,6}\s/.test(linea);

      // Un subtitulo en negrita cierra el parrafo anterior y va solo.
      if (!eraTitulo && esSubtitulo(limpia)) {
        cerrar();
        const subtitulo = normalizar(limpia);
        if (subtitulo.length > 0) parrafos.push(subtitulo);
        continue;
      }

      if (!eraTitulo && MARCA_DE_LISTA.test(limpia)) {
        cerrar();
        const item = normalizar(limpia.replace(MARCA_DE_LISTA, ""));
        if (item.length > 0) parrafos.push(`· ${item}`);
        continue;
      }
      acumulado.push(limpia);
    }
    cerrar();
  }

  return parrafos;
}
