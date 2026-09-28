# Flujo de trabajo del equipo — Cresco

> **Estado:** Vigente · **Dueño:** Todos · **Última revisión:** 2026-09-28

Este documento reemplaza la idea de "manual que se reescribe cada vez que algo
cambia". Explica el problema que resolvimos, qué se construyó, y cómo trabaja
cada uno a partir de ahora — individual y en equipo.

## El problema que veníamos arrastrando

Con manuales en prosa (el principal + los individuales de rol), cada vez que
una decisión cambiaba había que reescribir el documento a mano. Terminábamos
con versiones desactualizadas circulando, y nadie podía estar seguro de cuál
era la vigente. Encontramos ejemplos reales de esto en el propio repo:
`decisiones-pendientes.md` y `registro-decisiones.md` llevaban semanas sin
aparecer en el índice de `docs/README.md`, y `manual-equipo.md` todavía
mencionaba rutas del stack viejo (`db/schema/enums.ts`) que ya no existen.

La solución no es "escribir mejor", es dejar de depender de que un documento
en prosa se mantenga sincronizado a mano.

## Qué se construyó

| Antes | Ahora |
|---|---|
| `NEXT_STEPS.md` reescrito a mano cada vez | GitHub Issues |
| Decisiones editadas encima en `registro-decisiones.md` | `docs/00-producto/decisiones/` — un archivo por decisión (DP-001 a DP-016), nunca se edita, se reemplaza |
| Reglas de negocio descritas en prosa | Viven en el código: `convex/lib/enums.ts`, `guardas.ts` — el código no puede desincronizarse de sí mismo |
| "Cada quien es dueño de su módulo" como frase del manual | `.github/CODEOWNERS` — GitHub pide la revisión correcta solo, sin depender de que alguien se acuerde |

`registro-decisiones.md`, `decisiones-pendientes.md` y
`cuestionario-direccion-visual.md` quedaron marcados `Reemplazado` y movidos a
`docs/99-archivo/`. El 28 de septiembre esa carpeta se retiró del árbol, junto
con `Contexto/NEXT_STEPS.md`: su contenido sigue completo en el historial de
git (`git show c5ce997:docs/99-archivo/`).

## El ciclo de trabajo, individual

Ejemplo con tu propio módulo (`convex/nucleo.ts`):

1. `git checkout main && git pull` — arrancas siempre desde `main` actualizado.
2. `git checkout -b feat/nucleo-lo-que-sea` — rama corta. "Corta" significa que
   la fusionas en días, no que sea técnicamente distinta de una rama normal.
3. Escribes el código. Las reglas de negocio (rangos, topes, enums) no se
   inventan en el momento — se importan de `convex/lib/enums.ts` y
   `guardas.ts`. Si necesitas cambiar una de esas reglas compartidas, el
   cambio va ahí, no duplicado en tu archivo.
4. `npm run typecheck && npm test` en tu máquina antes de subir nada.
5. `git push -u origin feat/nucleo-lo-que-sea` → abres el Pull Request contra
   `main`.
6. GitHub ve, por `CODEOWNERS`, que tocaste `convex/nucleo.ts` → te pide
   automáticamente la aprobación de Kenny (tu respaldo en ese archivo). Si
   además tocaste algo compartido (`schema.ts`, `enums.ts`, `guardas.ts`,
   `permisos.ts`), pide la aprobación de **los tres**.
7. El CI corre solo (typecheck + tests). El botón de fusionar queda
   deshabilitado hasta que esté en verde y llegue la aprobación.
8. Fusionas. Tu rama se borra sola en GitHub.
9. B y Kenny hacen `git pull origin main` cuando les toque tocar algo cerca.

## El ciclo en equipo

- **Lunes, 20 min:** qué hizo cada uno, qué sigue, qué bloquea — esto no
  cambia, sigue siendo la reunión de siempre.
