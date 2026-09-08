# Contrato de núcleo para la interfaz

Funciones en `api.nucleo`. Esperar a que `useConvexAuth().isAuthenticated` sea
verdadero antes de consultarlas. La identidad se toma del JWT validado por
Convex; ninguna función acepta el id de otro usuario como identidad.

## Perfil — #28 y #29

1. Consultar `obtenerPerfil({})`. Devuelve `null` si falta el alta, o
   `{ perfilUsuarioId, docenteId, representanteId }`. Los dos últimos son ids
   o `null`; pueden existir ambos. El selector de vista es una decisión de UI,
   no una modificación de permisos.
2. Mostrar el formulario de documento y roles si falta el alta.
3. Llamar `completarPerfil({ tipoDocumento, numeroDocumento, telefono?, roles })`.
   Documento del adulto: `CEDULA` (10 dígitos) o `PASAPORTE` (3–30 caracteres
   alfanuméricos o guion). Es validación de formato, no verificación de identidad.
   `roles`: `["DOCENTE"]`, `["REPRESENTANTE"]` o ambos. Teléfono opcional;
   omitir si está vacío. Devuelve el mismo objeto que `obtenerPerfil`.
4. El docente ya puede llamar `crearCurso`, `definirPeriodos` y `listarCursos`.

Reintentar el alta no duplica registros. Añadir un rol conserva el otro. El alta
no cambia documentos ni permite apropiarse de otra cuenta por correo o cédula.
Un usuario con documento ya registrado en otra cuenta recibe `CONFLICTO`.

Los nuevos perfiles guardan `tokenIdentifier` (emisor + subject) en `authSubject`.
Los perfiles antiguos siguen resolviéndose **solo** si el emisor del JWT coincide
con `CLERK_JWT_ISSUER_DOMAIN`; al completar el perfil se actualiza esa clave sin
cambiar el `_id`. La variable debe coincidir exactamente con el `iss` de Clerk.

## Errores de las nuevas funciones

Son `ConvexError` con `error.data = { codigo, mensaje }`. Mostrar `mensaje` y
usar `codigo` para decidir la respuesta de UI. No interpretar el texto del error.
Los errores inesperados siguen siendo fallos técnicos, sin exponer detalles.

- `NO_AUTENTICADO`: esperar sesión o volver al inicio de sesión.
- `VALIDACION`: corregir el formulario.
- `CONFLICTO`: explicar el conflicto; repetir sin cambiar datos no lo resuelve.

Estas funciones no generan eventos `LOGIN`: completar un perfil no equivale a
iniciar una sesión. La integración de auditoría de sesión sigue en #19.

