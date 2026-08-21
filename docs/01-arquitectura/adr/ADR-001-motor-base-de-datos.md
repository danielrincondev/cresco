# ADR-001 — Motor de base de datos y ORM

**Fecha:** 2026-08-02 · **Estado:** Reemplazado el 2026-08-16

> Decisión vigente: Convex proporciona la base de datos, las funciones de
> backend y los tipos generados. Ya no existe PostgreSQL ni Drizzle.

## Contexto
El modelo de datos es relacional y normalizado: 41 tablas con integridad
referencial, índices únicos parciales y restricciones CHECK que codifican reglas
de negocio. El equipo trabaja en TypeScript de punta a punta.

## Opciones
1. **Firestore** — rápido de arrancar, sin servidor propio, pero exige
   desnormalizar y mueve toda la integridad a la aplicación.
2. **Supabase** — Postgres administrado con RLS y autenticación incluidas.
3. **Postgres administrado + Drizzle ORM** — control total del esquema y tipos
   de TypeScript derivados de las tablas.

## Decisión
**Postgres con Drizzle ORM.** El proveedor concreto (Neon, Railway o Supabase
usado solo como base de datos) se decide por costo y latencia.

## Consecuencias
- El contrato de datos deja de ser un documento que puede mentir: los tipos se
  derivan del esquema y el compilador los verifica.
- Las migraciones las genera `drizzle-kit`; nunca se editan a mano.
- **Se pierde la RLS automática de Supabase Auth.** Ver ADR-004.
