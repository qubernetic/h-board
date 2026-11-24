# Asset attribution

Every non-code asset in this repository (icons, images, fonts, design files) is listed here with its author, source
and licence.

**Policy:** H-Board ships no favicons, logos or other images taken from the sites it links to. Every asset is
original, CC0, OSI open source or under a Creative Commons licence that allows redistribution. The Qubernetic mark,
micro mark and lockup (and the renderings made from them) are by Qubernetic under the Creative Commons
Attribution-NoDerivatives 4.0 International licence (CC BY-ND 4.0, https://creativecommons.org/licenses/by-nd/4.0/):
they may be shared unchanged with credit to Qubernetic, not changed, and are not under Apache-2.0. The licence grants
no trademark rights: the names and marks stay trademarks of Qubernetic (see `NOTICE`).

**Pins:** the files copied from the Qubernetic brand repository, and the renderings made from its marks, are pinned
by sha256 in `.config/assets.toml`; `just assets` (part of `just ci`) fails on a missing or changed file.

| File | Author | Source | Licence | Use |
|---|---|---|---|---|
| `mock/img/lockup-horizontal-<mode>.svg` | Qubernetic | the Qubernetic brand repository, tag v0.3.2, `logo/svg/`, unchanged | CC BY-ND 4.0; trademark of Qubernetic | the logo in the mock's header |
| `docs/design/gen/lockup-horizontal-<mode>.svg`, `docs/design/gen/mark-<mode>.svg` | Qubernetic | the Qubernetic brand repository, tag v0.3.2, `logo/svg/`, unchanged | CC BY-ND 4.0; trademark of Qubernetic | placed in the FigCraft design by `docs/design/gen/build.py` |
| `docs/design/gen/mark.json` | Qubernetic | the Qubernetic emblem as a grid of 76 × 40 characters, from the qubernetic.com character field (`mark.ts`) | CC BY-ND 4.0; trademark of Qubernetic | the emblem on the home · standby page |
| `extension/icons/mark-on-dark.svg`, `packages/host-extension/public/icons/mark-on-dark.svg` | Qubernetic | the Qubernetic brand repository, tag v0.3.2, `logo/svg/mark-micro-dark.svg`, unchanged | CC BY-ND 4.0; trademark of Qubernetic | the mark in the extension's settings header |
| `mock/favicon.svg`, `extension/icons/mark.svg`, `packages/host-extension/public/icons/mark.svg` | Qubernetic | the micro mark of the brand repository, tag v0.3.2, with its ink switched by `prefers-color-scheme` | CC BY-ND 4.0; trademark of Qubernetic | favicon of the mock and the extension pages |
| `extension/icons/<size>.png`, `extension/icons/toolbar-on-<mode>-<size>.png`, and the same files under `packages/host-extension/public/icons/` | Qubernetic | rendered from the micro mark of the brand repository, tag v0.3.2 (on a dark tile, or bare for the toolbar) | CC BY-ND 4.0; trademark of Qubernetic | the extension icon and its toolbar icon |
| `docs/design/h-board.figcraft`, `docs/design/png/*.png` | H-Board contributors; the Qubernetic marks by Qubernetic | made by `docs/design/gen/build.py` in FigCraft | Apache-2.0, except the marks: CC BY-ND 4.0, trademarks of Qubernetic | the design file and its pictures |
| `mock/fonts/IBMPlexMono-<weight>.woff2`, `mock/fonts/IBMPlexSans-Variable.woff2` | IBM Corp. | IBM Plex (https://github.com/IBM/plex), taken from the Qubernetic brand repository, tag v0.3.2, `fonts/`, unchanged | OFL-1.1 | the mock's typefaces; licence text in `mock/fonts/OFL-IBM-Plex.txt` |
| `mock/fonts/OFL-IBM-Plex.txt` | IBM Corp. | the Qubernetic brand repository, tag v0.3.2, `fonts/ibm-plex-mono/OFL.txt`, unchanged | OFL-1.1 | the licence of the Plex files beside it |
| `mock/fonts/Phosphor.ttf`, `docs/design/gen/phosphor-map.json` | Phosphor Icons (Helena Zhang, Tobias Fried) | https://github.com/phosphor-icons/web, release 2.1.1, `src/regular/Phosphor.ttf`; the map lists its code points | MIT | the icon font; licence text in `mock/fonts/LICENSE-Phosphor.txt` |
| `mock/fonts/LICENSE-Phosphor.txt` | Phosphor Icons | https://github.com/phosphor-icons/web, release 2.1.1, `LICENSE` | MIT | the licence of the Phosphor font |
| `packages/ui/assets/img/lockup-horizontal-<mode>.svg` | Qubernetic | the Qubernetic brand repository, tag v0.3.2, `logo/svg/`, unchanged | CC BY-ND 4.0; trademark of Qubernetic | the logo in the page's header |
| `packages/ui/assets/fonts/IBMPlexMono-<weight>.woff2`, `packages/ui/assets/fonts/IBMPlexSans-Variable.woff2`, `packages/ui/assets/fonts/OFL-IBM-Plex.txt` | IBM Corp. | IBM Plex (https://github.com/IBM/plex), taken from the Qubernetic brand repository, tag v0.3.2, `fonts/`, unchanged | OFL-1.1 | the page's typefaces, bundled with the page; licence text in `OFL-IBM-Plex.txt` beside them |
| `packages/ui/assets/fonts/Phosphor.ttf`, `packages/ui/assets/fonts/LICENSE-Phosphor.txt`, `packages/ui/assets/fonts/phosphor-map.json` | Phosphor Icons (Helena Zhang, Tobias Fried) | https://github.com/phosphor-icons/web, release 2.1.1, `src/regular/Phosphor.ttf` and `LICENSE`, unchanged; the map is a copy of `docs/design/gen/phosphor-map.json` and lists the font's code points | MIT | the page's icon font, and the code point of each icon name |
| `mock/icons/brands/*.svg`, `mock/icons/brands.js` | Simple Icons contributors; the marks belong to their owners | Simple Icons 16.38.1 (https://github.com/simple-icons/simple-icons), unchanged; see `mock/icons/brands/NOTICE` | CC0-1.0; the marks are trademarks of their owners | brand marks on the cards of the mock |
