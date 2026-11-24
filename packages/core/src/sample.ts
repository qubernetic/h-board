import { DEFAULT_SETTINGS } from './model';
import type { Group, Library, Site } from './model';

/** A site as the drawing writes it: name, Phosphor glyph, description, address without the scheme. */
type SampleSite = readonly [name: string, glyph: string, description: string, host: string];

/**
 * The sample library is the data of the English drawing, `docs/design/gen/build.py`: its `GROUPS`,
 * the `SITES` of its active group as they are, and as many sites in the other groups as its `COUNTS`
 * says. The drawing only counts those, so their sites are made up, on example.com addresses.
 */
const SAMPLE: readonly (readonly [group: string, sites: readonly SampleSite[]])[] = [
  [
    'Start',
    [
      ['mail', 'envelope-simple', 'Mail, labels and the first round of the day.', 'mail.example.com'],
      ['calendar', 'calendar-blank', 'Meetings and deadlines of the week.', 'calendar.example.com'],
      ['maps', 'map-trifold', 'Routes and traffic before you leave.', 'maps.example.com'],
      ['weather', 'cloud-sun', 'Radar and the forecast for the area.', 'weather.example.com'],
      ['news', 'newspaper', 'The news, short and long.', 'news.example.com'],
      ['videos', 'play-circle', 'Subscriptions and videos saved for later.', 'videos.example.com'],
      ['encyclopedia', 'book-bookmark', 'A quick look into anything.', 'wiki.example.com'],
      ['translate', 'translate', 'Translation when it has to be exact.', 'translate.example.com'],
      ['timetable', 'train', 'Trains, changes and tickets.', 'trains.example.com'],
    ],
  ],
  [
    'Development',
    [
      ['github', 'github-logo', 'Repos, pull requests and CI runs in one place.', 'github.com'],
      ['claude', 'sparkle', 'Conversations, projects and artifacts.', 'claude.ai'],
      ['copia', 'git-branch', 'Version control for PLC projects, diffs, review.', 'copia.io'],
      ['beckhoff infosys', 'book-open', 'TwinCAT 3 documentation and library reference.', 'infosys.beckhoff.com'],
      ['docs.rs', 'code', 'The documentation of every Rust crate, by version.', 'docs.rs'],
      ['crates.io', 'cube', 'The Rust package registry: versions, downloads.', 'crates.io'],
      ['mdn', 'globe', 'Web reference: HTML, CSS, JavaScript.', 'developer.mozilla.org'],
      ['flathub', 'package', 'Linux applications, as Flatpaks.', 'flathub.org'],
      ['nextcloud', 'cloud', 'Your own cloud: files, calendar, contacts.', 'cloud.example.com'],
      ['hetzner', 'hard-drives', 'Servers, firewall, console and invoices.', 'console.hetzner.cloud'],
      ['qubernetic.com', 'browser', 'The company website, live.', 'qubernetic.com'],
      ['gitlab', 'gitlab-logo', 'Own runners, pipelines and registry.', 'gitlab.com'],
      ['codeberg', 'tree-structure', 'Open source repos, built on Forgejo.', 'codeberg.org'],
      ['rust-lang', 'gear', 'The Rust book, the reference and the blog.', 'rust-lang.org'],
      ['tauri', 'app-window', 'Desktop apps with a web front end, in Rust.', 'tauri.app'],
      ['egui', 'paint-brush-broad', 'Immediate mode GUI for Rust: examples, demo.', 'egui.rs'],
      ['playwright', 'test-tube', 'Browser tests and automation.', 'playwright.dev'],
      ['npm', 'package', 'JavaScript packages and their versions.', 'npmjs.com'],
      ['pypi', 'stack', 'Python packages, releases, downloads.', 'pypi.org'],
      ['ghcr', 'cube-transparent', 'Container images in the GitHub registry.', 'ghcr.io'],
      ['docker hub', 'anchor', 'Official and community container images.', 'hub.docker.com'],
      ['grafana', 'chart-line-up', 'Metrics, dashboards and alerts.', 'grafana.example.local'],
      ['home assistant', 'house-line', 'Home automation and sensors.', 'ha.example.com'],
      ['te1000 docs', 'books', 'TwinCAT 3 XAE: engineering manuals.', 'infosys.beckhoff.com/te1000'],
      ['stack overflow', 'stack-overflow-logo', 'Questions and answers for debugging.', 'stackoverflow.com'],
      ['lib.rs', 'file-rs', 'Rust crates by category.', 'lib.rs'],
      ['ads docs', 'plugs-connected', 'The ADS protocol and its error codes.', 'infosys.beckhoff.com/ads'],
      ['regex101', 'brackets-curly', 'Try out regular expressions.', 'regex101.com'],
      [
        'devdocs',
        'terminal-window',
        'The documentation of many languages and libraries in one place.',
        'devdocs.io',
      ],
    ],
  ],
  [
    'Qubernetic',
    [
      ['brand', 'palette', 'Colours, fonts and marks from one source.', 'brand.example.com'],
      ['docs', 'book-open', 'Product documentation, as published.', 'docs.example.com'],
      ['status', 'pulse', 'Uptime and incidents of the services.', 'status.example.com'],
      ['board', 'kanban', 'The work in progress, by column.', 'board.example.com'],
      ['wiki', 'notebook', 'How things are done here.', 'wiki.example.com'],
      ['releases', 'tag', 'What shipped, and when.', 'releases.example.com'],
      ['chat', 'chats-circle', 'Channels and threads of the team.', 'chat.example.com'],
    ],
  ],
  [
    'Automation',
    [
      ['plc projects', 'cpu', 'The PLC projects and their versions.', 'plc.example.com'],
      ['hmi', 'monitor', 'The operator screens, live.', 'hmi.example.com'],
      ['scada', 'gauge', 'Plant overview and trends.', 'scada.example.com'],
      ['alarms', 'bell-ringing', 'Active alarms and their history.', 'alarms.example.com'],
      ['recipes', 'list-checks', 'Machine recipes and their parameters.', 'recipes.example.com'],
      ['io map', 'plugs', 'Inputs, outputs and their addresses.', 'io.example.com'],
      ['fieldbus', 'network', 'EtherCAT topology and diagnostics.', 'fieldbus.example.com'],
      ['historian', 'database', 'Process data over time.', 'historian.example.com'],
      ['change log', 'clock-counter-clockwise', 'Who changed what on the line.', 'changes.example.com'],
      ['drives', 'engine', 'Servo drives and their settings.', 'drives.example.com'],
      ['safety', 'shield-check', 'Safety functions and their checks.', 'safety.example.com'],
      ['energy', 'lightning', 'Power use per machine and shift.', 'energy.example.com'],
    ],
  ],
  ['Media', []],
  [
    'Finance',
    [
      ['bank', 'bank', 'Accounts, cards and transfers.', 'bank.example.com'],
      ['invoices', 'receipt', 'Sent and received invoices.', 'invoices.example.com'],
      ['budget', 'chart-pie-slice', 'Where the money goes, by month.', 'budget.example.com'],
      ['taxes', 'calculator', 'Returns, deadlines and receipts.', 'tax.example.com'],
      ['shares', 'trend-up', 'Portfolio and prices.', 'shares.example.com'],
    ],
  ],
  [
    'Reading',
    [
      ['articles', 'article', 'Long reads saved from the week.', 'articles.example.com'],
      ['papers', 'file-text', 'Research papers to get through.', 'papers.example.com'],
      ['books', 'books', 'The shelf, read and unread.', 'books.example.com'],
      ['magazine', 'newspaper-clipping', 'The monthly issue and its archive.', 'magazine.example.com'],
      ['feeds', 'rss', 'Blogs and sites, by feed.', 'feeds.example.com'],
      ['read later', 'bookmark-simple', 'What was saved for a quiet hour.', 'later.example.com'],
      ['notes', 'note-pencil', 'Highlights and notes on what was read.', 'notes.example.com'],
      ['library', 'book-open-text', 'Loans, holds and the catalogue.', 'library.example.com'],
      ['podcasts', 'microphone', 'Episodes to listen to.', 'podcasts.example.com'],
      ['comics', 'smiley', 'The daily strips.', 'comics.example.com'],
      ['cooking', 'cooking-pot', 'Recipes worth keeping.', 'cooking.example.com'],
      ['poetry', 'feather', 'A poem a day.', 'poetry.example.com'],
      ['dictionary', 'book-bookmark', 'Words, their meaning and their use.', 'dictionary.example.com'],
      ['archive', 'archive', 'Old issues and finished books.', 'archive.example.com'],
    ],
  ],
  [
    'Tools',
    [
      ['passwords', 'password', 'The password manager, in the browser.', 'vault.example.com'],
      ['converter', 'arrows-left-right', 'Units, currencies and time zones.', 'convert.example.com'],
      ['calculator', 'calculator', 'Sums, quickly.', 'calc.example.com'],
      ['timer', 'timer', 'Countdowns and a stopwatch.', 'timer.example.com'],
      ['colour picker', 'eyedropper', 'Colours and their codes.', 'colours.example.com'],
      ['qr codes', 'qr-code', 'Make and read QR codes.', 'qr.example.com'],
      ['diff', 'git-diff', 'Compare two texts.', 'diff.example.com'],
      ['json viewer', 'brackets-curly', 'Read and format JSON.', 'json.example.com'],
    ],
  ],
];

