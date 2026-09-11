/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

import { avisoPrivacidad, textoConsentimiento } from "./consentimiento";

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

const VERSION = "2026-09-v1";

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
   * El guardia contra la deriva. La versión `2026-09-v1` vive en tres sitios
   * —el documento, `VERSION_CONSENTIMIENTO` de `convex/nucleo.ts` y este
   * archivo— y `consentimiento.versionDocumento` guarda la que la persona leyó.
   * Si el documento cambia y esta copia no, acabamos guardando una versión que
   * no corresponde al texto que se mostró, que es justo lo que la sección 11
   * del aviso promete que no pasa.
   */
  it("coincide palabra por palabra con docs/03-piloto/aviso-privacidad.md", () => {
    const publico = soloLF(avisoDoc)
      .split("\n## Notas internas")[0]
      .replace(/\n-{3,}\s*$/, "")
      .trim();
    expect(soloLF(avisoPrivacidad).trim()).toBe(publico);
  });

  it("declara la misma versión que los documentos", () => {
    expect(avisoPrivacidad).toContain(VERSION);
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
