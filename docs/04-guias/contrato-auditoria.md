# Contrato de auditoría para la interfaz

Funciones en `api.auditoria`. Dueño: Persona C. Alcance fijado por
[DP-006](../00-producto/decisiones/006-auditoria-alcance-v1.md).

## Por qué la pantalla tiene que llamarlas

Con Postgres, la capa de acceso escribía la bitácora dentro de la misma consulta
que leía el dato. Con Convex no se puede: las `query` son de solo lectura y
cacheadas. Así que **la lectura la audita la pantalla**, llamando a una mutation
al abrirse. Si la pantalla no llama, no hay registro — y la bitácora es lo que se
le enseña a un colegio cuando pregunta *"¿quién vio los datos de mi hijo?"*.

## Los cuatro eventos de la v1 y quién los produce

| Evento | Quién lo escribe | Estado |
|---|---|---|
| `APROBAR` estudiante | `nucleo.aprobarEstudiante` | Hecho (Persona A, #7) |
| `LOGIN` | `auditoria.registrarInicioSesion` | Hecho (#19) |
| `LEER_SENSIBLE` | `auditoria.registrarLecturaSensible` | Hecho (#19) |
| `CREAR` / `ANULAR` acción | `conducta.ts` | Pendiente (Persona B, #9) |

`EXPORTAR` y `ALERTA` están diferidos a la v2 por DP-006. (`interaccion.ts` ya
escribe `ALERTA`; es de más, no de menos.)

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
