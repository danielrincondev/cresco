# Reglas del Shipaton 2026 — Categoría Next Gen

> **Estado:** Vigente · **Dueño:** el equipo · **Última revisión:** 8 de agosto de 2026
>
> Extracto de las reglas oficiales de RevenueCat Shipaton 2026 (Devpost),
> limitado a lo que aplica a nuestra candidatura. **Solo competimos en Next Gen.**
> Fuente: `revenuecat-shipaton-2026.devpost.com/rules`
>
> Las reglas pueden cambiar a discreción del patrocinador. Verificar la página
> oficial antes de la entrega.

---

## 1. Fechas oficiales

| Hito | Fecha y hora |
|---|---|
| Período de inscripción | 15 mayo 2026, 8:00 PDT → **30 septiembre 2026, 23:45 PDT** |
| Período de presentación | 31 julio 2026, 8:00 PDT → **30 septiembre 2026, 23:45 PDT** |
| Período de evaluación | 1 octubre, 00:00 PDT → 13 octubre, 12:00 PDT |
| Anuncio de ganadores | 21 de octubre de 2026 |

**Fecha límite en hora de Ecuador: jueves 1 de octubre de 2026, 01:45.**
(30 de septiembre, 23:45 PDT = 1 de octubre, 02:45 EDT.)

Nuestro **deadline interno sigue siendo el 28 de septiembre**. Los dos días de
margen son intencionales: no se usan.

---

## 2. Elegibilidad — Next Gen

Requisitos que debemos cumplir:

- **Estudiante activo** matriculado en secundaria, universidad, bootcamp u otro
  programa académico.
- **Correo electrónico estudiantil o académico válido en la cuenta de Devpost.**
  La elegibilidad del dominio se verifica contra la lista JetBrains/swot.
- Mayoría de edad en el país de residencia (Ecuador: 18 años).
- Ecuador no está en la lista de países excluidos.

**Acción inmediata:** verificar que nuestro dominio universitario aparece en la
lista de swot y crear la cuenta de Devpost con el correo académico, no con el
personal.

### Representante del equipo

Un equipo debe designar a **una persona (el "Representante")** que presenta la
propuesta en nombre de los tres. El premio se paga al Representante, y **es su
responsabilidad repartirlo** entre los miembros. Conviene acordar el reparto por
escrito antes de enviar.

> **Pendiente de verificar:** las reglas exigen correo académico al presentar la
> propuesta. No queda explícito si los tres miembros deben tener correo académico
> o solo el Representante. Lo prudente es que los tres lo tengan.

---

## 3. Qué hay que construir

**Requisito central:** una aplicación de software funcional que use el **SDK de
RevenueCat** para gestionar **al menos una compra dentro de la aplicación o en la
web**, o que muestre anuncios mediante **RevenueCat Ads**.

- Plataformas admitidas: iOS, iPadOS, macOS o **Android**. ✅ Cumplimos.
- El proyecto debe instalarse y ejecutarse de forma consistente, y funcionar tal
  como se muestra en el video.
- Si integra SDK, API o datos de terceros, debemos estar autorizados a usarlos
  según sus licencias.
- El proyecto pudo existir antes del período de presentación, pero **no debe
  haber sido publicado en ninguna tienda** antes de dicho período. ✅ Cumplimos.

---

## 4. Lo que Next Gen NO exige (y cambia nuestro plan)

> **Este es el hallazgo más importante del documento.**

Cita textual de las reglas:

> "En lugar de publicar tu aplicación en la App Store, envía un video de
> demostración y un enlace a tu repositorio de código abierto público, incluyendo
> un archivo de licencia de código abierto. **No se requiere una cuenta de
> desarrollador de Apple o Google ni una publicación en la tienda.**"

Y además:

> "Los proyectos galardonados con el premio Next Gen están **exentos de los
> requisitos de prueba de descarga desde la tienda** y se evaluarán en función del
> video de demostración y el repositorio de código público."

**Consecuencias directas:**

