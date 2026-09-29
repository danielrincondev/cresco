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

## 2. La build 1.1.0 del 28 de septiembre — por comprobar en el teléfono

**Estado:** construido el 28 de septiembre; va en las builds "General" y
"Beta" de la **versión 1.1.0**. Cada punto se borra de aquí cuando
pasa su comprobación en el teléfono.

**Por qué 1.1.0 y no 1.0.0.** Esta build trae módulos nativos que la anterior
no tiene. `runtimeVersion` sigue a la versión de la app, así que las
actualizaciones por el aire que se publiquen desde este código solo llegan a
la 1.1.0: una instalación vieja no recibe un JavaScript que pida módulos que no
tiene (y que la cerraría al abrir). La 1.0.0 se queda con la última que
recibió, la del modo oscuro. **Hay que instalar la 1.1.0 en cada teléfono de
prueba.**

| Qué | Cómo quedó | Cómo se comprueba |
|---|---|---|
| Avisos de `expo-doctor` | `npx expo-doctor` pasa 21 de 21: los nueve paquetes al parche que pide el SDK 57 (`react-native-google-mobile-ads` sigue en 17.0.0) y el splash configurado con `expo-splash-screen`, que ni estaba instalado | Abrir la app desde cerrada: el logo sobre fondo celeste, y después la app como siempre |
| Lo nativo sigue al tema (DP-014) | `expo-system-ui` pinta el fondo nativo con el de la paleta, y `userInterfaceStyle: "automatic"` más `Appearance.setColorScheme` hacen que la barra del sistema siga **el tema de la app**, no el del teléfono | Ajustes → Apariencia → Oscuro: la app se reinicia oscura y la barra de navegación de Android también. Con el teléfono en modo oscuro y la app en Claro, todo queda claro |
| «Como el teléfono» | Tercera opción en Ajustes → Apariencia. Se decide al abrir la app: un cambio del sistema con la app abierta se aplica la próxima vez | Elegirla con el teléfono en oscuro: la app queda oscura. Pasar el teléfono a claro, cerrar y abrir la app: queda clara |
| Abrir el menú deslizando (issue #101) | `PanResponder` del núcleo, sin librería nueva: desde el borde izquierdo hacia la derecha abre; sobre el menú, hacia la izquierda cierra. Solo gestos horizontales: tocar y desplazar la lista funcionan igual | Deslizar desde el borde izquierdo hacia la derecha donde está la hamburguesa. Con navegación por gestos, empezar un dedo más adentro (el borde es el "atrás" de Android) |
| El botón responde al dedo (issue #101) | Se hunde un 3 % en 120 ms al pulsarlo, con el `Animated` del núcleo y el driver nativo. Con "quitar animaciones" de Android no se mueve | Mantener pulsado cualquier botón: se hunde un poco y vuelve al soltar |
| Fuente de iconos recortada (#84) | `scripts/generar-iconos.py` deja solo los 42 glifos que usa la app: de 1.277 KB a 6 KB. El paquete de la app baja de 6,64 a 5,24 MB. Un icono fuera del recorte no compila | Recorrer las pantallas: todos los iconos iguales que antes (barra de abajo, menú, campana, calendarios) |

**Apareció en el camino y quedó resuelto:** el botón "Eliminar curso" de la
confirmación tenía el texto rojo oscuro sobre el azul de marca (1,5:1, casi no
se leía). Un botón con tono que no es secundario ahora va relleno de su tono.

**Lo que sigue claro a propósito:** la pantalla de arranque. Android la pinta
antes de que corra la app, así que no puede saber el tema elegido en Ajustes;
una versión oscura del splash seguiría al *teléfono* y chocaría con quien
tiene el teléfono oscuro y la app clara.

---

## Al hacer la tanda

1. Instalar las dependencias nativas de todos los puntos de arriba de una vez.
2. Reconstruir **"Beta"** (perfil `development`) y **"General"** (perfil
   `preview`). Las dos llevan los mismos módulos nativos: una "Beta" vieja
   con el JavaScript nuevo de Metro se cierra al abrir. "General" no puede
   mostrar la compra real ni el anuncio con la clave `test_` de RevenueCat
   (ver `docs/04-guias/integracion-revenuecat.md`).
3. Si la tanda agrega o actualiza un módulo nativo, subir la versión de la app
   (`app.json`), para que las actualizaciones por el aire no lleguen a las
   builds anteriores.
4. Borrar de este documento cada punto que quede hecho.

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
