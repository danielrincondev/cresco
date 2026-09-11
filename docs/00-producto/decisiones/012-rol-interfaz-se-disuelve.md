# DP-012 — El rol de interfaz se disuelve: Persona D pasa a producto y entrega

**Fecha:** 2026-09-10 · **Estado:** Aceptada

## Contexto

El 31 de agosto de 2026 se incorporó Persona D (@krriveram) con un encargo
claro: construir la interfaz de las **31 pantallas**, consumiendo las funciones
que A, B y C exponen. Antes de eso, cada uno de A/B/C era dueño de su backend
*y* de las pantallas que lo usan.

**Diez días después, ese lane está vacío:** cero commits, cero PR y cero
comentarios en el repositorio.

Mientras tanto, las pantallas se construyeron igual, porque nadie podía probar
su propio backend sin ellas:

| Quién | Qué construyó | Dónde |
|---|---|---|
| Persona A | 12 de las 31 pantallas (D3–D8, D10, P1–P3) y 4 de los 6 componentes base | PR #44 |
| Persona C | 6 pantallas más (D15–D17, P8, P10, P12) y los 2 componentes base que faltaban | PR #50 |

O sea: **~58 % del alcance de D ya está hecho, y ninguna línea la escribió D.**

### Por qué falló el rol, que no es lo mismo que decir que falló la persona

El encargo pedía que la primera tarea de alguien recién incorporado fuera ser
dueña de 31 pantallas. El issue #5, que es literalmente lo primero que se lee al
entrar, abre con *«son 31 pantallas en total… tú construyes la interfaz de las
31»* y sigue con una tabla de siete issues encadenados. Eso no es un primer día:
es un muro.

Y hay un segundo problema, independiente del primero: **la entrega al Devpost no
tiene dueño**. Video de menos de dos minutos más repositorio público (ADR-007),
con cierre el **30 de septiembre**, el mismo día que todo lo demás. En un
hackathon eso pesa tanto como el código, y hasta hoy no figura en ningún issue.

## Decisión

**1. El rol de interfaz, entendido como «construir las 31 pantallas», se
disuelve.** Deja de existir Persona D como cuarto módulo.

**2. Persona C asume la interfaz completa** — `movil/src/theme/`,
`components/` y `screens/` — además de interacción e infraestructura.

**3. Las pantallas NO vuelven a A ni a B.** Esto es lo que se decide, no una
consecuencia: antes del 31 de agosto cada uno tenía las suyas, y lo natural
sería devolverlas. No se hace.

- **A** tiene su módulo terminado y en revisión; devolverle pantallas lo saca de
  cerrar `nucleo.ts` y del hallazgo abierto en #52.
- **B es hoy la ruta crítica del producto.** Sin `conducta.ts` no hay puntaje,
  ni reportes, ni 10 de las 31 pantallas. Cargarle interfaz encima es empujar
  hacia atrás lo único que nadie más puede hacer.

**4. Persona D pasa a producto, validación y entrega**, sin escribir código:

- **La sumisión al Devpost** — video, capturas y el texto de la propuesta. Es
  suya de punta a punta y es el entregable que hoy no tiene dueño.
- **Validación con usuarios reales** — más entrevistas antes del piloto. El #11
  fue una sola conversación y de ahí salieron DP-009 y DP-010.
- **Los textos de la aplicación** — el aviso de privacidad y el consentimiento
  en lenguaje llano, y los mensajes que lee un representante sobre su hijo.

## Consecuencias

- **`CODEOWNERS` cambia:** las tres rutas de `movil/src/` pasan a
  @Kenny28-176 con @danielrincondev de respaldo.
- **Se reasignan siete issues** (#5, #28, #29, #30, #31, #32, #33) de
  @krriveram a @Kenny28-176. Cuatro de ellos ya están entregados en los PR #44
  y #50 y se cierran al fusionarlos.
- **Se abren issues nuevos con fecha** para el lane de D. Un rol sin
  programación necesita entregables con fecha, o se vuelve un título sin
  salida: «video de demo el 25» es un compromiso, «apoyar en diseño» no lo es.
- **Persona C concentra ahora interacción, infraestructura e interfaz.** Es un
  riesgo y se asume a sabiendas: quedan 20 días y la alternativa —repartir
  pantallas a A y B— cuesta más de lo que ahorra.
- **Lo que no cambia:** D nunca escribió en `convex/` y sigue sin hacerlo. La
  superficie compartida (`schema.ts`, `lib/enums.ts`, `lib/guardas.ts`,
  `lib/permisos.ts`, `lib/flags.ts`) sigue exigiendo el acuerdo de A, B y C.

### Cuándo hay que reabrir esta decisión

Si los PR de interfaz empiezan a acumularse esperando la revisión de una sola
persona, o si C deja de avanzar en su propio módulo por sostener la interfaz,
la señal es que hay que **repartir las pantallas por módulo** — quien escribió
el backend de D14–D19 revisa esas pantallas, y así con cada uno. Ese reparto ya
estaba anticipado como plan B en `flujo-de-trabajo.md` desde el 31 de agosto.

## Qué reemplaza

La incorporación del 31 de agosto de 2026 descrita en
`docs/02-equipo/backlog-y-reparto.md` §2 y en `docs/02-equipo/flujo-de-trabajo.md`,
sección «El contrato con la interfaz». Los dos documentos se actualizan junto
con esta decisión.

DP-001 (no se recorta el alcance de 31 pantallas) **sigue vigente**: esta
decisión cambia quién construye las pantallas, no cuántas se construyen.