Referencia de identidad: [almacenar usuarios en Convex](https://docs.convex.dev/auth/database-auth).

## Invitación y registro — #7, #30 y #32

| Función | Tipo | Entrada | Resultado |
|---|---|---|---|
| `crearInvitacion` | mutation, titular | `{ cursoId }` | `{ invitacionId, cursoId, codigo, token, expiraEn }` |
| `consultarInvitacion` | mutation, representante | `{ credencial }` | `{ cursoId, nombreCurso, institucion, expiraEn, versionDocumento }` |
| `canjearInvitacion` | mutation, representante | Ver ejemplo | `{ estudianteId, estadoVerificacion }` |
| `listarPendientes` | query, titular | `{ cursoId, paginationOpts }` | Página de estudiantes pendientes de ese curso |
| `listarEstudiantes` | query, titular | `{ cursoId, paginationOpts }` | Página de estudiantes matriculados, con `matriculaId` y `numeroLista` |
| `aprobarEstudiante` | mutation, titular | `{ cursoId, estudianteId, correcciones? }` | `{ estudianteId, matriculaId }` |
| `listarMisEstudiantes` | query, representante | `{ paginationOpts }` | Página de sus hijos con estado, `cursoId` y `matriculaId` (pueden ser `null`) |

`credencial` es **uno** de `{ codigo: "..." }` o `{ token: "..." }`.
El código admite minúsculas, espacios y guiones de presentación. El token es
sensible a mayúsculas. No mostrar tokens en logs ni incluirlos en analítica.
La invitación dura `REGLAS.INVITACION_DIAS_VIGENCIA` (30 días), permite varios
canjes y `crearInvitacion` reutiliza la última mientras sea válida. No se exige
que siga vigente al aprobar un registro que ya fue aceptado.

`consultarInvitacion` es una mutation sin escrituras para validar la caducidad
con el reloj del servidor al enviar P2. El canje vuelve a comprobarla: la
previsualización no reserva plaza ni congela su vigencia.

```ts
await canjearInvitacion({
  credencial: { codigo },
  solicitudId, // UUID generado una sola vez por formulario, conservado al reintentar
  estudiante: {
    tipoDocumento: "CEDULA", // CEDULA | PASAPORTE | SIN_DOCUMENTO
    numeroDocumento: "0900000010", // "" para SIN_DOCUMENTO
    nombres: "Ana", apellidos: "Prueba", fechaNacimiento: "2016-01-02", // fecha opcional
  },
  parentesco: "MADRE", // valores de PARENTESCO en enums.ts
  aceptaTratamiento: true,
  declaraRepresentanteLegal: true,
  versionDocumento: "2026-09-v1", // la versión que se mostró, recibida en P2
});
```

Mostrar el [texto de consentimiento](../03-piloto/texto-consentimiento.md) y las
**dos casillas separadas**, inicialmente desmarcadas. Enviar los valores reales
del formulario; el `true` del ejemplo representa aceptación explícita.
La versión se guarda para ese hijo junto con el perfil y la fecha del servidor.

La clave `solicitudId` debe tener 16–128 caracteres alfanuméricos, guiones o `_`;
un UUID sirve. Conservar tanto la clave como los datos enviados mientras el
resultado sea incierto por un error de red. Una respuesta satisfactoria cierra
el formulario. Un nuevo hijo usa otra clave, incluso si no tiene documento y
sus datos coinciden. Reutilizar una clave con datos distintos da `CONFLICTO`.
El reintento exacto recupera el resultado incluso después de caducar el código,
sin consumir otro uso; un vínculo revocado impide recuperarlo.

Para documentos reales se comprueba unicidad por institución dentro de la misma
mutation. Un segundo representante no puede vincular un documento ya registrado.
`SIN_DOCUMENTO` no participa en esa unicidad: no se deduce identidad por nombre.
El servidor no reutiliza ni sobreescribe un estudiante de otra cuenta.

## Corrección, aprobación y puntaje

`correcciones` puede incluir `nombres`, `apellidos`, `tipoDocumento`,
`numeroDocumento`, `fechaNacimiento`. Para cambiar documento, enviar tipo y
número juntos. `fechaNacimiento: null` elimina una fecha incorrecta.
Solo se corrige durante la aprobación de un pendiente, y se vuelve a comprobar
la unicidad del documento.

Antes de aprobar, el titular debe haber definido parciales. Se inicializa en 60
cada parcial **PLANIFICADO o EN_CURSO cuya fecha final no haya pasado**. Esto
permite preparar el curso antes del inicio de clases sin inventar historia en
parciales terminados o cerrados. No abre ni cierra períodos; esa transición de
calendario es independiente. El puntaje pertenece a `puntajePeriodo`, no a
`matricula`. Se respeta el límite `estudiantesPorCurso` del plan del titular.

La matrícula, los puntajes y el evento `APROBAR` se guardan atómicamente. Repetir
la aprobación del mismo estudiante en el mismo curso no duplica nada ni reinicia
puntajes. Si la repetición trae correcciones diferentes, devuelve `CONFLICTO`.
La fecha de ingreso se calcula en `America/Guayaquil`.

## Listas y errores

Las listas usan el formato de paginación Convex: `{ page, isDone, continueCursor,
... }`, con `paginationOpts: { numItems: 20, cursor: null }` inicialmente (1–100
registros solicitados por página). Reutilizar `continueCursor` o usar
`usePaginatedQuery`. Cada estudiante incluye `estudianteId`, nombres, apellidos,
documento, `fechaNacimiento` (`null` si falta) y `estadoVerificacion`.

Un pendiente se vincula al curso a través de la invitación del vínculo, porque
**aún no tiene matrícula**. La consulta de pendientes pagina el índice de
institución/verificación y filtra por el curso exacto; una página puede quedar
vacía sin ser la última. Seguir el cursor hasta `isDone`. Esto conserva el
esquema actual sin inventar una matrícula provisional.

Códigos adicionales: `PERFIL_NO_ENCONTRADO`, `SIN_PERMISO`, `SIN_VINCULO`,
`INVITACION_INVALIDA`, `CURSO_INACTIVO`, `CONSENTIMIENTO_REQUERIDO`,
`CONSENTIMIENTO_DESACTUALIZADO`, `PERIODO_NO_VIGENTE`, `LIMITE_PLAN` y
`NO_ENCONTRADO`. Para `LIMITE_PLAN`, ofrecer el flujo de plan; para consentimiento
desactualizado, recargar el texto y pedir aceptación nuevamente.

## Validación local reproducible

```bash
npm run typecheck
npm test
# En un checkout separado, sin las variables del despliegue compartido:
cd movil
CONVEX_AGENT_MODE=anonymous npx convex dev --local-cloud-port 3220 --local-site-port 3221
# En otra terminal, desde movil, configurar solo este backend local:
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.test
cd ..
node scripts/verificar-nucleo-local.mjs
```

El script usa el `config.json` local y conecta exclusivamente a `127.0.0.1`.
Crea cuentas y estudiantes sintéticos nuevos por ejecución. Usa impersonación
administrativa local para probar las funciones públicas, incluyendo solicitudes
HTTP concurrentes contra el runtime real. No verifica inicio de sesión de Clerk
ni la interfaz en un teléfono. No publica cambios en el despliegue compartido.

El esquema agrega solo campos opcionales `solicitudId`, `huellaSolicitud` y el
índice `por_representante_solicitud` de `vinculoRepresentacion`; los vínculos
existentes siguen siendo válidos. La huella es SHA-256 de los datos normalizados,
no otra copia de los documentos de los estudiantes.
