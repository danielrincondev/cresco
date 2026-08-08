# Manual del equipo — Cresco (equipo Neofix)

> **Estado:** Vigente · **Dueño:** Todos · **Última revisión:** 2026-08-07

Media página que evita la mayor causa de fracaso de un equipo de tres, que no es técnica.

## Propiedad
Cada persona es dueña de su módulo (ver `backlog-y-reparto.md`). **Nadie edita el
módulo de otro.** Si necesitas un campo ajeno, lo pides en el grupo y su dueño lo
agrega. Excepción: `db/schema/enums.ts` y `api/openapi.yaml` son compartidos y
cambian solo con acuerdo de los tres.

## Ramas y commits
- Ramas desde `develop`: `feat/`, `fix/`, `chore/` + descripción corta.
  Ejemplo: `feat/asignar-accion-tope-diario`
- Commits en formato convencional: `feat(acciones): valida tope diario de -5`
- `main` está protegida: nadie empuja directo.
- **Nadie fusiona su propio PR.** Se necesita una aprobación.
- Un PR que toque datos de estudiantes exige las tres verificaciones de
  `matriz-permisos.md`.

## Ritmo
- Lunes, 20 min: qué hizo cada uno, qué sigue, qué le bloquea.
- Viernes, 10 min: revisión de riesgos y del punto de control.
- Si algo te bloquea más de **medio día**, lo dices ese mismo día. No al lunes.

## Definición de terminado
Las cinco condiciones de `backlog-y-reparto.md`, sección 6.

## Decisiones
Las técnicas de fondo se registran como ADR. Si hay desacuerdo, decide el dueño
del módulo afectado; si toca a los tres, se vota y el resultado queda escrito.

## Si alguien se atrasa
No es un juicio, es logística: se dice en el punto de control, se reparte lo
pendiente y se recorta alcance del bloque *Should*. La regla es avisar temprano;
lo que rompe un proyecto de seis semanas no es el atraso, es enterarse tarde.

## Nunca se sube al repositorio
Claves de RevenueCat · credenciales de base de datos · keystore de firma ·
archivos `.env` · **datos reales de estudiantes o representantes**. El Excel que
les pase un profesor para probar la carga no entra al repositorio: se usan datos
ficticios generados.