/**
 * The Simple Icons slug of the sites whose mark the page bundles, by address, as `mock/app.js` gives them. The
 * drawing draws every site with its Phosphor glyph; on the board the group starts on brand marks, as in the mock.
 */
const SAMPLE_BRANDS: Readonly<Record<string, string>> = {
  'github.com': 'github',
  'claude.ai': 'claude',
  'docs.rs': 'docsdotrs',
  'developer.mozilla.org': 'mdnwebdocs',
  'flathub.org': 'flathub',
  'cloud.example.com': 'nextcloud',
  'console.hetzner.cloud': 'hetzner',
  'gitlab.com': 'gitlab',
  'codeberg.org': 'codeberg',
  'grafana.example.local': 'grafana',
  'ha.example.com': 'homeassistant',
  'stackoverflow.com': 'stackoverflow',
};

/** The group the drawing shows: Development. */
const SAMPLE_ACTIVE = 1;

const SAMPLE_TODOS: readonly (readonly [text: string, done: boolean])[] = [
  ['Client: review the quote', false],
  ['Code review: PR #41', false],
  ['Brand repo v2.3 tag', true],
];

/** The library a new board starts with: the data of the drawing, so the page and the frames agree. */
export function sampleLibrary(): Library {
  let siteNumber = 0;
  const groups = SAMPLE.map(([name, sites], g): Group => ({
    id: `g${g + 1}`,
    name,
    iconMode: 'brand',
    sites: sites.map(
      ([siteName, glyph, description, host]): Site => ({
        id: `s${++siteNumber}`,
        name: siteName,
        url: `https://${host}`,
        description,
        glyph,
        brand: SAMPLE_BRANDS[host] ?? null,
        icon: null,
      }),
    ),
  }));
  return {
    schema: 1,
    groups,
    todos: SAMPLE_TODOS.map(([text, done], t) => ({ id: `t${t + 1}`, text, done })),
    settings: { ...DEFAULT_SETTINGS, activeGroup: groups[SAMPLE_ACTIVE]?.id ?? null },
  };
}
