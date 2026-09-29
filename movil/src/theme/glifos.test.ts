// Esta prueba lee la fuente del disco: los tipos de Node, solo aquí.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { GLIFOS } from "./glifos";
import type { PropsIcono } from "./Icono";

/**
 * Los códigos que la fuente recortada sabe dibujar, leídos de su tabla `cmap`
 * (subtabla de formato 12: los iconos viven por encima de U+FFFF).
 */
function codigosDeLaFuente(ruta: string): Set<number> {
  const datos = readFileSync(ruta);
  const tablas = datos.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < tablas; i++) {
    const registro = 12 + i * 16;
    if (datos.toString("latin1", registro, registro + 4) === "cmap") cmap = datos.readUInt32BE(registro + 8);
  }
  expect(cmap).toBeGreaterThan(0);
  const codigos = new Set<number>();
  const subtablas = datos.readUInt16BE(cmap + 2);
  for (let i = 0; i < subtablas; i++) {
    const inicio = cmap + datos.readUInt32BE(cmap + 4 + i * 8 + 4);
    if (datos.readUInt16BE(inicio) !== 12) continue;
    const grupos = datos.readUInt32BE(inicio + 12);
    for (let g = 0; g < grupos; g++) {
      const desde = datos.readUInt32BE(inicio + 16 + g * 12);
      const hasta = datos.readUInt32BE(inicio + 20 + g * 12);
      for (let c = desde; c <= hasta; c++) codigos.add(c);
    }
  }
  return codigos;
}

it("la fuente recortada dibuja cada icono del mapa (si no, se vería un cuadrado vacío)", () => {
  const codigos = codigosDeLaFuente(fileURLToPath(new URL("../../assets/fonts/IconosCresco.ttf", import.meta.url)));
  const faltan = Object.entries(GLIFOS).filter(([, codigo]) => !codigos.has(codigo)).map(([nombre]) => nombre);
  expect(faltan).toEqual([]);
});

it("cada icono con variante de contorno la trae también, para lo inactivo", () => {
  const sinContorno = ["home", "bell", "account", "calendar-blank", "account-group", "file-document"]
    .filter((nombre) => nombre in GLIFOS && !(`${nombre}-outline` in GLIFOS));
  expect(sinContorno).toEqual([]);
});

it("un icono fuera del recorte no compila", () => {
  // @ts-expect-error -- "airplane" no está en GLIFOS: `npm run typecheck` falla.
  const fuera: PropsIcono["nombre"] = "airplane";
  const dentro: PropsIcono["nombre"] = "bell";
  expect([fuera, dentro]).toHaveLength(2);
});
