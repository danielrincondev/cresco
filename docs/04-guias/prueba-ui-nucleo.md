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

- TypeScript del cliente y Convex sin errores; 97 pruebas automatizadas.
- Bundle Android servido correctamente por Metro.
- Recorrido completo en navegador con viewport Pixel 7, autenticación real
  de Clerk de desarrollo y Convex de desarrollo: perfil con ambos roles,
  curso, dos parciales, invitación, registro sin documento, corrección del
  nombre, aprobación y actualización de la vista familiar.
- La consulta del calendario tiene prueba de autorización: solo el titular
  puede verla; otro docente y una sesión anónima son rechazados.

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
