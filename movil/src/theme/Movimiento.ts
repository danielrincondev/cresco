/**
 * Movimiento: la parte del sistema de diseño que faltaba.
 *
 * Hasta hoy la aplicación no tenía **una sola animación**. Nada se movía, así
 * que nada se sentía vivo: cada pantalla aparecía de golpe, ya terminada, como
 * un formulario impreso. Esto son los tokens que faltaban, con la misma regla
 * que el resto del tema — **ningún número mágico fuera de este archivo**.
 *
 * ## Qué clase de movimiento quiere esta aplicación
 *
 * No el de una app de fitness. Las restricciones del producto ya dicen qué
 * clase de movimiento cabe aquí:
 *
 *  · El docente la usa **de pie, con una mano**, con 30 niños haciendo ruido.
 *    Una animación que le haga esperar le está robando tiempo de clase.
 *  · El representante abre la aplicación para leer **una noticia sobre su
 *    hijo**, que a veces es mala. Un rebote alegre al enseñar una sanción es
 *    una falta de tacto.
 *  · Entre los representantes hay abuelos, y el piloto es en un plantel fiscal
 *    con teléfonos de gama baja.
 *
 * De ahí sale todo lo de abajo: **entradas cortas, nada que rebote, nada que
 * bloquee**. El movimiento aquí sirve para explicar de dónde viene una cosa y
 * para que la espera no se sienta muerta. Nunca para lucirse.
 *
 * ## La regla que no se negocia
 *
 * Todo lo que se mueva tiene que respetar `useReduceMotion()`. No es un
 * detalle de accesibilidad opcional: para quien tiene trastorno vestibular, el
 * movimiento de una interfaz produce mareo real. Y como la app ya cuida el
 * contraste por el sol del patio y el cuerpo de 16 por los abuelos, sería
 * incoherente cuidar todo eso y luego marear a alguien con una transición.
 *
 * ## Por qué el driver nativo importa aquí más que en otros proyectos
 *
 * `useNativeDriver: true` manda la animación al hilo de interfaz, así que
 * sigue siendo fluida aunque JavaScript esté ocupado. Eso solo funciona con
 * `opacity` y `transform` — por eso todo lo de este módulo se anima con esas
 * dos y nunca con `width`, `height` ni `backgroundColor`. En un teléfono de
 * gama baja la diferencia no es sutil.
 */

import { Easing } from "react-native";

/**
 * Duraciones, en milisegundos.
 *
 * El techo es 480. Por encima de medio segundo una transición deja de leerse
 * como respuesta del sistema y empieza a leerse como lentitud.
 */
export const Duracion = {
  /** Respuesta al dedo: pulsar un botón. Tiene que sentirse instantáneo. */
  instantanea: 120,
  /** Algo pequeño aparece o cambia: un chip, un mensaje de error. */
  rapida: 200,
  /** La entrada estándar de una tarjeta o una sección. */
  base: 320,
  /** Solo para lo que ocupa la pantalla entera. */
  lenta: 480,
  /** Un ciclo completo del latido del esqueleto de carga. */
  esqueleto: 1100,
} as const;

/**
 * Cuánto sube una cosa al entrar, en píxeles.
 *
 * Corto a propósito. Un desplazamiento largo convierte una entrada en un
 * viaje, y con seis tarjetas en pantalla eso es un carrusel involuntario.
 */
export const Desplazamiento = {
  /** Chips y elementos pequeños. */
  sutil: 6,
  /** Tarjetas y secciones. */
  base: 12,
} as const;

/**
 * Retraso entre hermanos consecutivos de una lista, en milisegundos.
 *
 * Es lo que hace que una lista se lea como una lista y no como un bloque: el
 * ojo sigue el orden. 55 ms es el punto donde se percibe la secuencia sin que
 * el último elemento llegue tarde.
 */
export const ESCALONADO = 55;

/**
 * Tope de elementos escalonados.
 *
 * Con 40 nombres en la pantalla del docente, escalonarlos todos haría que el
 * último entrara 2,2 segundos después del primero. Pasado este tope todos
 * entran a la vez: la gracia del escalonado es la cabecera de la lista, no la
 * cola.
 */
export const MAXIMO_ESCALONADO = 8;

/**
 * Curvas.
 *
 * `entrada` desacelera al final: la cosa llega y se posa. Es la curva de casi
 * todo. `salida` acelera: lo que se va, se va sin hacerse notar. Ninguna de
 * las dos rebota, y eso es deliberado — un rebote es alegre, y esta aplicación
 * da noticias que a veces no lo son.
 */
export const Curva = {
  entrada: Easing.out(Easing.cubic),
  salida: Easing.in(Easing.quad),
  /** Simétrica, para lo que va y vuelve: el latido del esqueleto. */
  latido: Easing.inOut(Easing.quad),
} as const;

export default { Duracion, Desplazamiento, ESCALONADO, MAXIMO_ESCALONADO, Curva };
