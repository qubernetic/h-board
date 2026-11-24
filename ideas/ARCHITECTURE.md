# H-Board: architektúra

Döntés: 2026-11-24. Háromféleképpen használható, egy kódbázisból, a lehető legkevesebb ismételt kóddal.

## A három mód

| | 1. Web | 2. Bővítmény | 3. Saját szerver + bővítmény |
|---|---|---|---|
| Kinek | aki semmit nem telepít | aki a Monknow-féle megoldást szereti | aki saját szervert üzemeltet |
| Honnan fut | `h-board.example.com`, statikus PWA | a bővítménybe csomagolva | a bővítmény, a saját konténerhez kapcsolva |
| Tárolás | `LocalStore` (IndexedDB) | `ExtStore` (a bővítmény tárhelye) | `RemoteStore` (a szerver API-ja, helyi gyorsítótárral) |
| Új tab fókusza | **címsorban marad** (ismert korlát, le kell írni) | az oldalon | az oldalon |
| Címsoros `/go` | saját keresőként, a böngésző beállításaiban | a bővítmény adja | a bővítmény adja |
| Felhasználók | egy, a böngészőben | egy, a böngészőben | több, mindenkinek saját könyvtára |
| AI (API, MCP, agent-kulcs) | nincs | nincs | van |
| Offline | betölt és szerkeszthető | betölt és szerkeszthető | betölt és olvasható, szerkeszteni csak online lehet |

A 2. és a 3. mód **ugyanaz a bővítmény**. A beállításokban lehet választani a „helyi” és a „kapcsolódás szerverhez” mód között (szerver-URL és belépés). Helyi módból az export és import viszi át az adatot a szerverre.

A 3. módban az offline szerkesztést szándékosan kihagyjuk: AI-munkához úgyis internet kell, és így nincs szükség ütközéskezelésre.

## Rétegek

Egy **TypeScript monorepo**, mert a mag így egy az egyben fut a böngészőben és a szerveren.

| csomag | tartalom | szabály |
|---|---|---|
| `core` | modell (csoport, oldal, teendő, beállítás); parancsok azonosítóval, paraméter-sémával és ügynök-osztállyal; pillanatkép és visszavonás; a `/go` útválasztó logikája; az elrendezési szabályok | nincs I/O, nincs DOM; böngészőben és szerveren is fut |
| `ui` | az oldal (a mostani `mock/` felbontva) | csak a `Store` felületen és a core-parancsokon át változtat adatot |
| `store` | `LocalStore`, `ExtStore`, `RemoteStore`, egy közös `Store` felületre | a hostok választanak közülük |
| `host-web` | statikus PWA-build (service worker, manifest) | 1. mód; a 3. mód szervere is ezt szolgálja ki |
| `host-extension` | MV3-csomag; a fókuszt az új tabról a „bővítmény nyit egy tabot, a régit bezárja” trükk viszi az oldalra; beállítások: helyi vagy szerver | 2. és 3. mód |
| `host-server` | konténer: Node vagy Bun, SQLite a köteten, REST az `/api` alatt, MCP HTTP-n az `/mcp` alatt, felhasználók, agent-kulcsok, napló | 3. mód |

**A fő szabály:** egy művelet egyszer, a core-ban van megírva parancsként. A felület, a REST, az MCP és egy esetleges CLI csak azonosító alapján hívja (inboxcraft-minta: „everything is a command”).

## Parancsok

- **Azonosítók:** `group.add`, `group.rename`, `group.remove`, `site.add`, `site.update`, `site.move`, `site.remove`, `todo.*`, `settings.set`, `backup.list`, `backup.restore`, `library.export`, `library.import`.
- **Ügynök-osztály:**
  - `safe`: olvasás, hozzáadás, módosítás;
  - `owner`: törlés, visszaállítás, tömeges import; agent-kulcsnál külön jogkör kell hozzá;
  - `never`.
  - Osztály nélküli parancs nem fut.
- **Pillanatkép:** minden változás után készül egy, a forrás jelölésével („te”, illetve a kulcs neve).

## Szerver (3. mód)

- **Belépés:** jelszó vagy passkey. Lehet helyette opcionális OIDC, vagy reverse proxy fejléc (Authelia, Authentik).
- **Agent-kulcsok:**
  - felhasználónként, névvel és jogkörrel: `olvasás`, `szerkesztés`, `tulajdonosi`;
  - egyszer jelennek meg, a szerver csak a hash-üket tárolja, és visszavonhatók;
  - minden kulcshasználat naplózódik.
- **Agentek és oldalszöveg:** egy oldal neve, leírása vagy címe adat, nem utasítás. Ezt az MCP-eszközök leírásában is ki kell mondani.
- **Élő frissítés:** a megnyitott lapok SSE-n keresztül értesülnek a változásról, így az AI módosítása azonnal megjelenik.

## Nyitott kérdések a tervhez

- **Bun vagy Node** a szerverhez, és milyen HTTP-réteg (például Hono, ami mindkettőn fut).
- **Build:** Vite a ui-hoz, és egy közös build, ami a web és a bővítmény csomagját is előállítja.
- **Migráció:** hogyan bomlik fel a `mock/app.js` (kb. 2600 sor) `core` és `ui` részekre; a mock addig referenciának marad.
- **FigCraft-rajz és mock:** a rajz (`gen/build.py`) és a ui elrendezési szabályai ugyanabból a forrásból jöjjenek (core `layout`).
