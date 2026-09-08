---
name: Tarea
about: Trabajo concreto asignado a una persona del equipo
title: ''
labels: ''
assignees: ''
---

## Qué tiene que poder hacer alguien cuando esto esté listo

<!-- Una o dos frases, en términos de la persona que usa la app, no del código.
     Ejemplo: "Un docente puede ponerle una acción a un estudiante y el puntaje
     se actualiza solo." -->

## Contexto que hace falta antes de escribir código

<!-- Las reglas de producto que aplican, y POR QUÉ son así.
     Regla importante: NO copies aquí valores que ya viven en el código
     (topes, rangos, colores, plazos). Escribe "usa exigirTopeDiario", no
     "el límite es -5". Si copias el número, este issue queda desactualizado
     el día que la regla cambie — que es justo el problema que dejamos atrás
     al abandonar los manuales en PDF. -->

## Funciones que ya existen — úsalas, no las reescribas

<!-- Nómbralas: exigirVinculo, calcularPuntaje, exigirTitularDelCurso...
     Alguien que empieza no sabe que existen y las reimplementa peor. -->

## Por dónde empezar

<!-- El primer paso concreto, para vencer la página en blanco.
     Casi siempre: "abre <archivo ya revisado> y copia esa forma".
     No detalles la implementación completa: eso lo resuelve quien la hace. -->

## Terminado cuando

- [ ] <!-- criterios verificables, no intenciones -->
- [ ] `npm run typecheck` y `npm test` pasan en verde
- [ ] Revisado y aprobado por otra persona (nadie fusiona su propio PR)

## Depende de

<!-- "Bloqueada por #N", o "nada, se puede empezar ya".
     Si depende de algo, di qué hacer mientras tanto en vez de esperar. -->

## No toques

<!-- Archivos de otros módulos y superficie compartida (schema.ts, lib/enums.ts,
     lib/guardas.ts, lib/permisos.ts, lib/flags.ts). Si hace falta cambiarlos,
     se pide en el grupo: GitHub va a exigir la aprobación de los tres. -->
