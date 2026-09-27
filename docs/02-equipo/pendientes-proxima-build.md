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

**Qué:** un PDF del reporte acumulado del parcial, listo para compartir por
WhatsApp. En Premium se genera directo. En el plan gratis se desbloquea viendo
un anuncio con premio (*rewarded*).

**Por qué es urgente, aunque espere a la build:** el paywall **ya lo promete**.
`PaywallScreen.tsx` dice "Informe imprimible viendo un anuncio" (gratis) e
"Informe imprimible cuando llegue" (Premium), leyendo `limites.exportarPdf` de
los planes sembrados en `semillas.ts` (`CON_ANUNCIO` / `LIBRE`). Hoy esa
función no existe: quien abra el paywall ve una promesa vacía.

**Qué ya está hecho y qué falta:**

- Ya existe: el campo `exportarPdf` en los planes, y la tabla
  `desbloqueoRecompensado` en el esquema ("E6 / I2: exportar el PDF acumulado
  viendo un anuncio recompensado"), **sin ningún productor todavía**.
- Ya existe: `react-native-google-mobile-ads` (fijado en 17.0.0, ver la guía
  de RevenueCat), que también trae anuncios *rewarded*. No hace falta otro SDK
  de anuncios.
- Falta, **nativo**: `expo-print` para generar el PDF y `expo-sharing` para
  compartirlo. Estas dos son las que obligan a la build nueva.
- Falta, sin build: la consulta que arma el contenido del informe, la
  mutación que registra y consume el desbloqueo, y el botón en la pantalla del
  acumulado.

**Relación con DP-009:** DP-009 difiere a la v2 el informe imprimible **del
docente** (la carpeta de evidencia para el distrito). Este es el del
**representante**, que es otro documento y otra audiencia, pero el generador
del PDF sirve para los dos. Vale la advertencia de DP-009: nada de este
informe debe dar a entender que reemplaza el expediente en papel del plantel.

**Mientras no haya build:** si se graba el video o se presenta la app antes de
hacer esto, cambiar el texto del paywall para que no prometa lo que no existe.
Es un cambio de solo JS.

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
