# Qubernetic Start: funkcióötletek

Húsz ötlet az új laphoz. Két kérdés mentén gyűjtöttem őket: mit csinálok naponta tízszer, amikor új lapot nyitok, és mi az, aminek naponta egyszer megörülök.

A mockban már meglévő dolgok (csoportkerék, sűrűségek, szerkesztő mód, kereső saját oldalakkal és előzménnyel, teendők, időjárás, standby, mutatónyom a mezőben) nem szerepelnek újra.

Jelölések:

- Ráfordítás: S = egy-két nap, M = körülbelül egy hét, L = több hét egy valódi kiegészítőben.
- Engedély: milyen böngészőengedély vagy hálózati hozzáférés kellene hozzá.
- Piac: a [MARKET.md](MARKET.md) 3. szakaszának melyik sorára válaszol („Visszatérő kérések, amelyek nem teljesülnek”). Ahol nincs ilyen sor, ott nincs dokumentált igény mögötte, csak a saját napi használat.
- Prototípus: a mockban kipróbálható, a fogaskerék alatti „Kísérleti” szakaszban kapcsolható.

## Rangsor

A sorrend elsősorban azt nézi, hányszor veszem hasznát egy nap. Közel azonos napi haszonnál az kerül előbbre, amire a piackutatás dokumentált, megoldatlan igényt talált.

1. Ugrókódok (1. ötlet). Az új lap leggyakoribb művelete két billentyű lesz, engedély nélkül, egy-két nap munkával. A MARKET.md 6. sora szerint a szép kezdőoldalak egérre készülnek, a billentyűsek csúnyák, a Vimium pedig más kiegészítő új lapján nem fut.
2. Keresés az oldalon belül (2. ötlet). Naponta többször spórol két lépést a dokumentációs oldalakon. Piaci sor nincs mögötte; a MARKET.md összegzése annyit mond, hogy a technikai közönséget gyorsasággal és billentyűzettel lehet megnyerni, és ez a funkció mindkettő.
3. Pillanatképek és visszaállítás (15. ötlet). Nem napi mozdulat, mégis ide kerül: az adatvesztés a MARKET.md 1. sora, 14 forrással és 5 termékkel, és a leggyakoribb ok, amiért valaki elhagyja a kezdőoldalát. A napi haszna a visszavonás (`z`) és az, hogy a státuszsor megmondja: megvan minden. Ha a linkek elveszhetnek, a többi ötletre sem érdemes építeni.
4. A nap íve (7. ötlet). Ettől mond mást az oldal minden megnyitáskor. A naptár a MARKET.md 12. sora; ott azért megoldatlan, mert OAuth és fiók kellene hozzá. Az ICS-cím ezt megkerüli, de hálózati funkció marad, ezért kikapcsolt alapértelmezésű modulnak való (a MARKET.md 5. szakaszának 10. pontja is ezt javasolja).
5. Nyitott lapok tükre (5. ötlet). Sok lappal dolgozva naponta többször véd a duplikátumtól, kis munkával. Piaci sor nincs mögötte, és `tabs` engedélyt kér, ezért az utolsó az ötből.

Szorosan a lista mögött: a fókusz-sor (8.) és a konfiguráció fájlként (16.). Az előbbi engedély nélkül megvan, az utóbbi három piaci sorra válaszol egyszerre, de egyik sem napi tízszeri mozdulat.

A mockban az első három készült el.

## Gyorsaság

### 1. Ugrókódok

Az `f` lenyomására minden kártya sarkában megjelenik egy betű; a betű megnyitja az oldalt.

Naponta ez a leggyakoribb művelet: új lap, aztán egy ismert oldal. Ma ehhez egér kell, vagy `/` és gépelés. Ugrókóddal a GitHub két billentyű, egy másik csoport oldala három (`f`, `3`, `a`). A betűk a kártyák sorrendjét követik, ezért pár nap után kézben vannak.

A kód a kártya bal felső sarkában ül, cián négyzetben, mono betűvel. Megjelenéskor nincs animáció, mert billentyűről indul és naponta sokszor fut. A sorrend a kezdősorból indul (`a s d f g h j k l`), 26 kártya fölött kétbetűs kódok jönnek, és gépelés közben a nem illő kártyák elhalványulnak. `Shift` + betű háttérlapon nyit. `Esc` vagy egy betű, amely egyik kártyán sincs, kilép. A csoportváltó számok és nyilak ugrókód módban is működnek, a státuszsor pedig erre az időre csak az ide tartozó billentyűket mutatja.

