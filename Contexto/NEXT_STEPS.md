# NEXT_STEPS.md — Por dónde continuar

Estado al 8 de agosto de 2026. Proyecto **Cresco**, equipo **Neofix**. El usuario
es **Persona C** (citas, inconformidades, alertas, RevenueCat, notificaciones,
CI, despliegue).

> **Calendario reiniciado.** La semana 1 real empieza **mañana, domingo 9 de
> agosto** (no el 4, como decía el plan original — ver `DECISIONS.md`). Todas
> las fechas de este documento ya están recalculadas sobre ese nuevo inicio.

**El código de la aplicación no existe todavía.** Lo que existe es el esquema de
datos, el contrato de API y la documentación.

---

## Paso 0 — Organizar el repositorio (antes que nada)

Estructura actual, ya verificada:

```
cresco/
├── Contexto/{CLAUDE,CONTEXT,DECISIONS,NEXT_STEPS,reglas-shipaton-next-gen}.md
├── README.md · LICENSE · .gitignore · .env.example
├── package.json · package-lock.json · drizzle.config.ts · tsconfig.json
├── api/openapi.yaml
├── db/
│   ├── schema/{enums,nucleo,conducta,interaccion,index}.ts
│   ├── migrations/0000_cresco_inicial.sql
│   ├── seeds/               ← vacía
│   └── acceso/              ← vacía (la llena Persona A)
├── servidor/                ← NACE el día 1 con `npx create-next-app`.
│                                La crea Persona C (decisión S6). NO la
│                                crees a mano ni por adelantado (S3).
│   └── lib/puntaje.ts       ← de Persona B, una vez exista la carpeta
├── movil/                   ← NACE el día 1 con `npx create-expo-app`,
│                                también la crea Persona C, mismo día.
│   ├── theme/Theme.ts       ← de Persona A
│   └── components/base/     ← de Persona A
└── docs/
    ├── README.md
    ├── 00-producto/
    ├── 01-arquitectura/{adr/, matriz-permisos.md}
    ├── 02-equipo/
    ├── 03-piloto/firmados/.gitkeep
    ├── 04-guias/
    └── 05-validacion/
```

`servidor/` y `movil/` tendrán **cada uno su propio `package.json`**, generado
por su propio scaffolding — independiente del `package.json` de la raíz, que
sigue siendo solo para `db/schema/` y Drizzle. No hay `npm workspaces`: es la
forma más simple de tener dos proyectos sin adoptar herramientas de monorepo
(decisión S4 en `DECISIONS.md`).

Verificaciones al terminar — **todas ejecutadas y en verde el 8 de agosto de
2026**, con Node.js 24.19.0 LTS y npm 11.17.0:

| Comprobación | Resultado |
|---|---|
| `npm install` | ✅ 36 paquetes, sin errores |
| `npm run typecheck` | ✅ salida limpia, exit 0 |
| `npm run db:generate` dos veces seguidas | ✅ la segunda dice *"No schema changes, nothing to migrate"* |
| Migración `0000_cresco_inicial.sql` | ✅ 41 tablas, 57 CHECK, 41 índices |

Las versiones del `package.json` **ya no son una suposición**: se instalaron y
quedaron fijadas en `package-lock.json`, que **se versiona** (no está en
`.gitignore`). Quien clone debe usar `npm ci` para obtener exactamente estas:

```
drizzle-orm 0.44.7 · drizzle-kit 0.31.10 · typescript 5.9.3 · tsx 4.23.11
pg 8.22.0 · dotenv 17.4.2 · @types/node 24.13.3 · @types/pg 8.21.0
```

Además:
- **El primer commit es el `.gitignore` solo**, antes de cualquier otro archivo.
  Hoy el repositorio no tiene ningún commit.
- El repositorio arranca **privado** y se hace público antes de enviar. El
  `LICENSE` (AGPL-3.0) ya está en la raíz.

---

## Paso 0-bis — Correcciones E1 y E2 al esquema: **ya aplicadas**

Las decisiones **E1, E2 y E3** de `DECISIONS.md` decían que las dos correcciones
a `db/schema/nucleo.ts` se aplicaran *antes del primer commit del esquema*. Como
el repositorio todavía no tiene commits y no existe ninguna base de datos en
ninguna parte, **se aplicaron y se verificaron el 8 de agosto**. Persona A no
tiene que hacerlas: tiene que **no deshacerlas**.

Qué quedó en el esquema, y por qué:

| Decisión | Cambio | Verificado en el SQL |
|---|---|---|
| E1 | `matricula.fechaIngreso` y `asignacionDocente.vigenteDesde` pierden `.defaultNow()` | `"fecha_ingreso" date NOT NULL` — sin `DEFAULT now()` |
| E2 | `ux_estudiante_documento` pasa a índice único parcial | `... WHERE tipo_documento <> 'SIN_DOCUMENTO'` |
| E3 | Migración regenerada desde cero, no encadenada | `0000_cresco_inicial.sql`, 41 tablas / 57 CHECK |