- **Viernes, 10 min:** revisión de riesgos y del punto de control — tampoco
  cambia. Se suma una pregunta fija: *¿tomamos alguna decisión esta semana que
  no quedó escrita en un DP?*
- El Project board reemplaza la necesidad de recitar en la reunión "qué
  falta" — se puede mirar antes.

## Cuando cambia una decisión

Se escribe un DP nuevo (ej. `DP-009`) que reemplaza al viejo — el viejo se
marca `Reemplazada`, nunca se edita ni se borra. Si el cambio también afecta
código compartido (`enums.ts`, etc.), ese PR ya pide la aprobación de los
tres automáticamente — la conversación de "¿estamos de acuerdo?" no depende
de que alguien la organice aparte.

## Cuando algo no llega a tiempo

No se deja en una rama vieja divergiendo de `main`. Se fusiona igual, pero
detrás de una bandera de activación (`convex/lib/flags.ts`) — código real,
compilado y probado, simplemente apagado hasta que esté listo. Ya lo decidimos así para el diferenciador de IA (`DP-008`); la idea es
usarlo como práctica general.

## La interfaz (actualizado el 10 de septiembre — DP-012)

Entre el 31 de agosto y el 9 de septiembre hubo un cuarto rol dedicado a
construir la interfaz de las 31 pantallas. **Ese rol se disolvió** y la
interfaz pasó a Persona C, junto con interacción e infraestructura. El porqué
está en `docs/00-producto/decisiones/012-rol-interfaz-se-disuelve.md`.

Qué significa en la práctica:

- **Las pantallas no volvieron a A ni a B.** Es deliberado: A tiene su módulo
  terminado y B es la ruta crítica del producto. Si te llega una pantalla que
  toca tu backend, la construye C y te pregunta lo que necesite.
- **Si cambias la firma de una función que una pantalla ya usa, avísale a C.**
  No hay forma automática de saber quién construyó una pantalla sobre tu
  función — a diferencia de un archivo compartido, esto no lo detecta
  CODEOWNERS. Un comentario en el issue de la pantalla afectada es suficiente.
- **CODEOWNERS de `movil/src/`** tiene a C como dueño y a A como respaldo. Eso
  concentra en C más superficie de revisión que en nadie, y es un riesgo
  asumido a sabiendas. **La señal de que hay que repartir** es que los PR de
  interfaz empiecen a acumularse esperando a una sola persona, o que C deje de
  avanzar en su propio módulo. Si eso pasa, se reparte por módulo: quien
  escribió el backend de D14–D19 revisa esas pantallas, y así con cada uno.
- **La superficie compartida no cambió.** `schema.ts`, `enums.ts`,
  `guardas.ts`, `permisos.ts` y `flags.ts` siguen exigiendo el acuerdo de A, B
  y C. Que C tenga ahora la interfaz no le da un voto extra ahí.

## Producto y entrega

Persona D (@krriveram) no escribe código. Su lane son tres cosas con fecha:

- **La sumisión al Devpost** — video de menos de dos minutos y repositorio
  público (ADR-007). Cierra el 30 de septiembre, igual que todo lo demás.
- **Validación con usuarios reales** — entrevistas antes del piloto. De la
  primera, el 1 de septiembre, salieron DP-009 y DP-010.
- **Los textos de la aplicación y del piloto** — en lenguaje llano, revisados
  contra lo que la aplicación realmente hace.

Cada una vive en su propio issue con fecha de entrega. Un lane sin código
necesita entregables con fecha, o deja de poder seguirse.

## Configuración de GitHub

La hizo Daniel, que es quien tiene permisos de **Admin** sobre el repo:

- `main` está protegida: todo cambio entra por Pull Request, con la revisión de
  los dueños que pide `CODEOWNERS` y el check del CI (`Tipos y pruebas`) en
  verde.
- La rama de un PR se borra sola al fusionarlo.

Cambiar algo de esto solo lo puede hacer un Admin: se le pide a Daniel.