Valódi kiegészítőben egy dolgot ki kell próbálni: a Chrome új lap nyitásakor a címsorba teszi a fókuszt, így az első leütés oda megy. Vagy a kiegészítő irányítja át a lapot a saját oldalára, vagy el kell fogadni, hogy előbb egy billentyű visszaadja a fókuszt az oldalnak. A mock ezt nem tudja megmutatni.

Ráfordítás: S. Engedély: nincs. Piac: 6. sor (teljes billentyűzetes kezelés, 9 forrás). Prototípus: van.

### 2. Keresés az oldalon belül

A keresőbe beírt oldalnév után `Tab`, és a keresés azon az oldalon fut: `docs` `Tab` `tokio`.

A docs.rs, a crates.io, az Infosys, a GitHub és az MDN keresőjét naponta többször használom. Ma ez három lépés: megnyitom az oldalt, megkeresem a keresőmezőt, gépelek. Így egy.

A kereső bal szélén a motor jelölője (`ddg`) az oldal nevére vált, cián kerettel, a helykitöltő pedig „keresés itt” lesz. Rövid álnév is megy szóközzel: `gh `, `rs `, `so `. Üres mezőn a `Backspace` vagy az `Esc` visszalép az általános keresőre. A javaslatlistában az érintett sor jobb szélén ott a „tab: keresés itt” jelölés, így a funkció magától kiderül. Ahol nincs ilyen sor kijelölve, a `Tab` továbbra is keresőmotort vált.

Ráfordítás: S. Engedély: nincs, ha a keresőcímeket kézzel adom meg a kártyán. Az automatikus felderítéshez (OpenSearch) az adott oldal elérése kell. Piac: nincs sor. Prototípus: van.

### 3. Mélylinkek

Az oldalon belüli keresés üres állapotban azt a néhány aloldalt mutatja, ahol azon az oldalon legutóbb jártam.

A GitHubon ritkán a kezdőlap kell: ugyanaz az öt repó és két PR. Az előzményből ezek kiolvashatók, és az új lapról egy lépésben elérhetők.

Ugyanaz a javaslatlista, „nemrég” jelöléssel és a relatív idővel. Gépelésre szűkül, az első sor az oldal saját keresője. A 2. ötlet prototípusa mintaadatokkal már mutatja.

A MARKET.md szerint a legutóbbi oldalak kirakása adatvédelmi okból zavar egyeseket. Itt semmi sincs kirakva: a lista csak akkor jelenik meg, ha rákeresek egy oldalra.

Ráfordítás: M. Engedély: böngészési előzmény (`history`). Piac: nincs sor.

### 4. Előtagok a keresősorban

A keresősor parancssorként is működik: `+ szöveg` teendőt vesz fel, `= kifejezés` számol.

Teendőt felvenni ma kattintás és külön mező. A számológép a PLC-s munkában állandó: hexa, bináris, maszkok, idők. A sor érti az IEC-literálokat is (`16#FF`, `2#1010`, `T#1h30m`), és az eredményt decimálisan, hexában és binárisan egyszerre adja. `Enter` a vágólapra teszi.

A `›` jel az előtag szerint vált (`+`, `=`), a javaslatlista helyén egyetlen eredménysor áll. Új felület nem kell hozzá, a meglévő sor tud többet.

Ráfordítás: S a teendő, M a számoló. Engedély: vágólap írása (`clipboardWrite`). Piac: nincs sor.

### 5. Nyitott lapok tükre

Ha egy kártya oldala már nyitva van valamelyik lapon, a kártya jelzi, és kattintásra oda vált új lap helyett.

Sok lappal a duplikátum mindennapos: a Grafana harmadik példánya, a negyedik GitHub. Ugyanaz a mozdulat marad, csak kevesebb lap lesz belőle.

A kártya jobb felső sarkában kis négyzet és a lapok száma („2 lap”), a sorszám helyén. `Shift` + kattintás továbbra is újat nyit.

Ráfordítás: S vagy M. Engedély: lapok (`tabs`). Piac: nincs sor.

### 6. Billentyűsúgó

A `?` egy lapon megmutatja az összes billentyűt.

A státuszsor hat-nyolc billentyűt bír el, a többi (`Tab` a keresőben, `Shift` + nyilak szerkesztő módban) rejtve marad. A MARKET.md a `?` súgót a billentyűs kezdőoldalak bevett mintájaként említi.

Egy sáv a státuszsor fölött, két oszlopban, ugyanazzal a mono betűvel. Bármely billentyű bezárja.

Ráfordítás: S. Engedély: nincs. Piac: 6. sor.

## Kontextus

### 7. A nap íve

