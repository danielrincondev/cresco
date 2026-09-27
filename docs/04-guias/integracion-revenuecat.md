# Development build y RevenueCat

> **Estado:** Vigente · **Dueño:** Persona C · **Última revisión:** 2026-09-06

Por qué existe este documento: **RevenueCat es requisito obligatorio del
Shipaton**, y `react-native-purchases` es un módulo nativo — **no funciona en
Expo Go**. Sin un development build no se puede probar ni una sola compra, así
que esto está en la ruta crítica de la entrega.

---

## 1. El development build (issue #14)

`movil/eas.json` ya está escrito, con tres perfiles:

| Perfil | Para qué | Formato |
|---|---|---|
| `development` | El día a día. Trae el cliente de desarrollo, así que recarga el código sin reconstruir | APK |
| `preview` | Pasarle la app a alguien para que la pruebe, o grabar el video | APK |
| `production` | La entrega final | AAB |

### Pasos

```bash
cd movil
npx eas login          # requiere la cuenta de Expo del issue #12
npx eas build:configure
npx eas build --profile development --platform android
```

La build corre en los servidores de Expo y devuelve un enlace de descarga.
Se instala el APK en el teléfono **una sola vez**: a partir de ahí, `npm run
dev` recarga el código sin reconstruir nada.

### Las variables de entorno, que es donde se atasca todo el mundo

Localmente las variables vienen del vault por varlock. **En una build de EAS
no**: la build corre en un servidor de Expo que no tiene tu `.env.local` ni tu
token de Bitwarden.

Las variables `EXPO_PUBLIC_*` **se hornean dentro del bundle** en el momento de
construir, así que tienen que estar disponibles ahí:

```bash
npx eas env:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "<valor>" --environment development
npx eas env:create --name EXPO_PUBLIC_CONVEX_URL --value "<valor>" --environment development
```

Los valores salen del vault de Bitwarden (proyecto `cresco-dev`).

> **Por qué `eas.json` no las trae escritas:** si se ponen ahí con valor vacío,
> sobreescriben lo que venga de cualquier otro lado y la app arranca sin
> configuración, fallando de una forma difícil de rastrear. Es preferible que
> la build falle diciendo que falta la variable.

---

## 2. RevenueCat en la aplicación

### Antes de tocar código

