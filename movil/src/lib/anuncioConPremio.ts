import { randomUUID } from "expo-crypto";

import { microsDelPago, precisionDesdeGoogle } from "./publicidad";

/**
 * El anuncio con premio que desbloquea el informe imprimible en el plan
 * gratuito: lo que el muro de pago llama "Informe imprimible viendo un
 * anuncio".
 *
 * Como `AnuncioBanner`, carga los dos SDKs con `import()`: son nativos, y una
 * build que no los tenga tiene que poder decirlo en vez de romperse. Y como el
 * banner, se reporta a RevenueCat con `Purchases.adTracker`, para que lo que
 * factura la publicidad termine en el mismo panel que las suscripciones
 * (ADR-006). Cada reporte va con su propio `catch`: que falle avisarle a
 * RevenueCat nunca debe quitarle el premio a la familia.
 *
 * Usa `TestIds.REWARDED`, el anuncio de prueba oficial de Google, hasta que el
 * proyecto tenga su cuenta de AdMob.
 */
export type ResultadoAnuncio = "PREMIO" | "SIN_PREMIO" | "SIN_MODULOS" | "ERROR";

const UBICACION = "informe_acumulado";
/** Lo máximo que se espera a que el anuncio cargue. Mirarlo puede tardar más. */
const ESPERA_CARGA = 30_000;

export async function verAnuncioConPremio(): Promise<ResultadoAnuncio> {
  let sdk: typeof import("react-native-google-mobile-ads");
  try {
    sdk = await import("react-native-google-mobile-ads");
  } catch {
    return "SIN_MODULOS";
  }
  const purchases = await import("react-native-purchases").then((m) => m.default).catch(() => null);
  const { AdEventType, RewardedAd, RewardedAdEventType, TestIds } = sdk;
  const adUnitId = TestIds.REWARDED;
  const base = { mediatorName: "AdMob", adFormat: "rewarded", adUnitId, placement: UBICACION };
  const impressionId = randomUUID();
  const anuncio = RewardedAd.createForAdRequest(adUnitId);

  return await new Promise<ResultadoAnuncio>((resolver) => {
    let premio = false;
    let terminado = false;
    const quitar: (() => void)[] = [];
    const reloj = setTimeout(() => terminar("ERROR"), ESPERA_CARGA);

    function terminar(resultado: ResultadoAnuncio) {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      for (const q of quitar) q();
      resolver(resultado);
    }

    quitar.push(
      anuncio.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(reloj);
        purchases?.adTracker.trackAdLoaded({ ...base, impressionId }).catch(() => {});
        anuncio.show().catch(() => terminar("ERROR"));
      }),
      anuncio.addAdEventListener(AdEventType.OPENED, () => {
        purchases?.adTracker.trackAdDisplayed({ ...base, impressionId }).catch(() => {});
      }),
      anuncio.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        premio = true;
      }),
      anuncio.addAdEventListener(AdEventType.PAID, (evento) => {
        purchases?.adTracker.trackAdRevenue({
          ...base,
          impressionId,
          revenueMicros: microsDelPago(evento),
          currency: evento.currency,
          precision: precisionDesdeGoogle(evento.precision),
        }).catch(() => {});
      }),
      // Se cierra antes de terminar: no hay premio, y no es un error.
      anuncio.addAdEventListener(AdEventType.CLOSED, () => terminar(premio ? "PREMIO" : "SIN_PREMIO")),
      anuncio.addAdEventListener(AdEventType.ERROR, () => {
        purchases?.adTracker.trackAdFailedToLoad(base).catch(() => {});
        terminar("ERROR");
      }),
    );
    anuncio.load();
  });
}
