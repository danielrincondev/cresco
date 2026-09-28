"""Genera la fuente de iconos de Cresco: solo los glifos que usa la app (#84).

`MaterialCommunityIcons.ttf` trae 7.448 iconos y pesa 1,28 MB; la app usa unas
decenas. Este script busca en `movil/src` los nombres de icono que aparecen en
el código, les suma su variante `-outline` cuando existe (el componente `Icono`
la usa para lo inactivo), y escribe:

- `movil/assets/fonts/IconosCresco.ttf`: la fuente recortada.
- `movil/src/theme/glifos.ts`: el mapa nombre → código que usa `Icono.tsx`.

**Cuándo correrlo:** al usar un icono nuevo. No hace falta acordarse: el tipo
del nombre de un icono sale de `glifos.ts`, así que un icono que no esté en el
recorte no compila (`npm run typecheck`, y por tanto el CI, lo rechazan).

Uso, desde la raíz del repositorio (necesita `pip install fonttools`):

    python scripts/generar-iconos.py
"""

import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
MOVIL = RAIZ / "movil"
VECTOR_ICONS = RAIZ / "node_modules" / "@expo" / "vector-icons" / "build" / "vendor" / "react-native-vector-icons"
FUENTE_COMPLETA = VECTOR_ICONS / "Fonts" / "MaterialCommunityIcons.ttf"
MAPA_COMPLETO = VECTOR_ICONS / "glyphmaps" / "MaterialCommunityIcons.json"
FUENTE_RECORTADA = MOVIL / "assets" / "fonts" / "IconosCresco.ttf"
MODULO_GLIFOS = MOVIL / "src" / "theme" / "glifos.ts"

# Las líneas donde puede aparecer un nombre de icono: la prop o el campo
# `icono`, o el `nombre` que recibe `<Icono>`.
CONTEXTO = re.compile(r"\b(icono|nombre)\b", re.IGNORECASE)
LITERAL = re.compile(r'"([a-z0-9]+(?:-[a-z0-9]+)*)"')


def nombres_usados(mapa: dict) -> set:
    usados = set()
    for archivo in (MOVIL / "src").rglob("*.ts*"):
        if ".test." in archivo.name or archivo.name == "glifos.ts":
            continue
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            if CONTEXTO.search(linea):
                usados.update(n for n in LITERAL.findall(linea) if n in mapa)
    return usados


def main() -> None:
    mapa = json.loads(MAPA_COMPLETO.read_text(encoding="utf-8"))
    base = nombres_usados(mapa)
    con_contorno = base | {f"{n}-outline" for n in base if f"{n}-outline" in mapa}
    glifos = {n: mapa[n] for n in sorted(con_contorno)}

    opciones = subset.Options()
    opciones.layout_features = []
    opciones.hinting = False
    opciones.name_IDs = ["*"]
    opciones.notdef_outline = True
    fuente = TTFont(FUENTE_COMPLETA)
    recortador = subset.Subsetter(options=opciones)
    recortador.populate(unicodes=list(glifos.values()))
    recortador.subset(fuente)
    FUENTE_RECORTADA.parent.mkdir(parents=True, exist_ok=True)
    fuente.save(FUENTE_RECORTADA)

    # Comprobación: cada código del mapa tiene su glifo en la fuente nueva.
    cmap = TTFont(FUENTE_RECORTADA).getBestCmap()
    faltan = [n for n, c in glifos.items() if c not in cmap]
    assert not faltan, f"La fuente recortada no tiene: {faltan}"

    lineas = "\n".join(f'  "{n}": 0x{c:X},' for n, c in glifos.items())
    MODULO_GLIFOS.write_text(
        "/**\n"
        " * Los iconos que usa Cresco y su código en `assets/fonts/IconosCresco.ttf`.\n"
        " *\n"
        " * **Generado por `scripts/generar-iconos.py`: no se edita a mano.** Para\n"
        " * usar un icono nuevo, se escribe en el código y se vuelve a correr el\n"
        " * script, que recorta la fuente y reescribe este archivo (#84).\n"
        " */\n"
        f"export const GLIFOS = {{\n{lineas}\n}} as const;\n",
        encoding="utf-8",
        newline="\n",
    )
    completo = FUENTE_COMPLETA.stat().st_size
    recortado = FUENTE_RECORTADA.stat().st_size
    print(f"{len(base)} iconos ({len(glifos)} glifos con sus contornos): "
          f"{completo / 1024:.0f} KB -> {recortado / 1024:.1f} KB")


if __name__ == "__main__":
    main()
