# Cuestionario de dirección visual — Cresco v1.0

> **Estado:** Borrador · **Dueño:** Persona A (dueña del archivo `Theme.ts`) · **Última revisión:** 2026-08-08

Preguntas cuya respuesta hace falta para poder escribir `Theme.ts` y los seis
componentes base. Mismo formato que `cuestionario-definiciones.md`: respondan con
el número y la opción (ej. `B2: b`).

**El resultado de esta sesión es código, no un documento** (decisión del 3 de
agosto). Este archivo es solo el guion de la sesión; una vez escrito el tema,
este documento pasa a `Reemplazado`.

**Leyenda:** 🔴 sin esto no se puede escribir `Theme.ts` · 🟡 afecta a los
componentes pero no al tema base · 🟢 se puede diferir sin bloquear la semana 2

---

## Antes de empezar: las restricciones que ya existen

No son decisiones, son hechos del proyecto. Cualquier propuesta que las
incumpla se descarta sin discutir:

| Restricción | De dónde viene | Qué implica |
|---|---|---|
| **NativeWind + componentes propios.** shadcn/ui no corre en React Native | ADR-002 | No hay librería de componentes de la que copiar; todo se define aquí |
| **El docente usa la app de pie, con una mano, con 30 niños haciendo ruido** | Manual B, D11 | Botones grandes, mínimos toques, nada que exija precisión |
| **El padre promedio no lee gráficos estadísticos** | Manual B, P4/P6 | Un número grande, una frase clara, color que se entienda sin leer |
| **Android real, probablemente gama media** | ADR-002 | Nada de animaciones pesadas ni sombras costosas |
| **Se usa en aulas y patios, a veces con sol** | Contexto del piloto | El contraste no es un detalle de accesibilidad, es de legibilidad |
| **Dos apps con personalidades distintas:** docente = herramienta de trabajo; representante = informativa y simple | CONTEXT §1 | Ver bloque A |

---

## Bloque A — Alcance del tema

**A1** 🔴 ¿**Un solo tema para las dos apps, o dos temas?**
 a) Uno solo, compartido. Misma paleta y componentes; las apps se diferencian por
    densidad y contenido, no por color
 b) Un núcleo compartido (color, tipografía, espaciado) + variantes por app
    (p. ej. la del docente más densa, la del representante más aireada)
 c) Dos temas independientes

> *Recomendación:* **b**. Un solo color de marca hace que se vean del mismo
> producto, pero el docente necesita densidad (40 nombres en pantalla) y el
> representante necesita respiro. La diferencia se resuelve con escala de
> espaciado y tamaño de tipografía, no con dos paletas.

**A2** 🔴 ¿**Modo oscuro en la v1?**
 a) No. Solo claro. Se difiere a v2
 b) Sí, desde el inicio

> *Recomendación:* **a**. Duplica el trabajo de definición y de prueba de
> contraste, y multiplica los estados a revisar en cada componente. Con 31
> pantallas y seis semanas, no pasa el filtro de *Must*. Si se elige **a**,
> escriban los tokens de forma que admitan un segundo tema después (objeto de
> colores con nombres semánticos, no `#hex` sueltos en los componentes).

**A3** 🟡 ¿La app se ve **"institucional/seria"** o **"cercana/amable"**?
Afecta radios, tipografía y saturación. Tengan presente que el producto da
malas noticias sobre un hijo: demasiado alegre resta credibilidad, demasiado
severo asusta al padre.

---

## Bloque B — Color de marca y semántico

**B1** 🔴 ¿**Cuál es el color primario de Cresco?**
Los cuatro manuales usan hoy un verde azulado (`#106b58`), pero **eso lo elegí yo
para maquetar los PDF, no es una decisión de marca**. Si les gusta, adóptenlo
explícitamente; si no, cámbienlo y regenero los manuales.

Definan:
- Primario, y al menos 3 variantes (claro / base / oscuro) para estados
- Un color de acento, si hacen falta dos

**B2** 🔴 **Colores semánticos.** Éxito, advertencia, error, informativo.

> *Trampa concreta de este producto:* el rojo de "error de formulario" **no puede
> ser el mismo** que el de "acción negativa de tu hijo" ni que el de "alerta de
> emergencia". Son tres cosas distintas y el padre las va a ver en la misma
> pantalla. Necesitan diferenciarse por tono, peso o forma.

