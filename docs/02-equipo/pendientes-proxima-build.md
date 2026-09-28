# Pendientes que esperan la próxima build de EAS

> **Estado:** Abierto · **Dueño:** Persona C · **Creado:** 2026-09-27

Casi todo lo que cambia en Cresco llega al teléfono sin reinstalar nada: un
cambio de `convex/` se despliega con `npx convex dev --once`, y uno de
`movil/src/` lo toma la build "Beta" por Metro. Lo que **no** llega así es
cualquier cosa que agregue o actualice un **módulo nativo**. Eso exige una
build nueva de EAS: una hora de espera y reinstalar la app en cada teléfono de
prueba.

Por eso esas tareas se juntan aquí y se hacen **en una sola tanda**, con una
sola build, en vez de reconstruir por cada una.

**Regla para agregar algo:** la lista principal es solo para lo que de verdad
necesita build nueva (dependencia nativa nueva o actualizada, cambio de
`app.json` que toca permisos o plugins, ícono o splash). Al final hay una
sección aparte para lo que se aceptó y se dejó para después **sin** depender
de la build, para que no se confunda con lo que sí la espera.

---

## 1. Informe imprimible del reporte acumulado (representante)

**Estado:** construido el 27 de septiembre (commit `914a1d6`) e incluido en
las builds "Beta" y "General" de ese día. Falta la prueba en el teléfono con
las dos cuentas (ver "Cuándo está terminado"); cuando pase, se borra de aquí.

**Qué:** un PDF del reporte acumulado del parcial, listo para compartir por
WhatsApp.

**Lo que el muro de pago ya promete, y que esto tiene que cumplir tal cual.**
Decisión de Kenny del 27 de septiembre: el texto del muro de pago **no se
cambia**, porque esta tanda lo vuelve cierto. Por eso este punto solo está
terminado cuando se cumplen las dos promesas como están escritas hoy en
`PaywallScreen.tsx` (`limitesLegibles`, que las arma con `limites.exportarPdf`
de los planes de `semillas.ts`):

| Plan | Lo que dice el muro de pago | Lo que tiene que pasar |
|---|---|---|
| Gratuito (`CON_ANUNCIO`) | "Informe imprimible viendo un anuncio" | Mira un anuncio con premio y obtiene el PDF |
| Premium (`LIBRE`) | "Informe imprimible cuando llegue" | Obtiene el PDF directo, sin anuncio. Al terminar, el texto pasa a "Informe imprimible": ya llegó |

Hasta que la build nueva esté instalada, en el teléfono donde se muestre la
app esas dos líneas prometen algo que ahí todavía no existe.

**Lo que ya está hecho**

- El recurso `EXPORTAR_PDF_ACUMULADO` (`RECURSO_DESBLOQUEABLE` en `enums.ts`) y
  la tabla `desbloqueoRecompensado` (`otorgadoEn`, `expiraEn`, `consumidoEn`),
  **sin ningún productor todavía**.
- `react-native-google-mobile-ads` 17.0.0 ya trae `RewardedAd`, el anuncio con
  premio. No hace falta otro SDK de anuncios.
- `react-native-purchases` 10.9.1 ya trae `Purchases.adTracker` (el banner lo
  usa) y la verificación de recompensas de RevenueCat
  (`generateRewardVerificationToken` y `pollRewardVerification`, implementadas
  también en Android). Ver el riesgo aceptado, al final de este punto.

**Parte 1 — sin build: se puede adelantar y dejar probada antes de la tanda**