| Ya NO es necesario | Estado anterior |
|---|---|
| Cuenta de Google Play Console | Era el trámite crítico de Persona C |
| Cuota de registro de desarrollador | Era un costo a resolver |
| Publicar en canal de pruebas internas | Estaba en el plan de la semana 1 |
| URL de app publicada en tienda | Requisito de las otras categorías |
| Código promocional para jueces | Requisito de las otras categorías |
| Prueba gratuita accesible a los jueces | Requisito de las otras categorías |

**Esto libera el mayor riesgo externo del proyecto.** Persona C ya no depende de
tiempos de trámite ajenos.

> **Pendiente de verificar (Persona C, esta semana):** cómo demostrar RevenueCat
> funcionando **sin** una app en Play Console. RevenueCat ofrece mecanismos de
> prueba que no dependen de la tienda; hay que confirmar en su documentación
> oficial cuál aplica y si `getOfferings()` devuelve datos en ese modo. Si
> resultara que sí hace falta una app en Play Console para mostrar una compra de
> verdad, el trámite vuelve a la lista y hay que arrancarlo de inmediato.

---

## 5. Requisitos de la presentación

### 5.1 Repositorio de código — obligatorio en Next Gen

- Debe ser **público** y **de código abierto**.
- Debe incluir un **archivo de licencia de código abierto**.
- **La licencia debe ser visible en la parte superior de la página del
  repositorio**, en la sección "Acerca de" / "About". En GitHub esto ocurre solo
  si el archivo se llama `LICENSE` y contiene una licencia reconocida.
- Debe contener **todo el código fuente, los recursos y las instrucciones
  necesarias** para que el proyecto funcione correctamente.

> **Los jueces evalúan el repositorio.** No es un anexo: es la mitad de nuestra
> nota. El `README.md` debe permitir que alguien externo levante el proyecto sin
> preguntarnos nada.

### 5.2 Video de demostración

- **Menos de dos (2) minutos.** Los jueces no están obligados a ver más.
- Debe mostrar **el proyecto funcionando en el dispositivo** para el que fue
  diseñado (un Android real).
- Subido a **YouTube o Vimeo**, público, con el enlace en el formulario de Devpost.
- **No debe incluir marcas comerciales de terceros, ni música ni material
  protegido por derechos de autor** sin permiso.

### 5.3 Recursos gráficos

- **Icono de la aplicación de 1024 × 1024 px.**
- **Al menos una captura de pantalla de 1179 × 2556 px**, sin marcos de
  dispositivo (sin el "marco" del teléfono alrededor).

### 5.4 Descripción textual

Una descripción que explique las características y la funcionalidad del proyecto.

### 5.5 Idioma

> "Todos los materiales de presentación deben estar **en inglés** o, si no lo
> están, el participante debe proporcionar una traducción al inglés del video de
> demostración, la descripción del texto y las instrucciones de la prueba."

**La app puede estar en español** (es su público real). Lo que debe estar en
inglés, o traducido, son los materiales de la presentación: descripción, video
(subtítulos) e instrucciones.

> **Decisión pendiente:** ¿narramos el video en inglés o en español con
> subtítulos en inglés? Los subtítulos son más seguros y muestran el producto en
> su idioma real.

### 5.6 Propiedad intelectual

- La propuesta debe ser obra original del equipo y de su propiedad exclusiva.
- Se puede usar software de código abierto cumpliendo sus licencias.
- Las propuestas **siguen siendo propiedad intelectual del equipo**. Al enviar,
  se concede al patrocinador una licencia no exclusiva para evaluarla y
  promocionarla.

---

## 6. Criterios de evaluación de Next Gen

> "Categoría exclusiva para estudiantes que premia la mejor aplicación presentada
> por estudiantes activos con una dirección de correo electrónico .edu (o
> equivalente). La evaluación se basa en **video y código abierto**; no se
> requiere publicación en la App Store ni en Google Play."

Los cuatro criterios, textuales:

1. **¿La idea de la aplicación es clara, útil, interesante u original? ¿Resuelve
   un problema real o crea una experiencia atractiva para sus usuarios objetivo?**
2. **¿El proyecto presentado demuestra progreso significativo hacia una aplicación
   funcional? ¿La funcionalidad principal queda clara a partir del video y el
   repositorio de código?**
