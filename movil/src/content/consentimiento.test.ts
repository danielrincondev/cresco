/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

import {
  avisoPrivacidad,
  textoConsentimiento,
  versionConsentimiento,
} from "./consentimiento";

// Los documentos entran como texto en tiempo de compilación (`?raw`) y no con
// `node:fs`: el tsconfig de la app no trae los tipos de Node, y añadírselos
// solo para una prueba cambiaría el entorno de tipos de toda la aplicación.
import avisoDoc from "../../../docs/03-piloto/aviso-privacidad.md?raw";
import consentimientoDoc from "../../../docs/03-piloto/texto-consentimiento.md?raw";

/**
 * Se normalizan los saltos de línea: en Windows git deja CRLF en el `.md` del
 * disco y LF en el literal de TypeScript. Es un artefacto del checkout, no una
 * diferencia de contenido, y sin esto la prueba pasa en el CI de Linux y falla
 * en la máquina de quien la escribió.
 */
const soloLF = (texto: string) => texto.split("\r\n").join("\n");

const VERSION = "2026-09-v2";

describe("aviso de privacidad — lo que ve el representante", () => {
  /**
   * El documento termina con una sección cuyo propio título dice que no forma
   * parte del aviso al usuario: pendientes del equipo, referencias a DP y
   * números de issue. Llegó a renderizarse en la pantalla de consentimiento,
   * justo antes del botón con el que una madre autoriza el tratamiento de los
   * datos de su hijo. Esta prueba existe para que no vuelva.
   */
  it("no arrastra las notas internas del equipo", () => {
    for (const marca of [
      "Notas internas",
      "Pendientes antes de usar este documento",
      "Decisiones del proyecto que este texto refleja",
      "DP-007",
      "DP-009",
      "ADR-006",
      "Regla I3",
      "issue #16",
    ]) {
      expect(avisoPrivacidad).not.toContain(marca);
    }
  });

  it("conserva entero el aviso que sí es para la persona", () => {
    for (const seccion of [
      "## 1. Quién trata sus datos",
      "## 4. Qué NO recogemos",
      "## 5. Quién puede ver la información de un estudiante",
      "## 7. Sus derechos, y qué puede ejercer hoy",
      "## 8. Cuánto tiempo conservamos los datos",
      "## 10. Una aclaración importante sobre las alertas",
      "## 11. Cambios a este aviso",
    ]) {
      expect(avisoPrivacidad).toContain(seccion);
    }
  });

  /**
   * DP-007: la v1 no borra datos a solicitud, y el aviso lo dice de frente en
   * vez de prometerlo. Si alguien suaviza esa frase, el documento deja de
   * describir lo que la aplicación hace.
   */
  it("mantiene la declaración honesta sobre la eliminación de datos", () => {
    expect(avisoPrivacidad).toContain(
      "En esta primera versión no podemos eliminar los datos a solicitud",
    );
  });

  /**
   * DP-009 difirió el informe imprimible a la v2, y la pantalla de ajustes ya
   * se lo dice al docente con todas sus letras. El aviso, en cambio, listaba
   * la descarga en PDF como un derecho disponible: la misma aplicación daba
   * dos respuestas opuestas a la misma pregunta, y la del aviso era la que
   * prometía de más.
   */
  it("no ofrece la descarga en PDF que la v1 no tiene", () => {
    expect(avisoPrivacidad).toContain("descarga en PDF** todavía no existe");
    expect(avisoPrivacidad).not.toContain("y descargarla en PDF");
  });

  /**
   * La bitácora cubre las operaciones implementadas; el registro de lecturas
   * se incorpora progresivamente y no cubre cada consulta de pantalla. Decir "cada acceso" era prometer una garantía que el piloto no
   * puede sostener si la institución la audita.
   */
  it("describe el alcance real de la bitácora, sin decir 'cada acceso'", () => {
    expect(avisoPrivacidad).not.toContain("Cada acceso a información");
    expect(avisoPrivacidad).not.toContain("registrar o anular");
    expect(avisoPrivacidad).toContain("no acredita todas las lecturas");
    expect(avisoPrivacidad).toContain("la bitácora cubre esas\nacciones, no toda");
  });

  /**
   * El guardia contra la deriva. La versión `2026-09-v2` vive en tres sitios
   * —el documento, `VERSION_CONSENTIMIENTO` de `convex/nucleo.ts` y este
   * archivo— y `consentimiento.versionDocumento` guarda la que la persona leyó.
   * Si el documento cambia y esta copia no, acabamos guardando una versión que
   * no corresponde al texto que se mostró, que es justo lo que la sección 11
   * del aviso promete que no pasa.
   */
  it("coincide palabra por palabra con docs/03-piloto/aviso-privacidad.md", () => {
    const doc = soloLF(avisoDoc);
    const titulo = doc.split("\n")[0].trim();
    // Del título salta directo a la sección 1: lo de en medio es la cabecera
    // del equipo. Y corta antes de las notas internas del final.
    const cuerpo = doc
      .slice(doc.indexOf("\n## 1. "))
      .split("\n## Notas internas")[0]
      .replace(/\n-{3,}\s*$/, "")
      .trim();
    // La línea en blanco entre el título y la sección 1 se conserva: es lo que
    // hace que `parrafosLegibles` los pinte como dos párrafos y no como uno.
    expect(soloLF(avisoPrivacidad).trim()).toBe(`${titulo}\n\n${cuerpo}`);
  });

  /**
   * La versión ya no viaja dentro del texto del aviso: vivía en la cabecera
   * del equipo, que es justo lo que se quitó. Ahora la fuente es
   * `versionConsentimiento`, y la pantalla de consentimiento se la muestra a
   * la persona por separado. Lo que esta prueba cuida es que esa constante y
   * los dos documentos no se separen.
   */
  it("declara la misma versión que los documentos", () => {
    expect(versionConsentimiento).toBe(VERSION);
    expect(avisoDoc).toContain(VERSION);
    expect(consentimientoDoc).toContain(VERSION);
  });
});

describe("texto de consentimiento — lo que se lee antes de aceptar", () => {
  it("conserva los tres marcadores que la pantalla reemplaza", () => {
    for (const marcador of [
      "{nombre del estudiante}",
      "{nombre del curso}",
      "{nombre del docente}",
    ]) {
      expect(textoConsentimiento).toContain(marcador);
    }
  });

  it("avisa de lo que la v1 todavía no puede hacer", () => {
    expect(textoConsentimiento).toContain(
      "no podemos borrar los datos si usted lo solicita",
    );
  });

  it("dice quién puede ver la información y quién no", () => {
    expect(textoConsentimiento).toContain("Solo usted y el docente de su curso");
    expect(textoConsentimiento).toContain("Su hijo no usa esta aplicación");
  });
});