1. `prepararInforme({ estudianteId })` en `conducta.ts`. Es una mutation y no
   una query, porque consume el desbloqueo y deja auditoría:
   - `exigirVinculo`.
   - Premium vigente (la misma regla que `reportesAnteriores`: entitlement
     `premium` con `tieneAccesoVigente`): sigue.
   - Gratuito: exige un `desbloqueoRecompensado` del perfil para
     `EXPORTAR_PDF_ACUMULADO`, sin `consumidoEn` y con `expiraEn` en el futuro,
     y lo marca consumido. Sin eso, error `SIN_DESBLOQUEO`: "Mira el anuncio
     para desbloquear el informe".
   - Registra `EXPORTAR` en la auditoría. DP-006 lo dejó para la v2 porque
     nada exportaba; esto sí saca de la aplicación datos de un menor.
   - Devuelve lo mismo que `reporteAcumulado` (parcial, puntaje, franja,
     bitácora), más el estudiante, el curso, el docente y la fecha de
     generación.
2. `otorgarDesbloqueo({ recurso })`: crea el desbloqueo con una vigencia corta
   (30 minutos, como constante nueva). Lo llama la app cuando el anuncio avisa
   que se ganó el premio.
3. `src/lib/informe.ts`: una función pura que arma el HTML del informe con esos
   datos, con la advertencia de DP-009 al pie: no reemplaza el expediente del
   plantel.
4. Pruebas: Premium sin desbloqueo; gratuito con y sin desbloqueo; desbloqueo
   vencido; un desbloqueo no sirve dos veces; una familia no exporta el
   informe de un hijo ajeno; el HTML.

**Parte 2 — con build**

5. `npx expo install expo-print expo-sharing`, que elige las versiones de
   Expo SDK 57. Son los dos módulos nativos que obligan a la build.
6. En `ReporteAcumulado`, un botón "Informe imprimible (PDF)":
   - Premium: `prepararInforme` → `Print.printToFileAsync({ html })` →
     `Sharing.shareAsync(uri, { mimeType: "application/pdf" })`.
   - Gratuito: `RewardedAd` con el ID de prueba de Google para anuncios con
     premio en Android (`ca-app-pub-3940256099942544/5224354917`) hasta tener
     cuenta de AdMob. Con `RewardedAdEventType.EARNED_REWARD`, llama a
     `otorgarDesbloqueo` y sigue igual que Premium. Se reporta a RevenueCat con
     `Purchases.adTracker`, como el banner, con `adFormat: "rewarded"`.
7. En `limitesLegibles`, "Informe imprimible cuando llegue" pasa a decir
   "Informe imprimible".

**Cuándo está terminado:** en la build "Beta", con dos cuentas. La gratuita ve
el anuncio, obtiene el PDF, y una segunda exportación le pide otro anuncio. La
Premium obtiene el PDF directo, sin anuncio. El PDF se abre y se comparte por
WhatsApp.

**Riesgo aceptado, y cómo cerrarlo después:** así, una app modificada podría
llamar a `otorgarDesbloqueo` sin haber visto el anuncio; lo que se llevaría es
un PDF gratis. Lo cierra la verificación de recompensas de RevenueCat:
`generateRewardVerificationToken` antes de mostrar el anuncio,
`pollRewardVerification` al terminar, y el desbloqueo solo si RevenueCat
confirma. Necesita la verificación del lado del servidor (SSV) configurada en
una unidad de anuncio propia en la consola de AdMob, así que espera a que el
proyecto tenga su cuenta: en los ID de prueba de Google no hay dónde
configurarla.

**Relación con DP-009:** DP-009 difiere a la v2 el informe imprimible **del
docente** (la carpeta de evidencia para el distrito). Este es el del
**representante**, que es otro documento y otra audiencia, pero el generador
del PDF sirve para los dos. Vale la advertencia de DP-009: nada de este
informe debe dar a entender que reemplaza el expediente en papel del plantel.

---

## 2. Lo que marca `expo-doctor` — después del Shipaton

**Estado:** anotado el 28 de septiembre, en la revisión general del repo.
`npx expo-doctor` pasa 19 de 21 comprobaciones. Las dos que fallan no rompen
nada hoy (la build del 27 de septiembre funciona), pero las dos exigen build
nueva y reinstalar en cada teléfono de prueba, así que **no se tocan antes de
enviar**: una build a última hora es el riesgo, no el arreglo.