3. **¿El proyecto utiliza RevenueCat de forma estratégica para dar soporte a
   suscripciones, compras dentro de la aplicación, compras web, anuncios u otro
   flujo de monetización?**
4. **¿La propuesta demuestra decisiones técnicas bien pensadas, una visión de
   producto acertada y cuidado en la forma en que se construyó y presentó la
   aplicación?**

### Cómo se traduce a nuestro trabajo

| Criterio | Qué lo demuestra en nuestro caso |
|---|---|
| 1 — Idea | El problema es real y verificable: comunicación escuela-familia en Ecuador. Vale la pena grabar o citar la validación con un profesor real. |
| 2 — Progreso funcional | **No exige app terminada, exige progreso significativo y funcionalidad principal clara.** Nuestro circuito completo (crear curso → invitar → registrar hijo → aprobar → acción → reporte) es exactamente eso. |
| 3 — RevenueCat estratégico | No basta con integrarlo: hay que **explicar la estrategia**. Nuestro paywall aparece cuando el representante intenta ver un tercer reporte anterior, no al abrir la app. Los dos públicos (representante y docente) con límites distintos también cuentan. |
| 4 — Decisiones técnicas y cuidado | **Aquí nuestros ADR, la matriz de permisos, el contrato de API y la documentación puntúan directamente.** El repositorio limpio y explicado es parte de la nota, no un extra. |

**El criterio 4 valida la inversión en documentación.** No es papeleo: es una de
las cuatro cosas que el jurado mide.

---

## 7. Premios de Next Gen

| Puesto | Premio |
|---|---|
| 1.º | **15 000 USD** + invitación a la conferencia App Growth de RevenueCat en Nueva York (sin viaje ni alojamiento) + app en una valla de Times Square + trofeo Shippy + entrada de blog + cobertura en 9to5Mac y 9to5Google |
| 2.º | **10 000 USD** + entrada de blog |
| 3.º | **5 000 USD** + entrada de blog |

**Cobros e impuestos:** el premio se paga al Representante del equipo. Como
residentes fuera de EE. UU. probablemente nos pidan el formulario **W-8BEN**.
Los impuestos y comisiones bancarias corren por nuestra cuenta. Hay 10 días
hábiles para devolver los formularios requeridos.

---

## 8. Ship Kit — beneficios por participar

No es un premio: es un beneficio de participación. Hasta **25 beneficios de
patrocinadores** desbloqueables en cinco hitos:

1. Registro completo
2. Creación del proyecto en RevenueCat
3. Primera compra de prueba
4. Primera llamada a la API de la tienda
5. Primera compra real

Requiere estar registrado en Devpost y **completar el formulario de participante
que llega por correo**. No se envía a correos desechables o temporales. La
comunicación va por el Discord oficial de Shipaton o `shipkit@revenuecat.com`.

> Vale la pena perseguir los primeros hitos: son gratis y algunos beneficios
> pueden ser herramientas útiles para el propio proyecto.

---

## 9. Sobre otras categorías

Todas las demás categorías exigen **publicar la app en una tienda** (App Store,
Google Play o Galaxy Store) durante el período de presentación.

Decisión del equipo: **solo Next Gen**. Si más adelante publicáramos la app antes
del 30 de septiembre, el **RevenueCat Peace Prize** encajaría temáticamente con
nuestro producto (beneficio social, impacto en comunidades) y un proyecto puede
presentarse a varias categorías no-Influencer. **No es nuestro plan actual** y
publicar implicaría la cuenta de desarrollador que acabamos de descartar.

---

## 10. Cambios que estas reglas provocan en nuestras decisiones

| # | Antes | Ahora | Afecta a |
|---|---|---|---|
| 1 | Play Console era el trámite crítico de la semana 1 | **Ya no es necesario.** Se libera tiempo y desaparece el mayor riesgo externo | Persona C |
| 2 | Repositorio privado | **Debe ser público y de código abierto antes de enviar**, con `LICENSE` en la raíz | Todos |
| 3 | Video de demostración de 3 minutos | **Menos de 2 minutos** | Todos |
| 4 | Materiales en español | **Descripción y video en inglés, o con traducción/subtítulos en inglés** | Todos |
| 5 | Deadline real 28 de septiembre | El oficial es el **30 de septiembre, 23:45 PDT**. Mantenemos el 28 como margen | Todos |
| 6 | — | Hacen falta **icono 1024×1024** y **captura 1179×2556 sin marcos** | Diseño |
| 7 | — | Los tres deben tener **cuenta de Devpost con correo académico** | Todos |
| 8 | La documentación era higiene interna | **Puntúa en el criterio 4.** El repositorio es objeto de evaluación | Todos |