El panel tiene que estar completo (issue #13): los 3 productos, los 2
entitlements, **los dos offerings** y el webhook. Si los productos no están
dentro de un package de un offering, `getOfferings()` devuelve vacío y el error
no dice por qué — es la trampa más común de RevenueCat.

### El orden de arranque, que no se puede invertir

```
Clerk autentica  →  se busca o crea el perfilUsuario  →  Purchases.logIn(perfilUsuario._id)
```

**`Purchases.logIn()` recibe `perfilUsuario._id`, nunca el id de Clerk.**

Si se invierte, RevenueCat registra las compras contra una identidad que no
controlamos, y cambiar de proveedor de autenticación deja de ser un cambio de
código para convertirse en una migración de datos de pago. Es la decisión del
identificador canónico (`Contexto/CONTEXT.md` §4), y es de las pocas cosas de
este proyecto que son caras de deshacer.

### Los dos offerings

Un docente nunca debe ver el plan del representante:

```ts
const offerings = await Purchases.getOfferings();
offerings.current           // representante → pantalla P11
offerings.all["docente"]    // docente       → pantalla D19
```

Van separados porque RevenueCat solo admite un producto por tipo de package
dentro de un mismo offering, y `REP_PREMIUM_MENSUAL` y `DOC_PRO` son ambos
mensuales: en un solo offering chocarían.

### El webhook ya está escrito

`convex/http.ts` y `convex/suscripciones.ts` están implementados y probados.
Lo único que falta es conectarlos:

- URL en el panel de RevenueCat, con el dominio terminado en **`.site`**, no
  `.cloud`: `https://<despliegue>.convex.site/webhooks/revenuecat`
- El mismo secreto en el despliegue:
  `npx convex env set REVENUECAT_WEBHOOK_SECRET "<secreto>"`

Con `.cloud` el webhook responde 404, RevenueCat reintenta 5 veces y **pierde
el evento**. Las `httpAction` de Convex se sirven en el dominio `.site`.

### El SDK en el teléfono

Desde el PR del SDK, la aplicación **puede cobrar**. Lo que falta para que
funcione de verdad:

1. **La clave pública de Android** del panel: *Project settings → API keys*.
   Con ADR-008 usamos el **Test Store**, así que empieza por `test_`; la de
   producción empieza por `goog_`. Se pone en `movil/.env.local`:

   ```
   EXPO_PUBLIC_REVENUECAT_API_KEY=test_xxx
   ```

   Es pública por diseño —viaja dentro del APK— y no autoriza nada por sí sola.

   > ### ⚠️ Una clave `test_` cierra la aplicación en una build de release
   >
   > Comprobado el 25 de septiembre, tres de tres veces: al abrir "Tu plan" en
   > la APK de `preview`, el SDK enseña un diálogo —*«This app is using a test
   > API key… The app will close now to protect the security of test
   > purchases»*— y **termina el proceso**. No es un error que se pueda
   > capturar: para cuando responde, no hay proceso al que volver.
   >
   > Lo hace a propósito, para que nadie publique en una tienda con una clave
   > de pruebas. Y el perfil `preview` de EAS **es** release: no lleva
   > `developmentClient`.
   >
   > `src/lib/compras.ts` lo detecta y no llama a `configure` en ese caso, así
   > que la aplicación ya no se cierra — pero tampoco puede cobrar. **Para
   > demostrar una compra hace falta una build del perfil `development`**, que
   > sí es depurable. Es la única forma de grabar el video con una compra real
   > sin tramitar Google Play Console, que es justo lo que ADR-007 evitó.

2. **Una build nueva.** `react-native-purchases` es un módulo **nativo**: no
   existe en Expo Go ni en una build anterior a su instalación. Hace falta una
   `development` o `preview` recién construida.

**El `appUserID` es el `perfilUsuarioId` de Convex**, y eso no es un detalle:
el webhook resuelve a quién pertenece un cobro con
`ctx.db.get(evento.app_user_id)`. Si el SDK usara su identificador anónimo,
ningún pago se aplicaría jamás — el evento llegaría, se guardaría, y fallaría
al buscar el perfil. Es el contrato entre las dos mitades.

**Sin la clave la aplicación funciona igual que antes**: los planes se ven, no
aparece ningún botón de compra, y el aviso dice que todavía no está disponible.
Nadie se encuentra la app rota por una variable que falta.

### Revisar los pagos que no se aplicaron

El webhook responde **200 aunque el evento no se pueda aplicar**, y lo hace a
propósito: el evento ya está guardado, reintentarlo no lo arreglaría, y que
RevenueCat lo dé por perdido sí duele. El fallo queda en
`eventoRevenuecat.errorProcesamiento`.

Pero una fila ahí es **alguien que pagó y puede no tener su plan**. Hay dos
formas de verlo, y conviene usar las dos:

- En el log de Convex sale al instante como
  `[revenuecat] evento <id> (<tipo>) guardado sin aplicar: <motivo>`.
- Para revisar en bloque —por ejemplo al cerrar un día de cobros—:

  ```
  npx convex run suscripciones:eventosSinAplicar
  ```

  Devuelve `{ total, sinAplicar, eventos }`, con el más reciente primero y el
  motivo de cada uno.

Los dos motivos que más van a salir son el producto que no coincide (`No hay
ningún plan con productoGooglePlay = "..."`, casi siempre un identificador mal
escrito en el panel) y el usuario que no existe. Los dos se arreglan y el
evento se puede reaplicar a mano.

### Una regla de negocio que el código ya respeta

`CANCELLATION` **no** significa que el acceso terminó: la suscripción sigue
vigente hasta `expiraEn`. Está implementado en `tieneAccesoVigente()` y tiene
prueba. Si alguien construye la pantalla del paywall asumiendo lo contrario, le
va a quitar el premium a alguien que todavía pagó por él.

---

## 3. Para el video de entrega

El Test Store permite demostrar una compra completa sin cuenta de Google Play
(ADR-008). El flujo que conviene grabar es el corto: paywall → compra →
la función desbloqueada.

> **Corrección del 26 de septiembre:** esta sección decía "con `preview`
> alcanza". Ya no es cierto — es justo lo que el aviso de la §1 corrigió. Con
> `preview` el botón de compra ni siquiera aparece (`src/lib/compras.ts` lo
> bloquea a propósito, para evitar el cierre forzado). **Hace falta un build
> del perfil `development`**, conectado a `npm run dev`, para que la clave de
> prueba sea legítima y la compra se pueda completar de verdad.

No hace falta `production` en ningún caso.
