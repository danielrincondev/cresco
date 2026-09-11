# Probar el núcleo desde Expo Go

La rama `feat/movil-nucleo` conecta las pantallas al contrato de
`contrato-nucleo.md`. Requiere las funciones de las ramas de perfiles y
vinculación, además de `obtenerCalendarioCurso`.

Desde `movil`, configura el entorno de desarrollo y ejecuta
`npm run dev -- --tunnel`. Escanea el QR de esa terminal en Expo Go: otro
servidor Metro abierto en otro checkout seguirá mostrando su propia versión.

## Recorrido

1. Inicia sesión y completa el documento y uno o ambos roles.
2. Como docente, crea el curso y define dos o tres parciales.
3. Abre «Invitar representantes» y comparte el código.
4. Como representante, abre «Registrar a mi hijo», consulta el código,
   completa los datos y lee el consentimiento. Ambas autorizaciones
   comienzan desmarcadas.
5. Como docente, abre «Por aprobar», revisa o corrige los datos y aprueba.
6. Comprueba la matrícula en «Estudiantes» y su estado en «Mis hijos».

Usa datos sintéticos en desarrollo. Para probar ambos recorridos con una
sola cuenta, selecciona ambos roles al completar el perfil. El selector
aparece en el inicio; también puedes añadir un rol desde el icono de perfil
usando el mismo documento.

## Validación realizada

- TypeScript del cliente y Convex sin errores; 161 pruebas automatizadas,
  incluidas ocho de componentes para consentimiento, reintentos y auditoría,
  y ocho sobre el contenido del aviso y la exclusión de notas internas.
- Bundle Android generado mediante `expo export --platform android`.
- Recorrido completo en navegador con viewport Pixel 7, autenticación real
  de Clerk de desarrollo y Convex de desarrollo: perfil con ambos roles,
  curso, dos parciales, invitación, registro sin documento, corrección del
  nombre, aprobación y actualización de la vista familiar.
- La consulta del calendario tiene prueba de autorización: solo el titular
  puede verla; otro docente y una sesión anónima son rechazados.

## Consentimiento y auditoría de sesión

`versionConsentimiento`, en `src/content/consentimiento.ts`, identifica los textos
incluidos en la app. Si el servidor exige otra versión, el formulario pide
actualizar Cresco y no permite aceptar con un texto anterior. Al cambiar los
documentos hay que actualizar su contenido y esta versión juntos. Una solicitud
guardada conserva el identificador y la versión que se aceptó originalmente:
reintentar una respuesta incierta no representa una nueva aceptación.

El inicio autenticado llama a `auditoria.registrarInicioSesion`. Si aún falta
el perfil, vuelve a llamarla al terminar el alta. Los errores se reintentan con
esperas crecientes de hasta un minuto, mientras la sesión siga activa; el servidor
agrupa eventos repetidos. Cerrar sesión o desmontar la pantalla cancela los
reintentos pendientes. No se añaden tareas de servidor ni cron.

Las pruebas de componentes simulan Clerk, Convex y el almacenamiento. La prueba
física de estas correcciones sigue pendiente.

## Alcance de esta versión

La validación del navegador no sustituye la prueba física en Expo Go del
teclado, botón Atrás de Android, almacenamiento seguro y hoja de compartir.
La solicitud de registro se guarda antes de enviarse para poder reintentar
con el mismo identificador sin duplicar al estudiante.

El texto de consentimiento y el aviso se copian de los borradores en
`docs/03-piloto`. El retiro desde Ajustes todavía no está implementado; la
pantalla lo indica antes de aceptar. Esta entrega tampoco incorpora pagos,
notificaciones ni seguimiento de conducta. No cierra por sí sola los issues
que incluyan esas capacidades.

El aviso mostrado excluye la sección «Notas internas». Una prueba lo compara
con la parte pública del documento para detectar desincronizaciones.
