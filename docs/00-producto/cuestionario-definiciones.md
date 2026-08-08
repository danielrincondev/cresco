# Cuestionario de definiciones — Cresco v1.0

> **Estado:** Reemplazado por `Contexto/DECISIONS.md` · **Dueño:** Todos · **Última revisión:** 2026-08-07
>
> Se conserva como registro de qué se preguntó y por qué. Las respuestas
> vigentes están en `DECISIONS.md`; donde este documento y aquel difieran (por
> ejemplo las franjas propuestas en C7), manda `DECISIONS.md`.

Preguntas cuya respuesta afecta el esquema o la lógica de negocio. Responde con el número y la opción (ej. `B3: b`); con eso cierro el contrato de datos en versión 1.0 definitiva.

**Leyenda:** 🔴 bloqueante (sin respuesta no se puede fijar el esquema) · 🟡 afecta lógica pero no estructura · 🟢 se puede diferir

---

## Bloque A — Institución y despliegue

**A1** 🔴 ¿Cómo entra un colegio al sistema?
 a) El colegio se registra primero y luego crea las cuentas de sus docentes
 b) Cualquier docente se registra solo y crea su curso; la institución se infiere después
 c) Ambos, con dos flujos distintos de alta

**A2** 🔴 Si un docente se registra por su cuenta (opción b o c), ¿su curso pertenece a una institución "informal" creada automáticamente, o queda sin institución hasta que el colegio se sume?

**A3** 🟡 ¿Habrá un rol de administrador de institución en v1, o el docente titular hace todo?

**A4** 🟢 ¿Van a operar en Galápagos? Define si hay que soportar dos zonas horarias desde el inicio.

---

## Bloque B — Calendario y períodos

**B1** 🔴 ¿Los parciales son iguales para todo el colegio, o cada docente define los suyos por curso?

**B2** 🔴 ¿Cuántos períodos por año lectivo y de qué tipo? (¿2-3 parciales sueltos, o quimestres con parciales dentro?)

**B3** 🟡 ¿Qué pasa si un docente registra una acción con fecha de un período ya cerrado? ¿Se rechaza, se permite con advertencia, o se asigna al período vigente?

**B4** 🟡 ¿El fin de semana y los feriados generan reporte diario, o solo los días con clase?

---

## Bloque C — Puntaje y acciones

**C1** 🔴 Piso y techo del puntaje: ¿0 y 100? ¿O puede quedar negativo para reflejar casos graves?

**C2** 🔴 ¿Quién define cuántos puntos vale cada acción?
 a) Catálogo fijo del sistema, igual para todos
 b) Catálogo del sistema con rango, y el docente elige dentro del rango
 c) Cada institución define su propio catálogo
 d) Cada docente crea sus tipos de acción libremente

**C3** 🔴 ¿El puntaje se reinicia a 60 en cada parcial, o arrastra un porcentaje del parcial anterior?

**C4** 🟡 ¿Existe un límite de acciones por estudiante y por día? (Evita que un mal día hunda el puntaje.)

**C5** 🟡 Al cerrar el parcial, ¿el puntaje se congela definitivamente, o el docente puede seguir corrigiendo unos días?

**C6** 🟡 ¿El representante ve el valor en puntos de cada acción, o solo el puntaje total y la franja? (Ver los puntos individuales tiende a generar más reclamos.)

**C7** 🟢 ¿Las franjas por defecto (0-49, 50-69, 70-89, 90-100) te parecen bien, o prefieres otros cortes?

**C8** 🟡 ¿Una acción positiva puede anularse también, o solo las negativas?

---

## Bloque D — Representantes y vinculación

**D1** 🔴 ¿El docente carga la cédula del representante junto con la del estudiante en el Excel, o el representante la digita al registrarse?

**D2** 🔴 ¿Cuántos representantes por estudiante como máximo? ¿Hay uno "principal" con más permisos?

**D3** 🟡 Si hay dos representantes, ¿ambos pueden abrir inconformidad sobre la misma acción, o solo el principal?

**D4** 🟡 ¿Cuánto dura una invitación antes de expirar? (Sugerencia: 30 días.)

**D5** 🟡 ¿Qué ve un representante recién vinculado a mitad de parcial: todo el histórico del parcial o solo desde su vinculación?

