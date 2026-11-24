# Installing the H-Board beta

The beta (`0.1.0-beta.1`) is a Manifest V3 extension for Chromium browsers. It is not in any extension store yet:
you load it unpacked, in developer mode. These steps are the same in Chrome, Brave, Edge and Helium; only the
address of the extensions page and the place of the developer mode switch differ.

## 1. Get the build

Either unzip `h-board-0.1.0-beta.1.zip` into a folder, or build it from a clone of this repository (Node 22.13 or
newer):

```bash
npm ci && npm run build
```

The build writes the unpacked extension into `packages/host-extension/dist/` and the same files as
`packages/host-extension/h-board-0.1.0-beta.1.zip`.

Keep the folder where it is. The browser loads the extension from that folder every time it starts, and it knows
the extension by the folder's path: load it from another folder and you get a second extension, which starts
again from the sample library.

## 2. Turn off other new-tab extensions

Only one extension can take over the new tab. If another one does (Monknow, Momentum, Infinity New Tab and the
like), the browser shows that one and H-Board never opens. Turn the other one off on the extensions page before you
load H-Board, or remove it.

## 3. Load it

| Browser | Extensions page | Developer mode |
|---|---|---|
| Chrome | `chrome://extensions` | the switch at the top right |
| Brave | `brave://extensions` | the switch at the top right |
| Edge | `edge://extensions` | the switch in the left column (open the menu on a narrow window) |
| Helium | `chrome://extensions` | the switch at the top right |

1. Open the extensions page from the table, by typing its address into the address bar.
2. Turn developer mode on.
3. Press **Load unpacked** and choose the folder: `packages/host-extension/dist/`, or the folder you unzipped into
   (the one that holds `manifest.json`).
4. H-Board appears in the list as version `0.1.0-beta.1`. Pin its toolbar button if you want the settings one
   click away.

Open a new tab (Ctrl+T, or Cmd+T on a Mac). The browser may ask whether you meant to change the new tab page; keep
the change, or it turns H-Board off again. The board opens with the sample library, and the keys work at once:
`f4a` opens the first site of group 4 without a click.

The extension asks for local storage and an offscreen page only. When you press Import from bookmarks in the
settings, it asks for the bookmarks, once.

## Your library

Everything stays in the extension's local storage on this computer; nothing is sent anywhere. Removing the
extension removes the library with it, and loading it from another folder starts again from the sample
library. Before either, open the settings and press Export: the JSON file it saves can be imported again.

## A newer build

Replace the files in the same folder with the new build, then press the reload arrow on H-Board's card on the
extensions page. The library stays.
