# ADR-007 — Entrega sin publicación en tienda, con repositorio abierto

**Fecha:** 2026-08-08 · **Estado:** Aceptado

> Reemplaza la consecuencia de **ADR-002** que anticipaba subir un build a un
> canal de pruebas internas de Play Console e iniciar el trámite en la semana 2.
> La decisión original de ADR-002 sobre Next.js fue reemplazada el 2026-08-16.

## Contexto

Cuando se escribieron los ADR-001 a 006 no se habían verificado las reglas
oficiales del RevenueCat Shipaton 2026. Se asumió el modelo de las categorías
generales: publicar la app en Google Play y demostrar una compra real. De ahí
salieron dos consecuencias que se dieron por hechas: tramitar una cuenta de
Google Play Console (con su cuota de registro) y mantener el repositorio
privado.

Verificadas las reglas de la categoría **Next Gen** —la única en la que
competimos— el modelo de entrega es otro
(`Contexto/reglas-shipaton-next-gen.md`). Cita textual:

> "En lugar de publicar tu aplicación en la App Store, envía un video de
> demostración y un enlace a tu repositorio de código abierto público,
> incluyendo un archivo de licencia de código abierto. **No se requiere una
> cuenta de desarrollador de Apple o Google ni una publicación en la tienda.**"

## Decisión

1. **No se tramita cuenta de Google Play Console** ni se publica en ninguna
   tienda durante el hackathon.
2. La entrega se sostiene en dos piezas: un **video de demostración de menos de
   2 minutos** y el **repositorio público de código abierto**.
3. El repositorio se licencia bajo **AGPL-3.0** (`LICENSE` en la raíz, texto
   canónico de la FSF sin modificar). Neofix conserva el copyright y puede
   licenciar en paralelo en términos comerciales.
4. El repositorio arranca **privado** y se hace público antes de enviar.

## Consecuencias

- **Desaparece el mayor riesgo externo del proyecto.** Era el único elemento
  cuyo tiempo no dependía de la velocidad del equipo. Persona C recupera la
  semana 1 completa.
- **Queda una incógnita abierta, y es de Persona C:** cómo demostrar RevenueCat
  funcionando sin una app publicada. RevenueCat ofrece mecanismos de prueba que
  no dependen de la tienda, pero hay que confirmar en su documentación oficial
  cuál aplica y si `getOfferings()` devuelve datos en ese modo. **Si resultara
  que sí hace falta una app en Play Console para mostrar una compra real, este
  ADR se revisa y el trámite vuelve a la lista el mismo día.**
- **El repositorio pasa a ser objeto de evaluación**, no un anexo: el criterio 4
  del jurado mide decisiones técnicas y cuidado en la construcción. Los ADR, la
  matriz de permisos y el contrato de API puntúan directamente.
- **Todo lo que se commitea será público.** Nunca claves, `.env`, keystore ni
  datos reales de estudiantes — ni siquiera de forma temporal, porque el
  historial de Git conserva lo borrado.
- El `LICENSE` no se edita nunca: GitHub solo reconoce la licencia si el archivo
  contiene el texto íntegro. El aviso de copyright y la nota de licenciamiento
  comercial van en el `README.md`.