Ambas columnas quedaron `NOT NULL` **sin default a propósito**: obligan a que el
servidor calcule la fecha con `REGLAS.ZONA_HORARIA` antes de insertar. Si alguien
ve un error de "null value in column fecha_ingreso", la respuesta correcta **no**
es devolver el `defaultNow()`, es pasar la fecha desde el servidor.

Queda un cambio de esquema pendiente, el técnico #9 de `CONTEXT.md`
(`dispositivo.plataforma`). Si el equipo lo aprueba, se aplica y se **regenera la
migración igual que aquí**: borrar `db/migrations/`, `npm run db:generate`, y
confirmar que la segunda ejecución no produce nada nuevo.

---

## Paso 1 — Ya resuelto

1. ~~Verificar los criterios de Next Gen~~ → hecho. Ver
   `reglas-shipaton-next-gen.md`. **Resultado: no hace falta Google Play
   Console.**
2. **Crear las cuentas:**
   - RevenueCat (gratuita) — sigue siendo obligatoria
   - Expo / EAS (gratuita) — sigue siendo obligatoria
   - ~~Google Play Console~~ → **ya no es necesaria.** Era el trámite más lento
     del proyecto y desapareció.
   - Devpost, **con correo académico**, los tres. Verificar antes que el dominio
     universitario esté en la lista JetBrains/swot.
3. Instalar Node.js 20+, Git y VS Code. Preparar un teléfono Android real con
   depuración por USB activada.

---

## Paso 2 — Semana 1 (9 al 15 de agosto) — Tareas de Persona C

Criterio de éxito de la fase: **la app abre en un teléfono real y
`Purchases.configure()` no lanza error.**

### Domingo 9 — Repositorio, CI, y scaffolding de las dos apps
- Proteger la rama `main`: nadie empuja directo, todo por PR con una aprobación.
- Crear `develop`.
- **Scaffoldear `servidor/`** (Next.js): `npx create-next-app servidor`.
  A lo necesita para instalar BetterAuth el martes 11 — dos días de margen.
- **Scaffoldear `movil/`** (Expo): `npx create-expo-app movil`. Esto lo
  desbloquea a ti mismo para mañana (development build) y a A para `theme/` y
  `components/base/` cuando lleguen las decisiones visuales.
- Montar GitHub Actions que en cada PR ejecute `npm run typecheck` y `npm test`.
- **Éxito:** un PR con un error de tipos no se puede fusionar, y existen
  `servidor/` y `movil/` con sus propios `package.json`.

### Lunes 10 — Development build de Expo
- Reservar el día completo; es el paso que más problemas da la primera vez.
- Dentro de `movil/`: `npx expo install expo-dev-client`
- `npx eas build --profile development --platform android`
- Instalar el resultado en el teléfono real.
- **Trampa conocida:** RevenueCat no funciona en Expo Go. Fallará con un error de
  módulo nativo no encontrado. No es un bug del código.
- **Éxito:** la app abre en el teléfono desde el development build.

### Martes 11 — RevenueCat en sandbox
- Crear el proyecto en RevenueCat.
- Dentro de `movil/`: `npx expo install react-native-purchases`
- Configurar al arrancar la app con la clave desde `.env`.
- Definir el entitlement `premium` y los cinco productos: `REP_FREE`,
  `REP_PREMIUM_MENSUAL`, `REP_PREMIUM_BIMESTRAL`, `DOC_FREE`, `DOC_PRO`.
- **Éxito:** `Purchases.getOfferings()` devuelve algo en un teléfono real.

### Miércoles 12 — Demostrar RevenueCat sin tienda

Next Gen no exige Google Play Console. Este día se dedica a cerrar la duda que
lo reemplaza:

- Confirmar en la documentación oficial de RevenueCat **qué modo de prueba
  aplica sin una app publicada**, y si `getOfferings()` devuelve datos en ese
  modo.
- Si resultara que sí hace falta una app en Play Console para mostrar una compra
  de verdad, **el trámite vuelve a la lista y se arranca ese mismo día**: es el
  único hallazgo que podría revivir el riesgo que ya eliminamos.
- Con el tiempo sobrante, adelantar el webhook de los días siguientes.

### Jueves 13 y viernes 14 — Webhook de RevenueCat
Crear `POST /webhooks/revenuecat` **dentro de `servidor/`**. Debe:
1. Verificar la firma de la petición.
2. Insertar en `evento_revenuecat` usando `evento_id_externo`.
3. Si el identificador ya existe → responder `200` sin hacer nada más.
4. Si es nuevo → actualizar `suscripcion` y marcar `procesado_en`.

### Sábado 15 — Colchón / verificación de cierre de semana
Sin tarea nueva asignada. Úsalo para lo que se haya corrido de los días
anteriores, o para confirmar el criterio de éxito de la fase completa.

