# Contrato de auditoría para la interfaz

Funciones en `api.auditoria`. Dueño: Persona C. Alcance fijado por
[DP-006](../00-producto/decisiones/006-auditoria-alcance-v1.md).

## Por qué la pantalla tiene que llamarlas

Con Postgres, la capa de acceso escribía la bitácora dentro de la misma consulta
que leía el dato. Con Convex no se puede: las `query` son de solo lectura y
cacheadas. Así que **la lectura la audita la pantalla**, llamando a una mutation
al abrirse. Si la pantalla no llama, no hay registro — y la bitácora es lo que se
le enseña a un colegio cuando pregunta *"¿quién vio los datos de mi hijo?"*.

## Los cuatro eventos de la v1 y quién los produce (actualizado el 28 de septiembre)

Un evento necesita **dos** piezas: la función que lo escribe y alguien que la
llame. Tenerlas separadas es lo que hizo que `LOGIN` y `LEER_SENSIBLE`
existieran durante días sin registrar nada — la tabla vacía y nadie enterado.
Por eso esta tabla mira las dos.

| Evento | Quién lo escribe | Quién lo dispara | Estado |
|---|---|---|---|
| `APROBAR` estudiante | `nucleo.aprobarEstudiante` | la propia mutation | ✅ |
| `CREAR` acción | `conducta.registrarAccion` | la propia mutation | ✅ desde el PR #39 |
| `ANULAR` acción | `conducta.anularAccion`, e `interaccion.resolverInconformidad` cuando un reclamo termina en anulación | las propias mutations | ✅ |
| `LOGIN` | `auditoria.registrarInicioSesion` | `useAuditoriaSesion` en `NucleoScreen` | ✅ |
| `LEER_SENSIBLE` | `auditoria.registrarLecturaSensible` | `useLecturaSensible`, en cada pantalla de abajo | ✅ |

### Qué pantallas disparan `LEER_SENSIBLE`

Cada pantalla que muestra los datos de un menor uno por uno lo llama al
abrirse; si no, el acceso no queda registrado:

| Pantalla | `recurso` |
|---|---|
| Ficha del estudiante pendiente que el docente revisa para aprobar (`NucleoScreen`) | `FICHA_ESTUDIANTE` |
| Reporte del día y reportes anteriores del hijo (P4, `ReporteScreen`) | `REPORTE_ESTUDIANTE` |
| Acumulado del parcial: puntaje y bitácora (P6, `ReporteScreen`) | `BITACORA_ACCIONES` |

El acumulado muestra el puntaje junto a la bitácora, así que un solo registro
cubre los dos: `PUNTAJE_PERIODO` queda para una pantalla que muestre el
puntaje por separado.

La lista del curso (`Estudiantes`) **no** lo dispara a propósito: es un listado
de nombres, no la apertura del expediente de una persona. Registrar cada
scroll llenaría la bitácora de ruido y haría más difícil responder la pregunta
que importa.

### Además de los cuatro de DP-006

DP-006 dejó el resto para la v2, pero estos eventos ya se registran porque
cada uno es de más, no de menos:

| Evento | Quién lo escribe |
|---|---|
| `ALERTA` | `interaccion.activarAlerta`, al publicar una alerta o un simulacro (queda marcado) |
| `ACTUALIZAR` | `interaccion.resolverInconformidad`: siempre sobre el reclamo, y además sobre la acción cuando el reclamo la modifica |
| `EXPORTAR` | `conducta.prepararInforme`: el informe en PDF saca de la aplicación los datos de un menor |
| `ANULAR` curso | `nucleo.eliminarCurso`, con el número de matrículas retiradas |

## `registrarInicioSesion({ plataforma? })`

Llamarla **una vez** cuando `useConvexAuth().isAuthenticated` pase a verdadero, y
**otra vez** justo después de que `nucleo.completarPerfil` devuelva por primera
vez. No hace falta llamarla en cada pantalla.

Devuelve `{ registrado, motivo }`:

- `{ registrado: true, motivo: null }` — quedó escrito.
- `{ registrado: false, motivo: "SIN_PERFIL" }` — la cuenta de Clerk existe pero
  todavía no hay perfil del dominio, así que no hay a quién atribuir el evento.
  **No es un error**: no mostrar nada al usuario, volver a llamar tras el alta.
- `{ registrado: false, motivo: "YA_REGISTRADO" }` — ya había un `LOGIN` de esta
  persona en los últimos 30 minutos. Tampoco es un error.

`plataforma` es `"ANDROID" | "IOS" | "WEB"` y es opcional.

Lanza `ErrorPermiso("NO_AUTENTICADO")` si no hay sesión — esperar a que Clerk
confirme antes de llamar.

## `registrarLecturaSensible({ estudianteId, recurso })`

Llamarla al **abrir** una pantalla que muestra datos de un estudiante, junto a la
`query` que los trae. `recurso` es una de:

| `recurso` | Pantalla |
|---|---|
| `FICHA_ESTUDIANTE` | ficha o detalle del estudiante |
| `BITACORA_ACCIONES` | historial de acciones registradas |
| `REPORTE_ESTUDIANTE` | reporte diario o de período |
| `PUNTAJE_PERIODO` | puntaje del parcial |

Devuelve `{ registrado: true }` o `{ registrado: false }`. `false` significa que
ya había un registro **del mismo recurso, del mismo estudiante y de la misma
persona** en los últimos 5 minutos: volver a montar la pantalla al rotar el
teléfono no es un acceso nuevo. La pantalla no tiene que hacer nada distinto en
ninguno de los dos casos.

Funciona tanto para el representante vinculado como para el docente titular del
curso: la mutation comprueba el acceso con las mismas guardas de `permisos.ts`
que usa la consulta real.

Si quien llama no tiene acceso lanza `ErrorPermiso("SIN_VINCULO")` con el mismo
mensaje exista o no el estudiante, y **no escribe nada**. Eso es a propósito: si
escribiera antes de negar, la propia bitácora confirmaría qué estudiantes
existen.

## Lo que estas funciones no son

No son el permiso. Autorizan para no ser una puerta lateral, pero la consulta que
trae los datos **también** tiene que pasar por `permisos.ts`. Llamar a
`registrarLecturaSensible` no habilita nada.
