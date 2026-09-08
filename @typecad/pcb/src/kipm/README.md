# kipm

> [!NOTE]
> This is a copied and slightly modified version of the original [kipm](https://github.com/tomat/kipm) tool, integrated directly into **type**CAD.

kipm is a tool that fetches symbols, footprints, and 3D models from LCSC/EasyEDA and converts them to KiCad format. The conversion process uses the same method as [easyeda2kicad.py](https://github.com/uPesy/easyeda2kicad.py).

This directory contains only the core conversion engine used by typeCAD's `add-component` and `add-package` commands. The standalone CLI (`kipm install`, `components.txt` workflow, etc.) was removed during integration.

## License

MIT — see the [original repository](https://github.com/tomat/kipm) for attribution.