**B3** 🔴 **Superficies y texto.** Fondo de pantalla, fondo de tarjeta, borde,
separador; texto primario, secundario, deshabilitado, y texto sobre color.

**B4** 🟡 ¿La **publicidad** del plan gratuito tiene un contenedor visual propio
que la separe del contenido? Un anuncio que se confunde con un reporte escolar
es un problema de confianza, no de estética.

---

## Bloque C — Las seis franjas de conducta 🔴

**Este es el bloque más específico del producto y el que no pueden saltarse:**
la columna `franja_conducta.color_hex` existe en el esquema y hay que sembrarla
con valores reales.

| Rango | Franja | Color |
|---|---|---|
| 0 – 15 | Situación crítica | ? |
| 16 – 30 | Muy por debajo | ? |
| 31 – 50 | Por debajo de lo esperado | ? |
| 51 – 60 | En el punto de partida | ? |
| 61 – 80 | Buen desempeño | ? |
| 81 – 100 | Excelente | ? |

**C1** 🔴 ¿Qué color lleva cada franja?

**C2** 🔴 ¿**Rojo→verde clásico, o una escala menos punitiva?**
El rojo sobre el nombre de un niño de 8 años tiene una carga que conviene medir.
Una alternativa es que el extremo bajo sea ámbar/naranja en vez de rojo, y
reservar el rojo para la alerta de emergencia.

**C3** 🔴 ¿Cómo se distingue una franja **sin depender del color**?
Obligatorio: entre el 5 y el 8 % de los hombres tiene daltonismo, y el padre
puede estar mirando la pantalla bajo el sol. Opciones: icono distinto, posición
en una barra, la frase orientadora en negrita, un patrón.

**C4** 🟡 ¿La franja "En el punto de partida" (51-60) se ve **neutra**?
Es donde arranca todo estudiante cada parcial. Si se ve amarilla o de
advertencia, cada padre empieza el parcial creyendo que su hijo va mal.

---

## Bloque D — Acciones y sus estados 🟡

**D1** ¿Cómo se ven las tres acciones por estudiante — **Positiva, Negativa,
Nota** — en la lista del reporte? Color, icono, o ambos.

**D2** ¿Cómo se muestran los estados `ANULADA` ("anulada por el docente") y
`MODIFICADA` ("resuelta con el representante")? Valen 0 puntos pero **se muestran
distinto** (F4). Tachado, atenuado, con etiqueta.

**D3** ¿Cómo se ve el **puntaje grande** de P6? Es el elemento más importante de
la app del representante: número, franja y frase. Tamaño, peso y si el color del
número cambia con la franja.

**D4** ¿Cómo se ve el bloque expandible de **Evento** al final del reporte
diario?

---

## Bloque E — Alerta de emergencia 🔴

**E1** ¿Qué aspecto tiene la alerta que **recibe** el representante?
Debe ser inconfundible frente a cualquier otra notificación, pero recordar que
existe el caso `SIMULACRO`: si la pantalla es idéntica en un simulacro, entrenan
al padre a ignorarla.

**E2** ¿Cómo se ve el **botón de activar** en la app del docente (D17)?
La regla ya decidida es que sea **difícil de tocar por accidente**, con
confirmación de dos pasos. Definan cómo se ve algo que es importante pero no
invita a tocarse.

**E3** ¿Dónde y cómo aparece la declaración de que **no sustituye al ECU 911**?
Ya está decidido que sea visible, no escondida en términos. Falta el tratamiento.

---

## Bloque F — Tipografía

**F1** 🔴 ¿**Fuente del sistema o fuente cargada?**
 a) La del sistema (Roboto en Android). Cero peso, cero riesgo, arranque instantáneo
 b) Una fuente cargada con `expo-font` (Inter, Manrope, etc.)

> *Recomendación:* **a** para la v1. Cargar fuentes en Expo añade peso al bundle
> y un estado de "fuente no lista" que hay que manejar en cada pantalla. Si
> quieren personalidad tipográfica, úsenla solo en el número del puntaje y en los
> títulos, no en todo el cuerpo.

**F2** 🔴 **Escala de tamaños.** ¿Cuántos niveles y cuáles? Sugerencia de partida:
`xs 12 · sm 14 · base 16 · lg 20 · xl 24 · 2xl 32 · puntaje 56`.

> El cuerpo **no debe bajar de 16** en la app del representante: hay abuelos y
> tíos entre los representantes legales (`PARENTESCO` incluye `ABUELO_A`).

