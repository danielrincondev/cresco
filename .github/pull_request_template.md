## Qué cambia y por qué

<!-- Una o dos frases. Si cierra un Issue, escribe "Cierra #<número>" para que
     GitHub lo cierre solo al fusionar. -->

## Comprobaciones

- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa
- [ ] No hay secretos, claves ni datos reales de estudiantes o representantes

## Si toca datos de estudiantes

Solo si el PR lee o escribe `estudiante`, `matricula`, `accionRegistrada`,
`reporteEstudiante` o `puntajePeriodo`:

- [ ] La consulta pasa por `convex/lib/permisos.ts` — no hay `ctx.db` suelto
- [ ] Hay una prueba de que un usuario sin vínculo recibe `ErrorPermiso`
- [ ] Los eventos que corresponden quedan auditados con `auditar()` (DP-006)

> Con Convex se perdió la capa RLS de PostgreSQL: `permisos.ts` es la **única**
> defensa que queda, no una de dos.

## Si cambia una decisión

- [ ] Escribí el DP o el ADR nuevo, y marqué el anterior como `Reemplazado`

<!-- Las decisiones no se editan encima: se escribe una nueva que reemplaza a la
     anterior. Ver docs/00-producto/decisiones/README.md -->

## Si cambia superficie compartida

`schema.ts` · `lib/enums.ts` · `lib/guardas.ts` · `lib/permisos.ts` · `lib/flags.ts`

- [ ] Lo hablé con los otros dos antes de abrir el PR

<!-- CODEOWNERS ya pedirá la aprobación de los tres automáticamente. -->
