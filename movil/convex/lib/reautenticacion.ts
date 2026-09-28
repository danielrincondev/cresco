import { createRemoteJWKSet, jwtVerify } from "jose";
import type { UserIdentity } from "convex/server";
import { ErrorDominio } from "./guardas";

const MINUTO = 60_000;
const clavesPorEmisor = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verifica el token de sesión, nunca un timestamp declarado por el cliente.
 * Convex excluye fva de UserIdentity; por eso esta comprobación va en una action.
 * https://docs.convex.dev/auth/clerk#factor-verification-age
 * https://clerk.com/docs/guides/sessions/session-tokens
 */
export async function verificarReautenticacion(
  token: string,
  identidad: UserIdentity | null,
  para = "activar una alerta",
) {
  const rechazar = () => new ErrorDominio(
    "REAUTENTICACION_REQUERIDA", `Vuelve a confirmar tu identidad para ${para}.`,
  );
  const emisor = process.env.CLERK_JWT_ISSUER_DOMAIN;
  if (!identidad || !emisor || identidad.issuer !== emisor ||
      typeof identidad.sid !== "string" || !token || token.length > 16_384) throw rechazar();
  try {
    let claves = clavesPorEmisor.get(emisor);
    if (!claves) {
      const url = new URL("/.well-known/jwks.json", emisor);
      if (url.protocol !== "https:") throw rechazar();
      claves = createRemoteJWKSet(url, { timeoutDuration: 5_000 });
      clavesPorEmisor.set(emisor, claves);
    }
    const { payload } = await jwtVerify(token, claves, {
      issuer: emisor, subject: identidad.subject, algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sid", "fva"],
    });
    if (payload.sid !== identidad.sid || payload.sts === "pending" ||
        !Array.isArray(payload.fva) || payload.fva.length !== 2 ||
        !Number.isInteger(payload.fva[0]) || payload.fva[0] < 0 || payload.fva[0] >= 5 ||
        typeof payload.iat !== "number" || !Number.isFinite(payload.iat) ||
        payload.iat * 1000 > Date.now()) throw rechazar();
    // fva tiene precisión de minutos: se usa el extremo más antiguo del minuto
    // para no ampliar la ventana de cinco minutos por el redondeo o por replay.
    const reautenticadoEn = payload.iat * 1000 - (payload.fva[0] + 1) * MINUTO;
    if (Date.now() - reautenticadoEn > 5 * MINUTO) throw rechazar();
    return reautenticadoEn;
  } catch {
    // No devolver JWTs ni detalles criptográficos al cliente o a la bitácora.
    throw rechazar();
  }
}
