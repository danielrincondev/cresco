# DP-013 — Importar la lista del curso por CSV (D9) se difiere a la v2

**Fecha:** 2026-09-11 · **Estado:** Aceptada · **Dueño:** Persona C

## Contexto

D9 —"el docente sube un archivo con la lista de su curso y se crean los
estudiantes"— entró al alcance como **Could** desde el corte MoSCoW (DP-001) y
así sigue anotado en el issue #30: *"hazla al final, o no la hagas"*. Es lo
último que queda abierto de ese issue; todo lo demás (D7, D8, D10) está hecho.

Tres cosas cambiaron desde que se anotó:

**1. El flujo de alta ya no pasa por el docente.** El camino que la aplicación
construyó es el inverso: el docente genera un código de invitación reutilizable
(D10), cada representante canjea el código y **registra a su propio hijo**, y
el docente aprueba. Esa dirección no es un accidente de implementación — es la
que hace que el consentimiento lo dé quien puede darlo. Un CSV cargado por el
docente crea estudiantes *sin* que ningún representante haya aceptado nada, y
después habría que ir a buscar ese consentimiento hacia atrás.

**2. No es la parte cara.** Leer un archivo es fácil. Lo que cuesta es todo lo
que viene detrás: qué pasa con una fila cuya cédula ya existe en otro curso,
con un nombre escrito distinto que el del año pasado, con un archivo de Excel
guardado en Latin-1, con las 40 filas de las que 3 están mal. Sin una pantalla
de conciliación fila por fila, la importación produce duplicados sobre datos de
menores — y esa pantalla es tan grande como la función entera.

**3. Quedan diecisiete días.** La entrega es el 28 de septiembre y el trabajo
que sí está en la ruta crítica son las pantallas de conducta (#31) y de
representante (#32), que no existen.

## Decisión

**Se difiere a la v2.** No entra en la versión del 28 de septiembre.

Se conserva `ORIGEN_ESTUDIANTE = "DOCENTE_CSV"` en `lib/enums.ts`: el camino
queda declarado en el modelo para que un estudiante importado sea distinguible
de uno registrado por su representante el día que la función exista. No cuesta
nada dejarlo y evita una migración después.

## Consecuencias

- **El issue #30 se cierra.** Era lo único que le quedaba abierto.
- **Hay que corregir el aviso de privacidad.** Su §4 dice hoy: *"Si el docente
  carga una lista de estudiantes desde un archivo, ese archivo se procesa y se
  descarta; nunca se guarda."* Esa frase describe una función que no existe.
  Dicha así no es una promesa que incumplamos —seguimos sin guardar archivos,
  porque no hay dónde subirlos— pero le cuenta a una madre una capacidad que la
  aplicación no tiene. Se reescribe como lo que de verdad hace la v1: **no se
  suben archivos de ninguna clase**.
- **Para el piloto, el alta es por código de invitación.** Si un curso de 40
  estudiantes resulta inmanejable así, eso es un hallazgo de validación y entra
  por #56, no una función que haya que adelantar por si acaso.
- **Es la segunda candidata de la v2**, detrás del informe imprimible (DP-009),
  que tiene evidencia de entrevistas y esta no.

## Alternativas consideradas

- **Hacerla sin pantalla de conciliación** (rechazar el archivo entero si una
  fila falla). Es la versión barata y es peor que no tenerla: el docente con
  40 filas y 3 erratas no tiene forma de saber cuáles, y termina escribiéndolas
  a mano igual, después de haber perdido el tiempo con el archivo.
- **Hacerla solo para cursos nuevos**, donde no hay duplicados posibles. Reduce
  el problema pero no la pantalla, y deja la función inservible justo en el caso
  que la motivaba (el docente que ya tiene su lista de años anteriores).
