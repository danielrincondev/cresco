# DP-016 — Cresco no pide ni muestra medios de contacto personales del docente

**Fecha:** 2026-09-28 · **Estado:** Aceptada · **Dueño:** Persona C

## Contexto

Hasta el 28 de septiembre, el perfil profesional del docente pedía un "correo
de contacto" y un "teléfono de contacto" opcionales, y la ficha que ve la
familia (P9, "Docente a cargo") los mostraba con dos botones: "Escribirle al
correo" y "Llamar a…".

Kenny (Product Manager) pidió quitarlos ese día, con este argumento: una de
las bases de la aplicación es que el docente no tenga que dar ningún medio que
lo vincule con su vida personal. Si los padres tienen esa información, el
estudiante puede tomar el celular de su padre o su madre y encontrarla, y el
docente vuelve a quedar expuesto a las extorsiones y amenazas anónimas de las
que Cresco lo quiere sacar. La aplicación no es solo un medio para
comunicarse: es un puente seguro que separa la vida profesional del docente de
su vida personal.

Las entrevistas del 1 de septiembre lo respaldan
([hallazgos](../../05-validacion/hallazgos.md), sección 2): un plantel prohibió
hace dos años los grupos de WhatsApp entre docentes y representantes, por
seguridad, porque *"estaban tomando los números de los profesores"*.

## Decisión

- **Cresco no pide, no guarda y no muestra el correo ni el teléfono personal
  del docente.**
- **La familia llega al docente dentro de la aplicación:** pidiéndole una cita,
  con el horario de atención que él publica, o reclamando una anotación. Todo
  queda registrado a nombre de la familia que lo envió: **en Cresco no hay
  mensajes anónimos.**
- La ficha P9 muestra el nombre, el curso, el título profesional y el horario
  de atención.

## Consecuencias

- `actualizarDatosDocente` sigue aceptando `correoContacto` y
  `telefonoContacto` **solo** para que una build 1.0.0, que todavía los manda,
  no falle al guardar el perfil. Los descarta sin validarlos, y cada guardado
  borra los que hubiera de antes. `docenteACargo` los devuelve siempre en
  `null`, por la misma razón: la pantalla de la 1.0.0 los lee.
- Al 28 de septiembre **ningún docente** del despliegue del piloto tenía un
  correo o un teléfono guardado, así que no hubo datos que borrar.
- Los dos campos siguen en `convex/schema.ts`, que es superficie compartida.
  Se quitan en un cambio aparte, con el acuerdo de los tres, cuando ya no se
  use ninguna build 1.0.0.
- **El aviso de privacidad** (borrador `2026-09-v2`, pendiente de revisión
  jurídica) todavía dice que se recoge un "teléfono de contacto". Su próxima
  versión lo quita y declara esta decisión. No se cambia ahora porque
  comparte versión con el consentimiento que el servidor exige al registrar a
  un hijo: cambiar esa versión a dos días de enviar arriesgaría el registro de
  familias. Declarar de más no expone a nadie; lo que no se puede es mostrar
  de más, y eso ya no ocurre.
- El horario de atención es texto libre, y un docente podría escribir su
  número ahí. El formulario le pide que no lo haga.
- Complementa DP-010: si Cresco es *el* canal entre la escuela y la familia,
  tiene que ser uno en el que los dos lados se identifiquen.

## Alternativas consideradas

- **Dejarlos opcionales, con una advertencia.** El riesgo no es el docente que
  decide publicar su número: es que, una vez publicado, lo ve cualquiera que
  tome el teléfono de un representante, y ya no se puede recoger.
- **Mostrarlos solo a los representantes aprobados del curso.** Ya era así
  (`exigirVinculo`), y no cambia el riesgo: quien accede es alguien de la
  familia con el teléfono del representante, no un extraño.