---

## 11. Decisión pendiente: qué licencia de código abierto

El repositorio debe ser abierto, pero **el equipo planea comercializar el producto
después del hackathon**. Estas dos cosas conviven, pero hay que elegir con
criterio:

- **MIT / Apache 2.0** — permisivas. Cualquiera puede tomar el código, cerrarlo y
  competir con nosotros. Apache 2.0 añade una concesión expresa de patentes.
- **AGPL-3.0** — copyleft fuerte. Quien lo use en un servicio debe liberar sus
  cambios. Desalienta que un tercero lo comercialice cerrado, pero también puede
  complicar la adopción por parte de un colegio con sus propios sistemas.

Puntos a tener presentes: seguimos siendo los titulares del copyright y podemos
**licenciar en paralelo** (abierto para la comunidad, comercial para clientes).
Pero lo publicado bajo una licencia abierta queda disponible bajo esa licencia
para siempre, en esa versión.

**No soy abogado y esta decisión tiene consecuencias comerciales reales.**
Conviene consultarlo antes de publicar el repositorio.

---

## 12. Checklist de entrega

### Ahora (semana 1)

- [ ] Verificar el dominio del correo universitario en la lista JetBrains/swot
- [ ] Crear cuenta de Devpost **con correo académico** (los tres)
- [ ] Registrarse en el hackathon ("Unirse al hackathon")
- [ ] Completar el formulario de participante para el Ship Kit
- [ ] Designar al Representante del equipo y acordar por escrito el reparto del premio
- [ ] Crear el proyecto en RevenueCat (hito 2 del Ship Kit)
- [ ] Verificar cómo demostrar RevenueCat sin Play Console

### Durante el desarrollo

- [ ] Elegir la licencia de código abierto y añadir `LICENSE` en la raíz
- [ ] Mantener el `README.md` en condiciones de que un juez levante el proyecto
- [ ] Nunca subir claves, `.env`, keystore ni datos reales de estudiantes
      (**el repositorio será público**)
- [ ] Revisar que `docs/03-piloto/firmados/` siga ignorada

### Antes de enviar (semana del 21 de septiembre)

- [ ] Hacer público el repositorio
- [ ] Confirmar que la licencia aparece en la sección "Acerca de" de GitHub
- [ ] Video de **menos de 2 minutos**, en YouTube o Vimeo, público
- [ ] Video sin música ni marcas de terceros
- [ ] Subtítulos o narración en inglés
- [ ] Descripción del proyecto en inglés
- [ ] Icono 1024×1024
- [ ] Captura 1179×2556 sin marcos de dispositivo
- [ ] README verificado en una máquina limpia por alguien que no lo escribió
- [ ] Enviar el **28 de septiembre**, no el 30

---

## 13. Qué debe mostrar el video (menos de 2 minutos)

Propuesta de guion, sujeta a ajuste:

| Tiempo | Contenido |
|---|---|
| 0:00 – 0:15 | El problema, con una frase concreta sobre la realidad escolar ecuatoriana |
| 0:15 – 0:55 | El circuito completo en un teléfono real: docente registra una acción → publica el reporte → el representante lo recibe y lo lee |
| 0:55 – 1:20 | **RevenueCat funcionando**: el paywall aparece en el momento exacto en que el representante intenta ver un tercer reporte, y la compra se completa |
| 1:20 – 1:45 | El acumulado con la franja de conducta, y una inconformidad resuelta que devuelve puntos |
| 1:45 – 2:00 | Cierre: qué sigue, y mención al repositorio abierto |

RevenueCat debe verse funcionando, no mencionarse de pasada: es el criterio 3 y
además el requisito central del hackathon.