A dátum sorában egy vonalzó mutatja a munkanapot: mi telt el, mikor vannak találkozók, és mennyi idő van a következőig.

Az óra megmondja, mennyi az idő, de azt nem, hogy mire elég. Új lap nyitásakor egy pillantás: „14:00 Ügyfél A · 28 perc múlva”.

A `[ 00 ]` dátumsor folytatása jobbra: vékony vonal óránkénti osztással, a találkozók tömbök rajta, a most jele cián. Mellette egy sor szöveg a következő eseménnyel. Tíz percen belül a szöveg ciánra vált, más nem mozog. Munkaidő után a nap mérlegét írja: hány teendő lett kész. Kattintásra a naptár nyílik. Keskeny ablakban csak a szöveg marad, még keskenyebben eltűnik.

Alapból kikapcsolt modul legyen. A naptár egy titkos ICS-címről jön (a saját Nextcloud ad ilyet), így nem kell hozzá fiók és OAuth, ami a MARKET.md szerint a többi terméknél a megoldás akadálya.

Ráfordítás: M. Engedély: hálózat az ICS-címhez. Piac: 12. sor (naptár, 3 forrás).

### 8. Fókusz-sor

Egy teendő kijelölhető aktuális feladatnak; ez nagyobb betűvel megjelenik az óra alatt, és számolja az eltelt időt.

Új lapot gyakran kitérőként nyitok. Ha az oldal első sora az, amin éppen dolgozom, nehezebb elkalandozni. A standby már mutatja a következő teendőt; ez ugyanennek az erősebb változata a kezdőlapon.

A teendő melletti jelölés vagy a `.` billentyű jelöli ki. Fókusz alatt a „zajosnak” jelölt csoportok (Olvasnivaló, Média) a keréken halványabbak, de elérhetők maradnak. A standby a fókuszt és az eltelt időt mutatja.

Ráfordítás: S vagy M. Engedély: nincs. Piac: nincs sor; a MARKET.md 4. szakasza szerint a zaj és a figyelemelterelés elhagyási ok, ez annak az ellenkezője.

### 9. Készletek

Egy név alatt több oldal, amely egy billentyűvel együtt nyílik: „Projekt X” = Grafana, GitLab, ügyfélportál, Copia.

Ügyfelek és projektek között váltva mindig ugyanazt a négy-öt lapot nyitom meg egyenként. A Monknow „Open all” parancsa egy egész csoportot nyit; a készlet szűkebb és csoportokon átnyúlik.

A szakaszsor jobb oldalán, az elrendezésváltó mellett kis lista: `g x` Projekt X, `g a` Ügyfél A. Szerkesztő módban a kártyákra kattintva áll össze.

Ráfordítás: S vagy M. Engedély: lapok; lapcsoporthoz `tabGroups`. Piac: nincs sor.

### 10. Lapok félretétele

Az ablak összes lapja egy névvel elmenthető és bezárható, később egy mozdulattal visszahozható.

Megbeszélés előtt vagy ügyfélváltáskor a húsz nyitott lap teher, de bezárni sem merem. Félretéve megmaradnak, az ablak pedig kiürül.

A kerék alatt, a „+ új csoport” fölött egy „félretett” sor a darabszámmal. Megnyitva lista: név, lapszám, dátum.

Ráfordítás: L. Engedély: lapok, munkamenetek. Piac: nincs sor.

### 11. Állapotpont a saját szolgáltatásokon

A saját szerveren futó oldalak kártyáján egy pont mutatja, hogy a szolgáltatás él-e.

A Grafana, az n8n, a Nextcloud és a Home Assistant kártyája így műszer is. Ha valami leállt, az új lapon látom meg, mielőtt az ügyfél szólna.

Ugyanaz a hat képpontos pont, mint a szinkronjelzésnél: cián, ha él; üres keretes, ha nem válaszol. Csak a megjelölt kártyákon van, a többi változatlan.

Ráfordítás: M. Engedély: hálózat és az érintett hostok elérése. Piac: nincs sor; a MARKET.md a homelab-dashboardok szolgáltatás-integrációit böngészőkiegészítőnek nem tartja relevánsnak, ezért ez csak a saját hostokra szűkítve éri meg.

### 12. Napszak szerinti kezdőcsoport

Reggel a Kezdő csoport nyílik, munkaidőben a Fejlesztés, este az Olvasnivaló.

A Monknow megjegyzi az utoljára nyitott csoportot. Az órarend ennél pontosabb, mert a nap ritmusát követi, és megspórol egy csoportváltást.

Nincs külön felülete: csoportonként egy időablak a csoport szerkesztésénél.