**D6** 🟢 ¿Un representante puede tener hijos en dos colegios distintos que ambos usen la app?

---

## Bloque E — Reportes

**E1** 🔴 ¿A qué hora se genera y envía el reporte diario? ¿Es fija por institución o la elige el docente?

**E2** 🔴 Si el docente no llena el reporte general un día, ¿se envía igual el reporte del estudiante con solo sus novedades, o no se envía nada?

**E3** 🟡 ¿Qué campos exactos tendrá la plantilla del reporte general? Propuesta inicial: temas del día, tareas enviadas, recordatorios, consejo para casa. ¿Agregas o quitas alguno?

**E4** 🟡 ¿Cuánto tiempo se conservan los reportes diarios? ¿Toda la semana, todo el parcial, o todo el año?

**E5** 🟡 La "pregunta por reporte": ¿el límite es una por reporte diario, o una por semana? ¿Qué pasa si el docente no responde?

**E6** 🟢 ¿El reporte acumulado se puede exportar a PDF para llevarlo a una reunión?

---

## Bloque F — Citas e inconformidades

**F1** 🟡 ¿El docente publica espacios concretos (martes 10:00-10:30), o un horario general y el representante propone hora?

**F2** 🟡 ¿La cita requiere confirmación del docente, o se confirma sola al reservar un espacio publicado?

**F3** 🟡 ¿Hay plazo máximo para que el docente responda una inconformidad? ¿Qué pasa si vence?

**F4** 🟢 ¿Una inconformidad resuelta como "modificada" cambia los puntos, o solo agrega una nota aclaratoria?

---

## Bloque G — Alertas de emergencia

**G1** 🔴 ¿Cualquier docente puede activarla, o requiere autorización?

**G2** 🟡 ¿Alcanza solo a su curso, o puede alcanzar a todo el colegio?

**G3** 🟡 ¿Se le pide al representante confirmar que la leyó?

---

## Bloque H — Monetización

**H1** 🔴 La suscripción premium del representante: ¿es por cuenta (cubre a todos sus hijos) o por estudiante?

**H2** 🔴 ¿Qué funciones exactas quedan detrás del muro premium, además de quitar publicidad? Si la respuesta es "ninguna", el único valor es la ausencia de anuncios y conviene saberlo desde ya.

**H3** 🟡 "Por parcial" como periodicidad: Google Play no tiene un ciclo de 6 semanas. ¿Lo mapean a una suscripción de 2 meses, o a una compra no renovable?

**H4** 🟡 Si el colegio compra licencia institucional, ¿cómo se activa el beneficio en la cuenta de cada representante? ¿Por dominio de correo, por código, o manualmente?

**H5** 🟢 ¿Los anuncios serán de red publicitaria (AdMob) desde el día uno, con patrocinadores directos después?

---

## Bloque I — Datos y cumplimiento

**I1** 🔴 ¿Qué se hace con los datos de un estudiante que se retira del colegio? ¿Se anonimizan, se archivan, o el representante pierde acceso pero el colegio lo conserva?

**I2** 🟡 ¿El representante puede descargar toda la información de su hijo? (La LOPDP contempla el derecho de acceso y portabilidad.)

**I3** 🟡 ¿Se guardan fotos o archivos adjuntos en algún punto? Si sí, cambia el modelo de almacenamiento y el análisis de riesgo.

**I4** 🟢 ¿Ya tienen definido quién será el responsable del tratamiento de datos frente al colegio: ustedes o la institución?

---

## Bloque J — Técnico

**J1** 🔴 ¿Postgres/Supabase o Firestore? Este modelo está pensado para el primero; el segundo exige desnormalizar.

**J2** 🔴 ¿Kotlin + Jetpack Compose o Flutter?

**J3** 🟡 ¿La app debe funcionar sin conexión? Un docente tomando asistencia en un aula sin señal es un caso muy probable en Ecuador.

**J4** 🟡 ¿Habrá un backend propio para el webhook de RevenueCat y la generación nocturna de reportes, o se resuelve todo con funciones administradas?

---

## Prioridad de respuesta

Si tienes poco tiempo, responde primero estas ocho: **A1, B1, C1, C2, D1, E1, H1, J1**. Con esas queda cerrado el 90 % del esquema.
