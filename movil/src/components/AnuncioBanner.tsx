/**
 * El anuncio del plan gratuito — solo para representantes.
 *
 * QA del 27 de septiembre: "que la app mostrara los anuncios para los
 * padres. Los maestros producen el contenido, ellos no verán anuncios." Este
 * componente solo vive en pantallas de la familia (`ReporteScreen.tsx`); el
 * docente nunca lo importa, así que la regla se cumple por construcción, no
 * por un `if` de rol que alguien podría olvidar en una pantalla nueva.
 *
 * ## Quien pagó Premium no lo ve
 *
 * El muro de pago promete "Sin anuncios" en los planes Premium
 * (`plan.sinPublicidad`). Hasta el 27 de septiembre este componente no lo
 * miraba: una familia que pagaba seguía viendo el anuncio. Ahora pregunta el
 * plan vigente (`miSuscripcion`, que ya respeta la regla de las suscripciones
 * canceladas que no han expirado) y, mientras no lo sabe, tampoco lo
 * muestra: enseñarle un anuncio a quien pagó, aunque sea un instante, es
 * romper esa promesa delante de él.
 *
 * ## Por qué RevenueCat sigue en el centro, aunque el anuncio lo sirva AdMob
 *
 * `react-native-google-mobile-ads` **muestra** el anuncio; no reporta nada a
 * RevenueCat por sí solo. `Purchases.adTracker` (ya en el SDK instalado,
 * `react-native-purchases` 10.9.1) es la integración manual documentada por
 * RevenueCat para exactamente este caso — el adaptador con `loadAndTrack`
 * que RevenueCat recomienda solo existe en iOS/Android puro, no en React
 * Native. Se llama desde los propios eventos del anuncio, así que los
 * ingresos por publicidad terminan en el mismo panel que las suscripciones
 * (ADR-006: una sola fuente de verdad para lo que factura).
 *
 * Reusa `prepararCompras` de `compras.ts` en vez de configurar el SDK por su
 * cuenta: es el mismo candado que evita el cierre forzado de la app con una
 * clave de prueba en una build de release (ver `compras.ts`), y el anuncio
 * no tiene por qué conocer esa regla dos veces.
 *
 * ## Por qué el paquete queda fijado a 17.0.0, no a la última versión
 *
 * 17.1.0 y 17.2.0 tienen un bug abierto y sin resolver: el plugin de Expo
 * rompe la build de Android buscando una propiedad de Gradle
 * (`googleMobileAdsJson`) que nunca se inicializa cuando la configuración
 * vive bajo `expo.plugins`, que es exactamente como está aquí. Comprobado en
 * el issue #903 del repositorio del paquete antes de instalar nada.
 *
 * ## Por qué los dos SDKs se cargan con `import()` y no arriba del archivo
 *
 * Los dos son módulos nativos: un `import` normal revienta en Expo Go y en
 * las pruebas, que no los tienen compilados. Cargarlos aquí adentro hace
 * que quien no llega a esta pantalla nunca los toque, y que fallar al
 * cargarlos sea "no se ve el anuncio", nunca "la pantalla entera se rompe".
 *
 * ## Por qué cada llamada a `adTracker` va envuelta en su propio `catch`
 *
 * Mostrar el anuncio es lo esencial; avisarle a RevenueCat es un enriquecido
 * que puede fallar sin que a la familia le importe -- por ejemplo, si esta
 * es la primera pantalla que abre y `prepararCompras` todavía no terminó.
 * Que falle el reporte nunca debe poder tumbar el anuncio.
 */

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useQuery } from "convex/react";
import type { AdRevenuePrecision } from "react-native-purchases";
import type { AdErrorPayload, PaidEvent } from "react-native-google-mobile-ads";

import { api } from "../../convex/_generated/api";
import { prepararCompras } from "../lib/compras";
import { Espacio } from "../theme/Theme";

/**
 * El ID de prueba oficial de Google: sirve un anuncio real del SDK real, sin
 * necesitar una cuenta de AdMob aprobada. Nunca gana dinero real — es lo
 * mismo que la clave `test_` de RevenueCat para las compras: real de
 * verdad, pero de mentira en el sentido que importa para no cobrarle a
 * nadie por accidente.
 *
 * ⚠️ Antes de publicar en una tienda de verdad, esto se reemplaza por el ID
 * real del panel de AdMob del proyecto. Documentado, no un secreto — viaja
 * dentro del APK igual que la clave pública de RevenueCat.
 */
const ID_BANNER_DE_PRUEBA = "ca-app-pub-3940256099942544/6300978111";