---

## Paso 3 — Semanas 2 a 6 de Persona C

| Semana | Fechas | Trabajo | Éxito |
|---|---|---|---|
| 2 | 16–22 ago | P1 registro del representante, P11 paywall, notificaciones push (`expo-notifications`, guardar token en `dispositivo`) | Llega una notificación push a un teléfono real y se completa una compra de prueba en sandbox |
| 3 | 23–29 ago | D19 paywall del docente, función `verificarLimite()` que lee `plan.limites`. **Coordinar la firma con Persona A antes de escribir cada lado** | Un docente con `DOC_FREE` recibe `402 LIMITE_PLAN` al crear su segundo curso |
| 4 | 30 ago–5 sep | D17 alerta de emergencia con reautenticación, P10 confirmación de lectura | Una alerta llega a los representantes del curso y la confirmación se registra |
| 5 | 6–12 sep | D15 bandeja de inconformidades, D16 horario y citas, P7, P8. **Llamar la función de recálculo de Persona B, no reescribirla** | Un representante reclama, el docente resuelve como modificada y el puntaje sube |
| 6 | 13–19 sep | Trabajo conjunto: datos de demostración, video, build firmado, README verificado en máquina limpia | RevenueCat funcionando visiblemente en el video |

---

## Paso 4 — Pendientes del equipo que bloquean trabajo

Ordenados por urgencia. Ninguno es tarea de Claude Code por sí solo: requieren
decisión del usuario o de los tres.

1. **Datos semilla** (`db/seeds/`) — sin los tipos de acción con sus puntos, las
   seis franjas con sus frases, los cinco planes y una plantilla de reporte, nadie
   puede probar nada. Es lo primero que se necesita el domingo.
2. **Dirección visual.** El cuestionario ya está escrito
   (`docs/00-producto/cuestionario-direccion-visual.md`). Persona C entrega las
   respuestas la noche del 8 de agosto (~22:00). Produce `movil/theme/Theme.ts`
   y `movil/components/base/` con seis componentes: tarjeta, botón, campo, chip
   de estado, encabezado, estado vacío. Dueño del archivo: Persona A.
3. **Decidir el diferenciador del producto** (posible capa de IA para redactar el
   reporte). Si se adopta, condiciona la pantalla D13 desde la semana 3.
4. **Capa `db/acceso/` y políticas RLS** — las construye Persona A en la semana 1.
   Persona C depende de ellas para cualquier consulta sobre estudiantes.
5. **Texto del aviso de privacidad y del consentimiento**, con versión. Necesario
   antes de que Persona A construya la pantalla P3 en la semana 3.
6. **Elegir proveedor de hosting de PostgreSQL y dónde se despliega Next.**
7. **Conversación de validación con un profesor real.** Ya existen la presentación
   y el FAQ; no se han usado. El FAQ se corrigió el 7 de agosto: antes prometía
   dos representantes por estudiante y cuenta de profesor ilimitada, y ninguna de
   las dos cosas es cierta.
8. ~~Elegir la licencia de código abierto~~ → **hecho.** AGPL-3.0, `LICENSE` en la
   raíz. Falta solo hacer público el repositorio antes de enviar (semana 6) y
   confirmar que GitHub muestra "AGPL-3.0" en la sección *About*.
9. **Instalar Node.js 20+ (idealmente 24 LTS) en las tres máquinas.** La
   verificación del 8 de agosto se hizo con una copia portátil de Node 24.19.0
   que **no quedó instalada en el sistema**. Sin Node no se puede correr nada:
   ni `npm ci`, ni el CI del domingo, ni el development build de Expo. Es el
   primer bloqueo real de la semana 1 para Persona C.
10. ~~Dónde vive el código de aplicación~~ → **hecho.** `servidor/` (Next) y
    `movil/` (Expo), hermanas en la raíz, sin monorepo. Persona C las scaffoldea
    el domingo 9. Ver decisiones S1-S6 en `DECISIONS.md` y el árbol actualizado
    arriba en el Paso 0.

---

## Paso 5 — Después del 20 de septiembre

El deadline real es el **28 de septiembre**. Los ocho días de margen (antes
eran trece — ver el aviso de compresión en `DECISIONS.md`) se usan para:

- Implementar el diferenciador, si se decidió.
- Pulido visual: animaciones, microinteracciones, estados de carga.
- Prueba con un profesor real y corrección de lo que revele.
- Ensayo del video de demostración.

**No se usan para ampliar alcance.** Las 31 pantallas de la v1 ya son más de lo
que tres personas construyen cómodamente en seis semanas.

---

## Recordatorio permanente

RevenueCat es el único requisito cuyo fallo invalida todo el trabajo de los tres.
Si algo de RevenueCat se bloquea, se avisa al grupo **el mismo día**, no medio
día después: es un riesgo del proyecto entero, no solo de Persona C.
