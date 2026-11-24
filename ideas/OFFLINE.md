# Offline, bővítmény nélkül

Ötlet és döntésre váró terv, 2026-11-23. Még semmi nem készült belőle.

## Cél

Az új tab oldal bővítmény nélkül is működjön, és internet nélkül is betöltsön.

## Amit tudunk

- A Helium (AppImage, `~/.local/share/AppImages/helium.appimage`) ismeri a Chromium `NewTabPageLocation` szabályzatát, és az `/etc/chromium/policies` mappából olvassa. Ezt a binárisban lévő karakterláncokból láttuk; élesben még nem próbáltuk ki.
- Szabályzatfájl: `/etc/chromium/policies/managed/qubernetic-start.json`, tartalma `{"NewTabPageLocation": "<URL>"}`. Az írásához sudo kell, ezt a felhasználó futtatja.
- Ugyanez a szabályzat működik Chrome, Brave és Edge alatt is. Firefoxban autoconfig kell (`AboutNewTabService.newTabURL`). Androidon az új tab oldal semmilyen módon nem cserélhető.

## Terv

1. **PWA a mockból:**
   - service worker, amely az első betöltéskor a gépre ment mindent (HTML, CSS, JS, fontok, `icons/`, `favicons/`);
   - `manifest.webmanifest`;
   - az adatok és a pillanatképek localStorage helyett IndexedDB-ben.
2. **Hol fut:**
   - Elsőként ki kell próbálni, hogy a `NewTabPageLocation` elfogad-e `file://` címet. `file://` alatt nincs service worker, de nincs is rá szükség.
   - Ha nem fogad el, saját domain kell (pl. `start.qubernetic.com`). Onnan az első betöltés után a service worker miatt offline is megy.
3. **Szinkron fiók nélkül (opcionális):** pillanatképek WebDAV-on a saját Nextcloudba. Ez a MARKET.md „szinkron fiók nélkül” kérésére válaszol.

## Amit elveszítünk a bővítményhez képest, és mi lép a helyére

- **Böngésző-könyvjelzők:** helyettük importálás a böngésző könyvjelző-exportjából (HTML), egy mappa egy csoport.
- **Böngésző faviconjai:** ezek helyett a magunkkal vitt márkaikonok és faviconok.
- **„Szervezet által kezelt” jelzés:** a szabályzat miatt a böngésző beállításaiban megjelenik.

## Nyitott kérdések, élesben kell kipróbálni

- Szabályzattal megadott új tabnál a fókusz a címsorba vagy az oldalra kerül? Ettől függ a `/`, az `1–8` és a többi billentyű.
- Elfogadja-e a szabályzat a `file://` címet?
- Mennyi idő alatt jelenik meg az első kép (cél: 100 ms alatt), és van-e villanás a betöltéskor?