/** Dónde aparece el anuncio, para poder distinguirlo en el panel más adelante. */
const UBICACION = "reporte_diario_banner";

/**
 * `AdRevenuePrecision` de RevenueCat es un string; Google Mobile Ads lo da
 * como el enum numérico `RevenuePrecisions` (0–3). Sin este mapa, cualquier
 * valor que no fuera "estimado" se habría guardado sin decir nada.
 */
function precisionDesdeGoogle(precision: number | undefined): AdRevenuePrecision {
  switch (precision) {
    case 3: // RevenuePrecisions.PRECISE
      return "exact";
    case 2: // RevenuePrecisions.PUBLISHER_PROVIDED
      return "publisher_defined";
    case 1: // RevenuePrecisions.ESTIMATED
      return "estimated";
    default:
      return "unknown";
  }
}

async function sdkDeAnuncios() {
  try {
    return await import("react-native-google-mobile-ads");
  } catch {
    return null;
  }
}

async function sdkDeCompras() {
  try {
    return (await import("react-native-purchases")).default;
  } catch {
    return null;
  }
}

export function AnuncioBanner() {
  const perfil = useQuery(api.nucleo.obtenerPerfil);
  const suscripcion = useQuery(api.suscripciones.miSuscripcion);
  const [modulo, setModulo] = useState<Awaited<ReturnType<typeof sdkDeAnuncios>>>();
  const [purchases, setPurchases] = useState<Awaited<ReturnType<typeof sdkDeCompras>>>();
  const impresionActual = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void sdkDeAnuncios().then((m) => { if (vivo) setModulo(m); });
    void sdkDeCompras().then((p) => { if (vivo) setPurchases(p); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!perfil?.perfilUsuarioId) return;
    // Idempotente (ver `compras.ts`): si el representante ya abrió "Tu
    // plan" antes, esto no hace nada. Si esta es la primera pantalla que
    // ve, deja el SDK listo para que el anuncio pueda reportar de verdad.
    void prepararCompras(perfil.perfilUsuarioId).catch(() => {});
  }, [perfil?.perfilUsuarioId]);

  const sinPublicidad =
    suscripcion === undefined || suscripcion.representante?.plan.sinPublicidad === true;
  if (sinPublicidad || !modulo || !purchases) return null;
  const { BannerAd, BannerAdSize } = modulo;

  return (
    <View style={a.envoltorio}>
      <BannerAd
        unitId={ID_BANNER_DE_PRUEBA}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          impresionActual.current = randomUUID();
          purchases.adTracker.trackAdLoaded({
            mediatorName: "AdMob",
            adFormat: "banner",
            adUnitId: ID_BANNER_DE_PRUEBA,
            impressionId: impresionActual.current,
            placement: UBICACION,
          }).catch(() => {});
        }}
        onAdImpression={() => {
          if (!impresionActual.current) return;
          purchases.adTracker.trackAdDisplayed({
            mediatorName: "AdMob",
            adFormat: "banner",
            adUnitId: ID_BANNER_DE_PRUEBA,
            impressionId: impresionActual.current,
            placement: UBICACION,
          }).catch(() => {});
        }}
        onAdFailedToLoad={(_error: Error & Partial<AdErrorPayload>) => {
          // `code` es texto y viene obsoleto; RevenueCat pide un número, y
          // el SDK de anuncios no da uno real hoy. Mejor omitirlo que
          // inventar un número que no significa nada.
          purchases.adTracker.trackAdFailedToLoad({
            mediatorName: "AdMob",
            adFormat: "banner",
            adUnitId: ID_BANNER_DE_PRUEBA,
            placement: UBICACION,
          }).catch(() => {});
        }}
        onPaid={(evento: PaidEvent) => {
          if (!impresionActual.current) return;
          purchases.adTracker.trackAdRevenue({
            mediatorName: "AdMob",
            adFormat: "banner",
            adUnitId: ID_BANNER_DE_PRUEBA,
            impressionId: impresionActual.current,
            // RevenueCat cuenta el ingreso en micros (millonésimas). El SDK
            // de anuncios ya lo da exacto en `valueMicros`; solo se deriva
            // de `value` si esa cifra exacta no vino.
            revenueMicros: evento.valueMicros ? Number(evento.valueMicros) : Math.round(evento.value * 1_000_000),
            currency: evento.currency,
            precision: precisionDesdeGoogle(evento.precision),
            placement: UBICACION,
          }).catch(() => {});
        }}
      />
    </View>
  );
}

const a = StyleSheet.create({
  envoltorio: { alignItems: "center", marginTop: Espacio.sm },
});
