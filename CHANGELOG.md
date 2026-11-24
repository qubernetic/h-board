# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Core: the library model, the group, site, todo, settings and library commands with their agent classes, JSON export and import that name every wrong field, and the sample library of the English drawing (#9).
- Core: a snapshot after every change burst marked with its source, retention of the newest 20 and one a day for 7 days, undo, redo, an undoable restore with a preview, and a diff summary between two snapshots (#10).
- Store: the `Store` interface that runs a command by id and keeps a snapshot of each change, the memory store, and `ExtStore` on `chrome.storage.local` with a schema version, migrations, and a fallback to the newest readable snapshot when the stored library is corrupt (#11).
- Page: the start page with the layout rules of the drawing in core, the header, the group wheel with its tick ruler (keys 1 to 8, the arrows and the mouse wheel switch groups), the cards in three densities and three layouts, the status bar, light and dark theme and the empty group, with its fonts, icon font and logo bundled (#12).
- Page: the search line, with the engine switch (Tab or a click on the chip), search inside one of your sites by its alias, name or host and a space or by Tab on its row, suggestions with your own sites first and then the last five searches, and `/` to focus. An `http` or `https` address, with or without a port, opens as it is; one with another scheme opens nothing. Engines and site searches come from one table in core; nothing is sent anywhere while you type (#13).
- Page: editing. `e` turns on edit mode, where a card has its edit and delete buttons and moves by dragging or by Shift and an arrow; the dialog adds and edits a site with its address, name, description, group and icon (the bundled Simple Icons mark, a Phosphor icon or the initial); groups are added from the wheel, renamed and deleted in edit mode, and get their icon mode in the settings; to-dos are added, ticked and deleted. Every change runs a core command and keeps a snapshot; a delete shows a toast with undo for six seconds, and `z` or Ctrl+Z undoes the last change (#14).
- Page: the character field with the pointer trail that fades near text and cards, home · standby with the Qubernetic mark (after five minutes idle or with `s`; any key, click or pointer movement brings the start page back), its enter and exit transitions, and the motion setting (full, reduced as the default, none; `prefers-reduced-motion` means none until you pick a level) read through one flag, with every movement listed in `packages/ui/MOTION.md`. A key during a movement acts at once (#15).
- Page: jump codes. `f` shows a letter on every card (two letters in a group with more cards than letters) and the letter opens the card; `f`, a group number and the letter open a card of another group; Shift with the letter opens it in a tab behind this one; Escape or a letter no card has puts the codes away. The status bar and the tooltips read their keys from one keymap (#16).
- Page: snapshots, export and import. The status bar says "saved · time · N snapshots"; that sign, `v` or Restore in the settings opens the restore panel, which lists every snapshot with what changed and how many sites it holds, previews what a restore would change (the arrows walk the list, Enter restores) and restores in a way undo takes back. The settings export the library as a JSON file and import one, with undo; a wrong file is named in the settings, one problem per line (#17).
- Extension: the Manifest V3 host. A new tab hands over to the board in its own tab, so the keys reach the page without a click; the library, its snapshots and the last searches live in the extension's local storage; the toolbar button opens the settings page, and its icon follows the colour scheme through an offscreen page; Import from bookmarks asks for the optional `bookmarks` permission at that moment and adds one group per bookmark folder with the core command `group.import`, in one change undo takes back. The extension asks for `storage` and `offscreen` and nothing else (#18).
- Extension: the address bar as a command line. After the keyword `h`, a site's name, alias or host opens the site, a jump code (`a`, `4a`, `f4a`) opens a card in the group seen last or in the group of its number, a site and words search inside the site, and anything else goes to the chosen engine; the first row says where Enter goes. It only reads the library: one that cannot be read opens the board, which repairs it and says so. The router is the mock's `/go`, in core (#19).
- Extension: the beta build `0.1.0-beta.1`. `npm run build` writes the unpacked extension and the same files as `h-board-0.1.0-beta.1.zip`, with fixed dates so the same build gives the same zip, and `INSTALL.md` says how to load it in Chrome, Brave, Edge and Helium and to turn off other new-tab extensions first (#20).

### Changed

- Design: the drawing, its sample data and every frame in `docs/design/png/` are now in English (QUB-1297).
