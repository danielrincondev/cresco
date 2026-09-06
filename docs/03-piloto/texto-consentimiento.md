# Texto de consentimiento — Cresco

> **Estado:** Borrador · **Dueño:** Persona C · **Versión del documento:** `2026-09-v1` · **Última revisión:** 2026-09-07

Este es el texto que se muestra en la pantalla **P3**, cuando el representante
legal registra a su hijo. Es lo que la persona lee de verdad antes de tocar
"Acepto" — el aviso de privacidad completo queda enlazado desde aquí.

> ⚠️ **Pendiente de revisión jurídica**, igual que el aviso de privacidad.
> Trata datos de menores.

---

## Cómo se guarda

Al aceptar se registra en la tabla `consentimiento`:

| Campo | Valor |
|---|---|
| `tipo` | `TRATAMIENTO_DATOS_MENOR` |
| `versionDocumento` | `2026-09-v1` |
| `otorgado` | `true` |
| `otorgadoEn` | el momento exacto |
| `estudianteId` | el estudiante al que se refiere |

**No se guarda un simple "sí".** Se guarda **qué versión** de este texto leyó la
persona (decisión I4). Si el texto cambia, los consentimientos anteriores
siguen atados a la versión que realmente se leyó.

---

## Texto para la pantalla

> ### Antes de continuar
>
> Usted está por registrar a **{nombre del estudiante}** en el curso
> **{nombre del curso}**, a cargo de **{nombre del docente}**.
>
> **Qué información se va a guardar sobre su hijo o representado**
> Su nombre, documento de identidad y curso. Y, durante el año lectivo, los
> registros de conducta y responsabilidad que escriba su docente: qué ocurrió,
> cuándo, y los puntos correspondientes.
>
> **Quién la puede ver**
> Solo usted y el docente de su curso. Ningún otro representante, ningún otro
> docente. **Su hijo no usa esta aplicación** y no tiene acceso a ella.
>
> **Lo que no hacemos**
> No guardamos fotos ni archivos. No vendemos ni cedemos su información. Este
> puntaje **no es una calificación** y no afecta las notas de las materias.
>
> **Lo que todavía no podemos hacer**
> En esta primera versión **no podemos borrar los datos si usted lo solicita**.
> Podemos dejar de mostrarlos, pero el registro permanece. Estamos trabajando
> en poder anonimizarlos, y se lo decimos de frente antes de que acepte.
>
> **Puede cambiar de opinión**
> Puede retirar este consentimiento cuando quiera desde Ajustes. Si lo hace,
> dejará de recibir los reportes de su hijo por esta aplicación.
>
> [ Leer el aviso de privacidad completo ]
>
> ☐ **He leído lo anterior y autorizo el tratamiento de los datos de mi hijo o
> representado en los términos descritos.**
>
> ☐ Confirmo que soy su **representante legal** y que estoy facultado para
> otorgar esta autorización.
>
> [ Acepto y continúo ]     [ Ahora no ]

---

## Notas para quien construya la pantalla (Kamila, #32)

- **Las dos casillas son obligatorias** y van separadas a propósito: una es el
  consentimiento sobre los datos, la otra es la declaración de que quien acepta
  tiene la facultad legal de hacerlo. No las junte en una sola.
- **"Ahora no" no puede ser un callejón sin salida.** Si la persona no acepta,
  explique que puede seguir recibiendo la información por los canales de la
  institución, y déjela salir sin bloquearla.
- El texto **no debe bajar de 16px**. Entre los representantes legales hay
  abuelos y abuelas.
- El enlace al aviso completo tiene que ser visible, no escondido al final.
- Los campos entre llaves `{...}` se reemplazan con datos reales; no los deje
  literales.

## Notas internas

- La redacción de "lo que todavía no podemos hacer" es deliberada y **no debe
  suavizarse**. Sale de DP-007: en v1 solo se declara la política, la
  anonimización es v2. Prometer una eliminación que la aplicación no ejecuta
  es peor que no presentar la función.
- La declaración de representante legal cubre el caso D2: un solo representante
  por estudiante en la v1, y es quien canjea el código.
- Cuando el aviso de privacidad pase revisión jurídica, **este texto debe
  revisarse en el mismo acto**: comparten número de versión.
