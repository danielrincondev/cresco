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
