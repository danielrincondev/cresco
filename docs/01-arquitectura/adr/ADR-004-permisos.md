# ADR-004 — Aplicación de permisos por rol

**Fecha:** 2026-08-02 · **Estado:** Reemplazado el 2026-08-16

> Decisión vigente: cada función pública de Convex obtiene la identidad mediante
> `ctx.auth.getUserIdentity()` y aplica la autorización antes de leer o modificar
> documentos. Ya no existe RLS de PostgreSQL.

## Contexto
La regla más crítica del producto es que un representante solo acceda a los
estudiantes que representa. Un fallo aquí expone datos de conducta de un menor a
un tercero: no es un error corriente, es el fin del producto y un incidente de
protección de datos.

Al elegir BetterAuth y Drizzle (ADR-001, ADR-003), la autenticación vive en el
servidor y no en Postgres, así que la garantía no viene gratis.

## Decisión
**Defensa en dos capas.**

1. **Capa de acceso a datos obligatoria.** Toda consulta que devuelva datos de un
   estudiante pasa por funciones de `db/acceso/` que aplican el filtro por
   vínculo activo. Está prohibido usar `db.select()` suelto sobre las tablas de
   estudiante, acción o reporte fuera de esa carpeta; el revisor del PR lo rechaza.
2. **RLS de Postgres** sobre `estudiante`, `matricula`, `accion_registrada`,
   `reporte_estudiante` y `puntaje_periodo`. Cada petición abre una transacción
   que fija el identificador del usuario en una variable de sesión.

## Consecuencias
- Cuesta aproximadamente medio día más de configuración.
- Un bug de aplicación ya no basta para filtrar datos: haría falta que fallaran
  las dos capas a la vez.
- Toda consulta debe ejecutarse dentro de la transacción que fija la variable de
  sesión; olvidarlo devuelve cero filas, lo que falla de forma visible y segura
  en vez de silenciosa y peligrosa.
