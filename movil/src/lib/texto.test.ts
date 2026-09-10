import { describe, expect, it } from "vitest";

import { avisoPrivacidad, textoConsentimiento } from "../content/consentimiento";
import { parrafosLegibles } from "./texto";

const unido = (markdown: string) => parrafosLegibles(markdown).join("\n");

describe("texto — limpieza de Markdown", () => {
  it("quita las marcas de énfasis y deja el contenido", () => {
    expect(unido("Esto **no sustituye** al ECU 911.")).toBe(
      "Esto no sustituye al ECU 911.",
    );
    expect(unido("Un *matiz* y un `campo`.")).toBe("Un matiz y un campo.");
  });

  it("conserva los títulos como texto, sin almohadillas", () => {
    expect(unido("## 5. Quién puede ver la información")).toBe(
      "5. Quién puede ver la información",
    );
  });

  it("convierte una tabla en filas legibles y descarta el separador", () => {
    const tabla = ["| Quién | Qué ve |", "|---|---|", "| El docente | Su curso |"].join("\n");
    expect(unido(tabla)).toBe("Quién · Qué ve El docente · Su curso");
  });

  it("quita las citas y los separadores horizontales", () => {
    expect(unido("> Estado: Borrador")).toBe("Estado: Borrador");
    expect(parrafosLegibles("Uno\n\n---\n\nDos")).toEqual(["Uno", "Dos"]);
  });

  it("mantiene la separación entre párrafos", () => {
    expect(parrafosLegibles("Primero.\n\nSegundo.")).toEqual(["Primero.", "Segundo."]);
  });

  it("no deja párrafos vacíos", () => {
    expect(parrafosLegibles("\n\n  \n\nHola\n\n")).toEqual(["Hola"]);
  });
});

describe("texto — sobre los documentos reales del piloto", () => {
  /**
   * Estas dos son las que importan de verdad: son el documento con el que se
   * pide consentimiento sobre los datos de un menor. Si se lee como código a
   * medio cocinar, la persona no lo lee — y un consentimiento que nadie leyó
   * no vale nada por mucho que guardemos su versión.
   */
  it("el aviso de privacidad queda sin una sola marca de Markdown", () => {
    const texto = unido(avisoPrivacidad);
    expect(texto).not.toContain("**");
    expect(texto).not.toContain("|---|");
    expect(texto).not.toMatch(/^#/m);
    expect(texto).not.toMatch(/^>/m);
  });

  it("y conserva lo que la persona tiene que poder encontrar", () => {
    const texto = unido(avisoPrivacidad);
    expect(texto).toContain("Esta función no sustituye al ECU 911");
    expect(texto).toContain("En esta primera versión no podemos eliminar los datos");
    expect(texto).toContain("El propio estudiante · Nada");
  });

  it("el texto de consentimiento también, marcadores incluidos", () => {
    const texto = unido(textoConsentimiento);
    expect(texto).not.toContain("**");
    expect(texto).toContain("{nombre del estudiante}");
    expect(texto).toContain("Su hijo no usa esta aplicación");
  });
});