- **`splash` en `app.json`.** El esquema de configuración de Expo SDK 57 ya no
  acepta la clave `splash` en la raíz; la pantalla de arranque se configura con
  el plugin `expo-splash-screen`. Moverla ahí, con la misma imagen y el mismo
  fondo (`#EBF4FA`).
- **Nueve paquetes con un parche por detrás** de lo que pide el SDK 57: `expo`
  57.0.13 → ~57.0.25, `react-native` 0.86.2 → 0.86.3, y `expo-auth-session`,
  `expo-crypto`, `expo-dev-client`, `expo-font`, `expo-secure-store`,
  `expo-updates` y `expo-web-browser`. Se actualizan todos juntos con
  `npx expo install --check`, **sin** tocar `react-native-google-mobile-ads`,
  que sigue fijado en 17.0.0 por el issue #903 de ese paquete.

**Cuándo está terminado:** `npx expo-doctor` pasa las 21, la build nueva
arranca con el splash de siempre, y las pruebas de siempre en el teléfono
(sesión, reporte del día, compra en "Beta", avisos) siguen pasando.

---

## 3. Que lo nativo también se oscurezca (DP-014)

**Estado:** anotado el 28 de septiembre. El modo oscuro ya funciona en
todas las pantallas y llegó por el aire; lo que no alcanza es lo que
pinta Android por su cuenta.

**Qué:** con el modo oscuro encendido, hoy siguen claros la pantalla de
arranque, el fondo nativo que asoma un instante al abrir la aplicación y
los diálogos del sistema.

**Cómo:**

- `npx expo install expo-system-ui`, y al arrancar
  `SystemUI.setBackgroundColorAsync(Superficie.fondo)`.
- `userInterfaceStyle` de `"light"` a `"automatic"` en `app.json`, para que
  los diálogos sigan al tema. Revisar entonces que en modo claro no cambie
  nada.
- Con eso, ofrecer en Ajustes una tercera opción, «Como el teléfono».

**Cuándo está terminado:** con el modo oscuro encendido, abrir la
aplicación no muestra ningún destello claro.

---

## Al hacer la tanda

1. Instalar las dependencias nativas de todos los puntos de arriba de una vez.
2. Reconstruir **"Beta"** (perfil `development`). Decidir en ese momento si
   también se reconstruye **"General"** (perfil `preview`). Esa build no puede
   mostrar la compra real ni el anuncio con la clave `test_` de RevenueCat (ver
   `docs/04-guias/integracion-revenuecat.md`), así que solo vale la pena si
   algo de la tanda se usa fuera de "Beta".
3. Borrar de este documento cada punto que quede hecho.

---

## Aceptado para después, sin build

Anotado aquí por decisión de Kenny el 27 de septiembre. No depende de la
build ni de una actualización por el aire: son datos en Convex, así que se
puede hacer en cualquier momento, sin reinstalar nada en ningún teléfono.

### Datos de demostración para grabar el video

**Qué:** cargar, **solo en el deployment de desarrollo** (`affable-robin-654`),
un curso con aspecto real. Unos veinte estudiantes con sus familias, una semana
de anotaciones, citas en cada estado (pedida, citación del docente,
confirmada, atendida con sus acuerdos, cancelada, no asistió), comunicados que
parte de las familias ya vio, y el resumen de la semana.

**Por qué:** que el video muestre pantallas llenas en vez de listas vacías, y
que se vea todo lo construido esta semana. Hoy no existe nada parecido:
`semillas.cargar` solo carga catálogos (franjas, categorías, planes).

**Cómo:** una `internalMutation` aparte, por ejemplo en `convex/demo.ts`, que se
corre con `npx convex run` contra desarrollo. Nunca contra producción
(`merry-dolphin-269`). Los datos tienen que poder distinguirse de los reales,
por el mismo motivo que `esSandbox` en las suscripciones (ADR-008).

**Ojo con el calendario:** solo sirve si está **antes de grabar**. Si la build
nueva llega después del video, conviene hacer esto por separado y no esperarla.