Ráfordítás: S. Engedély: nincs. Piac: a 4. sor széle (gyors csoportváltás).

### 13. Két csoport egymás mellett

Széles képernyőn (2560 képpont fölött) a rács kettéosztható, és két csoport látszik egyszerre.

A 3440-es monitoron a rács jobb fele sokszor üres. Fejlesztés és Automatizálás egymás mellett: nincs váltás.

A kerék két lencsét kap, a második halványabb. A `Shift` + szám a jobb oldali csoportot állítja.

Ráfordítás: M. Engedély: nincs. Piac: a 3. sor széle (több link egy képernyőn).

## Rend és biztonság

### 14. Kopás

A hónapok óta nem nyitott kártyák halványabbak, szerkesztő módban pedig látszik, mikor nyitottam meg őket utoljára.

A rács idővel megtelik olyan oldalakkal, amelyeket egyszer hasznosnak hittem. Ha a használat nyoma látszik, könnyebb törölni.

A 60 napja érintetlen kártya neve tompa színű. Szerkesztő módban a leírás helyén: „94 napja nem nyitottad meg”.

Ráfordítás: S. Engedély: nincs, a kiegészítő a saját megnyitásait számolja. Piac: nincs sor.

### 15. Pillanatképek és visszaállítás

Minden változás után helyi pillanatkép készül mindenről, ami az enyém, és bármelyik egy mozdulattal visszaállítható.

A MARKET.md szerint az adatvesztés a leggyakoribb ok, amiért valaki leértékeli vagy elhagyja a kezdőoldalát: frissítés vagy újraindítás után eltűnnek a linkek. A többi termék kézi exportot ad, amit senki sem csinál rendszeresen. Automatikus helyi verziózás egyikben sincs.

Mit ment: csoportok, oldalak és sorrendjük, csoportonkénti ikonmód, teendők, beállítások (sűrűség, oszlopok, elrendezés, téma, keresőmotor). Az utolsó változás után két másodperccel készül egy pillanatkép, egy változássorozatra egy. Megmarad a legutóbbi 20, azon túl egy hétig naponta egy.

Hol látszik:

- A státuszsorban, a szinkronjelzés mellett: „mentve · 14:32 · 18 pillanatkép”. Amíg a két másodperc tart, „mentés…”. Ha a tároló megtelt, azt is kiírja.
- Törlés, szerkesztés és import után az értesítésben hat másodpercig ott a „visszavonás · z”. A `z` (vagy `Ctrl+Z`, ha a fókusz nem szövegmezőben van) az utolsó változás előtti állapotot hozza vissza; újra megnyomva a változást.
- A `v` vagy a státuszsor jelzése nyitja a Visszaállítás panelt. Minden sor egy pillanatkép: időpont és rövid összegzés arról, mi változott („+1 teendő, téma: világos”). A kijelölt sor alatt az áll, mi történne visszaállításkor. A nyilak lépkednek, az `Enter` visszaállít. Visszaállítás előtt a mostani állapotról is készül pillanatkép, így ez is visszavonható.
- Export és import egyetlen JSON-fájllal: kézi mentésnek és másik böngészőbe költözéshez. Az import ellenőrzi a fájlt, és megmondja, mi a baj vele.
- Ha minden csoport üres, de a pillanatképekben vannak oldalak, az üres csoport utolsó sora ezt írja: „Minden csoport üres, de a 14:32-es pillanatképben 113 oldal van. Visszaállítás”. Nincs felugró ablak.

A mockban a fogaskerék alatt az „Adatvesztés szimulálása” kiüríti a csoportokat és a teendőket, hogy a visszaút kipróbálható legyen.

Valódi kiegészítőben a pillanatképek a `chrome.storage.local` vagy az IndexedDB tárba kerülnek (a mock a localStorage-t használja saját kulcs alatt), és érdemes őket a `storage.sync` kvótájától függetlenül tartani, mert a MARKET.md szerint épp a kvóta túllépése az egyik vesztési ok. Csoport törlése a mockban nincs, de ugyanez a mechanizmus fedi.

Ráfordítás: M. Engedély: nincs (`storage`, `unlimitedStorage` hasznos). Piac: 1. sor (14 forrás, 5 termék). Prototípus: van.

### 16. Konfiguráció fájlként

Az egész kezdőlap egy olvasható szövegfájl (YAML vagy JSON), amely gitben vagy a saját Nextcloudon él, és onnan szinkronizál.

A fiók nélküli szinkron a MARKET.md 9. sora, a szerverfüggetlenség a 7., a nem vesző adat az 1. A homelab-dashboardok kedvelt tulajdonsága ugyanez: a konfiguráció verziókezelhető. Nekem ez a természetes forma, mert a többi eszközöm beállításai is repóban vannak.

