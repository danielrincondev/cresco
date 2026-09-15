# Vencimiento programado de reclamos

Al abrir un reclamo, `interaccion.abrirInconformidad` guarda `venceEn` y programa
`interaccion.vencerInconformidad` para esa fecha mediante `ctx.scheduler.runAt`.
La creación del reclamo, su tarea y la notificación de apertura pertenecen a
la misma transacción. No hay un cron diario de vencimientos.

La tarea recibe solo el id y vuelve a leer el reclamo. Si todavía está `ABIERTA`
o `EN_REVISION` y llegó su `venceEn`, lo cambia a `VENCIDA` y crea los avisos del
representante y del docente en la misma transacción. Si ya se resolvió, se
eliminó o todavía está dentro del plazo, termina sin modificar nada. Repetir la
tarea no duplica avisos. Un reclamo vencido sigue visible y se puede responder.

`venceEn` es la referencia del plazo. La ejecución programada puede ocurrir
después de esa fecha; la comprobación del servidor impide vencerlo antes.
Las notificaciones se crean en la bandeja; el envío push es una integración
separada. Véase [Scheduled Functions de Convex](https://docs.convex.dev/scheduling/scheduled-functions).

## Activación para los reclamos existentes

Después de desplegar este cambio en el entorno correspondiente, ejecutar desde
`movil/`:

```sh
npx convex run interaccion:programarVencimientosExistentes '{}'
```

Para el despliegue de producción, usar explícitamente:

```sh
npx convex run --prod interaccion:programarVencimientosExistentes '{}'
```

Esta ejecución inicial es necesaria: los reclamos creados con el código
anterior no tenían tarea. La mutation interna recorre los estados `ABIERTA` y
`EN_REVISION` en páginas de hasta 100 documentos. Cada página programa la
siguiente con `runAfter(0)`, hasta terminar; no hay que ejecutar el comando por
cada lote ni esperar al día siguiente.

- Los reclamos cuyo plazo ya pasó se programan para ejecución inmediata.
- Los que siguen dentro del plazo se programan para su `venceEn` original.
- Los resueltos y vencidos se omiten.
- El campo opcional `vencimientoProgramadoId` identifica los ya programados y
  evita duplicar tareas al repetir la migración, incluso si dos ejecuciones se
  solapan. Su valor es una referencia de programación, no el estado del reclamo.

La respuesta `{ programadas, continuacion }` describe únicamente el primer
lote. `continuacion: true` indica que quedó programada la siguiente página o el
siguiente estado; no significa que ya haya terminado toda la migración.
Comprobar su finalización y cualquier error en las funciones programadas y los
logs del despliegue de Convex. Repetir el comando permite completar páginas que
no se hubieran llegado a programar. Si una tarea individual falla por un error
del código, corregirlo y reintentar `interaccion:vencerInconformidad` con el id
afectado; repetir la migración no reemplaza tareas que ya tienen id.

## Alcance

Este cambio avanza el issue #17. El recálculo de puntaje al resolver como
`MODIFICADA` o `ANULADA` sigue pendiente de la integración con conducta (#9).
