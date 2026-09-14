// @vitest-environment edge-runtime
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { verificarReautenticacion } from "./reautenticacion";

const ahora = new Date("2026-09-10T15:00:00Z");
const segundos = ahora.getTime() / 1000;
const emisor = "https://clerk-prueba.test";
const identidad = { issuer: emisor, subject: "docente", tokenIdentifier: `${emisor}|docente`, sid: "sesion" };
let claves: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => { claves = await generateKeyPair("RS256"); });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(ahora);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", emisor);
  const jwk = { ...await exportJWK(claves.publicKey), kid: "test", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    expect(String(url)).toBe(`${emisor}/.well-known/jwks.json`);
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function firmar(cambios: JWTPayload = {}) {
  return await new SignJWT({ iss: emisor, sub: "docente", sid: "sesion", iat: segundos, exp: segundos + 60, fva: [0, -1], ...cambios })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).sign(claves.privateKey);
}

it("acepta prueba firmada reciente de la misma sesión y calcula la fecha en el servidor", async () => {
  expect(await verificarReautenticacion(await firmar(), identidad)).toBe(ahora.getTime() - 60_000);
});

it.each([
  ["sin factor", { fva: undefined }], ["factor nunca verificado", { fva: [-1, -1] }],
  ["factor vencido", { fva: [5, -1] }], ["factor mal formado", { fva: ["0", -1] }],
  ["factor fraccionario", { fva: [0.5, -1] }], ["sin segundo elemento", { fva: [0] }],
  ["otro emisor", { iss: "https://otro.test" }], ["otro usuario", { sub: "otro" }],
  ["otra sesión", { sid: "otra" }], ["sesión pendiente", { sts: "pending" }],
  ["token vencido", { exp: segundos - 1 }], ["sin caducidad", { exp: undefined }],
  ["sin fecha de emisión", { iat: undefined }], ["emisión futura", { iat: segundos + 30 }],
  ["factor envejecido desde emisión", { iat: segundos - 121, exp: segundos + 60, fva: [3, -1] }],
] satisfies [string, JWTPayload][])("rechaza %s", async (_nombre, cambios) => {
  await expect(verificarReautenticacion(await firmar(cambios), identidad)).rejects.toThrow("Vuelve a confirmar");
});

it("rechaza una firma de otra clave aunque declare verificación reciente", async () => {
  const ajenas = await generateKeyPair("RS256");
  const falso = await new SignJWT({ iss: emisor, sub: "docente", sid: "sesion", iat: segundos, exp: segundos + 60, fva: [0, -1] })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).sign(ajenas.privateKey);
  await expect(verificarReautenticacion(falso, identidad)).rejects.toThrow("Vuelve a confirmar");
});

it("rechaza usuarios sin autenticar o sin sesión identificable", async () => {
  const token = await firmar();
  await expect(verificarReautenticacion(token, null)).rejects.toThrow("Vuelve a confirmar");
  await expect(verificarReautenticacion(token, { ...identidad, sid: undefined })).rejects.toThrow("Vuelve a confirmar");
});

it("falla de forma cerrada si no se pueden recuperar las claves", async () => {
  const otroEmisor = "https://clerk-sin-conexion.test";
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", otroEmisor);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(verificarReautenticacion(await firmar({ iss: otroEmisor }), { ...identidad, issuer: otroEmisor }))
    .rejects.toThrow("Vuelve a confirmar");
});
