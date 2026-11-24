# Motion

Every movement of the page, and what it does at each of the three motion levels. This is the table of
`ideas/REQUIREMENTS.md` section 2, filled in for the page as it is built; `packages/ui/src/motion.ts` carries the
same rows (`MOVEMENTS`) and the durations (`MS`), and a test holds this file and that list together.

## The levels

- **full**, **reduced** and **none**, in the settings (the gear) under "Motion". The default is **reduced**: what
  explains a change of state stays, what only decorates goes.
- When the system asks for less motion (`prefers-reduced-motion: reduce`), the level is **none** until the user
  picks a level in the settings. Full or none in the library count as picked; the library cannot tell a picked
  reduced from the default, so a pick of reduced holds for the page that is open.
- One flag: the page reads the level in one place (`motion()` in `board.ts`) and writes it on the page as
  `data-motion`. Every movement, in the code and in the style sheet, reads that flag and nothing else.
- The user never waits: a key or a click during a movement acts at once, and the movement jumps to its end.

## The table

| | what moves | full | reduced | none |
|---|---|---|---|---|
| M1 | the character field and the pointer trail | the trail follows the pointer on the start page and on home · standby | the trail only on home · standby | still dots |
| M2 | the mark on home · standby | shimmer and the pointer playing with it | the same | still |
| M3 | entering and leaving home · standby | 920 ms in and 640 ms out, the mark decoding and a shockwave | 150 ms crossfade | at once |
| M4 | switching groups on the wheel | the drum springs and the cards write their text out | the drum springs and the cards crossfade | at once |
| M5 | changing the density | FLIP 300 ms | 125 ms crossfade | at once |
| M6 | delete and undo | the card runs out, the toast with a time bar | the card fades, the toast with a time bar | the card disappears, the toast without a bar |
| M7 | the toast coming and going | rises 8 px and fades in 200 ms | fades in 150 ms | at once |
| M8 | the scrim behind the search suggestions | 150 ms fade | 150 ms fade | at once |
| M9 | the edit and delete bar of a card in edit mode | 120 ms fade on hover and focus | 120 ms fade on hover and focus | at once |

## The movements

**M1, the character field.** A grid of faint dots behind the page, the same cells on every layout (`field.ts`).
Within 60 px of the pointer a cell flips to a random glyph with the chance f² · 0.8 · q, where f is 1 at the
pointer and 0 at the rim, and q is the quiet of the cell: 0.2 right behind a block of text or a card, rising to 1
over 80 px. A flipped cell stays hot for 80 to 200 ms, flickering, then turns back into its dot; a quarter of the
glyphs are cyan. The header and the status bar do not quiet the field. The rules are those of the anatomy sheet
(`docs/design/png/06-anatomy.png`) and of the mock.

**M2, the mark.** Home · standby draws the Qubernetic mark as characters of the same field
(`docs/design/gen/mark.json`). Now and then one of its cells blinks on its own, and under the pointer its cells
flip more readily than the dots around it.

**M3, home · standby.** After five minutes without a key, a click, the wheel or a pointer movement, or at once with
`s`, the start page gives way to home · standby: the mark, the clock, the date and the next to-do. Any key, a click,
the wheel or a pointer movement away from the mark brings the start page back. Full: on the way in (920 ms) the
start page dissolves into glyphs from the centre out, the clock travels to its standby place and the mark decodes
row by row; on the way out (640 ms) a shockwave runs from where the pointer woke the page, and each block of the
start page writes itself back as the ring reaches it. A key on the way in brings the start page back at once; a key
on the way out ends the movement and then acts on the start page.

**M4, switching groups.** Full: the drum springs to the new group and the new cards write their text out of the
field in 240 ms. Reduced: the drum springs, the new cards fade in. None: the new group is there at once.

**M5, density.** Full: the cards travel from their old place and size to the new ones (FLIP, 300 ms). Reduced:
the cards fade in at their new place (125 ms). None: at once.

**M6, delete and undo.** Full: the deleted card runs out to the side and fades (200 ms) before the grid closes up.
Reduced: it fades in place (150 ms). None: it is gone at once. The toast offers undo for six seconds; a thin bar
under it shows the time left, except under none. A card on its way out takes no more clicks, so a double click
deletes once. Undo brings the card back the same way a group switch draws it.

**M7, the toast.** It rises into place and fades in; reduced only fades.

**M8, the search scrim.** The page behind the suggestions dims with a short fade.

**M9, the edit bar.** In edit mode a card's edit and delete bar fades in on hover and focus.
