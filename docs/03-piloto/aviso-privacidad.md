# Aviso de privacidad — Cresco

> **Estado:** Borrador · **Dueño:** Persona C · **Versión del documento:** `2026-09-v2` · **Última revisión:** 2026-09-11

> ⚠️ **Antes de usarlo con datos reales.** Este texto describe con exactitud lo
> que la aplicación hace hoy, pero **no ha sido revisado por un profesional del
> derecho**. Trata datos personales de **niños, niñas y adolescentes**, que en
> Ecuador tienen protección reforzada bajo la Ley Orgánica de Protección de
> Datos Personales (LOPDP). Antes de recoger un solo dato real de un estudiante,
> este documento debe pasar por revisión jurídica y ser aceptado por la
> institución educativa.
>
> **La versión de este documento (`2026-09-v2`) es la que se guarda** en el
> campo `versionDocumento` de la tabla `consentimiento` cuando alguien lo
> acepta. Si el texto cambia, cambia la versión: los consentimientos ya dados
> quedan atados a la versión que la persona realmente leyó.

---

## 1. Quién trata sus datos

**Cresco** es una aplicación desarrollada por el equipo **Neofix**, tres
estudiantes de ingeniería, en el contexto de un proyecto académico y del
concurso RevenueCat Shipaton 2026.

Durante la fase de piloto, el responsable del tratamiento es el equipo Neofix,
en coordinación con la institución educativa participante. **Los términos
exactos de esa corresponsabilidad se fijan en la carta de acuerdo del piloto**,
que se firma con la institución antes de empezar.

Contacto para cualquier asunto relacionado con sus datos: *(correo del equipo,
pendiente de definir antes del piloto)*.

## 2. Para qué usamos los datos

Un solo propósito: **permitir que el docente informe al representante legal
sobre la responsabilidad y la conducta del estudiante, y que el representante
pueda responder.**

No usamos los datos para ningún otro fin. En concreto: **no los vendemos, no
los cedemos a terceros con fines comerciales, y no los usamos para entrenar
modelos de inteligencia artificial.**

## 3. Qué datos recogemos

### Del docente y del representante legal

Nombres y apellidos, tipo y número de documento de identidad, correo
electrónico, teléfono de contacto, y —en el caso del docente— datos
profesionales como el título y el horario de atención.

### Del estudiante

**El estudiante nunca usa la aplicación.** No tiene cuenta, no inicia sesión y
no puede acceder a ella. Sus datos son proporcionados por su representante
legal o por el docente:

- Nombres y apellidos
- Tipo y número de documento de identidad
- Fecha de nacimiento (opcional)
- Institución, curso y estado de matrícula
- **Registros de conducta y responsabilidad**: la categoría de cada acción, los
  puntos asignados, y **el mensaje que el docente escribe con sus propias
  palabras** describiendo lo ocurrido
- Asistencia
- El contenido de los reportes diarios que redacta el docente
- El puntaje de conducta del período

### De la interacción entre docente y representante

Los mensajes de los reclamos (inconformidades), las citas agendadas y las
alertas de emergencia recibidas y confirmadas.

### Técnicos

El identificador del dispositivo para enviar notificaciones, la plataforma y la
versión de la aplicación, y un **registro de auditoría** de determinadas
acciones sensibles, con quién las realizó y cuándo, según el alcance de la sección 5.

## 4. Qué NO recogemos

- **No almacenamos archivos ni fotografías**, de ninguna clase. Si el docente
  carga una lista de estudiantes desde un archivo, ese archivo **se procesa y
  se descarta**; nunca se guarda.
- **No recogemos calificaciones académicas.** El puntaje de conducta de Cresco
  no forma parte del expediente académico ni modifica ninguna nota.
- No recogemos ubicación, contactos, ni contenido de otras aplicaciones.

## 5. Quién puede ver la información de un estudiante

| Quién | Qué ve |
|---|---|
| **Su representante legal registrado** | Toda la información de su representado |
| **El docente titular de su curso** | La información de los estudiantes de su curso |
| Otros representantes | **Nada** |
| Otros docentes | **Nada** |
| El propio estudiante | **Nada** — no tiene acceso a la aplicación |

En esta primera versión **cada estudiante tiene un solo representante legal
registrado**, que es quien canjea el código de invitación del curso.

La bitácora de auditoría registra el inicio de sesión, la creación de acciones
de conducta, la aprobación de matrículas y la resolución de reclamos, con quién
realizó cada operación y cuándo. En esta primera versión la bitácora cubre esas
acciones, no toda consulta de pantalla. El registro de lecturas de fichas se
incorpora de forma progresiva y no acredita todas las lecturas.

## 6. Terceros que participan en el servicio

Para funcionar, la aplicación se apoya en proveedores que tratan ciertos datos
por cuenta nuestra:

