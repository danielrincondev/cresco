# ADR-002 — Framework móvil y servidor

**Fecha:** 2026-08-02 · **Estado:** Aceptado

## Contexto
El producto es una app Android usada por un docente de pie en un aula y por un
representante en su teléfono. RevenueCat es requisito obligatorio del Shipaton.

## Opciones
1. **TanStack + Tauri** — descartada: el soporte móvil es inmaduro y **no existe
   SDK de RevenueCat para Tauri**, lo que incumple el requisito del hackathon.
2. **Next.js + Expo** — Expo para las dos apps, Next como servidor.
3. Kotlin nativo — descartada: el equipo trabaja en TypeScript.

## Decisión
**Next.js + Expo (React Native).** Next **no** es un frontend web: es el
servidor donde viven BetterAuth, las rutas de API, el webhook de RevenueCat y la
tarea nocturna de generación de reportes.

## Consecuencias
- RevenueCat exige un *development build* de Expo; no funciona en Expo Go.
- Probar compras reales normalmente requiere subir un build firmado a un canal
  de pruebas internas de Play Console. Eso **no es un lanzamiento público** y es
  compatible con el plan de no publicar antes de septiembre. Iniciar en semana 2.
- **shadcn/ui es solo para web** y no corre en React Native. Para las apps se usa
  NativeWind con componentes propios; shadcn queda reservado para el panel web de
  la dirección en la v2.
- Se comparte el esquema de Drizzle y los tipos entre Next y Expo mediante un
  paquete local, sin montar un monorepo completo.
