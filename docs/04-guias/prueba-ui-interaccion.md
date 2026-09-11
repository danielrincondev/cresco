# Prueba de reclamos, citas y alertas en el navegador

Usar la rama `feat/pantallas-interaccion` y el entorno personal de desarrollo,
con las funciones del mismo commit. La interfaz nueva llama a `activarAlerta`
como action; un backend anterior que aún la exponga como mutation no sirve
para este recorrido.

Usar únicamente cuentas y datos sintéticos. Crear un curso identificado como
«Prueba PR50» y comprobar que sus representantes son cuentas de prueba antes
de publicar un simulacro. No utilizar cursos de familias reales.

## Alertas

1. Iniciar sesión con la cuenta docente de prueba que tenga contraseña.
2. Abrir el curso de prueba y «Alerta de emergencia».
3. Elegir «Simulacro», escribir un título que empiece por «SIMULACRO PR50»
   y un mensaje que explique que se está probando la aplicación.
4. Marcar la confirmación y escribir `SIMULACRO`. Introducir una contraseña
   incorrecta. Debe aparecer un error y no debe publicarse ningún aviso.
5. Repetir con la contraseña correcta. Durante la operación, los campos y el
   selector de tipo deben quedar bloqueados.
6. La confirmación debe indicar que se publicó un simulacro y que no confirma
   recepción o lectura. Si no hay destinatarios, debe indicarlo explícitamente.
7. Con el representante sintético vinculado, abrir «Alertas», comprobar la marca
   de simulacro y confirmar su lectura.

No se debe activar una emergencia real para comprobar el selector. La protección
frente a un evento de cambio de tipo durante un envío real está cubierta por la
prueba automatizada de componentes.

## Citas

1. Como docente, publicar una fecha futura de 12:30 a 13:00.
2. Como representante sintético, abrir «Pedir cita» y los horarios de su hijo.
   Deben aparecer 12:30–12:45 y 12:45–13:00 como opciones independientes.
3. Reservar el primer bloque. Debe figurar como pendiente de confirmación y el
   segundo debe seguir disponible.
4. Reservar el segundo bloque y comprobar ambas solicitudes como docente.
5. Rechazar la primera: solo 12:30–12:45 debe volver a estar disponible.

La paginación con una página intermedia vacía se comprueba automáticamente,
sin crear decenas de estudiantes en el entorno de desarrollo.

## Evidencia actual

- 238 pruebas automatizadas, incluidos los casos de reautenticación, tipo de
  alerta, destinatarios vacíos, reservas independientes y paginación.
- Tipos de la app y del backend correctos; exportación Android correcta.
- Recorrido interactivo de esta revisión: pendiente de ejecutar y documentar.
