/**
 * Banderas de activación — superficie compartida.
 *
 * Sirven para fusionar a `main` trabajo que todavía no está listo, sin dejarlo
 * en una rama divergiendo durante semanas. El código entra apagado: se compila,
 * TypeScript lo revisa y puede tener pruebas, pero no se ejecuta hasta que la
 * bandera pase a `true`.
 *
 * Diferencia con comentar el código: el código comentado no se compila ni se
 * prueba, así que se pudre en silencio y "reactivarlo" es una apuesta. Una
 * bandera se activa cambiando un valor.
 *
 * Reglas de uso:
 *
 * 1. Una bandera es **temporal**. Cuando el trabajo que protege está terminado
 *    y activado, se borra la bandera y el `if` que la usaba — no se dejan
 *    banderas permanentes en `true`, porque cada una duplica los caminos que
 *    hay que probar.
 * 2. Nunca se usa una bandera para esconder un fallo de permisos o de
 *    validación. `permisos.ts` y `guardas.ts` se aplican siempre, con la
 *    bandera encendida o apagada.
 * 3. Cambiar una bandera es un cambio de superficie compartida: el PR pide la
 *    aprobación de los tres (`.github/CODEOWNERS`).
 *
 * Uso:
 * ```ts
 * import { BANDERAS } from "./lib/flags";
 * if (BANDERAS.IA_REPORTE) {
 *   // borrador del reporte generado por el modelo
 * }
 * ```
 */

export const BANDERAS = {
  /**
   * DP-008 — diferenciador de IA: el docente escribe notas rápidas y una
   * `action` de Convex devuelve un borrador del reporte general.
   *
   * Se mantiene apagada hasta que los 18 *Must* estén cerrados y probados, que
   * es la condición explícita de DP-008. Es también la salida de emergencia si
   * el tiempo no alcanza: se entrega sin activarla, sin deshacer trabajo.
   */
  IA_REPORTE: false,
} as const;

export type Bandera = keyof typeof BANDERAS;
