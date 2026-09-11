import { describe, expect, it } from "vitest";

import {
  ESTADO_ACCION,
  ESTADO_CITA,
  ESTADO_INCONFORMIDAD,
  MODALIDAD,
  MOTIVO_INCONFORMIDAD,
  TIPO_ALERTA,
} from "../../convex/lib/enums";
import {
  etiquetaAccion,
  etiquetaAlerta,
  etiquetaCita,
  etiquetaFranja,
  etiquetaReclamo,
  reclamoRespondible,
  textoModalidad,
  textoMotivo,
  textoTipoAlerta,
} from "./estados";

/**
 * Un estado sin texto se pinta como `undefined` en la pantalla de un
 * representante. Estas cuatro pruebas recorren los enums del dominio, así que
 * agregar un estado nuevo en `enums.ts` y olvidar su texto pone rojo el CI en
 * vez de aparecer en el teléfono de alguien.
 */
describe("estados — ningún estado del dominio se queda sin texto", () => {
  it("cubre las acciones", () => {
    for (const estado of ESTADO_ACCION) {
      expect(etiquetaAccion(estado).texto).toBeTruthy();
    }
  });

  it("cubre las citas", () => {
    for (const estado of ESTADO_CITA) {
      expect(etiquetaCita(estado).texto).toBeTruthy();
    }
  });

  it("cubre los reclamos", () => {
    for (const estado of ESTADO_INCONFORMIDAD) {
      expect(etiquetaReclamo(estado).texto).toBeTruthy();
    }
  });

  it("cubre motivos, modalidades y tipos de alerta", () => {
    for (const motivo of MOTIVO_INCONFORMIDAD) expect(textoMotivo(motivo)).toBeTruthy();
    for (const modalidad of MODALIDAD) expect(textoModalidad(modalidad)).toBeTruthy();
    for (const tipo of TIPO_ALERTA) expect(textoTipoAlerta(tipo)).toBeTruthy();
  });
});

describe("estados — franja de conducta", () => {
  /**
   * C3 de la sesión visual: la franja **nunca** se distingue solo por color.
   * Entre el 5 y el 8 % de los hombres tiene daltonismo. Por eso el puntaje va
   * dentro del texto y no hay forma de pedir la etiqueta sin él.
   */
  it("siempre lleva el puntaje dentro del texto", () => {
    for (const puntaje of [0, 25, 60, 85, 100]) {
      expect(etiquetaFranja("Buena", puntaje).texto).toContain(String(puntaje));
    }
  });

  it("el tono acompaña al puntaje", () => {
    expect(etiquetaFranja("Excelente", 92).tono).toBe("positivo");
    expect(etiquetaFranja("Base", 60).tono).toBe("neutro");
    expect(etiquetaFranja("Bajo", 45).tono).toBe("atencion");
    expect(etiquetaFranja("Crítica", 20).tono).toBe("negativo");
  });
});

describe("estados — reclamos", () => {
  /**
   * F3: al vencer no desaparece, sube de prioridad — y `resolverInconformidad`
   * solo rechaza los `RESUELTA_*`. Responder tarde es mejor que no responder,
   * así que la pantalla tiene que seguir ofreciendo el botón.
   */
  it("un reclamo vencido todavía se puede responder", () => {
    expect(reclamoRespondible("VENCIDA")).toBe(true);
    expect(reclamoRespondible("ABIERTA")).toBe(true);
    expect(reclamoRespondible("EN_REVISION")).toBe(true);
  });

  it("uno ya resuelto no", () => {
    expect(reclamoRespondible("RESUELTA_MANTENIDA")).toBe(false);
    expect(reclamoRespondible("RESUELTA_MODIFICADA")).toBe(false);
    expect(reclamoRespondible("RESUELTA_ANULADA")).toBe(false);
  });

  it("vencido se ve como algo malo, no como algo neutro", () => {
    expect(etiquetaReclamo("VENCIDA").tono).toBe("negativo");
  });
});

describe("estados — citas", () => {
  /**
   * F2: reservar no cierra nada. Si "solicitada" se leyera como confirmada, un
   * representante se presentaría a una cita que el docente nunca aceptó.
   */
  it("solicitada pide atención, no tranquiliza", () => {
    expect(etiquetaCita("SOLICITADA").tono).toBe("atencion");
    expect(etiquetaCita("SOLICITADA").texto).toContain("Esperando");
    expect(etiquetaCita("CONFIRMADA").tono).toBe("positivo");
  });
});

describe("estados — alertas", () => {
  /**
   * Issue #18: si la pantalla de un simulacro es idéntica a la de una
   * emergencia, se entrena al representante a ignorarlas. El día que haya una
   * de verdad, no la abre.
   */
  it("un simulacro nunca se pinta como una emergencia", () => {
    const simulacro = etiquetaAlerta("SIMULACRO", true);
    expect(simulacro.tono).not.toBe("critico");
    expect(simulacro.texto).toContain("no es una emergencia");
  });

  it("una emergencia real sí usa el tono crítico", () => {
    for (const tipo of TIPO_ALERTA.filter((t) => t !== "SIMULACRO")) {
      expect(etiquetaAlerta(tipo, false).tono).toBe("critico");
    }
  });

  /**
   * El tipo dice SIMULACRO pero la bandera dice que no lo es: el servidor lo
   * rechaza (`activarAlerta`), y aquí lo que importa es que la pantalla no lo
   * disfrace de práctica inofensiva mientras tanto.
   */
  it("manda la bandera, no el tipo", () => {
    expect(etiquetaAlerta("SIMULACRO", false).tono).toBe("critico");
  });
});
