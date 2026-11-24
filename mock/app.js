// H-Board: interactive mock. No build step; data.js carries the
// Phosphor codepoints and the ASCII mark. The layout rules are gen/build.py's
// layout(w, h); the character field is qubernetic-web's field.ts.
(() => {
  'use strict';

  const {PH, MARK} = window.QS_DATA;
  const BRANDS = window.QS_BRANDS || {}; // Simple Icons paths by slug
  const FAVICONS = window.QS_FAVICONS || {}; // downloaded favicon files by host
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = n => (Math.random() * n) | 0;
  const mod = (a, n) => ((a % n) + n) % n;
  const pad2 = n => String(n).padStart(2, '0');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const ic = name => String.fromCodePoint(parseInt(PH[name] || PH.globe, 16));
  const icon = name => `<span class="ph" aria-hidden="true">${ic(name)}</span>`;
  const px = v => `${v}px`;

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('qs.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('qs.' + key, JSON.stringify(value));
      } catch {
        return false; // private mode or a full store: the mock still works, it just forgets
      }
      if (store.onWrite) store.onWrite(key);
      return true;
    },
    del(key) {
      try {
        localStorage.removeItem('qs.' + key);
      } catch {
        /* nothing to forget */
      }
      if (store.onWrite) store.onWrite(key);
    },
    onWrite: null,
  };

  // ------------------------------------------------------------------ data

  // brand: the site's Simple Icons slug, where its mark is in icons/brands
  const S = (name, ph, desc, host, brand) => ({name, icon: {type: 'ph', name: ph}, desc, host, url: 'https://' + host, brand});
  const GROUPS = [
    {name: 'Kezdő', sites: [
      S('posta', 'envelope-simple', 'Levelek, címkék és a nap első köre.', 'mail.example.com'),
      S('naptár', 'calendar-blank', 'A hét találkozói és határidői.', 'cloud.example.com/calendar', 'nextcloud'),
      S('térkép', 'map-trifold', 'Útvonalak és forgalom indulás előtt.', 'openstreetmap.org', 'openstreetmap'),
      S('időkép', 'cloud-sun', 'Radar és előrejelzés a környékre.', 'idokep.hu'),
      S('telex', 'newspaper', 'Hírek, röviden és hosszan.', 'telex.hu'),
      S('youtube', 'youtube-logo', 'Feliratkozások és a későbbre tett videók.', 'youtube.com', 'youtube'),
      S('wikipédia', 'book-bookmark', 'Gyors utánanézés bárminek.', 'hu.wikipedia.org', 'wikipedia'),
      S('deepl', 'translate', 'Fordítás, ha pontosan kell.', 'deepl.com', 'deepl'),
      S('menetrend', 'train', 'Vonatok, átszállások és jegyek.', 'jegy.mav.hu'),
      S('fordító', 'globe-hemisphere-west', 'Gyors fordítás bármely nyelvről.', 'translate.kagi.com', 'kagi'),
      S('jegyzetek', 'note-pencil', 'Obsidian vault a böngészőből.', 'notes.example.com', 'obsidian'),
      S('fotók', 'images', 'Családi fotók, saját szerveren.', 'photos.example.com'),
      S('csomagkövetés', 'truck', 'Úton lévő rendelések egy listán.', 'parcelsapp.com'),
      S('patika', 'first-aid', 'Ügyeletes gyógyszertár a közelben.', 'patikakereso.hu'),
    ]},
    {name: 'Fejlesztés', sites: [
      S('github', 'github-logo', 'Repók, pull requestek és a CI-futások egy helyen.', 'github.com', 'github'),
      S('claude', 'sparkle', 'Beszélgetések, projektek és artifactok.', 'claude.ai', 'claude'),
      S('copia', 'git-branch', 'PLC-projektek verziókezelése, diffek, review.', 'copia.io'),
      S('beckhoff infosys', 'book-open', 'TwinCAT 3 dokumentáció és könyvtár-referencia.', 'infosys.beckhoff.com'),
      S('docs.rs', 'code', 'Minden Rust crate dokumentációja, verziónként.', 'docs.rs', 'docsdotrs'),
      S('crates.io', 'cube', 'A Rust csomagregiszter: verziók, letöltések.', 'crates.io'),
      S('mdn', 'globe', 'Webes referencia: HTML, CSS, JavaScript.', 'developer.mozilla.org', 'mdnwebdocs'),
      S('flathub', 'package', 'Linuxos alkalmazások, Flatpakként.', 'flathub.org', 'flathub'),
      S('nextcloud', 'cloud', 'Saját felhő: fájlok, naptár, névjegyek.', 'cloud.example.com', 'nextcloud'),
      S('hetzner', 'hard-drives', 'Szerverek, tűzfal, konzol és számlák.', 'console.hetzner.cloud', 'hetzner'),
      S('qubernetic.com', 'browser', 'A saját weboldal, élőben.', 'qubernetic.com'),
      S('gitlab', 'gitlab-logo', 'Ügyfélrepók és pipeline-ok.', 'gitlab.com', 'gitlab'),
      S('codeberg', 'mountains', 'Nyílt forrású tükrök.', 'codeberg.org', 'codeberg'),
      S('rust playground', 'play', 'Gyors Rust-próbák a böngészőben.', 'play.rust-lang.org'),
      S('lib.rs', 'books', 'Crate-kereső kategóriák szerint.', 'lib.rs'),
      S('compiler explorer', 'cpu', 'Mit fordít ebből a fordító?', 'godbolt.org', 'compilerexplorer'),
      S('can i use', 'check-circle', 'Böngészőtámogatás funkciónként.', 'caniuse.com'),
      S('devdocs', 'files', 'API-dokumentációk egy keresőben.', 'devdocs.io'),
      S('stack overflow', 'stack-overflow-logo', 'Kérdések és válaszok.', 'stackoverflow.com', 'stackoverflow'),
      S('sentry', 'bug', 'Hibák és teljesítmény élesben.', 'sentry.io', 'sentry'),
      S('cloudflare', 'cloud-check', 'DNS, Pages és Workers.', 'dash.cloudflare.com', 'cloudflare'),
      S('tailscale', 'share-network', 'Gépek és kulcsok a saját hálón.', 'login.tailscale.com', 'tailscale'),
      S('figcraft', 'bezier-curve', 'Tervek és exportok.', 'figcraft.app'),
    ]},
    {name: 'Qubernetic', sites: [
      S('brand', 'palette', 'Színek, betűk és logók egy forrásból.', 'brand.example.com'),
      S('vision', 'eye', 'Vision platform: kamerák, modellek, állapot.', 'vision.example.com'),
      S('twincat mcp', 'plugs-connected', 'TwinCAT-projektek elérése MCP-n át.', 'mcp.example.com'),
      S('copia-cli', 'terminal-window', 'Copia parancssorból: repók és review-k.', 'github.com/qubernetic/copia-cli', 'github'),
      S('skillek', 'lightning', 'Claude skillek és modok gyűjteménye.', 'skills.example.com', 'claude'),
      S('ajánlatok', 'file-text', 'Kiküldött ajánlatok és állapotuk.', 'docs.example.com'),
      S('analitika', 'chart-line-up', 'Látogatók és források, sütik nélkül.', 'plausible.io', 'plausibleanalytics'),
      S('weboldal-repo', 'git-fork', 'A qubernetic-web forrása.', 'github.com/qubernetic/web', 'github'),
      S('állapot', 'pulse', 'Szolgáltatások elérhetősége.', 'status.example.com'),
      S('levelezőlista', 'paper-plane-tilt', 'Hírlevél és feliratkozók.', 'buttondown.com'),
      S('ügyfélportál', 'users-three', 'Projektek és átadott anyagok.', 'portal.example.com'),
      S('licencek', 'key', 'Kiadott licenckulcsok.', 'licenses.example.com'),
    ]},
    {name: 'Automatizálás', sites: [
      S('beckhoff', 'factory', 'Termékek, letöltések és árlista.', 'beckhoff.com'),
      S('twincat 3', 'gear-six', 'Build-ek és release notes.', 'beckhoff.com/twincat3'),
      S('plcopen', 'tree-structure', 'Szabványok és Motion Control blokkok.', 'plcopen.org'),
      S('ethercat', 'share-network', 'ETG: specifikációk és eszközlista.', 'ethercat.org'),
      S('opc foundation', 'broadcast', 'OPC UA companion specifikációk.', 'opcfoundation.org'),
      S('codesys', 'cpu', 'Runtime, store és fórum.', 'codesys.com'),
      S('n8n', 'flow-arrow', 'Saját folyamatok: webhookok és ütemezés.', 'n8n.example.com', 'n8n'),
      S('home assistant', 'house-line', 'Otthoni automatizálás és szenzorok.', 'ha.example.com', 'homeassistant'),
      S('grafana', 'chart-line', 'Mérések és riasztások idősoron.', 'grafana.example.com', 'grafana'),
      S('node-red', 'graph', 'Gyors prototípusok flow-ban.', 'nodered.org', 'nodered'),
      S('stack overflow', 'stack-overflow-logo', 'TwinCAT- és PLC-kérdések.', 'stackoverflow.com', 'stackoverflow'),
      S('plctalk', 'chats-circle', 'Fórum: terepi tapasztalatok.', 'plctalk.net'),
      S('profinet', 'plugs', 'PI: specifikációk és GSD-fájlok.', 'profibus.com'),
      S('io-link', 'link', 'IODD-kereső és eszközleírások.', 'ioddfinder.io-link.com'),
      S('mqtt', 'broadcast', 'Szabvány és kliensek.', 'mqtt.org', 'mqtt'),
      S('wago', 'toggle-right', 'Sorkapcsok és vezérlők.', 'wago.com'),
      S('sick', 'scan', 'Szenzorok és biztonságtechnika.', 'sick.com'),
      S('keyence', 'aperture', 'Vision és mérőrendszerek.', 'keyence.eu'),
    ]},
    {name: 'Média', sites: []},
    {name: 'Pénzügy', sites: [
      S('netbank', 'bank', 'Számlák, utalások és kivonatok.', 'netbank.example'),
      S('wise', 'arrows-left-right', 'Devizaváltás és nemzetközi utalás.', 'wise.com', 'wise'),
      S('nav ügyfélkapu', 'identification-card', 'Bevallások és adószámla.', 'nav.gov.hu'),
      S('számlázz.hu', 'receipt', 'Kiállított számlák és díjbekérők.', 'szamlazz.hu'),
      S('mnb árfolyam', 'currency-eur', 'Napi hivatalos árfolyamok.', 'mnb.hu'),
      S('könyvelő', 'calculator', 'Bizonylatok feltöltése a könyvelőnek.', 'konyvelo.example'),
      S('revolut', 'credit-card', 'Céges kártyák és költések.', 'business.revolut.com', 'revolut'),
      S('stripe', 'stripe-logo', 'Online fizetések és kifizetések.', 'dashboard.stripe.com', 'stripe'),
      S('állampapír', 'chart-bar', 'Megtakarítások és kamatok.', 'allampapir.hu'),
      S('költségek', 'table', 'Havi költségtábla.', 'cloud.example.com/koltsegek', 'nextcloud'),
    ]},
    {name: 'Olvasnivaló', sites: [
      S('hacker news', 'fire', 'A nap technikai beszédtémái.', 'news.ycombinator.com', 'ycombinator'),
      S('lobsters', 'chat-text', 'Kisebb, csendesebb linkgyűjtő.', 'lobste.rs'),
      S('this week in rust', 'calendar-check', 'Heti Rust-összefoglaló.', 'this-week-in-rust.org'),
      S('lwn', 'linux-logo', 'Kernel és nyílt forrás, alaposan.', 'lwn.net'),
      S('simon willison', 'pen-nib', 'Jegyzetek LLM-ekről és eszközökről.', 'simonwillison.net'),
      S('anthropic', 'flask', 'Kutatás és bejelentések.', 'anthropic.com', 'anthropic'),
      S('oxide', 'desktop-tower', 'Blog hardverről és Rustról.', 'oxide.computer'),
      S('fasterthanlime', 'timer', 'Hosszú írások rendszerprogramozásról.', 'fasterthanli.me'),
      S('julia evans', 'notebook', 'Zine-ek és magyarázatok.', 'jvns.ca'),
      S('the verge', 'device-mobile', 'Kütyük és technológiai hírek.', 'theverge.com'),
      S('ars technica', 'atom', 'Tudomány és technika, mélyebben.', 'arstechnica.com', 'arstechnica'),
      S('hwsw', 'newspaper-clipping', 'Hazai IT-hírek.', 'hwsw.hu'),
      S('qubit', 'microscope', 'Tudomány, magyarul.', 'qubit.hu'),
      S('wallabag', 'bookmark-simple', 'Későbbre tett cikkek.', 'wallabag.example.com', 'wallabag'),
      S('quanta', 'function', 'Matematika és fizika, érthetően.', 'quantamagazine.org'),
      S('acm queue', 'article', 'Mérnöki esszék.', 'queue.acm.org', 'acm'),
      S('control.com', 'gear', 'Ipari automatizálási cikkek.', 'control.com'),
      S('telex tech', 'rss', 'Hazai technológiai hírek.', 'telex.hu/tech'),
      S('24.hu', 'newspaper', 'Napi hírek.', '24.hu'),
      S('the pragmatic engineer', 'envelope-open', 'Heti hírlevél a szakmáról.', 'pragmaticengineer.com'),
    ]},
    {name: 'Eszközök', sites: [
      S('excalidraw', 'pencil-line', 'Gyors vázlatok és ábrák.', 'excalidraw.com', 'excalidraw'),
      S('regex101', 'asterisk', 'Reguláris kifejezések próbája.', 'regex101.com'),
      S('crontab guru', 'clock', 'Cron-ütemezések érthetően.', 'crontab.guru'),
      S('json crack', 'brackets-curly', 'JSON gráfként.', 'jsoncrack.com'),
      S('squoosh', 'image', 'Képtömörítés a böngészőben.', 'squoosh.app'),
      S('ip info', 'wifi-high', 'Külső IP és hálózati adatok.', 'ifconfig.me'),
      S('speedtest', 'gauge', 'Sávszélesség-mérés.', 'speedtest.net', 'speedtest'),
      S('bitwarden', 'lock-key', 'Jelszavak, saját szerveren.', 'vault.example.com', 'bitwarden'),
      S('wolfram alpha', 'sigma', 'Számolás és egységváltás.', 'wolframalpha.com', 'wolfram'),
      S('epoch', 'hourglass', 'Időbélyegek oda-vissza.', 'epochconverter.com'),
      S('diffchecker', 'columns', 'Két szöveg különbsége.', 'diffchecker.com'),
      S('qr-kód', 'qr-code', 'QR-kód bármely linkből.', 'qr.example.com'),
      S('pdf-eszközök', 'file-pdf', 'Összefűzés és tömörítés helyben.', 'pdf.example.com'),
      S('színek', 'eyedropper', 'Kontraszt és paletta.', 'oklch.com'),
      S('whois', 'magnifying-glass', 'Domainadatok.', 'whois.domaintools.com'),
      S('pingdom', 'timer', 'Oldalbetöltés mérése.', 'tools.pingdom.com', 'pingdom'),
    ]},
  ];
  const IMPORT_SAMPLE = [
    S('spotify', 'spotify-logo', 'Lejátszási listák és podcastok.', 'open.spotify.com', 'spotify'),
    S('youtube music', 'music-notes', 'Zene munka közben.', 'music.youtube.com', 'youtubemusic'),
    S('jellyfin', 'film-strip', 'Saját filmtár, otthoni szerverről.', 'jellyfin.example.com', 'jellyfin'),
    S('twitch', 'twitch-logo', 'Élő adások.', 'twitch.tv', 'twitch'),
  ];
  const ENGINES = [
    {id: 'ddg', url: 'https://duckduckgo.com/?q='},
    {id: 'google', url: 'https://www.google.com/search?q='},
    {id: 'startpage', url: 'https://www.startpage.com/do/search?q='},
  ];
  const DEFAULT_TODOS = [
    {t: 'Ügyfél: ajánlat átnézése', d: false},
    {t: 'Kódreview: PR #41', d: false},
    {t: 'Brand repo v2.3 tag', d: true},
  ];
  const DEFAULT_HISTORY = ['twincat 3.1.4026 release notes', 'ethercat distributed clocks', 'rust tokio select'];

  const state = {
    active: 1,
    mode: store.get('layout', 'classic'),
    editing: false,
    engine: Math.max(0, ENGINES.findIndex(e => e.id === store.get('engine', 'ddg'))),
    todos: store.get('todos', DEFAULT_TODOS),
    history: store.get('history', DEFAULT_HISTORY),
    opened: 23,
    standby: false,
    density: store.get('density', 'normal'),
    cols: store.get('cols', 0), // 0: as many as fit; 4-12: fixed
  };
  // Icons, per group: the brand's mark (Simple Icons), the site's own favicon, or the Phosphor icon.
  // Every group starts on brand marks; no favicons are shipped.
  const ICON_MODES = ['brand', 'favicon', 'phosphor'];
  const iconModes = store.get('iconModes', {});
  const iconModeOf = g => (ICON_MODES.includes(iconModes[g.name]) ? iconModes[g.name] : 'brand');
  if (!['dense', 'normal', 'roomy'].includes(state.density)) state.density = 'normal';
  if (!(state.cols >= 4 && state.cols <= 12)) state.cols = 0;
  if (!['classic', 'simple', 'compact'].includes(state.mode)) state.mode = 'classic';

  // ------------------------------------------------------------------ experiments (ideas/IDEAS.md)

  // The top three ideas, each behind its own switch in the settings. On by default, so they are seen.
  const EXPERIMENTS = [
    {id: 'hints', label: 'ugrókódok', keys: 'f'},
    {id: 'scope', label: 'keresés az oldalon belül', keys: 'tab'},
    {id: 'backup', label: 'pillanatképek és visszaállítás', keys: 'z · v'},
  ];
  const exp = {};
  EXPERIMENTS.forEach(x => {
    exp[x.id] = store.get('x.' + x.id, true) !== false;
  });

  // Search inside a site: the site's own search address, and a short alias for the search line.
  // In the extension the address is a field of the card; these are filled in by hand.
  const SITE_SEARCH = {
    'github.com': {q: 'https://github.com/search?q=%s', alias: 'gh'},
    'claude.ai': {q: 'https://claude.ai/new?q=%s', alias: 'ai'},
    'docs.rs': {q: 'https://docs.rs/releases/search?query=%s', alias: 'rs'},
    'crates.io': {q: 'https://crates.io/search?q=%s', alias: 'crates'},
    'lib.rs': {q: 'https://lib.rs/search?q=%s'},
    'developer.mozilla.org': {q: 'https://developer.mozilla.org/en-US/search?q=%s'},
    'infosys.beckhoff.com': {q: 'https://infosys.beckhoff.com/index.php?q=%s', alias: 'inf'}, // sample address
    'stackoverflow.com': {q: 'https://stackoverflow.com/search?q=%s', alias: 'so'},
    'flathub.org': {q: 'https://flathub.org/apps/search?q=%s'},
    'devdocs.io': {q: 'https://devdocs.io/#q=%s'},
    'caniuse.com': {q: 'https://caniuse.com/?search=%s'},
    'youtube.com': {q: 'https://www.youtube.com/results?search_query=%s', alias: 'yt'},
    'hu.wikipedia.org': {q: 'https://hu.wikipedia.org/w/index.php?search=%s', alias: 'wiki'},
    'openstreetmap.org': {q: 'https://www.openstreetmap.org/search?query=%s'},
    'deepl.com': {q: 'https://www.deepl.com/translator#hu/en/%s'},
    'news.ycombinator.com': {q: 'https://hn.algolia.com/?q=%s', alias: 'hn'},
  };
  // Pages visited lately on a site. The extension would read these from the history; here they are samples.
  const SITE_RECENT = {
    'github.com': [
      ['qubernetic/web · pull requests', 'https://github.com/qubernetic/web/pulls', '40 perce'],
      ['qubernetic/copia-cli · issues', 'https://github.com/qubernetic/copia-cli/issues', '2 órája'],
      ['qubernetic/brand · releases', 'https://github.com/qubernetic/brand/releases', 'tegnap'],
      ['tokio-rs/tokio · discussions', 'https://github.com/tokio-rs/tokio/discussions', 'tegnap'],
    ],
    'docs.rs': [
      ['tokio · macro select', 'https://docs.rs/tokio/latest/tokio/macro.select.html', '1 órája'],
      ['serde · trait Deserialize', 'https://docs.rs/serde/latest/serde/trait.Deserialize.html', 'tegnap'],
      ['ads · struct Client', 'https://docs.rs/ads/latest/ads/', '3 napja'],
    ],
    'infosys.beckhoff.com': [
      ['TF6100 · OPC UA · Server', 'https://infosys.beckhoff.com/content/1033/tf6100_tc3_opcua_server/', '3 órája'],
      ['TwinCAT 3 · ADS · AmsNetId', 'https://infosys.beckhoff.com/content/1033/tc3_ads_intro/', 'tegnap'],
      ['EtherCAT · Distributed Clocks', 'https://infosys.beckhoff.com/content/1033/ethercatsystem/', '4 napja'],
    ],
    'crates.io': [
      ['tokio · versions', 'https://crates.io/crates/tokio/versions', 'tegnap'],
      ['ads', 'https://crates.io/crates/ads', '3 napja'],
    ],
  };
  const searchOf = site => SITE_SEARCH[site.host] || null;

  // Snapshots: everything the user owns is kept as it was after each change, on this machine.
  // The newest one is the page's state, so the groups start from it.
  // ?fresh starts from the built-in sample and writes nothing.
  const fresh = new URLSearchParams(location.search).has('fresh');
  const bk = {snaps: exp.backup && !fresh ? store.get('backup', []) : [], timer: 0, applying: false, failed: false, sel: -1};
  if (!Array.isArray(bk.snaps)) bk.snaps = [];
  bk.snaps = bk.snaps.filter(x => x && x.state && Array.isArray(x.state.groups));
  const sitesFrom = (st, g, i) => {
    const src = st.groups.find(x => x.name === g.name) || st.groups[i];
    return src && Array.isArray(src.sites) ? src.sites.map(x => ({...x, icon: {...x.icon}})) : [];
  };
  if (bk.snaps.length) GROUPS.forEach((g, i) => {
    g.sites = sitesFrom(bk.snaps[0].state, g, i);
  });

  const HINT_KEYS = 'asdfghjklqwertyuiopzxcvbnm';
  const hintCode = (i, n) => (n <= HINT_KEYS.length ? HINT_KEYS[i] : HINT_KEYS[Math.floor(i / HINT_KEYS.length)] + HINT_KEYS[i % HINT_KEYS.length]);

  // ------------------------------------------------------------------ /go: the address bar as a command line
  // The browser's default search points here (go/?q=%s), so whatever is typed after Ctrl+T lands in this
  // router, offline too. A new tab opened by policy keeps the focus in the address bar, so this is where
  // the keyboard is. Order: alias or site name alone opens the site; "gh rust" searches inside the site;
  // "a" or "3a" is a jump code (the last group, or group 3); anything else goes to the chosen engine.
  if (window.QS_GO) {
    const q = (new URLSearchParams(location.search).get('q') || '').trim();
    const low = q.toLowerCase();
    const all = GROUPS.flatMap(g => g.sites);
    const hostOf = st => st.host.replace(/^www\./, '').split('/')[0];
    const named = w => all.find(st => {
      const d = SITE_SEARCH[st.host];
      return (d && d.alias === w) || st.name.toLowerCase() === w || hostOf(st) === w || hostOf(st).split('.')[0] === w;
    });
    const coded = (gi, code) => {
      const g = GROUPS[gi];
      if (!g) return null;
      const i = g.sites.findIndex((_, k) => hintCode(k, g.sites.length) === code);
      return i < 0 ? null : g.sites[i];
    };
    const last = Math.min(GROUPS.length - 1, Math.max(0, store.get('active', 1) | 0));
    let to = null;
    const m = low.match(/^(\S+)\s+(.+)$/);
    // a jump code as typed on the page ("f4a", "f a") or without the f ("4a", "a")
    const byCode = t => {
      const j = t.match(/^([1-9])?([a-z]{1,2})$/);
      return j ? coded(j[1] ? +j[1] - 1 : last, j[2]) : null;
    };
    const jumped = byCode(low) || (/^f\s*\S/.test(low) ? byCode(low.replace(/^f\s*/, '')) : null);
    if (!q) to = '../index.html';
    else if (named(low)) to = named(low).url;
    else if (jumped) to = jumped.url;
    else if (m && named(m[1]) && SITE_SEARCH[named(m[1]).host]) {
      to = SITE_SEARCH[named(m[1]).host].q.replace('%s', encodeURIComponent(q.slice(m[1].length).trim()));
    } else {
      const e = ENGINES.find(x => x.id === store.get('engine', 'ddg')) || ENGINES[0];
      to = e.url + encodeURIComponent(q);
    }
    if (window.QS_GO.dry) window.QS_GO.to = to; // for the checks: say where, do not go
    else location.replace(to);
    return;
  }

  // ------------------------------------------------------------------ layout rules (build.py: layout)

  const INFO_H = 206; // height of the weather block, the taller of the two info blocks
  const MAX_BLOCK = 2600; // the content block stops growing here; beyond it the block is centred
  const SIDE_W = 240, SIDE_GUTTER = 24; // the side column for todo + weather, and its distance from the grid
  const DENSITIES = ['dense', 'normal', 'roomy'];
  const DENSITY = {
    // card width limits, card height, gap between cards
    dense: {label: 'sűrű', min: 150, max: 190, h: 64, gap: 12}, // icon, name, host; the description shows on hover
    normal: {label: 'normál', min: 200, max: 260, h: 112, gap: 16}, // + one truncated line of description; the default
    roomy: {label: 'tágas', min: 240, max: 320, h: 148, gap: 24}, // + two lines of description and the tile's number
  };

  /** Every measure of the start screen, derived from the viewport (logical px). Nothing is scaled.
   *
   *  rail      14.5 % of the width, 280-360 px
   *  margin    48 / 80 / 96 px; a content block wider than 2600 px is centred
   *  columns   the largest count that keeps the cards at the density's minimum width; the width is shared
   *            between them up to the maximum. `cols` (4-12) fixes the count instead; a card is then at least 140 px
   *  rows      at least three must show. On a short screen the hero gives way first: the search moves beside the
   *            clock, then the clock shrinks. A group with more rows than fit scrolls inside the grid's area
   *  clock     9.5 % of the height, 88-128 px; on tall screens 176 px, with the search on the same row
   *  info      todo + weather: a strip under the grid on tall screens, a side column from 1800 px width,
   *            otherwise the todo sits in the hero and the weather stays in the header
   */
  const SEARCH_MIN = 420; // narrowest search box that still shows its placeholder
  const EMPTY_H = 300; // label offset + h2 + text + buttons + tip of the empty-group block

  function computeLayout(w, h, density = 'normal', cols = 0, tiles = 24) {
    const D = DENSITY[density], gap = D.gap;
    const rail = Math.min(360, Math.max(w < 1280 ? 220 : 280, Math.round((w * 0.145) / 8) * 8));
    const m = w < 2200 ? 48 : w < 3000 ? 80 : 96;
    let x0 = rail + m;
    const areaTop = 77, areaBottom = h - 40, area = areaBottom - areaTop;
    let avail = w - m - x0;
    if (avail > MAX_BLOCK) {
      x0 += Math.floor((avail - MAX_BLOCK) / 2);
      avail = MAX_BLOCK;
    }
    const tall = h >= 1200;
    const place = tall ? 'strip' : w >= 1800 ? 'side' : 'hero';
    const gridW = avail - (place === 'side' ? SIDE_W + SIDE_GUTTER : 0);
    let n, cardW;
    if (cols) {
      n = cols;
      cardW = Math.max(140, Math.floor((gridW - (n - 1) * gap) / n));
    } else {
      n = Math.max(1, Math.floor((gridW + gap) / (D.min + gap)));
      cardW = Math.floor(Math.min(D.max, (gridW - (n - 1) * gap) / n));
    }
    const mainW = n * cardW + (n - 1) * gap;
    const right = x0 + mainW;
    const rowsTotal = Math.ceil(tiles / n);
    const cardH = density === 'roomy' && tall ? 192 : D.h;
    const pitch = cardH + gap;
    const col = c => x0 + c * (cardW + gap);
    const span = c => c * cardW + (c - 1) * gap;
    // on tall screens the clock is large, but it gives way so the search beside it keeps ≥ SEARCH_MIN
    const clockByW = Math.max(88, Math.floor((mainW - SEARCH_MIN - 40) / 3.45 / 8) * 8);
    let clock = tall ? Math.min(176, clockByW) : Math.min(128, Math.max(88, Math.round((h * 0.095) / 8) * 8));
    const sh = w < 1800 ? 52 : 60;
    let inline = tall;
    let secGap = h < 950 ? 28 : 40, stripGap = 0;
    const pad = 32;
    const heroOf = () => 20 + 1.03 * clock + (inline ? 4 : 26 + sh);
    let heroH, rowsVis, scroll, viewH, top;
    if (tall) {
      // hero, grid and info strip share the height; what is left over becomes rhythm between them
      heroH = heroOf();
      const rowsFit = Math.floor((area - heroH - 30 - INFO_H - 4 * 40 + gap) / pitch);
      rowsVis = Math.min(rowsTotal, Math.max(1, rowsFit));
      scroll = rowsTotal > rowsVis;
      viewH = rowsVis * pitch - gap + (scroll ? Math.floor(pitch / 2) : 0);
      const free = area - (heroH + 30 + viewH + INFO_H);
      secGap = Math.round(free * 0.2);
      stripGap = Math.round(free * 0.22);
      top = Math.round(areaTop + free * 0.25);
    } else {
      const fit = () => Math.floor((area - heroOf() - secGap - 30 - 2 * pad + gap) / pitch);
      const want = Math.min(3, rowsTotal);
      if (fit() < want) inline = true;
      while (fit() < want && clock > 64) clock -= 8;
      heroH = heroOf();
      rowsVis = Math.min(rowsTotal, Math.max(1, fit()));
      scroll = rowsTotal > rowsVis;
      if (scroll) {
        top = areaTop + pad;
        viewH = areaBottom - 12 - Math.round(top + heroH + secGap + 30); // the next row peeks in
      } else {
        viewH = rowsVis * pitch - gap;
        top = Math.round(areaTop + Math.max(pad, (area - (heroH + secGap + 30 + viewH)) * 0.42));
      }
    }
    const clockY = top + 20;
    const todoX = right - 240;
    const clear = x0 + 3.45 * clock + 40; // the clock and its seconds end here
    let c0 = -1;
    for (let c = 0; c < n && c0 < 0; c++) if (col(c) >= clear) c0 = c;
    let search;
    const sRight = right - (place === 'hero' ? 300 : 0);
    if (inline && (c0 >= 0 || sRight - clear >= SEARCH_MIN)) {
      // the search starts on the first column edge clear of the clock and its seconds,
      // or straight after the clock when snapping to a column would leave it too narrow
      let sx = c0 >= 0 ? col(c0) : sRight;
      if (sRight - sx < SEARCH_MIN) sx = Math.max(Math.round(clear), sRight - SEARCH_MIN);
      search = [sx, Math.round(clockY + 1.03 * clock - sh), sRight - sx, sh];
    } else {
      const limit = place === 'hero' ? todoX - x0 - 60 : 920;
      let c1 = 1;
      for (let c = 1; c <= n; c++) if (span(c) <= limit) c1 = c;
      search = [x0, Math.round(clockY + 1.03 * clock + 26), Math.max(span(c1), Math.min(limit, SEARCH_MIN)), sh];
    }
    const secY = Math.round(top + heroH + secGap);
    const gridY = secY + 30;
    let todo, weather = null;
    if (place === 'side') {
      const sx = right + SIDE_GUTTER;
      todo = [sx, top, SIDE_W];
      weather = [sx, top + 196, SIDE_W];
    } else if (place === 'strip') {
      const sy = gridY + viewH + stripGap;
      let wc = n - 1;
      for (let c = n - 1; c >= 0; c--) if (col(c) >= x0 + 400) wc = c;
      todo = [x0, sy, 260];
      weather = [col(wc), sy, 340];
    } else todo = [todoX, top, 240];
    return {w, h, density, tiles, rail, m, gap, x0, n, rows: rowsVis, rowsTotal, scroll, cardW, cardH, pitch, mainW, right,
            clock, clockY, top, search, secY, gridY, viewH, place, todo, weather, inline, bottom: areaBottom,
            todoH: place === 'hero' ? Math.max(60, secY - top - 70) : 150};
  }

  // ------------------------------------------------------------------ character field (field.ts)

  const RAMP = ' .:-=+*#%@';
  const SET = '01<>/\\[]{}()#$%&*+=-_:;!?|~^';
  const REACH = 60; // px around the pointer
  const TINT = 0.25; // chance that a flipped cell swaps ink and cyan
  const TRAIL = 200; // ms a cell stays hot after the pointer has left
  // Share of the effect that survives right behind a text block, and the
  // distance over which it returns to full strength.
  const QUIET_IN = 0.2;
  const FADE = 80;
  // The web picks its text blocks by tag; here every block that counts says so.
  // The header and the status bar are left out, as the web leaves out its nav.
  const QUIET = '[data-quiet]';
  // the mark's decode on the way into standby: the scan starts at DECODE_AT ms and takes DECODE_SCAN ms
  const DECODE_AT = 250, DECODE_SCAN = 400;
  const {COLS, ROWS, DENS, CYAN} = MARK;
  // stable background dots, the same on every layout
  const dot = (c, r) => (((c * 73856093) ^ (r * 19349663)) >>> 0) % 100 < 5;

  /** Runs the field on `canvas`. `getStage()` says where the grid is anchored:
   *  {left, top, cw, ch, mark}; with `mark` the Qubernetic mark's cells start there. */
  function startField(canvas, getStage) {
    const ctx = canvas.getContext('2d');
    const still = reducedMotion();
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-family-code') || 'monospace';

    // tints: 0 background dot, 1 ink, 2 cyan, 3 glyph away from the mark
    let palette = [];
    const readPalette = () => {
      const probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.append(probe);
      palette = ['--q-dot', '--q-ink', '--q-cyan', '--q-dim'].map(token => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      });
      probe.remove();
    };

    // COLS x ROWS is the mark's own grid; GC x GR is the grid of the whole page
    let N = 0, GC = 0, GR = 0, gx0 = 0, gy0 = 0;
    let base = [], glyph = [], markIdx = [];
    let baseTint = new Uint8Array(0), tint = new Uint8Array(0);
    let hotUntil = new Float64Array(0), nextFlip = new Float64Array(0), quiet = new Float32Array(0);
    let W = 0, H = 0, dpr = 1, cw = 8, ch = 15, font = 13;
    let dirty = true, raf = 0, withMark = false;
    // The standby transition drives the mark: each mark cell is shown (0), hot
    // (1: decoding, random glyphs) or hidden (2: a background dot or nothing).
    let phase = new Uint8Array(0), appear = new Float32Array(0), settle = new Float32Array(0);
    let decodeT = null, ring = null, cL0 = 0, rT0 = 0;
    const ptr = {x: -9999, y: -9999, inside: false};

    function layout() {
      const sx = window.scrollX, sy = window.scrollY, de = document.documentElement;
      const st = getStage();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = de.clientWidth;
      H = window.innerHeight;
      const docH = Math.max(de.scrollHeight, H);
      const cwN = Math.round(W * dpr), chN = Math.round(H * dpr);
      if (canvas.width !== cwN || canvas.height !== chN) {
        canvas.width = cwN;
        canvas.height = chN;
      }
      const sameCell = cw === st.cw && ch === st.ch && withMark === !!st.mark;
      cw = st.cw;
      ch = st.ch;
      withMark = !!st.mark;
      font = cw / 0.6;
      const ox = st.left + sx, oy = st.top + sy; // where the mark starts in the document
      const cL = Math.ceil(ox / cw), rT = Math.ceil(oy / ch); // whole cells to its left and above
      cL0 = cL;
      rT0 = rT;
      gx0 = ox - cL * cw;
      gy0 = oy - rT * ch; // grid origin, at or before the page edge
      const gc = cL + Math.ceil((Math.max(W, de.scrollWidth) - ox) / cw), gr = rT + Math.ceil((docH - oy) / ch);
      const same = gc === GC && gr === GR && sameCell;
      GC = gc;
      GR = gr;
      N = GC * GR;
      if (!same) {
        base = new Array(N);
        glyph = new Array(N);
        baseTint = new Uint8Array(N);
        tint = new Uint8Array(N);
        hotUntil = new Float64Array(N);
        nextFlip = new Float64Array(N);
        quiet = new Float32Array(N);
        phase = new Uint8Array(N);
      }
      markIdx = [];
      for (let r = 0; r < GR; r++) {
        for (let c = 0; c < GC; c++) {
          const i = r * GC + c, mc = c - cL, mr = r - rT;
          const m = mc >= 0 && mc < COLS && mr >= 0 && mr < ROWS ? mr * COLS + mc : -1;
          const d = m < 0 || !withMark ? 0 : +DENS[m];
          base[i] = d ? RAMP[d] : dot(mc, mr) ? '·' : ' ';
          baseTint[i] = d ? (CYAN[m] === '1' ? 2 : 1) : 0;
          if (!same || !hotUntil[i]) {
            glyph[i] = base[i];
            tint[i] = baseTint[i];
          }
          if (phase[i] === 2) {
            glyph[i] = dot(mc, mr) ? '·' : ' ';
            tint[i] = 0;
          }
          if (d) markIdx.push(i);
          quiet[i] = 1;
        }
      }
      // Distance to the nearest text block, once per layout: only the cells
      // around each block are visited.
      // The decode is a row scan from the top, CRT-like, with a little jitter:
      // a cell appears hot and settles to its own character 120-200 ms later.
      appear = new Float32Array(markIdx.length);
      settle = new Float32Array(markIdx.length);
      for (let k = 0; k < markIdx.length; k++) {
        const mr = ((markIdx[k] / GC) | 0) - rT;
        appear[k] = DECODE_AT + (mr / ROWS) * DECODE_SCAN + Math.random() * 60;
        settle[k] = appear[k] + 120 + Math.random() * 80;
      }
      for (const el of document.querySelectorAll(QUIET)) {
        if (st.skip && el.closest(st.skip)) continue; // the page that is not shown
        let e = el.getBoundingClientRect();
        if (!e.width || !e.height) continue;
        const box = el.closest('[data-clip]'); // a card scrolled out of its box quiets nothing
        if (box) {
          const b = box.getBoundingClientRect();
          e = {left: Math.max(e.left, b.left), right: Math.min(e.right, b.right), top: Math.max(e.top, b.top),
               bottom: Math.min(e.bottom, b.bottom)};
          if (e.right <= e.left || e.bottom <= e.top) continue;
        }
        const l = e.left + sx - gx0, rgt = e.right + sx - gx0, tp = e.top + sy - gy0, bt = e.bottom + sy - gy0;
        const c0 = Math.max(0, Math.floor((l - FADE) / cw)), c1 = Math.min(GC - 1, Math.ceil((rgt + FADE) / cw));
        const r0 = Math.max(0, Math.floor((tp - FADE) / ch)), r1 = Math.min(GR - 1, Math.ceil((bt + FADE) / ch));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
            const dx = Math.max(l - x, 0, x - rgt), dy = Math.max(tp - y, 0, y - bt);
            const k = Math.min(1, Math.hypot(dx, dy) / FADE);
            const q = QUIET_IN + (1 - QUIET_IN) * k * k; // eased: stays faint close to the block
            const i = r * GC + c;
            if (q < quiet[i]) quiet[i] = q;
          }
        }
      }
      dirty = true;
      if (still) draw();
    }

    // The canvas sits behind everything, so the window listens. The pointer is
    // kept in viewport coordinates and turned into grid space on every frame,
    // which keeps it right while scrolling.
    let cx = -9999, cy = -9999;

    function update(now) {
      const R2 = REACH * REACH;
      ptr.x = cx + window.scrollX - gx0;
      ptr.y = cy + window.scrollY - gy0;
      if (decodeT != null) applyDecode(now, decodeT);
      if (ring) applyRing(now);
      // cells under the pointer: flip glyph, sometimes recolour, stay hot for a while
      if (ptr.inside) {
        const c0 = Math.max(0, ((ptr.x - REACH) / cw) | 0), c1 = Math.min(GC - 1, ((ptr.x + REACH) / cw) | 0);
        const r0 = Math.max(0, ((ptr.y - REACH) / ch) | 0), r1 = Math.min(GR - 1, ((ptr.y + REACH) / ch) | 0);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const dx = (c + 0.5) * cw - ptr.x, dy = (r + 0.5) * ch - ptr.y, d2 = dx * dx + dy * dy;
            if (d2 > R2) continue;
            const i = r * GC + c, f = 1 - Math.sqrt(d2) / REACH; // 1 at the pointer, 0 at the rim
            if (now < nextFlip[i] || phase[i]) continue;
            const isMark = baseTint[i] !== 0;
            if (Math.random() > (isMark ? 0.25 + f * 0.75 : f * f * 0.8 * quiet[i])) {
              nextFlip[i] = now + 60;
              continue;
            }
            glyph[i] = SET[rand(SET.length)];
            if (Math.random() < TINT) tint[i] = baseTint[i] === 2 ? 1 : 2; // swap ink and cyan
            else tint[i] = isMark ? baseTint[i] : 3;
            nextFlip[i] = now + 50 + rand(140);
            hotUntil[i] = now + TRAIL * (0.4 + Math.random() * 0.6);
            dirty = true;
          }
        }
      }
      // cool down: cells left behind keep flickering briefly, then return to the mark
      for (let i = 0; i < N; i++) {
        if (!hotUntil[i]) continue;
        if (now >= hotUntil[i]) {
          hotUntil[i] = 0;
          glyph[i] = base[i];
          tint[i] = baseTint[i];
          dirty = true;
        } else if (now >= nextFlip[i]) {
          glyph[i] = SET[rand(SET.length)];
          if (phase[i] === 1) {
            if (Math.random() < 0.35) tint[i] = tint[i] === 2 ? 1 : 2; // decoding: ink and cyan keep swapping
            nextFlip[i] = now + 35 + rand(50);
          } else nextFlip[i] = now + 70 + rand(160);
          dirty = true;
        }
      }
      // idle shimmer: now and then one mark cell blinks on its own
      if (markIdx.length && Math.random() < 0.125) {
        const i = markIdx[rand(markIdx.length)];
        if (!hotUntil[i] && !phase[i]) {
          glyph[i] = SET[rand(SET.length)];
          tint[i] = Math.random() < 0.5 ? 2 : baseTint[i];
          hotUntil[i] = now + 250 + rand(500);
          nextFlip[i] = now + 90;
          dirty = true;
        }
      }
    }

    function setPhase(i, want, now) {
      if (phase[i] === want) return;
      phase[i] = want;
      if (want === 2) {
        glyph[i] = dot((i % GC) - cL0, ((i / GC) | 0) - rT0) ? '·' : ' ';
        tint[i] = 0;
        hotUntil[i] = 0;
      } else if (want === 1) {
        glyph[i] = SET[rand(SET.length)];
        tint[i] = Math.random() < 0.5 ? (baseTint[i] === 2 ? 1 : 2) : baseTint[i];
        hotUntil[i] = now + 1e9; // hot for as long as the phase lasts
        nextFlip[i] = now + 35 + rand(50);
      } else {
        glyph[i] = base[i];
        tint[i] = baseTint[i];
        hotUntil[i] = 0;
      }
      dirty = true;
    }

    // Where the decode stands at time t of the enter timeline. It is a pure
    // function of t, so the transition can run backwards as well.
    function applyDecode(now, t) {
      for (let k = 0; k < markIdx.length; k++) setPhase(markIdx[k], t < appear[k] ? 2 : t < settle[k] ? 1 : 0, now);
    }

    // The shockwave: cells in the ring's band flip hot like the pointer trail,
    // and the mark cells the ring has passed collapse to dots.
    function applyRing(now) {
      const ox = ring.x + window.scrollX - gx0, oy = ring.y + window.scrollY - gy0;
      const outer = ring.r, inner = ring.r - ring.band, half = ring.band / 2;
      for (let r = 0; r < GR; r++) {
        const dy = (r + 0.5) * ch - oy;
        for (let c = 0; c < GC; c++) {
          const dx = (c + 0.5) * cw - ox, d = Math.sqrt(dx * dx + dy * dy);
          if (d > outer) continue;
          const i = r * GC + c;
          if (baseTint[i]) {
            setPhase(i, d < inner ? 2 : 1, now);
            continue;
          }
          if (d < inner || now < nextFlip[i]) continue;
          const f = 1 - Math.abs(d - inner - half) / half; // 1 in the middle of the band
          if (Math.random() > 0.25 + 0.6 * f * quiet[i]) {
            nextFlip[i] = now + 30;
            continue;
          }
          glyph[i] = SET[rand(SET.length)];
          tint[i] = Math.random() < TINT ? 2 : 3;
          nextFlip[i] = now + 50 + rand(140);
          hotUntil[i] = now + TRAIL * (0.4 + Math.random() * 0.6);
          dirty = true;
        }
      }
    }

    function draw() {
      if (!ctx || !N) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const top = window.scrollY - gy0; // first visible grid y
      ctx.translate(gx0 - window.scrollX, -top);
      ctx.font = `${font}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const r0 = Math.max(0, Math.floor(top / ch) - 1), r1 = Math.min(GR - 1, Math.ceil((top + H) / ch));
      let alpha = 1;
      for (let t = 0; t < 4; t++) {
        ctx.fillStyle = palette[t];
        for (let r = r0; r <= r1; r++) {
          for (let c = 0; c < GC; c++) {
            const i = r * GC + c;
            if (tint[i] !== t || glyph[i] === ' ') continue;
            const q = hotUntil[i] ? quiet[i] : 1; // active cells fade behind the text
            if (q !== alpha) ctx.globalAlpha = alpha = q;
            ctx.fillText(glyph[i], (c + 0.5) * cw, (r + 0.5) * ch);
          }
        }
      }
      ctx.globalAlpha = 1;
      dirty = false;
    }

    function frame(now) {
      update(now);
      if (dirty) draw();
      raf = requestAnimationFrame(frame);
    }

    const repaint = () => {
      readPalette();
      dirty = true;
      if (still) draw();
    };

    window.addEventListener('pointermove', e => {
      cx = e.clientX;
      cy = e.clientY;
      ptr.inside = true;
    });
    document.documentElement.addEventListener('pointerleave', () => {
      ptr.inside = false;
    });
    window.addEventListener('scroll', () => {
      dirty = true;
      if (still) draw();
    }, {passive: true});
    // colour mode: the visitor's choice lands on <html> as data-mode, otherwise the system decides
    new MutationObserver(repaint).observe(document.documentElement, {attributes: true, attributeFilter: ['data-mode']});
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);

    readPalette();
    layout();
    // Wait for the webfont, so the grid is drawn with the right glyphs.
    const ready = document.fonts && document.fonts.load
      ? Promise.race([document.fonts.load('13px "IBM Plex Mono"'), new Promise(resolve => setTimeout(resolve, 1500))])
      : Promise.resolve();
    const begin = () => {
      dirty = true;
      draw();
      if (!still) raf = requestAnimationFrame(frame);
    };
    ready.then(begin, begin);

    return {
      layout,
      repaint,
      stop: () => cancelAnimationFrame(raf),
      /** t on the enter timeline in ms; null shows the whole mark and lets go. */
      setDecode(t) {
        if (t == null && decodeT != null) applyDecode(performance.now(), Infinity);
        decodeT = t;
        dirty = true;
      },
      /** {x, y, r, band} in viewport px, or null. */
      setRing(v) {
        ring = v;
      },
    };
  }

  // ------------------------------------------------------------------ elements

  const root = document.documentElement;
  const el = {
    start: $('#start'), standby: $('#standby'), rail: $('#rail'), drum: $('#drum'), lens: $('#lens'),
    limb: $('#limb'), ruler: $('#ruler'), grid: $('#grid'), gridwrap: $('#gridwrap'), secrow: $('#secrow'),
    empty: $('#empty'), search: $('#search'), q: $('#q'), sugg: $('#sugg'), scrim: $('#scrim'),
    todo: $('#todo'), weather: $('#weather'), dlg: $('#dlg'), form: $('#dlgForm'), toast: $('#toast'),
    pop: $('#setPop'), markStage: $('#markStage'),
  };
  $$('[data-ph]').forEach(e => {
    e.textContent = ic(e.dataset.ph);
  });

  let L = null; // the current layout
  let ready = false; // set once the page is put together
  let SB = {left: 110, top: 90, cw: 9, ch: 18}; // the mark's stage on Home · standby
  let field = null;
  let fieldQueued = false;
  // the quiet map follows the page: ask for a new one after anything moves
  function refreshField() {
    if (!field || fieldQueued) return;
    fieldQueued = true;
    requestAnimationFrame(() => {
      fieldQueued = false;
      field.layout();
    });
  }

  function place(node, x, y, w, h) {
    node.style.left = px(x);
    node.style.top = px(y);
    if (w != null) node.style.width = px(w);
    if (h != null) node.style.height = px(h);
  }

  // ------------------------------------------------------------------ wheel

  const OFFS = [0, 64, 116, 158, 190];
  const SIZE = [26, 17, 15, 13, 12];
  const OPAC = [1, 0.72, 0.48, 0.3, 0];
  const TICKS = [[196, 0.8], [222, 0.62], [242, 0.46], [256, 0.32], [265, 0.22], [270, 0.14]];
  const NG = GROUPS.length;
  const wheel = {pos: state.active, target: state.active, v: 0, raf: 0, last: 0, idle: 0};
  let WG = {w: 280, h: 700, cy: 350, s: 1, fb: 1, lh: 42};
  const lerpArr = (arr, a) => {
    const i = Math.min(arr.length - 2, Math.floor(a)), k = Math.min(1, a - i);
    return arr[i] + (arr[i + 1] - arr[i]) * k;
  };
  // the shortest way round the drum from the position to group i
  const wrapD = d => {
    d = mod(d, NG);
    return d >= NG / 2 ? d - NG : d;
  };

  el.drum.innerHTML = GROUPS.map((g, i) =>
    `<li><button type="button" class="drum-item" data-g="${i}" data-quiet><span class="num" aria-hidden="true">${pad2(i + 1)}</span><span class="name">${esc(g.name)}</span></button></li>`).join('');
  const drumItems = $$('.drum-item', el.drum);
  el.ruler.insertAdjacentHTML('beforeend', GROUPS.map((g, i) =>
    `<button type="button" class="ruler-mark" data-g="${i}" aria-label="${i + 1}: ${esc(g.name)}" tabindex="-1"></button>`).join(''));
  const rulerMarks = $$('.ruler-mark', el.ruler);
  const rulerPos = [$('#rulerPosA'), $('#rulerPosB')];

  function layoutWheel(w, h) {
    const s = Math.min(1.6, Math.max(1, (h / 2 - 96) / 250)); // the drum grows with the rail
    const fb = Math.min(1.25, s);
    WG = {w, h, cy: Math.round(h / 2), s, fb, lh: Math.round(42 * fb)};
    el.rail.style.width = px(w);
    el.rail.style.height = px(h);
    el.lens.style.top = px(WG.cy - WG.lh);
    el.lens.style.height = px(2 * WG.lh + 1);
    el.limb.innerHTML = TICKS.flatMap(([off, op]) => [-1, 1].map(sign => {
      const y = Math.round(WG.cy + sign * off * s);
      return y > 56 + 12 && y < h - 60 - 12 ? `<i style="top:${y}px;opacity:${(op * 0.55).toFixed(2)}"></i>` : '';
    })).join('');
    const span = (h - 40) / NG;
    rulerMarks.forEach((b, i) => {
      b.style.top = px(20 + span * i);
      b.style.height = px(span);
    });
    rulerPos.forEach(p => {
      p.style.height = px(Math.round(span));
    });
    drawWheel();
  }

  function drawWheel() {
    const {w, h, cy, s, fb} = WG;
    const near = mod(Math.round(wheel.pos), NG);
    drumItems.forEach((b, i) => {
      const d = wrapD(i - wheel.pos), a = Math.abs(d);
      const y = cy + Math.sign(d) * lerpArr(OFFS, a) * s;
      let size = lerpArr(SIZE, a) * fb;
      if (a < 1) size = Math.min(size, Math.max(SIZE[1] * fb, (w - 32 - 40) / (GROUPS[i].name.length * 0.6)));
      const op = y > 56 && y < h - 60 ? lerpArr(OPAC, a) : 0;
      b.style.transform = `translateY(${y.toFixed(1)}px) translateY(-50%)`;
      b.style.fontSize = px(+size.toFixed(2));
      b.style.opacity = op.toFixed(3);
      b.style.visibility = op < 0.02 ? 'hidden' : '';
      b.style.setProperty('--shift', px(+(28 * Math.min(1, a)).toFixed(1)));
      b.firstChild.style.opacity = Math.max(0, Math.min(1, (a - 0.5) * 2)).toFixed(2);
      b.classList.toggle('on', i === near);
      if (i === near) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    const off = Math.abs(wheel.pos - Math.round(wheel.pos));
    const tagOp = Math.max(0, 1 - off * 4).toFixed(2);
    $('#lensTag').style.opacity = tagOp;
    $('#lensCnt').style.opacity = tagOp;
    $('#lensTag').textContent = `[ ${pad2(near + 1)} ]`;
    $('#lensCnt').textContent = `${GROUPS[near].sites.length} oldal`;
    const span = (h - 40) / NG, p = mod(wheel.pos, NG);
    rulerPos[0].style.transform = `translateY(${(p * span).toFixed(1)}px)`;
    rulerPos[1].style.transform = `translateY(${((p - NG) * span).toFixed(1)}px)`;
    rulerMarks.forEach((b, i) => b.classList.toggle('on', i === near));
  }

  // a spring carries the drum to its target, with a small overshoot
  function spin(now) {
    const dt = Math.min(0.032, (now - wheel.last) / 1000 || 0.016);
    wheel.last = now;
    const k = 240, c = 22;
    wheel.v += (k * (wheel.target - wheel.pos) - c * wheel.v) * dt;
    wheel.pos += wheel.v * dt;
    if (Math.abs(wheel.target - wheel.pos) < 0.002 && Math.abs(wheel.v) < 0.02) {
      wheel.pos = wheel.target;
      wheel.v = 0;
      wheel.raf = 0;
      // keep the numbers small: the drum is endless, the position need not be
      if (Number.isInteger(wheel.target)) wheel.pos = wheel.target = mod(wheel.target, NG);
      drawWheel();
      refreshField();
      return;
    }
    drawWheel();
    wheel.raf = requestAnimationFrame(spin);
  }
  function kick() {
    if (reducedMotion()) {
      wheel.pos = wheel.target;
      wheel.v = 0;
      drawWheel();
      refreshField();
      return;
    }
    if (!wheel.raf) {
      wheel.last = performance.now();
      wheel.raf = requestAnimationFrame(spin);
    }
  }
  function stepGroup(dir) {
    wheel.target = Math.round(wheel.target) + dir;
    setActive(mod(wheel.target, NG));
    kick();
  }
  function jumpTo(i) {
    wheel.target = Math.round(wheel.pos) + wrapD(i - Math.round(wheel.pos));
    setActive(i);
    kick();
  }
  function setActive(i) {
    if (i === state.active) return;
    state.active = i;
    store.set('active', i); // the /go router reads jump codes from the last group seen
    if (state.editing) setEditing(false);
    renderSection(true);
  }

  el.drum.addEventListener('click', e => {
    const b = e.target.closest('.drum-item');
    if (b) jumpTo(+b.dataset.g);
  });
  el.ruler.addEventListener('click', e => {
    const b = e.target.closest('.ruler-mark');
    if (b) jumpTo(+b.dataset.g);
  });

  window.addEventListener('wheel', e => {
    if (state.standby || el.dlg.open || e.ctrlKey) return;
    // the card grid, the suggestions and the todo list scroll by themselves
    if (e.target.closest && e.target.closest('#gridwrap, #sugg, #todoList, #setPop')) return;
    e.preventDefault();
    const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!dy) return;
    // a mouse wheel reports whole notches; a trackpad a stream of small steps
    const wd = Math.abs(e.wheelDeltaY || 0);
    const notch = e.deltaMode === 1 || (wd >= 120 && wd % 120 === 0);
    if (notch) {
      clearTimeout(wheel.idle);
      stepGroup(Math.sign(dy));
      return;
    }
    wheel.target += dy / 160;
    wheel.target = Math.max(wheel.pos - 3, Math.min(wheel.pos + 3, wheel.target));
    clearTimeout(wheel.idle);
    wheel.idle = setTimeout(() => { // the momentum has run out: settle on a group
      wheel.target = Math.round(wheel.target);
      setActive(mod(wheel.target, NG));
      kick();
    }, 110);
    kick();
  }, {passive: false});

  // ------------------------------------------------------------------ scramble (lib/scramble.ts, on a fixed time)

  function scrambleEl(node, final, dur = 240, delay = 0) {
    const start = performance.now() + delay;
    const mix = done => {
      let t = '';
      for (let i = 0; i < final.length; i++) t += i < done || final[i] === ' ' ? final[i] : SET[rand(SET.length)];
      return t;
    };
    const tick = now => {
      if (!node.isConnected) return;
      const k = (now - start) / dur;
      if (k >= 1) {
        node.textContent = final;
        return;
      }
      node.textContent = mix(Math.floor(Math.max(0, k) * final.length));
      requestAnimationFrame(tick);
    };
    node.textContent = mix(0);
    requestAnimationFrame(tick);
  }
  function scrambleIn(scope) {
    if (reducedMotion()) return;
    $$('[data-s]', scope).forEach(node => scrambleEl(node, node.textContent));
  }

  // ------------------------------------------------------------------ cards

  const hostName = site => site.host.split('/')[0];
  const brandSVG = slug => `<svg class="brand" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${BRANDS[slug].d}"/></svg>`;
  // the downloaded favicon, or the initial in a square where the site gave none
  function faviconHTML(site) {
    const file = FAVICONS[hostName(site)];
    return file ? `<img class="favimg" src="${esc(file)}" alt="">`
      : `<span class="fav" aria-hidden="true">${esc(site.name.trim()[0] || '?')}</span>`;
  }
  // What a site's own choice does not settle, the group's icon mode does.
  function tileHTML(site, mode = 'phosphor') {
    const i = site.icon;
    if (i.type === 'img') return `<img src="${esc(i.src)}" alt="">`;
    if (i.type === 'mono') return `<span class="mono-ic" aria-hidden="true">${esc(site.name.trim()[0] || '?')}</span>`;
    if (i.type === 'favicon' || mode === 'favicon') return faviconHTML(site);
    if (mode === 'brand' && site.brand && BRANDS[site.brand]) return brandSVG(site.brand);
    return icon(i.name);
  }
  // Jump codes follow the order of the cards, home row first, so they stay the same from day to day.
  function cardHTML(site, i) {
    const ed = state.editing;
    const inner = `<span class="tile">${tileHTML(site, iconModeOf(GROUPS[state.active]))}</span><span class="no" aria-hidden="true">${pad2(i + 1)}</span>` +
      `<span class="name" data-s>${esc(site.name)}</span><span class="host" data-s>${esc(site.host)}</span>` +
      `<span class="desc" data-s>${esc(site.desc)}</span><span class="rule"></span>`;
    if (!ed) {
      const hk = `<span class="hk" aria-hidden="true">${hintCode(i, GROUPS[state.active].sites.length)}</span>`;
      return `<a class="card" href="${esc(site.url)}" target="_blank" rel="noopener noreferrer" data-i="${i}" data-quiet title="${esc(site.desc)}">` +
        `${inner}<span class="go ph" aria-hidden="true">${ic('arrow-up-right')}</span>${hk}</a>`;
    }
    return `<div class="card ed" data-i="${i}" data-quiet draggable="true" tabindex="0" role="group" aria-label="${esc(site.name)}">` +
      `${inner}<span class="handle ph" aria-hidden="true">${ic('dots-six-vertical')}</span>` +
      `<span class="editbar"><button type="button" data-act="edit" aria-label="Szerkesztés: ${esc(site.name)}">${icon('pencil-simple')}<span class="lbl">szerk.</span></button>` +
      `<button type="button" data-act="del" aria-label="Törlés: ${esc(site.name)}">${icon('trash')}<span class="lbl">törlés</span></button></span></div>`;
  }

  function sizeGrid() {
    const g = el.grid;
    g.dataset.mode = state.mode;
    delete g.dataset.wide;
    delete g.dataset.tall;
    g.dataset.density = state.mode === 'classic' ? state.density : 'roomy';
    g.style.gap = state.mode === 'classic' ? px(L.gap) : '';
    if (state.mode === 'classic') {
      const {cardW: w, cardH: h, n} = L;
      g.style.gridTemplateColumns = `repeat(${n}, ${w}px)`;
      g.style.gridAutoRows = px(h);
      g.dataset.size = state.density !== 'roomy' ? 'base' : h >= 150 && w >= 260 ? 'roomy' : 'base';
      if (w >= 300) g.dataset.wide = '';
      if (h >= 248) g.dataset.tall = '';
    } else if (state.mode === 'compact') {
      const cols = Math.max(1, Math.floor((L.mainW + 12) / 312));
      g.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      g.style.gridAutoRows = '32px';
      g.dataset.size = 'base';
    } else {
      g.style.gridTemplateColumns = '';
      g.style.gridAutoRows = '';
      g.dataset.size = 'base';
    }
  }

  // The grid's box: whole rows, and a strip of the next one where there is more
  // to scroll to. The hint under it counts the rows still below.
  function sizeBox() {
    const classic = state.mode === 'classic';
    // the other two layouts take the room down to the status bar (or to the info strip)
    const boxH = classic || L.place === 'strip' ? L.viewH : L.bottom - 12 - L.gridY;
    el.gridwrap.style.maxHeight = px(boxH + 8);
    place($('#gridHint'), L.x0, L.gridY + boxH - 22, L.mainW);
    scrollHint();
  }
  function scrollHint() {
    const g = el.gridwrap, hint = $('#gridHint');
    const below = g.scrollHeight - g.clientHeight - g.scrollTop, above = g.scrollTop;
    g.classList.toggle('more-below', below > 6);
    g.classList.toggle('more-above', above > 6);
    const rowH = state.mode === 'classic' ? L.pitch : state.mode === 'compact' ? 36 : 116;
    const text = below > 6 ? `↓ görgess · még ${Math.max(1, Math.round(below / rowH))} sor` : '';
    hint.innerHTML = text ? `<span>${text}</span>` : '';
  }

  function renderSection(scramble) {
    const g = GROUPS[state.active], count = g.sites.length;
    // the rows in view, and with them the hero's place, follow the number of tiles
    if (L.tiles !== count + 1) {
      if (ready) relayout();
      else applyLayout();
    }
    const none = count === 0;
    el.secrow.hidden = none;
    el.gridwrap.hidden = none;
    el.empty.hidden = !none;
    const idx = `[ ${pad2(state.active + 1)} ]`, txt = `${g.name} · ${count} oldal`;
    $('#secIdx').textContent = idx;
    $('#secTxt').textContent = txt;
    $('#emptyIdx').textContent = idx;
    $('#emptyTxt').textContent = txt;
    if (none) drawLoss();
    el.grid.innerHTML = g.sites.map(cardHTML).join('') +
      `<button type="button" class="card add" data-quiet>${icon('plus')}<span>új oldal</span></button>`;
    el.gridwrap.scrollTop = 0;
    $('#gridHint').hidden = none;
    sizeBox();
    if (scramble) {
      scrambleIn(el.grid);
      if (!reducedMotion()) scrambleEl($('#secTxt'), txt);
    }
    updateStatus();
    drawWheel();
    drawIconMode();
    refreshField();
  }

  function setMode(mode) {
    state.mode = mode;
    store.set('layout', mode);
    $$('#switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    sizeGrid();
    sizeBox();
    refreshField();
  }
  $('#switch').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.mode);
  });

  function setEditing(on) {
    if (on) setHints(false);
    state.editing = on;
    $('#editNote').hidden = !on;
    $('#status').classList.toggle('editing', on);
    renderSection(false);
  }

  function moveSite(from, to) {
    const sites = GROUPS[state.active].sites;
    if (from === to || from < 0 || to < 0 || from >= sites.length || to >= sites.length) return false;
    change(() => sites.splice(to, 0, sites.splice(from, 1)[0]), true);
    renderSection(false);
    return true;
  }

  el.grid.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    const card = e.target.closest('.card');
    if (!card) return;
    if (card.classList.contains('add')) {
      openDialog();
      return;
    }
    const i = +card.dataset.i;
    if (act && act.dataset.act === 'edit') openDialog(i);
    else if (act && act.dataset.act === 'del') {
      const gone = GROUPS[state.active].sites[i];
      change(() => GROUPS[state.active].sites.splice(i, 1));
      renderSection(false);
      toast(`törölve: ${gone.name}`, undoAct());
    } else if (!state.editing) {
      state.opened++;
      updateStatus();
    }
  });
  // edit mode, keyboard: Shift + arrows move the focused card
  el.grid.addEventListener('keydown', e => {
    const card = e.target.closest('.card.ed');
    if (!card || e.target !== card || !e.shiftKey) return;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const i = +card.dataset.i;
    if (moveSite(i, i + dir)) $(`.card[data-i="${i + dir}"]`, el.grid).focus();
  });

  // edit mode, pointer: drag a card onto another to take its place
  let dragFrom = -1;
  const clearDrop = () => $$('.drop-before, .drop-after', el.grid).forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const dropSide = (card, e) => {
    const r = card.getBoundingClientRect();
    return state.mode === 'compact' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
  };
  el.grid.addEventListener('dragstart', e => {
    const card = e.target.closest && e.target.closest('.card.ed');
    if (!card) return;
    dragFrom = +card.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', GROUPS[state.active].sites[dragFrom].url);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  el.grid.addEventListener('dragover', e => {
    const card = e.target.closest && e.target.closest('.card.ed');
    if (dragFrom < 0 || !card) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDrop();
    if (+card.dataset.i !== dragFrom) card.classList.add(dropSide(card, e) ? 'drop-after' : 'drop-before');
  });
  el.grid.addEventListener('drop', e => {
    const card = e.target.closest && e.target.closest('.card.ed');
    if (dragFrom < 0 || !card) return;
    e.preventDefault();
    let to = +card.dataset.i + (dropSide(card, e) ? 1 : 0);
    if (to > dragFrom) to--;
    const from = dragFrom;
    dragFrom = -1;
    if (!moveSite(from, to)) clearDrop();
  });
  el.grid.addEventListener('dragend', () => {
    dragFrom = -1;
    clearDrop();
    $$('.dragging', el.grid).forEach(c => c.classList.remove('dragging'));
  });
  el.gridwrap.addEventListener('scroll', () => {
    scrollHint();
    refreshField();
  }, {passive: true});

  // empty group
  $('#emptyAdd').addEventListener('click', () => openDialog());
  $('#emptyImport').addEventListener('click', () => {
    change(() => GROUPS[state.active].sites.push(...IMPORT_SAMPLE.map(s => ({...s}))));
    renderSection(true);
    toast(`${IMPORT_SAMPLE.length} könyvjelző áthozva (minta)`, undoAct());
  });
  $('#groupAdd').addEventListener('click', () => toast('új csoport: a mockban nincs bekötve'));
  $('#accBtn').addEventListener('click', () => toast('fiók: a mockban nincs bekötve'));

  function updateStatus() {
    const sites = GROUPS.reduce((a, g) => a + g.sites.length, 0);
    $('#statL').textContent = `${NG} csoport · ${sites} oldal · ma ${state.opened} megnyitás`;
    $('#railHead').textContent = `CSOPORTOK · ${NG}`;
  }

  let toastTimer = 0, toastAct = null;
  /** `act`: {label, run}, a button in the toast; with one the toast stays for six seconds. */
  function toast(msg, act) {
    el.toast.textContent = msg;
    toastAct = act || null;
    if (act) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = act.label;
      el.toast.append(b);
    }
    el.toast.classList.toggle('act', !!act);
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('on', 'act');
      toastAct = null;
    }, act ? 6000 : 2600);
  }
  el.toast.addEventListener('click', e => {
    if (!e.target.closest('button') || !toastAct) return;
    const act = toastAct;
    toastAct = null;
    el.toast.classList.remove('on', 'act');
    act.run();
  });

  // ------------------------------------------------------------------ add / edit dialog

  const PH_NAMES = Object.keys(PH);
  const PH_STARTERS = ['globe', 'chart-line-up', 'cloud', 'code', 'gear-six', 'book-open', 'terminal-window', 'database',
                       'camera', 'envelope-simple', 'calendar-blank', 'folder', 'lightning', 'cube'].filter(n => PH[n]);
  const dlg = {edit: -1, ph: 'chart-line-up', img: '', nameTouched: false};
  const F = el.form.elements;

  const hostOf = raw => {
    let u = raw.trim();
    if (!u) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    try {
      const p = new URL(u);
      return p.hostname.includes('.') || p.hostname === 'localhost' ? {url: p.href, host: p.hostname.replace(/^www\./, '')} : null;
    } catch {
      return null;
    }
  };
  const nameFromHost = host => {
    const parts = host.split('.');
    return (parts.length > 2 && parts[0].length > 2 ? parts[0] : parts[parts.length - 2] || parts[0]).toLowerCase();
  };

  function drawPhResults() {
    const q = $('#phQ').value.trim().toLowerCase();
    const names = q ? PH_NAMES.filter(n => n.includes(q)).sort((a, b) => a.indexOf(q) - b.indexOf(q) || a.length - b.length).slice(0, 14) : PH_STARTERS;
    $('#phRes').innerHTML = names.map(n =>
      `<button type="button" class="ph" data-n="${n}" title="${n}" aria-label="${n}" aria-pressed="${n === dlg.ph}">${ic(n)}</button>`).join('') ||
      '<span class="hint">nincs ilyen ikon</span>';
  }
  function drawIconPreview() {
    $('#pvPh').textContent = ic(dlg.ph);
    $('#pvMono').textContent = (F.name.value.trim()[0] || 'g').toLowerCase();
    $('#pvImg').innerHTML = dlg.img ? `<img src="${esc(dlg.img)}" alt="">` : icon('image');
    const h = hostOf(F.url.value), fav = h && FAVICONS[h.host];
    $('#pvFav').innerHTML = fav ? `<img src="${esc(fav)}" alt="">` : '<span class="sq"></span>';
    $('#phPick').hidden = F.icon.value !== 'ph';
  }

  function openDialog(editIndex = -1) {
    const g = GROUPS[state.active];
    const site = editIndex >= 0 ? g.sites[editIndex] : null;
    dlg.edit = editIndex;
    dlg.nameTouched = !!site;
    dlg.ph = site && site.icon.type === 'ph' ? site.icon.name : 'chart-line-up';
    dlg.img = site && site.icon.type === 'img' ? site.icon.src : '';
    el.form.reset();
    $('#fldUrl').classList.remove('bad');
    $('#dlgGroup').innerHTML = GROUPS.map((x, i) => `<option value="${i}">${pad2(i + 1)}  ${esc(x.name)}</option>`).join('');
    F.group.value = String(state.active);
    F.url.value = site ? site.url : '';
    F.name.value = site ? site.name : '';
    F.desc.value = site ? site.desc : '';
    F.icon.value = site ? site.icon.type : 'ph';
    $('#phQ').value = '';
    $('#dlgTitleTxt').textContent = `${site ? 'Oldal szerkesztése' : 'Új oldal'} · ${g.name}`;
    $('#dlgOk').textContent = site ? 'Mentés' : 'Hozzáadás';
    drawPhResults();
    drawIconPreview();
    el.dlg.showModal();
    F.url.focus();
  }
  function closeDialog() {
    el.dlg.close();
  }

  F.url.addEventListener('input', () => {
    $('#fldUrl').classList.remove('bad');
    const h = hostOf(F.url.value);
    if (h && !dlg.nameTouched) {
      F.name.value = nameFromHost(h.host);
      drawIconPreview();
    }
  });
  F.name.addEventListener('input', () => {
    dlg.nameTouched = F.name.value.trim() !== '';
    drawIconPreview();
  });
  $$('input[name="icon"]', el.form).forEach(r => r.addEventListener('change', () => {
    drawIconPreview();
    if (r.value === 'img' && r.checked && !dlg.img) $('#upFile').click();
  }));
  $('#upFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      dlg.img = String(reader.result);
      drawIconPreview();
    };
    reader.readAsDataURL(file);
  });
  $('#phQ').addEventListener('input', drawPhResults);
  $('#phQ').addEventListener('keydown', e => {
    if (e.key === 'Enter') e.preventDefault(); // searching icons is not submitting the form
  });
  $('#phRes').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    dlg.ph = b.dataset.n;
    drawPhResults();
    drawIconPreview();
  });
  $('#dlgX').addEventListener('click', closeDialog);
  $('#dlgCancel').addEventListener('click', closeDialog);
  el.dlg.addEventListener('click', e => {
    if (e.target === el.dlg) closeDialog(); // the backdrop
  });
  el.dlg.addEventListener('close', refreshField);

  el.form.addEventListener('submit', e => {
    e.preventDefault();
    const h = hostOf(F.url.value);
    if (!h) {
      $('#fldUrl').classList.add('bad');
      F.url.focus();
      return;
    }
    const type = F.icon.value === 'img' && !dlg.img ? 'mono' : F.icon.value;
    const site = {
      name: F.name.value.trim() || nameFromHost(h.host),
      desc: F.desc.value.trim(),
      host: h.host,
      url: h.url,
      icon: type === 'ph' ? {type, name: dlg.ph} : type === 'img' ? {type, src: dlg.img} : {type},
    };
    const gi = +F.group.value;
    const from = GROUPS[state.active].sites;
    if (dlg.edit >= 0) {
      change(() => {
        if (gi === state.active) from[dlg.edit] = site;
        else {
          from.splice(dlg.edit, 1);
          GROUPS[gi].sites.push(site);
        }
      });
      toast(`mentve: ${site.name}`, undoAct());
    } else {
      change(() => GROUPS[gi].sites.push(site), true);
      toast(gi === state.active ? `hozzáadva: ${site.name}` : `hozzáadva: ${site.name} → ${GROUPS[gi].name}`);
    }
    closeDialog();
    renderSection(false);
    if (dlg.edit < 0 && gi === state.active) {
      const card = $(`.card[data-i="${GROUPS[gi].sites.length - 1}"]`, el.grid);
      if (card) {
        scrambleIn(card);
        card.scrollIntoView({block: 'nearest'});
      }
    }
  });

  // ------------------------------------------------------------------ search

  const srch = {open: false, items: [], sel: -1, scope: null}; // scope: the site the search runs inside
  const fsOf = () => (L && L.search[3] > 52 ? 18 : 16);

  function drawCaret() {
    const v = el.q.value, fs = fsOf();
    const at = v ? (document.activeElement === el.q ? el.q.selectionStart : v.length) : el.q.placeholder.length;
    $('#caret').style.left = px(Math.round(at * 0.6 * fs + (v ? 1 : 3) - el.q.scrollLeft));
  }
  function setEngine(i) {
    state.engine = mod(i, ENGINES.length);
    if (!srch.scope) $('#engine').textContent = ENGINES[state.engine].id;
    store.set('engine', ENGINES[state.engine].id);
  }

  function fakeSuggestions(q) {
    if (q.startsWith('twincat')) return ['twincat ads notification', 'twincat ads rust crate'].filter(s => s !== q);
    const tails = ['dokumentáció', 'példa', 'rust crate', 'github', 'letöltés', 'hibaüzenet', 'release notes', 'alternatíva'];
    let hsh = 0;
    for (const c of q) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    return [0, 1, 2].map(k => `${q} ${tails[(hsh + k * 3) % tails.length]}`);
  }

  // Inside a site: its own search first, then the pages visited there lately.
  function scopedItems(raw) {
    const site = srch.scope, text = raw.trim(), q = text.toLowerCase();
    const items = [];
    if (text) {
      items.push({kind: 'scoped', text, meta: `keresés itt: ${hostName(site)}`, icon: 'magnifying-glass',
                  url: searchOf(site).q.replace('%s', encodeURIComponent(text))});
    }
    const words = q.split(/\s+/).filter(Boolean);
    (SITE_RECENT[site.host] || []).filter(([t]) => words.every(w => t.toLowerCase().includes(w))).slice(0, 4)
      .forEach(([t, url, when]) => items.push({kind: 'deep', text: t, meta: `nemrég · ${when}`, icon: 'clock-counter-clockwise', url}));
    return items;
  }
  function setScope(site) {
    srch.scope = site;
    const b = $('#engine');
    b.classList.toggle('scoped', !!site);
    b.textContent = site ? site.name : ENGINES[state.engine].id;
    b.setAttribute('aria-label', site ? `Keresés itt: ${site.name}. Vissza az általános keresőhöz` : 'Keresőmotor váltása');
    el.q.placeholder = site ? 'keresés itt' : 'keresés vagy cím';
    drawCaret();
  }
  // "gh " or "docs.rs ": a site's alias or name and a space turn the line into that site's search
  function scopeByWord(raw) {
    const m = /^(\S+) $/.exec(raw.toLowerCase());
    if (!m) return null;
    for (const g of GROUPS) {
      for (const site of g.sites) {
        const def = searchOf(site);
        if (def && (def.alias === m[1] || site.name === m[1] || hostName(site) === m[1])) return site;
      }
    }
    return null;
  }

  function buildItems(raw) {
    if (srch.scope) return scopedItems(raw);
    const q = raw.trim().toLowerCase();
    const items = [];
    if (q) {
      // your own sites first, with their group; the open group's sites lead
      const words = q.split(/\s+/).filter(w => w.length >= 2);
      const hits = [];
      GROUPS.forEach((g, gi) => g.sites.forEach(s => {
        const hay = `${s.name} ${s.host} ${s.desc}`.toLowerCase();
        let score = words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0);
        if (!score) return;
        if (s.name.toLowerCase().startsWith(q)) score += 3;
        if (gi === state.active) score += 0.5;
        hits.push({score, kind: 'site', text: s.name, meta: `${g.name} · saját oldal`, icon: s.icon.type === 'ph' ? s.icon.name : 'browser', url: s.url,
                   scope: exp.scope && searchOf(s) ? s : null});
      }));
      hits.sort((a, b) => b.score - a.score);
      items.push(...hits.slice(0, 3));
      fakeSuggestions(q).forEach(text => items.push({kind: 'sugg', text, meta: 'javaslat', icon: 'magnifying-glass'}));
    }
    state.history.filter(t => !q || (t.includes(q.split(/\s+/)[0]) && t !== q)).slice(0, q ? 2 : 5)
      .forEach(text => items.push({kind: 'hist', text, meta: 'előzmény', icon: 'clock-counter-clockwise'}));
    return items;
  }

  function drawSugg() {
    el.sugg.innerHTML = srch.items.map((it, i) =>
      `<div class="sugg-row${it.kind === 'site' ? ' hit' : ''}${it.scope ? ' can-scope' : ''}" role="option" id="sg${i}" data-i="${i}" aria-selected="${i === srch.sel}">` +
      `${icon(it.icon)}<span class="t">${esc(it.text)}</span><span class="m">${esc(it.meta)}</span>` +
      `${it.scope ? '<span class="tabk" aria-hidden="true">tab: keresés itt</span>' : ''}<span class="ret" aria-hidden="true">↵</span></div>`).join('') ||
      `<div class="sugg-empty">${srch.scope ? `írd be, mit keresel itt: ${esc(hostName(srch.scope))}` : 'nincs előzmény · írj be egy keresést vagy címet'}</div>`;
    if (srch.sel >= 0) el.q.setAttribute('aria-activedescendant', `sg${srch.sel}`);
    else el.q.removeAttribute('aria-activedescendant');
  }
  function openSugg() {
    srch.items = buildItems(el.q.value);
    srch.sel = el.q.value.trim() && srch.items.length ? 0 : -1;
    srch.open = true;
    drawSugg();
    el.sugg.hidden = false;
    el.search.classList.add('open');
    el.scrim.classList.add('on');
    el.q.setAttribute('aria-expanded', 'true');
    refreshField();
  }
  function closeSugg() {
    if (!srch.open) return;
    srch.open = false;
    el.sugg.hidden = true;
    el.search.classList.remove('open');
    el.scrim.classList.remove('on');
    el.q.setAttribute('aria-expanded', 'false');
    el.q.removeAttribute('aria-activedescendant');
    refreshField();
  }
  function openUrl(url) {
    window.open(url, '_blank', 'noopener');
  }
  function runSearch(item) {
    const text = (item ? item.text : el.q.value).trim();
    if (!text) return;
    if (item && (item.kind === 'site' || item.kind === 'deep' || item.kind === 'scoped')) {
      state.opened++;
      updateStatus();
      openUrl(item.url);
    } else if (srch.scope) {
      state.opened++;
      updateStatus();
      openUrl(searchOf(srch.scope).q.replace('%s', encodeURIComponent(text)));
    } else {
      const direct = !item && !/\s/.test(text) && /^([a-z]+:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text);
      if (direct) openUrl(/^[a-z]+:\/\//i.test(text) ? text : 'https://' + text);
      else {
        // the last five searches, on this machine only
        state.history = [text, ...state.history.filter(t => t !== text)].slice(0, 5);
        store.set('history', state.history);
        openUrl(ENGINES[state.engine].url + encodeURIComponent(text));
      }
    }
    el.q.value = '';
    if (srch.scope) setScope(null);
    drawCaret();
    closeSugg();
  }

  el.q.addEventListener('focus', () => {
    openSugg();
    drawCaret();
  });
  el.q.addEventListener('blur', () => {
    if (srch.scope) setScope(null); // the scope lasts for one search
    closeSugg();
    drawCaret();
  });
  el.q.addEventListener('input', () => {
    const site = exp.scope && !srch.scope ? scopeByWord(el.q.value) : null;
    if (site) {
      el.q.value = '';
      setScope(site);
    }
    openSugg();
    drawCaret();
  });
  ['keyup', 'click', 'select', 'scroll'].forEach(t => el.q.addEventListener(t, drawCaret));
  el.q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!srch.open) openSugg();
      const n = srch.items.length;
      if (n) srch.sel = mod((srch.sel < 0 && e.key === 'ArrowUp' ? 0 : srch.sel) + (e.key === 'ArrowDown' ? 1 : -1), n);
      drawSugg();
      const row = $(`#sg${srch.sel}`);
      if (row) row.scrollIntoView({block: 'nearest'});
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSearch(srch.open && srch.sel >= 0 ? srch.items[srch.sel] : null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (srch.scope) { // first back to the general search, with what was typed
        setScope(null);
        openSugg();
      } else if (srch.open) closeSugg();
      else el.q.blur();
    } else if (e.key === 'Backspace' && srch.scope && !el.q.value) {
      e.preventDefault();
      setScope(null);
      openSugg();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault(); // Tab changes the engine; Shift+Tab still leaves the field
      const it = srch.open && srch.sel >= 0 ? srch.items[srch.sel] : null;
      if (it && it.scope) { // on one of your own sites that has a search: search inside it
        el.q.value = '';
        setScope(it.scope);
        openSugg();
      } else if (!srch.scope) setEngine(state.engine + 1);
    }
  });
  el.sugg.addEventListener('mousedown', e => {
    e.preventDefault(); // keep the focus in the field
    const row = e.target.closest('.sugg-row');
    if (row) runSearch(srch.items[+row.dataset.i]);
  });
  el.sugg.addEventListener('mousemove', e => {
    const row = e.target.closest('.sugg-row');
    if (row && +row.dataset.i !== srch.sel) {
      srch.sel = +row.dataset.i;
      $$('.sugg-row', el.sugg).forEach((r, i) => r.setAttribute('aria-selected', String(i === srch.sel)));
    }
  });
  $('#engine').addEventListener('click', () => {
    if (srch.scope) {
      setScope(null);
      if (srch.open) openSugg();
    } else setEngine(state.engine + 1);
  });
  el.search.addEventListener('mousedown', e => {
    if (e.target.closest('#engine')) {
      if (srch.scope) e.preventDefault(); // the focus stays in the field, so the click can lift the scope
      return;
    }
    if (e.target === el.q) return;
    e.preventDefault();
    el.q.focus();
  });
  el.scrim.addEventListener('mousedown', () => el.q.blur());

  // ------------------------------------------------------------------ todo

  function drawTodos() {
    const done = state.todos.filter(t => t.d).length;
    $('#todoCnt').textContent = `Teendők · ${done} / ${state.todos.length}`;
    $('#todoList').innerHTML = state.todos.map((t, i) =>
      `<li class="todo-item${t.d ? ' done' : ''}" data-i="${i}">` +
      `<button type="button" class="check ph" role="checkbox" aria-checked="${t.d}" aria-label="${esc(t.t)}">${ic('check')}</button>` +
      `<span class="txt">${esc(t.t)}</span>` +
      `<button type="button" class="del ph" aria-label="Törlés: ${esc(t.t)}">${ic('x')}</button></li>`).join('');
    const next = state.todos.find(t => !t.d);
    $('#sbNext').textContent = next ? `következő: ${next.t}` : 'nincs nyitott teendő';
    store.set('todos', state.todos);
    refreshField();
  }
  $('#todoList').addEventListener('click', e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    const i = +li.dataset.i;
    if (e.target.closest('.del')) state.todos.splice(i, 1);
    else if (e.target.closest('.check')) state.todos[i].d = !state.todos[i].d;
    else return;
    drawTodos();
    const again = $(`.todo-item[data-i="${Math.min(i, state.todos.length - 1)}"] .check`);
    if (again) again.focus();
  });
  $('#todoAdd').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#todoIn').value.trim();
    if (!t) return;
    state.todos.push({t, d: false});
    $('#todoIn').value = '';
    drawTodos();
    $('#todoList').scrollTop = 1e6;
  });
  $('#todoIn').addEventListener('keydown', e => {
    if (e.key === 'Escape') e.target.blur();
  });

  // ------------------------------------------------------------------ clock and date

  const DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember',
                  'október', 'november', 'december'];
  // ?freeze=2026-11-23T14:32:07 stops the clock there, for screenshots
  const frozen = (() => {
    const v = new URLSearchParams(location.search).get('freeze');
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d : null;
  })();
  const isoWeek = d => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  };
  let lastTick = '';
  function tick() {
    const d = frozen || new Date();
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, s = `:${pad2(d.getSeconds())}`;
    if (hm + s === lastTick) return;
    if (!lastTick.startsWith(hm)) {
      $('#clock').textContent = hm;
      $('#sbClock').textContent = hm;
      const day = DAYS[d.getDay()], month = MONTHS[d.getMonth()];
      $('#dateTxt').textContent = `${day} · ${d.getFullYear()}. ${month} ${d.getDate()}. · ${isoWeek(d)}. hét`;
      $('#sbDate').textContent = `${day}, ${month} ${d.getDate()}.`;
    }
    $('#clockS').textContent = s;
    lastTick = hm + s;
  }

  // ------------------------------------------------------------------ theme

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentMode = () => root.dataset.mode || (systemDark.matches ? 'dark' : 'light');
  function drawMode() {
    // the label names the mode a click leads to
    $('#modeLbl').textContent = currentMode() === 'dark' ? 'Világos' : 'Sötét';
  }
  $('#modeBtn').addEventListener('click', () => {
    const next = currentMode() === 'dark' ? 'light' : 'dark';
    root.dataset.mode = next;
    store.set('mode', next);
    drawMode();
  });
  $('#modeSys').addEventListener('click', () => {
    delete root.dataset.mode;
    store.del('mode');
    drawMode();
    toast('téma: a rendszert követi');
  });
  systemDark.addEventListener('change', drawMode);

  // ------------------------------------------------------------------ settings

  const showPop = on => {
    el.pop.hidden = !on;
    $('#setBtn').setAttribute('aria-expanded', String(on));
  };
  $('#setBtn').addEventListener('click', () => showPop(el.pop.hidden));
  document.addEventListener('pointerdown', e => {
    if (!el.pop.hidden && !e.target.closest('#setPop, #setBtn')) showPop(false);
  });
  $('#idleDemo').checked = store.get('idleDemo', false);
  $('#idleDemo').addEventListener('change', e => {
    store.set('idleDemo', e.target.checked);
    drawStandbyLabel();
    toast(e.target.checked ? 'standby: 10 mp tétlenség után' : 'standby: 5 perc tétlenség után');
  });
  $('#sbNow').addEventListener('click', () => {
    showPop(false);
    enterStandby();
  });
  $('#resetAll').addEventListener('click', () => {
    state.todos = DEFAULT_TODOS.map(t => ({...t}));
    state.history = [...DEFAULT_HISTORY];
    store.set('history', state.history);
    drawTodos();
    toast('teendők és keresések visszaállítva');
  });

  // ------------------------------------------------------------------ card density and columns

  // A re-layout moves and resizes things in one go; FLIP plays it from where
  // they were (transform only), so nothing jumps.
  function relayout() {
    if (reducedMotion() || tr.kind) {
      applyLayout();
      return;
    }
    const nodes = [...$$('#grid > .card'), el.search, el.todo, el.weather, el.secrow, $('#clock'), $('#clockS'),
                   $('#heroLabel'), $('#gridHint')];
    const first = nodes.map(n => n.getBoundingClientRect());
    applyLayout();
    nodes.forEach((n, i) => {
      const a = first[i], b = n.getBoundingClientRect();
      if (!a.width || !b.width || !a.height || !b.height) return;
      const dx = a.left - b.left, dy = a.top - b.top, kx = a.width / b.width, ky = a.height / b.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(kx - 1) < 0.01 && Math.abs(ky - 1) < 0.01) return;
      n.animate([
        {transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${kx}, ${ky})`},
        {transformOrigin: '0 0', transform: 'none'},
      ], {duration: 300, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)'});
    });
    // cards in flight stretch the scroll box: measure the hint again once they have landed
    setTimeout(() => {
      scrollHint();
      refreshField();
    }, 340);
  }
  function drawDensity() {
    $$('#densSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === state.density)));
    $('#colsVal').textContent = state.cols ? String(state.cols) : `auto · ${L ? L.n : ''}`;
    $('#colsDown').disabled = !state.cols;
    $('#colsUp').disabled = state.cols >= 12;
  }
  function setDensity(d, say) {
    if (d === state.density) return;
    state.density = d;
    store.set('density', d);
    if (state.mode !== 'classic') setMode('classic'); // density is about the cards
    relayout();
    drawDensity();
    if (say) toast(`sűrűség: ${DENSITY[d].label} · ${L.n} oszlop`);
  }
  function setCols(c) {
    state.cols = c >= 4 && c <= 12 ? c : 0;
    store.set('cols', state.cols);
    relayout();
    drawDensity();
  }
  function drawIconMode() {
    const g = GROUPS[state.active], mode = iconModeOf(g);
    $$('#icoSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    $('#icoLbl').textContent = `ikonok · ${g.name}`;
    const n = g.sites.length;
    const have = mode === 'brand' ? g.sites.filter(x => x.brand && BRANDS[x.brand]).length
      : mode === 'favicon' ? g.sites.filter(x => FAVICONS[hostName(x)]).length : n;
    $('#icoHint').textContent = mode === 'brand' ? `Csoportonként állítható. Márkajel: ${have} / ${n}, a többi Phosphor-ikon.`
      : mode === 'favicon' ? `Csoportonként állítható. Letöltött favicon: ${have} / ${n}, a többi kezdőbetű.`
      : 'Csoportonként állítható. Minden oldal a Phosphor-ikonját mutatja.';
  }
  $('#icoSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    iconModes[GROUPS[state.active].name] = b.dataset.m;
    store.set('iconModes', iconModes);
    renderSection(false);
  });
  $('#densSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setDensity(b.dataset.d);
  });
  // auto, 4, 5 … 12
  $('#colsDown').addEventListener('click', () => setCols(state.cols > 4 ? state.cols - 1 : 0));
  $('#colsUp').addEventListener('click', () => setCols(state.cols ? state.cols + 1 : 4));

  // ------------------------------------------------------------------ home · standby

  const idleMs = () => ($('#idleDemo').checked ? 10e3 : 300e3);
  let lastInput = Date.now(), sbSince = 0, sbRef = null;
  function drawStandbyLabel() {
    $('#sbLabelTxt').textContent = `Home · standby · ${$('#idleDemo').checked ? '10 mp' : '5 perc'} tétlenség után`;
  }
  // The two pages change places through the field. Enter (about 900 ms): the
  // start page dissolves into glyphs, the mark decodes row by row, the clock
  // travels to its standby place. Exit (about 640 ms): a shockwave from the
  // wake point collapses the mark and the start page writes itself back as the
  // ring reaches each block. Both are pure functions of the time t, so waking
  // during the enter runs it backwards from where it stands.
  const ENTER_MS = 920, DISSOLVE_MS = 190, DISSOLVE_SPREAD = 110;
  const RING_MS = 420, RING_BAND = 72, WRITE_MS = 200, EXIT_MS = RING_MS + WRITE_MS + 20;
  const FADE_MS = 150; // prefers-reduced-motion: a plain crossfade
  const BLOCKS = '.hdr, .status, .rail, #heroLabel, #clockS, #search, #todo, #weather, #secLabel, #switch, ' +
    '#grid > .card, #gridHint, #empty [data-quiet], #toast';
  const SB_TEXTS = [['#sbLabel', 400], ['#sbDate', 470], ['#sbWeather', 540], ['#sbNext', 610], ['#sbHint', 680]];
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeIO = v => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  const tr = {kind: null, t: 0, dir: 1, last: 0, raf: 0, hold: false, blocks: [], texts: [], flip: null,
              origin: null, diag: 1, lastScr: 0, swapped: false};
  let fieldMark = false; // the field's grid: the start page's, or the standby's with the mark
  const lines = on => document.body.classList.toggle('sb-lines', on);

  // a block and the text nodes that scramble in it (icons and hidden labels keep out)
  function blockOf(node) {
    const texts = [];
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.data.trim() || n.parentElement.closest('.ph, .vh, select, #sugg')) continue;
      texts.push({n, final: n.data});
    }
    return {el: node, texts, scr: false, rect: node.getBoundingClientRect(),
            base: parseFloat(getComputedStyle(node).opacity) || 0};
  }
  // done = characters already final from the left; chance = share of the rest shown as random glyphs
  function scrambleBlock(b, done, chance) {
    for (const x of b.texts) {
      const f = x.final, k = Math.floor(done * f.length);
      let out = f.slice(0, k);
      for (let i = k; i < f.length; i++) {
        const c = f[i];
        out += c === ' ' || c === '\n' || Math.random() >= chance ? c : SET[rand(SET.length)];
      }
      x.n.data = out;
    }
    b.scr = true;
  }
  function settleBlock(b) {
    if (!b.scr) return;
    for (const x of b.texts) x.n.data = x.final;
    b.scr = false;
  }

  function startTr(kind, x, y) {
    const w = root.clientWidth, h = window.innerHeight;
    document.body.classList.add('sb-anim'); // both pages are laid out from here on
    Object.assign(tr, {kind, t: 0, dir: 1, last: performance.now(), lastScr: 0, swapped: false});
    if (kind === 'fade') {
      tr.to = x; // true: towards standby
      (tr.to ? el.standby : el.start).style.opacity = '0';
    } else {
      tr.blocks = $$(BLOCKS, el.start).map(blockOf).filter(b => b.rect.width && b.rect.height);
      tr.texts = SB_TEXTS.map(([sel, at]) => Object.assign(blockOf($(sel)), {at}));
      // the clock travels in one piece: from its hero box to the standby clock's box
      const a = $('#clock').getBoundingClientRect(), z = $('#sbClock').getBoundingClientRect();
      tr.flip = {dx: z.left - a.left, dy: z.top - a.top, s: z.height / a.height};
      $('#sbClock').style.opacity = '0';
      if (kind === 'enter') {
        // the page dissolves from the centre outwards
        const far = Math.hypot(w, h) / 2;
        for (const b of tr.blocks) {
          const r = b.rect;
          b.at = (DISSOLVE_SPREAD * Math.hypot(r.left + r.width / 2 - w / 2, r.top + r.height / 2 - h / 2)) / far;
        }
        fieldMark = true;
        lines(true);
        field.setDecode(0);
        field.layout();
      } else {
        tr.origin = {x, y};
        tr.diag = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
        // a block starts writing when the ring reaches its nearest point
        for (const b of tr.blocks) {
          const r = b.rect;
          const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
          b.at = (RING_MS * d) / tr.diag;
        }
        document.body.classList.remove('is-standby');
      }
    }
    renderTr(tr.last, true);
    if (!tr.raf) tr.raf = requestAnimationFrame(runTr);
  }

  function renderTr(now, force) {
    const t = tr.t;
    if (tr.kind === 'fade') {
      const k = clamp01(t / FADE_MS);
      el.start.style.opacity = String(tr.to ? 1 - k : k);
      el.standby.style.opacity = String(tr.to ? k : 1 - k);
      if (!tr.swapped && k >= 0.5) { // the canvas changes pages at the midpoint
        tr.swapped = true;
        fieldMark = tr.to;
        lines(tr.to);
        field.layout();
      }
      return;
    }
    const text = force || now - tr.lastScr > 32; // glyphs change about 30 times a second
    if (text) tr.lastScr = now;
    const clock = $('#clock'), f = tr.flip;
    const flip = k => {
      clock.style.transform = `translate(${(f.dx * k).toFixed(2)}px, ${(f.dy * k).toFixed(2)}px) scale(${(1 + (f.s - 1) * k).toFixed(4)})`;
    };
    if (tr.kind === 'enter') {
      for (const b of tr.blocks) {
        const k = clamp01((t - b.at) / DISSOLVE_MS);
        b.el.style.opacity = String(b.base * (1 - clamp01((k - 0.3) / 0.7)));
        b.el.classList.toggle('dz', k > 0.1);
        if (k <= 0 || k >= 1) settleBlock(b);
        else if (text) scrambleBlock(b, 0, Math.min(1, k * 2.2));
      }
      for (const b of tr.texts) {
        const k = clamp01((t - b.at) / 220);
        b.el.style.opacity = k > 0 ? '1' : '0';
        b.el.classList.toggle('dz', k > 0 && k < 0.6);
        if (k >= 1) settleBlock(b);
        else if (text) scrambleBlock(b, k, 1);
      }
      $('#sbRule').style.opacity = String(clamp01((t - 500) / 200));
      $('.gridlines').style.opacity = String(Math.abs(1 - 2 * clamp01(t / 300)));
      lines(t >= 150);
      flip(easeIO(clamp01((t - 80) / 700)));
      field.setDecode(t);
    } else {
      if (t < RING_MS) field.setRing({x: tr.origin.x, y: tr.origin.y, r: (tr.diag * t) / RING_MS, band: RING_BAND});
      else if (!tr.swapped) { // the ring has left the screen: back to the start page's grid, without the mark
        tr.swapped = true;
        field.setRing(null);
        field.setDecode(null);
        fieldMark = false;
        field.layout();
      }
      for (const b of tr.blocks) {
        const k = clamp01((t - b.at) / WRITE_MS);
        b.el.style.opacity = String(b.base * clamp01(k * 4));
        b.el.classList.toggle('dz', k < 0.5);
        if (k >= 1) settleBlock(b);
        else if (text) scrambleBlock(b, k, 1);
      }
      for (const b of tr.texts) {
        const k = clamp01(t / 160);
        b.el.style.opacity = String(1 - k);
        b.el.classList.toggle('dz', k > 0.1);
        if (text && k < 1) scrambleBlock(b, 0, k * 1.5);
      }
      $('#sbRule').style.opacity = String(1 - clamp01(t / 160));
      $('.gridlines').style.opacity = String(Math.abs(1 - 2 * clamp01(t / 400)));
      lines(t < 200);
      flip(1 - easeIO(clamp01(t / 440)));
    }
  }

  function runTr(now) {
    tr.raf = 0;
    if (!tr.kind) return;
    const dt = Math.min(50, now - tr.last);
    tr.last = now;
    if (!tr.hold) tr.t += dt * (tr.dir < 0 ? -1.6 : 1); // the way back out of an enter is quicker
    const end = tr.kind === 'enter' ? ENTER_MS : tr.kind === 'exit' ? EXIT_MS : FADE_MS;
    if (tr.dir < 0 ? tr.t <= 0 : tr.t >= end) {
      tr.t = tr.dir < 0 ? 0 : end;
      renderTr(now, true);
      finishTr();
      return;
    }
    renderTr(now, false);
    tr.raf = requestAnimationFrame(runTr);
  }

  function finishTr() {
    const toStandby = tr.kind === 'enter' ? tr.dir > 0 : tr.kind === 'fade' ? tr.to : false;
    for (const b of [...tr.blocks, ...tr.texts]) {
      settleBlock(b);
      b.el.style.opacity = '';
      b.el.classList.remove('dz');
    }
    for (const n of [el.start, el.standby, $('#sbClock'), $('#sbRule'), $('.gridlines')]) n.style.opacity = '';
    $('#clock').style.transform = '';
    tr.blocks = [];
    tr.texts = [];
    tr.kind = null;
    field.setRing(null);
    field.setDecode(null);
    document.body.classList.toggle('is-standby', toStandby);
    document.body.classList.remove('sb-anim');
    lines(toStandby);
    if (fieldMark !== toStandby) {
      fieldMark = toStandby;
      field.layout();
    } else refreshField();
    if (demo) setTimeout(demoStep, 2000);
  }

  function enterStandby() {
    if (state.standby || tr.kind || !field) return;
    if (el.dlg.open) el.dlg.close();
    showPop(false);
    showBackup(false);
    setHints(false);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    state.standby = true;
    sbSince = performance.now();
    sbRef = null;
    startTr(reducedMotion() ? 'fade' : 'enter', true);
  }
  // x, y: where the wake came from; a key wakes from the centre of the screen
  function wake(x = root.clientWidth / 2, y = window.innerHeight / 2) {
    if (!state.standby) return;
    if (tr.kind === 'enter') { // still on the way in: turn round from here
      state.standby = false;
      lastInput = Date.now();
      tr.dir = -1;
      return;
    }
    if (tr.kind) return;
    state.standby = false;
    lastInput = Date.now();
    if (reducedMotion()) {
      document.body.classList.remove('is-standby');
      startTr('fade', false);
    } else startTr('exit', x, y);
  }

  // ?transition-demo: enter, 2 s, exit, 2 s, and round again
  const demo = new URLSearchParams(location.search).has('transition-demo');
  function demoStep() {
    if (tr.kind) return;
    if (state.standby) wake();
    else enterStandby();
  }
  // for frame captures: hold the clock of the transition and place it by hand
  window.__qsTransition = {
    hold(on) {
      tr.hold = on;
    },
    seek(t) {
      tr.t = t;
    },
    state: () => ({kind: tr.kind, t: tr.t, dir: tr.dir, standby: state.standby}),
  };

  setInterval(() => {
    if (!state.standby && !tr.kind && !demo && !el.dlg.open && Date.now() - lastInput > idleMs()) enterStandby();
  }, 1000);

  window.addEventListener('pointermove', e => {
    if (!state.standby) {
      lastInput = Date.now();
      return;
    }
    // Any movement returns, except over the mark: there the pointer plays with it.
    if (tr.kind || demo || performance.now() - sbSince < 1000) return;
    const x = e.clientX, y = e.clientY;
    const r = el.markStage.getBoundingClientRect();
    const onMark = x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 30;
    if (!sbRef || onMark) {
      sbRef = {x, y};
      return;
    }
    if (Math.hypot(x - sbRef.x, y - sbRef.y) > 24) wake(x, y);
  });
  window.addEventListener('pointerdown', e => {
    if (state.standby) wake(e.clientX, e.clientY);
    else lastInput = Date.now();
  });
  window.addEventListener('wheel', () => {
    if (state.standby) wake();
    else lastInput = Date.now();
  }, {passive: true});

  // ------------------------------------------------------------------ jump codes

  // f shows a letter on every card of the open group; the letter opens the site.
  // Nothing animates: it starts from a key and runs many times a day.
  const hint = {on: false, typed: ''};
  function drawHints() {
    const n = GROUPS[state.active].sites.length;
    $$('#grid > .card:not(.add)').forEach(c => c.classList.toggle('hk-off', !hintCode(+c.dataset.i, n).startsWith(hint.typed)));
    $('#keysHint').textContent = hint.typed ? `${hint.typed}…` : 'betű: megnyitás';
  }
  function setHints(on) {
    if (on === hint.on) return;
    if (on && (!exp.hints || state.editing || !GROUPS[state.active].sites.length)) return;
    hint.on = on;
    hint.typed = '';
    document.body.classList.toggle('hinting', on);
    if (on) drawHints();
  }
  function openSite(i, background) {
    const site = GROUPS[state.active].sites[i];
    state.opened++;
    updateStatus();
    const card = $(`.card[data-i="${i}"]`, el.grid);
    if (card) {
      card.scrollIntoView({block: 'nearest'});
      card.classList.add('fired'); // the card answers, as it would to a press
      setTimeout(() => card.classList.remove('fired'), 240);
    }
    if (background) toast(`háttérlapon: ${site.name} (a mockban sima új lap)`);
    openUrl(site.url);
  }
  /** A key while the codes show. Returns true when the key was used up. */
  function hintKey(e) {
    if (e.key === 'Shift') return true;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      setHints(false);
      return false;
    }
    if (/^[1-9]$/.test(e.key) || e.key === 'ArrowDown' || e.key === 'ArrowUp') { // another group, the codes stay
      hint.typed = '';
      return false;
    }
    e.preventDefault();
    const k = e.key.length === 1 ? e.key.toLowerCase() : '';
    const n = GROUPS[state.active].sites.length;
    const typed = hint.typed + k;
    let exact = -1, some = false;
    for (let i = 0; i < n && k; i++) {
      const code = hintCode(i, n);
      if (code === typed) exact = i;
      else if (code.startsWith(typed)) some = true;
    }
    if (exact >= 0) {
      setHints(false);
      openSite(exact, e.shiftKey);
    } else if (some) {
      hint.typed = typed;
      drawHints();
    } else setHints(false); // Escape, or a letter no card has
    return true;
  }

  // ------------------------------------------------------------------ snapshots and restore

  // A snapshot is taken two seconds after the last change, one for a burst of changes. Kept: the newest
  // twenty, and beyond those one a day for a week. The extension would keep them in chrome.storage.local
  // or IndexedDB; the mock uses localStorage under its own key.
  const BK_KEEP = 20, BK_DAYS = 7, BK_WAIT = 2000;
  const BK_KEYS = ['todos', 'density', 'cols', 'layout', 'mode', 'engine', 'iconModes'];
  const nowMs = () => (frozen || new Date()).getTime();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const countIn = st => st.groups.reduce((a, g) => a + g.sites.length, 0);

  function captureState() {
    return {
      groups: GROUPS.map(g => ({name: g.name, sites: g.sites.map(x => ({...x, icon: {...x.icon}}))})),
      iconModes: {...iconModes},
      todos: state.todos.map(t => ({...t})),
      settings: {density: state.density, cols: state.cols, layout: state.mode, theme: root.dataset.mode || null,
                 engine: ENGINES[state.engine].id},
    };
  }

  const LAYOUT_LBL = {classic: 'klasszikus', simple: 'egyszerű', compact: 'tömör'};
  const THEME_LBL = {dark: 'sötét', light: 'világos'};
  /** What changes on the way from state `a` to state `b`, as short phrases. */
  function diffState(a, b) {
    const out = [];
    b.groups.forEach((g, i) => {
      const before = (a.groups.find(x => x.name === g.name) || a.groups[i] || {sites: []}).sites, after = g.sites;
      const bk0 = before.map(x => x.url), ak = after.map(x => x.url);
      const added = after.filter(x => !bk0.includes(x.url)), gone = before.filter(x => !ak.includes(x.url));
      const one = (list, sign) => (list.length === 1 ? `${sign}${list[0].name} (${g.name})` : `${sign}${list.length} oldal: ${g.name}`);
      if (added.length) out.push(one(added, '+'));
      if (gone.length) out.push(one(gone, '−'));
      if (!added.length && !gone.length) {
        if (bk0.join('\n') !== ak.join('\n')) out.push(`átrendezve: ${g.name}`);
        else if (!same(before, after)) out.push(`módosítva: ${g.name}`);
      }
      const ma = (a.iconModes || {})[g.name], mb = (b.iconModes || {})[g.name];
      if (ma !== mb) out.push(`ikonok: ${mb || 'alap'} (${g.name})`);
    });
    const ta = a.todos || [], tb = b.todos || [];
    if (ta.length !== tb.length) out.push(`${tb.length > ta.length ? '+' : '−'}${Math.abs(tb.length - ta.length)} teendő`);
    else if (!same(ta, tb)) {
      const d = tb.filter(t => t.d).length - ta.filter(t => t.d).length;
      out.push(d > 0 ? `${d} teendő kész` : d < 0 ? `${-d} teendő újra nyitva` : 'teendők módosítva');
    }
    const sa = a.settings || {}, sb = b.settings || {};
    if (sa.theme !== sb.theme) out.push(`téma: ${THEME_LBL[sb.theme] || 'rendszer'}`);
    if (sa.density !== sb.density) out.push(`sűrűség: ${(DENSITY[sb.density] || {}).label || sb.density}`);
    if (sa.cols !== sb.cols) out.push(`oszlopok: ${sb.cols || 'auto'}`);
    if (sa.layout !== sb.layout) out.push(`elrendezés: ${LAYOUT_LBL[sb.layout] || sb.layout}`);
    if (sa.engine !== sb.engine) out.push(`kereső: ${sb.engine}`);
    return out;
  }
  const sumOf = list => (list.length ? list.slice(0, 3).join(', ') + (list.length > 3 ? ` és még ${list.length - 3}` : '') : 'nincs változás');
  const MON = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
  const dayOf = t => {
    const d = new Date(t);
    return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
  };
  const hhmm = t => {
    const d = new Date(t);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const whenOf = t => {
    const d = new Date(t), days = Math.round((new Date(nowMs()).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return `${days === 0 ? 'ma' : days === 1 ? 'tegnap' : `${MON[d.getMonth()]} ${d.getDate()}.`} ${hhmm(t)}`;
  };

  function pruneSnaps() {
    const keep = bk.snaps.slice(0, BK_KEEP), seen = new Set(), limit = nowMs() - BK_DAYS * 864e5;
    for (const x of bk.snaps.slice(BK_KEEP)) {
      const day = dayOf(x.t);
      if (x.t < limit || seen.has(day)) continue;
      seen.add(day);
      keep.push(x);
    }
    bk.snaps = keep;
  }
  function persistSnaps() {
    if (fresh) return;
    bk.failed = !store.set('backup', bk.snaps);
    while (bk.failed && bk.snaps.length > 1) { // the store is full: let the oldest go until it fits
      bk.snaps.pop();
      bk.failed = !store.set('backup', bk.snaps);
    }
  }
  /** Keeps the present state, unless it is the newest snapshot already. */
  function pushSnap(sum) {
    const st = captureState(), prev = bk.snaps[0];
    if (prev && same(prev.state, st)) return false;
    bk.snaps.unshift({t: nowMs(), sum: sum || (prev ? sumOf(diffState(prev.state, st)) : 'kiinduló állapot'), n: countIn(st), state: st});
    pruneSnaps();
    persistSnaps();
    return true;
  }
  function touch() {
    if (!exp.backup || bk.applying || !ready) return;
    clearTimeout(bk.timer);
    bk.timer = setTimeout(() => {
      bk.timer = 0;
      pushSnap();
      drawBackup();
    }, BK_WAIT);
    drawBackup();
  }
  function flush() {
    if (!exp.backup) return;
    clearTimeout(bk.timer);
    bk.timer = 0;
    pushSnap();
    drawBackup();
  }
  store.onWrite = key => {
    if (BK_KEYS.includes(key)) touch();
  };
  /** Every edit of the groups goes through here. The state before it is kept first, so the edit can be
   *  undone by itself; `burst` (adding, dragging cards about) leaves that to the two-second wait. */
  function change(fn, burst) {
    if (!burst) flush();
    fn();
    touch();
  }

  function applyState(st) {
    bk.applying = true;
    if (state.editing) setEditing(false);
    GROUPS.forEach((g, i) => {
      g.sites = sitesFrom(st, g, i);
    });
    Object.keys(iconModes).forEach(k => delete iconModes[k]);
    Object.assign(iconModes, st.iconModes || {});
    store.set('iconModes', iconModes);
    if (Array.isArray(st.todos)) state.todos = st.todos.map(t => ({t: String(t.t), d: !!t.d}));
    const v = st.settings || {};
    if (DENSITIES.includes(v.density)) {
      state.density = v.density;
      store.set('density', v.density);
    }
    if ('cols' in v) {
      state.cols = v.cols >= 4 && v.cols <= 12 ? v.cols : 0;
      store.set('cols', state.cols);
    }
    if ('theme' in v) {
      if (v.theme === 'dark' || v.theme === 'light') {
        root.dataset.mode = v.theme;
        store.set('mode', v.theme);
      } else {
        delete root.dataset.mode;
        store.del('mode');
      }
      drawMode();
    }
    const engine = ENGINES.findIndex(x => x.id === v.engine);
    if (engine >= 0) setEngine(engine);
    if (LAYOUT_LBL[v.layout]) setMode(v.layout);
    applyLayout();
    drawDensity();
    drawTodos();
    renderSection(true); // the cards write themselves back
    bk.applying = false;
  }
  /** Back to a snapshot. What is on the page now is kept first, so this can be undone as well. */
  function restoreSnap(snap, verb) {
    if (!snap) return;
    flush();
    const what = sumOf(diffState(captureState(), snap.state));
    applyState(snap.state);
    pushSnap(`vissza: ${what}`);
    drawBackup();
    toast(`${verb}: ${what}`, {label: 'mégis · z', run: undoLast});
  }
  // z: the state before the last change. Pressed again it brings the change back.
  function undoLast() {
    if (!exp.backup) return;
    flush();
    if (bk.snaps.length < 2) {
      toast('nincs mit visszavonni');
      return;
    }
    restoreSnap(bk.snaps[1], 'visszavonva');
  }
  const undoAct = () => (exp.backup ? {label: 'visszavonás · z', run: undoLast} : null);

  // the status bar says the data is safe; the panel lists the snapshots
  function drawBackup() {
    const btn = $('#bkBtn'), last = bk.snaps[0];
    btn.hidden = !exp.backup;
    btn.classList.toggle('wait', !!bk.timer);
    btn.classList.toggle('bad', bk.failed);
    btn.textContent = bk.failed ? 'mentés sikertelen: megtelt a tároló' : bk.timer ? 'mentés…'
      : last ? `mentve · ${hhmm(last.t)} · ${bk.snaps.length} pillanatkép` : 'nincs pillanatkép';
    if ($('#bkPop').hidden) return;
    const cur = captureState();
    $('#bkTitle').textContent = `Visszaállítás · ${bk.snaps.length} pillanatkép`;
    $('#bkList').innerHTML = bk.snaps.map((x, i) =>
      `<li><button type="button" data-i="${i}" aria-pressed="${i === bk.sel}"><span class="t">${whenOf(x.t)}</span>` +
      `<span class="l">${esc(x.sum)}</span><span class="m">${x.n} oldal</span></button></li>`).join('') ||
      '<li class="none">Még nincs pillanatkép. Az első változás után két másodperccel készül el.</li>';
    const snap = bk.snaps[bk.sel];
    const diff = snap ? diffState(cur, snap.state) : [];
    $('#bkPrev').textContent = !snap ? 'Válassz egy pillanatképet: megmutatom, mi változna.'
      : diff.length ? `Ha visszaállítod: ${diff.join(', ')}.` : 'Ez a mostani állapot.';
    $('#bkGo').disabled = !snap || !diff.length;
  }
  function showBackup(on) {
    if (on && !exp.backup) return;
    if (on) {
      flush();
      showPop(false);
      bk.sel = -1;
      $('#bkErr').hidden = true;
    }
    $('#bkPop').hidden = !on;
    $('#bkBtn').setAttribute('aria-expanded', String(on));
    drawBackup();
    if (on) {
      const first = $('#bkList button');
      (first || $('#bkExport')).focus();
    }
    refreshField();
  }
  const pickSnap = i => {
    if (i === bk.sel) return;
    bk.sel = i;
    $$('#bkList button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const snap = bk.snaps[i], diff = snap ? diffState(captureState(), snap.state) : [];
    $('#bkPrev').textContent = diff.length ? `Ha visszaállítod: ${diff.join(', ')}.` : 'Ez a mostani állapot.';
    $('#bkGo').disabled = !diff.length;
  };
  const goSnap = () => {
    const snap = bk.snaps[bk.sel];
    if (!snap || $('#bkGo').disabled) return;
    showBackup(false);
    restoreSnap(snap, 'visszaállítva');
  };
  $('#bkBtn').addEventListener('click', () => showBackup($('#bkPop').hidden));
  $('#bkList').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) pickSnap(+b.dataset.i);
  });
  // the preview follows the focus; the arrows walk the list and Enter restores the row in focus
  $('#bkList').addEventListener('focusin', e => {
    const b = e.target.closest('button');
    if (b) pickSnap(+b.dataset.i);
  });
  $('#bkList').addEventListener('keydown', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = $(`#bkList button[data-i="${+b.dataset.i + (e.key === 'ArrowDown' ? 1 : -1)}"]`);
      if (next) next.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goSnap();
    }
  });
  $('#bkGo').addEventListener('click', goSnap);
  document.addEventListener('pointerdown', e => {
    if (!$('#bkPop').hidden && !e.target.closest('#bkPop, #bkBtn')) showBackup(false);
  });

  // one readable file: the manual backup, and the way to another browser
  $('#bkExport').addEventListener('click', () => {
    flush();
    const data = {app: 'qubernetic-start', version: 1, saved: new Date(nowMs()).toISOString(), state: captureState()};
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    a.download = 'qubernetic-start.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('exportálva: qubernetic-start.json');
  });
  /** The state in an exported file, or the reason it cannot be read. */
  function readBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return {error: 'A fájl nem olvasható JSON-ként. Olyan fájlt válassz, amelyet az Export készített.'};
    }
    if (!data || data.app !== 'qubernetic-start') return {error: 'Ez nem H-Board mentés: hiányzik belőle az "app": "qubernetic-start" mező.'};
    const st = data.state;
    if (!st || !Array.isArray(st.groups)) return {error: 'A mentésből hiányzik a csoportok listája (state.groups).'};
    for (const g of st.groups) {
      if (!g || typeof g.name !== 'string' || !Array.isArray(g.sites)) return {error: 'Hibás csoport a mentésben: a névnek (name) és az oldalak listájának (sites) meg kell lennie.'};
      for (const x of g.sites) {
        if (!x || typeof x.name !== 'string' || typeof x.url !== 'string' || !hostOf(x.url)) {
          return {error: `Hibás oldal a(z) ${g.name} csoportban: a név (name) és egy érvényes cím (url) kötelező.`};
        }
        if (typeof x.host !== 'string') x.host = hostOf(x.url).host;
        if (typeof x.desc !== 'string') x.desc = '';
        if (!x.icon || typeof x.icon.type !== 'string') x.icon = {type: 'ph', name: 'globe'};
      }
    }
    if (st.todos != null && !Array.isArray(st.todos)) return {error: 'Hibás teendőlista a mentésben (state.todos).'};
    const known = st.groups.filter(g => GROUPS.some(x => x.name === g.name)).length;
    if (!known) return {error: 'A mentés egyik csoportja sem egyezik az itteniekkel. A mockban a csoportok neve rögzített.'};
    return {state: st, skipped: st.groups.length - known};
  }
  $('#bkImport').addEventListener('click', () => $('#bkFile').click());
  $('#bkFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = readBackup(String(reader.result));
      const err = $('#bkErr');
      err.hidden = !res.error;
      err.textContent = res.error || '';
      if (res.error) return;
      flush();
      const what = sumOf(diffState(captureState(), {...captureState(), ...res.state}));
      applyState(res.state);
      pushSnap(`import: ${file.name}`);
      showBackup(false);
      toast(`importálva: ${what}${res.skipped ? ` · ${res.skipped} ismeretlen csoport kimaradt` : ''}`, undoAct());
    };
    reader.readAsText(file);
  });

  // The demo: the groups and the todos empty out, the way a wiped browser store would leave them.
  function simulateLoss() {
    flush();
    bk.applying = true;
    if (state.editing) setEditing(false);
    GROUPS.forEach(g => {
      g.sites = [];
    });
    state.todos = [];
    drawTodos();
    renderSection(false);
    bk.applying = false;
    showPop(false);
    toast('szimulált adatvesztés: a csoportok és a teendők üresek', {label: 'visszaállítás · z', run: undoLast});
  }
  // an empty page with full snapshots behind it: say so where the eye already is, once, without a dialog
  function drawLoss() {
    const full = exp.backup && countIn(captureState()) === 0 ? bk.snaps.find(x => x.n > 0) : null;
    $('#emptyTip').innerHTML = full
      ? `Minden csoport üres, de a ${esc(whenOf(full.t))} pillanatképben ${full.n} oldal van. <button type="button" class="lnk" id="lossGo">Visszaállítás</button>`
      : 'vagy húzz ide egy linket a címsorból';
    bk.loss = full || null;
  }
  $('#emptyTip').addEventListener('click', e => {
    if (e.target.closest('#lossGo') && bk.loss) restoreSnap(bk.loss, 'visszaállítva');
  });
  $('#xRestore').addEventListener('click', () => showBackup(true));
  $('#xLoss').addEventListener('click', simulateLoss);

  // ------------------------------------------------------------------ experiments: the switches

  $('#xList').innerHTML = EXPERIMENTS.map(x =>
    `<label><input type="checkbox" data-x="${x.id}"${exp[x.id] ? ' checked' : ''}><span>${esc(x.label)}</span><kbd>${esc(x.keys)}</kbd></label>`).join('');
  function drawExperiments() {
    EXPERIMENTS.forEach(x => document.body.classList.toggle('x-' + x.id, exp[x.id]));
    drawBackup();
  }
  $('#xList').addEventListener('change', e => {
    const id = e.target.dataset.x;
    if (!id) return;
    exp[id] = e.target.checked;
    store.set('x.' + id, exp[id]);
    if (id === 'hints') setHints(false);
    if (id === 'scope' && srch.scope) setScope(null);
    if (id === 'backup') {
      showBackup(false);
      clearTimeout(bk.timer);
      bk.timer = 0;
      if (exp.backup) pushSnap();
      if (!GROUPS[state.active].sites.length) drawLoss();
    }
    drawExperiments();
    const x = EXPERIMENTS.find(v => v.id === id);
    toast(`${x.label}: ${exp[id] ? 'be' : 'ki'}`);
  });

  // ------------------------------------------------------------------ keys

  document.addEventListener('keydown', e => {
    if (state.standby) {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) || e.repeat) return;
      e.preventDefault();
      wake();
      return;
    }
    lastInput = Date.now();
    if (el.dlg.open) return;
    if (hint.on && hintKey(e)) return;
    // [ and ] change the card density (AltGr on some layouts, so before the modifier check)
    if ((e.key === '[' || e.key === ']') && !e.metaKey && !e.target.closest('input, textarea, select')) {
      e.preventDefault();
      setDensity(DENSITIES[mod(DENSITIES.indexOf(state.density) + (e.key === ']' ? 1 : -1), 3)], true);
      return;
    }
    if (e.key === 'Escape') {
      if (!$('#bkPop').hidden) showBackup(false);
      else if (!el.pop.hidden) showPop(false);
      else if (state.editing && !e.target.closest('input, textarea')) setEditing(false);
      return;
    }
    if (e.target.closest('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && exp.backup) {
      e.preventDefault();
      undoLast();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      el.q.focus();
    } else if (/^[1-9]$/.test(e.key) && +e.key <= NG) {
      jumpTo(+e.key - 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepGroup(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'e' || e.key === 'E') {
      if (GROUPS[state.active].sites.length) setEditing(!state.editing);
    } else if ((e.key === 's' || e.key === 'S') && !e.repeat) {
      enterStandby();
    } else if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
      setHints(true);
    } else if ((e.key === 'z' || e.key === 'Z') && !e.repeat) {
      undoLast();
    } else if ((e.key === 'v' || e.key === 'V') && !e.repeat) {
      showBackup($('#bkPop').hidden);
    }
  });

  // ------------------------------------------------------------------ putting the page together

  function applyLayout() {
    const w = Math.max(root.clientWidth, 960), h = Math.max(window.innerHeight, 640);
    const nSites = GROUPS[state.active].sites.length;
    L = computeLayout(w, h, state.density, state.cols, nSites + 1);
    if (!nSites) {
      // empty group: reserve rows for the empty-state block (heading, text, buttons, tip ≈ 300 px)
      // so the todo / weather strip lands below it instead of on top of it
      const rows = Math.ceil((EMPTY_H + L.gap) / L.pitch);
      L = computeLayout(w, h, state.density, state.cols, rows * L.n);
    }
    [el.start, el.standby].forEach(n => {
      n.style.width = px(w);
      n.style.height = px(h);
    });
    root.style.setProperty('--rail', px(L.rail));
    layoutWheel(L.rail, h - 117);

    const cs = L.clock, f = cs / 88, ss = Math.round(cs / 4);
    place($('#heroLabel'), L.x0, L.top);
    const clock = $('#clock');
    place(clock, L.x0 - Math.round(4 * f), L.clockY);
    clock.style.fontSize = px(cs);
    clock.style.letterSpacing = px(-2 * f);
    const sec = $('#clockS');
    place(sec, L.x0 + Math.round(3 * cs), Math.round(L.clockY + 1.03 * (cs - ss)));
    sec.style.fontSize = px(ss);

    const [sx, sy, sw, sh] = L.search;
    place(el.search, sx, sy, sw, sh);
    el.search.style.setProperty('--e', px(sh - 16));
    el.search.style.setProperty('--fs', px(fsOf()));
    place(el.sugg, sx, sy + sh + 6, sw);
    drawCaret();

    place(el.todo, L.todo[0], L.todo[1], Math.min(L.todo[2], 340));
    $('#todoList').style.maxHeight = px(L.todoH);
    el.weather.hidden = !L.weather;
    if (L.weather) place(el.weather, L.weather[0], L.weather[1], L.weather[2]);

    place(el.secrow, L.x0, L.secY, L.mainW);
    place(el.gridwrap, L.x0, L.gridY, L.mainW + 8);
    place(el.empty, L.x0, L.secY + 40);
    sizeGrid();
    sizeBox(); // more tiles than rows in view: the grid scrolls inside its own box

    // Home · standby: the 1440 × 900 drawing, scaled as one piece and centred
    const sf = Math.max(0.75, Math.min(w / 1440, h / 900));
    const ox = (w - 1440 * sf) / 2, oy = (h - 900 * sf) / 2;
    const at = (id, x, y, size) => {
      const n = $(id);
      place(n, ox + x * sf, oy + y * sf);
      if (size) n.style.fontSize = px(size * sf);
      return n;
    };
    SB = {left: Math.round(ox + 110 * sf), top: Math.round(oy + 90 * sf), cw: 9 * sf, ch: 18 * sf};
    place(el.markStage, SB.left, SB.top, COLS * SB.cw, ROWS * SB.ch);
    root.style.setProperty('--sb-line', px(Math.round(ox + 880 * sf)));
    at('#sbLabel', 940, 250);
    at('#sbClock', 930, 280, 150).style.letterSpacing = px(-4 * sf);
    at('#sbDate', 940, 470, 22);
    at('#sbRule', 940, 530).style.width = px(420 * sf);
    at('#sbWeather', 940, 556, 18);
    at('#sbNext', 940, 610, 15);
    at('#sbHint', 940, 820);

    refreshField();
  }

  const stage = () => fieldMark
    ? {left: SB.left, top: SB.top, cw: SB.cw, ch: SB.ch, mark: true, skip: '#start'} // the only page with the ASCII mark
    : {left: 0, top: 0, cw: L.w < 2200 ? 7 : 8, ch: L.w < 2200 ? 14 : 16, mark: false, skip: '#standby'};

  setEngine(state.engine);
  drawExperiments();
  drawMode();
  drawStandbyLabel();
  tick();
  setInterval(tick, 200);
  applyLayout();
  drawDensity();
  setMode(state.mode);
  renderSection(false);
  drawTodos();
  field = startField($('#field'), stage);
  ready = true;
  if (exp.backup) pushSnap();
  drawBackup();
  window.addEventListener('resize', applyLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshField);
  if (new URLSearchParams(location.search).has('standby')) enterStandby();
  if (demo) setTimeout(demoStep, 1200);
})();
