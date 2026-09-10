# DP-011 — Iconografía: MaterialCommunityIcons con pares de contorno

**Fecha:** 2026-09-06 · **Estado:** Aceptada

## Contexto

La sesión de dirección visual del 14 de agosto decidió usar **Google Material
Symbols**, con contorno para el menú y los botones inactivos, y **relleno
sólido exclusivo para la sección activa**. El mecanismo previsto era el eje
variable `FILL` de esa fuente, cargada con `expo-font` y controlada con
`fontVariationSettings`.

Ya entonces quedó anotado como riesgo: *"el soporte de ejes de fuente variable
en React Native no es parejo entre versiones — probar en un Android real antes
de construir toda la navegación sobre este patrón"* (issue #21).

## Lo que se comprobó

No hizo falta un Android: el enfoque es imposible por dos razones
independientes, ambas verificadas sobre el propio proyecto.

**1. React Native no soporta `fontVariationSettings`.** No aparece en sus
tipos ni en ninguna parte de su código. No hay forma de mover un eje variable
desde un estilo.

**2. Las fuentes de Material Symbols publicadas en npm son estáticas.** Se
verificó leyendo el directorio de tablas de los `.ttf` de
`@expo-google-fonts/material-symbols-outlined` y de
`@expo-google-fonts/material-symbols`: **ninguno tiene tabla `fvar`**, así que
no contienen ejes variables — el eje `FILL` no está ahí ni aunque React Native
pudiera usarlo.

Cualquiera de las dos razones basta por sí sola.

## Decisión

**Se usa `MaterialCommunityIcons`, de `@expo/vector-icons`**, con la
convención `nombre` (relleno) y `nombre-outline` (contorno).

De sus 7448 iconos, **1889 tienen par de contorno**, incluidos todos los que
necesita la navegación: `home`, `bell`, `account`, `calendar`, `alert`,
`account-group`, `file-document`.

**La intención visual no cambia**: contorno para lo inactivo, relleno para la
sección activa. Cambia el mecanismo — dos glifos en lugar de un eje variable.

## Consecuencias

- Existe `movil/src/theme/Icono.tsx`, que resuelve el par automáticamente
  según la propiedad `activo`. **Nadie escribe el sufijo `-outline` a mano.**
- No todos los iconos tienen contorno. El componente **cae al relleno** cuando
  falta, en vez de romperse, y expone `tieneContorno(nombre)` para poder
  comprobarlo al elegir un icono.
- Se retira la dependencia de Material Symbols. **`expo-font` se conserva**:
  hace falta para cargar Inter, que sigue siendo la tipografía decidida (F1).
- El token `Icono` de `Theme.ts` se actualizó: ya no describe el eje `FILL`.
- **Queda una comprobación visual menor**, no de viabilidad: que la distinción
  contorno/relleno se lea con claridad al tamaño de la barra de navegación en
  un Android real. Va junto con los componentes base (issue #5), no antes.

## Por qué el razonamiento original se invirtió

La nota del 14 de agosto descartaba `@expo/vector-icons` porque *"trae Material
Icons clásico, sin el eje de relleno variable"*. Eso es cierto y resultó
irrelevante: **no hace falta un eje variable si existen los dos glifos**. El
descarte se apoyaba en una condición que nunca fue necesaria.