| Proveedor | Para qué | Qué recibe |
|---|---|---|
| **Clerk** | Inicio de sesión | Correo electrónico y datos de la sesión |
| **Convex** | Base de datos y servidor | Todos los datos descritos arriba |
| **RevenueCat** | Gestión de suscripciones | Un identificador interno de la cuenta. **No recibe datos del estudiante** |
| **Google AdMob** | Publicidad, solo en el plan gratuito del representante | Datos técnicos del dispositivo con fines publicitarios |
| **Expo** | Notificaciones al teléfono | El identificador del dispositivo |

**Transferencia internacional.** Los servidores de estos proveedores están
ubicados fuera del Ecuador. Al usar la aplicación, sus datos se procesan en el
exterior bajo las condiciones de seguridad de cada proveedor.

**Sobre la publicidad:** el plan gratuito del representante muestra anuncios.
Estos aparecen siempre en un contenedor visual separado del contenido escolar,
para que no se confundan con información del estudiante. La versión de pago
elimina la publicidad por completo.

## 7. Sus derechos, y qué puede ejercer hoy

La ley le reconoce derechos sobre sus datos y los de su representado. Le
decimos con franqueza qué puede ejercer en esta primera versión y qué todavía
no:

| Derecho | Estado en esta versión |
|---|---|
| **Acceso** — saber qué datos tenemos y consultarlos | ✅ Disponible en la aplicación. La **descarga en PDF** todavía no existe: llega en una versión posterior |
| **Rectificación** — corregir datos inexactos | ⚠️ Parcial. El docente puede corregir los datos del estudiante. Para otras correcciones, escríbanos |
| **Oposición** — dejar de usar el servicio | ✅ Disponible. Puede revocar su consentimiento en cualquier momento |
| **Eliminación** — que borremos los datos | ⚠️ **No disponible todavía.** Ver abajo |

### Sobre la eliminación de datos, con honestidad

**En esta primera versión no podemos eliminar los datos a solicitud.** El
sistema está construido de forma que la información no se borra físicamente,
sino que se marca como anulada o archivada.

Estamos desarrollando la **anonimización bajo solicitud** —sustituir el nombre
y el documento de forma que la información deje de estar asociada a una persona
identificable— para una versión posterior.

Preferimos decírselo antes que prometer algo que hoy la aplicación no hace. Si
esto es determinante para usted, no acepte el tratamiento de datos: puede
seguir recibiendo la información de su representado por los canales
tradicionales de la institución.

## 8. Cuánto tiempo conservamos los datos

Durante el **año lectivo** en curso.

Al retirarse un estudiante de la institución, su información se archiva: el
representante pierde el acceso y la institución conserva el registro, según lo
que se acuerde con ella.

**El plazo definitivo de conservación se pacta con la institución educativa en
la carta de acuerdo del piloto**, no lo decidimos unilateralmente.

## 9. Cómo protegemos la información

- El acceso a los datos de cada estudiante se verifica en el servidor en cada
  consulta, no solo en la aplicación del teléfono.
- Las contraseñas nunca se almacenan en texto plano: la autenticación la maneja
  un proveedor especializado.
- Registramos en una bitácora de auditoría las operaciones enumeradas en la
  sección 5, con quién las hizo y cuándo.
- Activar una alerta de emergencia exige que el docente vuelva a confirmar su
  identidad, para que no se dispare por accidente.

## 10. Una aclaración importante sobre las alertas

La aplicación incluye una función de **alerta de emergencia** que permite al
docente avisar rápidamente a las familias de su curso.

**Esta función no sustituye al ECU 911 ni a ningún servicio de emergencia.**
Sirve para informar a los representantes, no para solicitar auxilio. Ante una
emergencia real, llame al ECU 911.

## 11. Cambios a este aviso

Si cambiamos este documento, cambiamos también su número de versión. Guardamos
qué versión aceptó cada persona, de modo que siempre se pueda saber a qué texto
dio su consentimiento. Un cambio sustancial requiere volver a solicitar el
consentimiento.

---

## Notas internas (no forman parte del aviso al usuario)

**Pendientes antes de usar este documento con datos reales:**

1. Revisión por un profesional del derecho, con atención a la LOPDP y al
   tratamiento de datos de menores.
2. Definir el correo de contacto del equipo.
3. Acordar con la institución la corresponsabilidad y el plazo de conservación
   (carta de acuerdo del piloto, issue #16).
4. Confirmar que la redacción de la sección 6 coincide con los proveedores
   realmente en uso al momento del piloto.

**Decisiones del proyecto que este texto refleja:**

- DP-007 — la anonimización es objetivo de v2; en v1 solo se declara la
  política. La sección 7 lo dice sin adornos, a propósito.
- DP-006 — el alcance de la auditoría en v1.
- Regla I3 — no se almacenan archivos ni fotos; el CSV se descarta.
- ADR-006 — RevenueCat recibe el identificador canónico interno
  (`perfilUsuario._id`), nunca datos del estudiante.
