import type { AdRevenuePrecision } from "react-native-purchases";

/**
 * Lo que comparten los dos anuncios de la familia —el banner del reporte y el
 * anuncio con premio del informe imprimible— al reportarle a RevenueCat.
 */

/**
 * `AdRevenuePrecision` de RevenueCat es un string; Google Mobile Ads lo da
 * como el enum numérico `RevenuePrecisions` (0–3). Sin este mapa, cualquier
 * valor que no fuera "estimado" se habría guardado sin decir nada.
 */
export function precisionDesdeGoogle(precision: number | undefined): AdRevenuePrecision {
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

/**
 * RevenueCat cuenta el ingreso en micros (millonésimas). El SDK de anuncios ya
 * lo da exacto en `valueMicros`; solo se deriva de `value` si esa cifra exacta
 * no vino.
 */
export function microsDelPago(evento: { value: number; valueMicros?: number | string | null }): number {
  return evento.valueMicros ? Number(evento.valueMicros) : Math.round(evento.value * 1_000_000);
}
