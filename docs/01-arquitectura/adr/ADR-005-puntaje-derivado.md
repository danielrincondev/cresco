# ADR-005 — El puntaje es un valor derivado

**Fecha:** 2026-08-02 · **Estado:** Aceptado

## Contexto
El puntaje de conducta parte de 60 y se mueve con cada acción. Una acción puede
anularse (error del docente) o modificarse tras una inconformidad (F4), y en
ambos casos pasa a valer 0 puntos. Si el puntaje fuera un contador que se suma y
se resta, cualquier fallo lo desincronizaría de la bitácora de forma permanente
y sin manera de detectarlo.

## Decisión
**El puntaje nunca se incrementa: se recalcula.**

```
puntaje = clamp(base + Σ puntos de acciones VIGENTES del período, mínimo, máximo)
```

`puntaje_periodo` es una **caché** reconstruible en cualquier momento a partir de
`accion_registrada`. La verdad son las acciones.

## Consecuencias
- `accion_registrada.puntos_aplicados` es una fotografía inmutable: cambiar el
  catálogo no altera acciones ya registradas.
- Nada se borra. `ANULADA` y `MODIFICADA` valen ambas 0, pero se muestran
  distinto al representante (F4).
- El recálculo corre al registrar una acción, al resolverla y al cerrar el período.
- Los topes diarios (+4 / −5, C4) **no** puede validarlos la base de datos sola:
  van en la función de servidor que registra la acción, antes de insertar.
