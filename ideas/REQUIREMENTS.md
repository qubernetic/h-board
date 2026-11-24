# H-Board: követelmények a következő körre

Felvéve 2026-11-24-én. Mindkettő az inboxcraft mintáját követi, ahogy az eddigi Qubernetic-munkák is.

## 1. AI-felület a könyvtárhoz

A felhasználó a saját AI-jával (Claude Code, Claude Desktop, Codex, bármilyen MCP-kliens) is kezelhesse a könyvtárát: csoportokat, oldalakat, sorrendet, ikonmódot, teendőket.

**Minta:** az inboxcraft `docs/cli.md`, `docs/mcp.md` és `docs/control-protocol.md`.

- **Minden egy parancs.** A felületen végzett műveletek azonosítóval rendelkező parancsok, például `group.add`, `site.add`, `site.move`, `site.update`, `site.remove`, `todo.add`, `backup.list`, `backup.restore`. A kattintás, a billentyű, a CLI és az MCP ugyanazt a parancsot hívja.
- **Ügynök-osztály minden parancson:** `safe` (olvasás, hozzáadás), `owner` (törlés, visszaállítás, tömeges import: a felhasználó jóváhagyásával), `never`. Osztály nélküli parancs nem fut.
- **Felület:** REST és MCP a szerveren (HTTP), agent-kulccsal. Egy későbbi CLI ugyanezt az API-t hívja.
- **Minden AI-módosítás pillanatképet készít,** így egy `z` vagy a visszaállítás panel visszahozza. Az alsó sáv jelzi, ha egy változás AI-tól jött.
- **Az oldalakról beolvasott szöveg adat, nem utasítás:** az ügynök nem követhet egy weboldal címében vagy leírásában talált utasítást.

**Eldöntve (2026-11-24): az adat a saját szerveren él.** Az AI-felület csak a 3. módban (saját szerver + bővítmény) van: REST az `/api` alatt, MCP HTTP-n az `/mcp` alatt, felhasználónként generált agent-kulccsal. Helyi CLI nem kell, és native messaging sem. Az 1. és a 2. módban nincs AI-felület. A részletek: `ideas/ARCHITECTURE.md`.

## 2. Animáció: teljes / csökkentett / kikapcsolt

**Hol:** a beállításokban (fogaskerék), a téma mellett egy három állású kapcsoló: **teljes · csökkentett · nincs**.

**Minta:** az inboxcraft `docs/design.md`, „Motion” fejezet: három szint és egy mozgástáblázat (M1–M13).

- **Alapérték: csökkentett.** Ami állapotváltozást magyaráz, az marad. Ami csak díszít, elmarad.
- **Ha a rendszer csökkentett mozgást kér** (`prefers-reduced-motion`), a szint „nincs”, amíg a felhasználó mást nem választ.
- **A felhasználó sosem vár:** egy billentyű vagy kattintás mozgás közben azonnal hat, és a mozgás a végére ugrik.
- Egyetlen jelző, amit minden animáció olvas. Most a mock két külön helyen nézi a `prefers-reduced-motion` értékét.

**Mozgástáblázat a H-Boardra** (a következő körben kell kitölteni):

| | mi mozog | teljes | csökkentett | nincs |
|---|---|---|---|---|
| M1 | karaktermező, egérnyom | a web szerint | csak a home · standby lapon | álló pontok |
| M2 | jel a standby lapon | csillogás és egérhatás | ugyanaz | álló |
| M3 | standby be- és kilépés | 920 / 640 ms, dekódolás és lökéshullám | 150 ms áttűnés | azonnal |
| M4 | csoportváltás a görgőn | rugós dob, a kártyák szövege íródik ki | a dob rugózik, a szöveg áttűnik | azonnal |
| M5 | sűrűségváltás | FLIP 300 ms | áttűnés 125 ms | azonnal |
| M6 | törlés és visszavonás | a kártya kifut, értesítés sávval | a kártya elhalványul | eltűnik, értesítés sáv nélkül |