A státuszsor „szinkronban · 2 perce” jelzése a fájl helyét és az utolsó írás idejét mutatja. A 15. ötlet exportja ennek az első lépése.

Ráfordítás: M (fájl és WebDAV), L (git). Engedély: hálózat a választott tárolóhoz. Piac: 1., 7. és 9. sor.

### 17. Hozzáadás vágólapról és az aktuális lapról

Az új oldal ablaka kitölti a címet, ha a vágólapon link van; a kiegészítő ikonja az éppen nyitott lapot teszi a rácsra.

A felvétel így egy mozdulat, és nem kell hozzá a kezdőlapra menni.

Ráfordítás: S. Engedély: vágólap olvasása, aktív lap (`activeTab`). Piac: nincs sor.

## Öröm

### 18. Reggeli indulás

A nap első új lapja teljes belépővel nyílik: az oldal kiírja magát, a dátum alatt három sor áll a napról.

Naponta egyszer fut, ezért belefér a látvány. A három sor: az első találkozó, a tegnapról maradt teendők száma, az időjárás. A nap többi új lapja azonnal, animáció nélkül jelenik meg, mert a MARKET.md szerint a lassúság és a villanás elhagyási ok.

A meglévő kódolt beíródás (scramble) fut a blokkokon a kerék felől jobbra, körülbelül 600 ms alatt. Csökkentett mozgásnál sima áttűnés.

Ráfordítás: S. Engedély: nincs. Piac: nincs sor.

### 19. Hullám a kipipált teendőre

Amikor kipipálok egy teendőt, a jelölőnégyzetből gyűrű fut ki a karaktermezőben.

A standbyból visszatérő lökéshullám kicsiben. Ha az utolsó teendő is kész, a gyűrű az egész oldalon végigmegy.

Sugár 160 képpont, 350 ms, a szöveg mögött halkabban, ahogy a mutatónyom. Csökkentett mozgásnál elmarad.

Ráfordítás: S. Engedély: nincs. Piac: nincs sor.

### 20. Napzárás

Munkaidő után a standby a nap mérlegét mutatja, és megkérdezi, mi legyen holnap az első.

Egy sor („holnap első:”) elég, és másnap a reggeli indulás ezt mutatja legfelül.

A standby szövegoszlopában a „következő” sor helyén: „ma kész: 4 / 6”, alatta beviteli sor.

Ráfordítás: S. Engedély: nincs. Piac: nincs sor.

## Amit elvetettem

- Idézetek, váltakozó háttérképek: zajt adnak, a Qubernetic nyelvéhez nem illenek, és egyik sem vesz el lépést. A MARKET.md szerint a Tabliss idézet-widgetje a külső API-val együtt el is halt.
- RSS és hírfolyam: visszatérő kérés (MARKET.md 10. sor, 5 forrás), de a csendes iránnyal ellentétes, és a technikai közönség egy része épp emiatt marad az about:blanknél.
- Beépített AI-csevegő: a Claude egy kártyányira van, a 2. ötlettel pedig a keresősorból is indítható (`ai `).
- Pomodoro-időzítő: a fókusz-sor eltelt ideje ugyanazt adja szabály nélkül.
- Gépelés bárhol a keresőbe: ütközik az egybetűs billentyűkkel (`e`, `s`, `f`, `z`, `v`), a `/` pedig egyetlen leütés.

## A prototípusok kipróbálása

A mock: `mock/index.html`. Mindhárom ötlet a fogaskerék alatti „Kísérleti” szakaszban kapcsolható, alapból be van kapcsolva, és a kapcsoló állása megmarad. A `?fresh` paraméterrel a mock a beépített mintából indul, és nem ír a tárolóba.

- Ugrókódok: `f`, aztán egy betű. `f`, `3`, `a` másik csoportból nyit. `Shift` + betű háttérlap (a mockban sima új lap).
- Keresés az oldalon belül: `/`, `docs`, `Tab`, aztán a keresés. Vagy `/`, `gh ` szóközzel. Álnevek: `gh`, `ai`, `rs`, `crates`, `inf`, `so`, `yt`, `wiki`, `hn`. A „nemrég” sorok mintaadatok, az Infosys keresőcíme is az.
- Pillanatképek: szerkesztő módban (`e`) törölj egy kártyát, aztán `z`. `v` a panel. Fogaskerék, „Adatvesztés szimulálása”, aztán a „Visszaállítás” az üres csoport alján.

Képernyőképek: `mock/shots/idea-*`.