**F3** 🟡 ¿Qué pesos se usan? Con dos (regular y semibold) suele alcanzar.

**F4** 🟡 ¿Interlineado y ancho máximo de línea para la frase orientadora?

---

## Bloque G — Espaciado, formas y profundidad

**G1** 🔴 **Escala base de espaciado.** Múltiplos de 4 o de 8. Definan de 6 a 8
pasos.

**G2** 🔴 **Radio de esquina.** Un valor para tarjetas, uno para botones, uno
para chips. ¿Redondeado suave, muy redondeado, o esquinas casi rectas?

**G3** 🟡 **Profundidad.** ¿Sombras, bordes, o solo cambio de fondo?
En Android las sombras se hacen con `elevation` y se comportan distinto que en
iOS. Lo más barato y consistente es **borde + fondo**, sin sombra.

**G4** 🔴 **Tamaño mínimo del área táctil: 44 × 44 dp.** No es una pregunta, es
un requisito. Anótenlo en el tema como constante.

---

## Bloque H — Los seis componentes base 🔴

Ya está decidido cuáles son. Para **cada uno** hay que definir variantes, tamaños
y **los cuatro estados**: normal, presionado, deshabilitado y cargando.

| # | Componente | Lo que hay que decidir |
|---|---|---|
| 1 | **Tarjeta** | Con y sin borde; ¿cabecera opcional? |
| 2 | **Botón** | Variantes: primario, secundario, texto, **destructivo** (anular una acción, activar alerta). Tamaños: grande para el docente de pie. Estado *cargando* obligatorio |
| 3 | **Campo** | Etiqueta, texto de ayuda, error, contador de caracteres (el reporte los usa) |
| 4 | **Chip de estado** | Es el que más variantes necesita: 6 franjas, 3 estados de acción, estados de cita e inconformidad. Definan **una** mecánica reutilizable, no 15 chips distintos |
| 5 | **Encabezado** | Título, atrás, acción a la derecha; y la **barra de selección de hijo** del representante (D6 del backlog) |
| 6 | **Estado vacío** | Ilustración o icono + frase + acción. El caso más frecuente del producto: *"Aún no tienes reporte nuevo"* |

**H1** 🔴 ¿Cómo se ve el estado **cargando**? Cada pantalla debe manejar
cargando/vacío/error (definición de "terminado", punto 2). ¿Spinner, esqueleto, o
ambos según el caso?

---

## Bloque I — Iconografía e ilustración

**I1** 🟡 ¿**Librería de iconos**? (`lucide-react-native`, `@expo/vector-icons`…)
o ninguna. Elijan una sola y no la mezclen.

**I2** 🟢 ¿Hay ilustraciones para los estados vacíos, o solo iconos?
Las ilustraciones son bonitas y consumen tiempo que no tienen.

**I3** 🟢 ¿Tono de los emoji? Si aparecen en notificaciones push, defínanlo.

---

## Bloque J — Recursos de entrega 🟡

No son parte de `Theme.ts` pero salen de la misma sesión y **son requisito del
Shipaton**:

- **Icono de app de 1024 × 1024 px**
- **Al menos una captura de 1179 × 2556 px**, sin marco de dispositivo
- Nombre visible de la app en el lanzador de Android

---

## Bloque K — Dónde vive el archivo 🔴

`Theme.ts` y `components/base/` **no tienen hoy un directorio padre definido en
el repositorio**. Tampoco `lib/puntaje.ts`, que el manual de B manda crear.

Esto se decide en la misma sesión, porque son los primeros archivos de código de
aplicación del proyecto y marcan la estructura que seguirán los demás. Ver la
propuesta en `docs/01-arquitectura/estructura-codigo.md`.

---

## Qué se entrega al terminar la sesión

1. `Theme.ts` con: colores (marca, semánticos, superficies, texto, **las 6
   franjas**), tipografía, espaciado, radios y la constante de área táctil.
2. Los seis componentes base con sus variantes y sus cuatro estados.
3. Los seis `color_hex` de `franja_conducta`, listos para la semilla.
4. Este documento marcado como `Reemplazado`.

**Criterio para saber que salió bien:** alguien puede construir una pantalla
nueva sin preguntar ningún color ni ningún espaciado, y sin escribir un solo
`#hex` fuera de `Theme.ts`.
