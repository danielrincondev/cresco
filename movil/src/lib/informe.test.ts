import { describe, expect, it } from "vitest";

import { htmlDelInforme, type DatosDelInforme } from "./informe";

const DATOS = {
  periodo: { nombre: "Primer parcial", fechaInicio: "2026-05-04", fechaFin: "2026-07-10" },
  puntaje: 58,
  puntosPositivos: 3,
  puntosNegativos: -5,
  congelado: false,
  franja: { nombre: "Atención", frase: "Conviene conversar en casa.", color: null },
  bitacora: [
    { id: "a1", fecha: "2026-06-09", signo: "NEGATIVA", puntos: -2, descripcion: "Interrumpió la clase", estado: "VIGENTE" },
    { id: "a2", fecha: "2026-06-02", signo: "POSITIVA", puntos: 0, descripcion: "Ayudó a un compañero", estado: "ANULADA" },
  ],
  insight: "Va mejor que en el parcial anterior.",
  consejo: null,
  reconocimiento: null,
  estudiante: "Ana Pérez",
  curso: "Quinto A",
  institucion: "Unidad Educativa Piloto",
  docente: "María Torres",
  generadoEn: Date.UTC(2026, 8, 15, 15, 0),
} as unknown as DatosDelInforme;

describe("informe imprimible", () => {
  it("dice de quién es, de qué parcial y qué pasó, anotación por anotación", () => {
    const html = htmlDelInforme(DATOS);
    for (const texto of [
      "Ana Pérez · Quinto A · Unidad Educativa Piloto",
      "Primer parcial, del lunes 4 de mayo al viernes 10 de julio",
      "María Torres",
      "58 <span",
      "de 100",
      "Atención.</strong> Conviene conversar en casa.",
      "Suma +3 · Resta -5",
      "Va mejor que en el parcial anterior.",
      "Interrumpió la clase",
      "Por mejorar",
      "-2",
    ]) expect(html).toContain(texto);
  });

  it("una anotación anulada dice que lo está, no finge que cuenta", () => {
    expect(htmlDelInforme(DATOS)).toMatch(/Ayudó a un compañero <em>\([^)]+\)<\/em>/);
  });

  it("avisa que no reemplaza el expediente del plantel (DP-009) y cuándo se generó", () => {
    const html = htmlDelInforme(DATOS);
    expect(html).toContain("no reemplaza el expediente");
    expect(html).toContain("martes 15 de septiembre");
  });

  /** Lo que escribe un docente no puede convertirse en HTML dentro del PDF. */
  it("escapa lo que viene escrito por personas", () => {
    const html = htmlDelInforme({
      ...DATOS,
      estudiante: "Ana <b>Pérez</b>",
      bitacora: [{ ...DATOS.bitacora[0], descripcion: `<script>alert("x")</script> & 'más'` }],
    } as DatosDelInforme);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Pérez</b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;más&#39;");
  });

  it("sin anotaciones ni parcial, lo dice en vez de dejar la tabla vacía", () => {
    const html = htmlDelInforme({ ...DATOS, bitacora: [], periodo: null, docente: null } as DatosDelInforme);
    expect(html).toContain("Sin anotaciones en este parcial.");
    expect(html).toContain("Sin un parcial vigente");
    expect(html).not.toContain("<table>");
    expect(html).not.toContain("Docente:");
  });
});
