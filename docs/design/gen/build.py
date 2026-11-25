"""Qubernetic Start: a FigCraft concept for a new-tab page (groups of sites, category wheel, search, clock).

Run: python3 docs/design/gen/build.py   ->  docs/design/h-board.figcraft and docs/design/png/*.png
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # docs/design
sys.path.insert(0, HERE)
from fc import FC  # noqa: E402

PH = json.load(open(os.path.join(HERE, "phosphor-map.json")))["regular"]
MARK = json.load(open(os.path.join(HERE, "mark.json")))

THEMES = {
    "dark": dict(bg="#0E0F10", surface="#151617", line="#2A2D2F", ink="#D4D4D4", muted="#8B9196", cyan="#22A8E0",
                 cyan_text="#22A8E0", on_cyan="#0E0F10", grid="#17191A", dot="#2B2E30", glyph="#4A4F53",
                 scrim="#0E0F10", logo="lockup-horizontal-dark.svg", mark="mark-dark.svg"),
    "light": dict(bg="#F5F5F2", surface="#FFFFFF", line="#D6D7D3", ink="#191919", muted="#5A6065", cyan="#22A8E0",
                  cyan_text="#00749F", on_cyan="#0E0F10", grid="#ECECE8", dot="#CFD1CD", glyph="#9EA3A6",
                  scrim="#F5F5F2", logo="lockup-horizontal-light.svg", mark="mark-light.svg"),
}
MONO = "IBM Plex Mono"
SANS = "IBM Plex Sans"
W, H = 1440, 900

GROUPS = ["Start", "Development", "Qubernetic", "Automation", "Media", "Finance", "Reading", "Tools"]
COUNTS = [9, 11, 7, 12, 0, 5, 14, 8]
ACTIVE = 1
SITES = [
    ("github", "github-logo", "Repos, pull requests and CI runs in one place.", "github.com"),
    ("claude", "sparkle", "Conversations, projects and artifacts.", "claude.ai"),
    ("copia", "git-branch", "Version control for PLC projects, diffs, review.", "copia.io"),
    ("beckhoff infosys", "book-open", "TwinCAT 3 documentation and library reference.", "infosys.beckhoff.com"),
    ("docs.rs", "code", "The documentation of every Rust crate, by version.", "docs.rs"),
    ("crates.io", "cube", "The Rust package registry: versions, downloads.", "crates.io"),
    ("mdn", "globe", "Web reference: HTML, CSS, JavaScript.", "developer.mozilla.org"),
    ("flathub", "package", "Linux applications, as Flatpaks.", "flathub.org"),
    ("nextcloud", "cloud", "Your own cloud: files, calendar, contacts.", "cloud.example.com"),
    ("hetzner", "hard-drives", "Servers, firewall, console and invoices.", "console.hetzner.cloud"),
    ("qubernetic.com", "browser", "The company website, live.", "qubernetic.com"),
    ("gitlab", "gitlab-logo", "Own runners, pipelines and registry.", "gitlab.com"),
    ("codeberg", "tree-structure", "Open source repos, built on Forgejo.", "codeberg.org"),
    ("rust-lang", "gear", "The Rust book, the reference and the blog.", "rust-lang.org"),
    ("tauri", "app-window", "Desktop apps with a web front end, in Rust.", "tauri.app"),
    ("egui", "paint-brush-broad", "Immediate mode GUI for Rust: examples, demo.", "egui.rs"),
    ("playwright", "test-tube", "Browser tests and automation.", "playwright.dev"),
    ("npm", "package", "JavaScript packages and their versions.", "npmjs.com"),
    ("pypi", "stack", "Python packages, releases, downloads.", "pypi.org"),
    ("ghcr", "cube-transparent", "Container images in the GitHub registry.", "ghcr.io"),
    ("docker hub", "anchor", "Official and community container images.", "hub.docker.com"),
    ("grafana", "chart-line-up", "Metrics, dashboards and alerts.", "grafana.example.local"),
    ("home assistant", "house-line", "Home automation and sensors.", "ha.example.com"),
    ("te1000 docs", "books", "TwinCAT 3 XAE: engineering manuals.", "infosys.beckhoff.com/te1000"),
    ("stack overflow", "stack-overflow-logo", "Questions and answers for debugging.", "stackoverflow.com"),
    ("lib.rs", "file-rs", "Rust crates by category.", "lib.rs"),
    ("ads docs", "plugs-connected", "The ADS protocol and its error codes.", "infosys.beckhoff.com/ads"),
    ("regex101", "brackets-curly", "Try out regular expressions.", "regex101.com"),
    ("devdocs", "terminal-window", "The documentation of many languages and libraries in one place.", "devdocs.io"),
]
COUNTS[ACTIVE] = len(SITES)  # the wheel, the label row and the status bar all read the same numbers


def g(name):
    return chr(int(PH[name], 16))


class K:
    """Thin drawing kit over the FigCraft MCP client."""

    def __init__(self, f):
        self.f = f

    def frame(self, parent, name, x, y, w, h, fill=None, stroke=None, radius=0, clip=False, opacity=None, **kw):
        p = {"name": name, "fill": fill or "none", "clip": clip, "cornerRadius": radius}
        if stroke:
            p.update(stroke=stroke, strokeWeight=kw.pop("sw", 1), strokeAlign="inside")
        if opacity is not None:
            p["opacity"] = opacity
        p.update(kw)
        a = {"type": "frame", "x": x, "y": y, "width": w, "height": h, "props": p, "select": False}
        if parent is not None:
            a["parent"] = parent
        return self.f.tool("create_node", a)["id"]

    def rect(self, parent, x, y, w, h, fill, name="rect", **kw):
        p = {"name": name, "fill": fill}
        p.update(kw)
        return self.f.tool("create_node", {"type": "rectangle", "parent": parent, "x": x, "y": y, "width": w,
                                           "height": h, "props": p, "select": False})["id"]

    def line(self, parent, x, y, w, h, colour, name="line"):
        return self.rect(parent, x, y, w, h, colour, name=name)

    def text(self, parent, s, x, y, size=14, colour="#000", family=SANS, style="Regular", w=None, name=None, **kw):
        props = {"fontFamily": family, "fontStyle": style, "fontSize": size, "fill": colour}
        props.update(kw)
        a = {"text": s, "x": x, "y": y, "parent": parent, "props": props, "select": False}
        if w is not None:
            a["width"] = w
        if name:
            a["name"] = name
        return self.f.cmd("text.create", **a)["id"]

    def icon(self, parent, name, x, y, size, colour):
        return self.text(parent, g(name), x, y, size=size, colour=colour, family="Phosphor", name=f"icon/{name}",
                         lineHeight=size, textAlign="center", textAutoResize="none", width=size, height=size)

    def svg(self, parent, file, x, y, w=None, h=None):
        r = self.f.cmd("file.import", path=os.path.join(HERE, file), x=0, y=0)
        nid = r["id"] if isinstance(r, dict) and "id" in r else r["ids"][0]
        self.f.cmd("node.reparent", ids=[nid], parent=parent)
        node = self.f.tool("get_node", {"id": nid, "depth": 0})
        ow, oh = node["width"], node["height"]
        factor = (w / ow) if w else (h / oh)
        self.f.cmd("transform.scale", ids=[nid], factor=factor)
        self.f.tool("set_properties", {"ids": [nid], "props": {"x": x, "y": y, "name": "logo"}})
        return nid

    def set(self, ids, **p):
        self.f.tool("set_properties", {"ids": ids if isinstance(ids, list) else [ids], "props": p})

    def shadow(self, nid, colour="#00000066", y=24, r=48):
        self.f.cmd("effect.add", ids=[nid], effect={"type": "dropShadow", "color": colour, "offset": [0, y],
                                                    "radius": r, "spread": 0})


# ---------------------------------------------------------------- character field

RAMP = " .:-=+*#%@"
SET = "01<>/\\[]{}()#$%&*+=-_:;!?|~^"
# the numbers of qubernetic-web's src/components/field/field.ts
REACH = 60      # px around the pointer
TINT = 0.25     # chance that a flipped cell swaps ink and cyan (a field cell: turns cyan)
TRAIL = 200     # ms a cell stays hot after the pointer has left
QUIET_IN = 0.2  # share of the effect that survives right behind a text block
FADE = 80       # px over which it returns to full strength
BUCKETS = 5     # FigCraft has no per-glyph opacity: hot cells go into layers of 0.2 … 1.0


def quiet_map(cols, rows, cw, ch, blocks):
    """field.ts layout(): q = QUIET_IN + (1 - QUIET_IN)·k², k = min(1, distance to the block / FADE); the
    minimum over all blocks, 1 where no block is near."""
    q = [[1.0] * cols for _ in range(rows)]
    for (bx, by, bw, bh) in blocks:
        left, rgt, tp, bt = bx, bx + bw, by, by + bh
        c0, c1 = max(0, int((left - FADE) // cw)), min(cols - 1, int(-(-(rgt + FADE) // cw)))
        r0, r1 = max(0, int((tp - FADE) // ch)), min(rows - 1, int(-(-(bt + FADE) // ch)))
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                x, y = (c + 0.5) * cw, (r + 0.5) * ch
                dx, dy = max(left - x, 0, x - rgt), max(tp - y, 0, y - bt)
                kk = min(1, (dx * dx + dy * dy) ** 0.5 / FADE)
                v = QUIET_IN + (1 - QUIET_IN) * kk * kk
                if v < q[r][c]:
                    q[r][c] = v
    return q


def bezier(p0, p1, p2, n=120):
    """A quadratic curve as a polyline: the pointer's way from p0 to p2, bending towards p1."""
    out = []
    for i in range(n + 1):
        u = i / n
        out.append(((1 - u) ** 2 * p0[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0],
                    (1 - u) ** 2 * p0[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1]))
    return out


def curve(pts, n=24):
    """A smooth polyline through the points (Catmull-Rom): the pointer's way."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        for j in range(n):
            u = j / n
            out.append(tuple(0.5 * (2 * p[i][a] + (p[i + 1][a] - p[i - 1][a]) * u
                                    + (2 * p[i - 1][a] - 5 * p[i][a] + 4 * p[i + 1][a] - p[i + 2][a]) * u * u
                                    + (3 * p[i][a] - p[i - 1][a] - 3 * p[i + 1][a] + p[i + 2][a]) * u ** 3)
                             for a in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def trail(path, cw, ch, cols, rows, quiet, is_mark, rnd, speed=420, exposure=0):
    """field.ts update(), run frame by frame while the pointer travels `path` (px/s = speed).

    Returns the cells still hot when it arrives: {(r, c): (glyph, swapped)}. A cell within REACH flips with
    probability f²·0.8·q (a mark cell: 0.25 + 0.75·f), f = 1 at the pointer and 0 at the rim; it then stays hot
    for TRAIL·(0.4 … 1) ms and keeps flickering, so the older end of the path holds fewer cells.

    exposure (ms) > 0 returns instead every cell that was hot at any frame of the last `exposure` ms: a long
    exposure of the same rule, so a still image can show what the eye sees over half a second.
    """
    seg = [0.0]
    for a, b in zip(path, path[1:]):
        seg.append(seg[-1] + ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5)
    total = seg[-1]
    frames = max(1, int(total / speed * 60))
    hot_until, next_flip, glyph, swapped, seen = {}, {}, {}, {}, {}
    t_end = frames * 1000 / 60
    j = 0
    for fr in range(frames + 1):
        now = fr * 1000 / 60
        dist = total * fr / frames
        while j < len(seg) - 2 and seg[j + 1] < dist:
            j += 1
        u = (dist - seg[j]) / ((seg[j + 1] - seg[j]) or 1)
        px = path[j][0] + (path[j + 1][0] - path[j][0]) * u
        py = path[j][1] + (path[j + 1][1] - path[j][1]) * u
        c0, c1 = max(0, int((px - REACH) / cw)), min(cols - 1, int((px + REACH) / cw))
        r0, r1 = max(0, int((py - REACH) / ch)), min(rows - 1, int((py + REACH) / ch))
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                dx, dy = (c + 0.5) * cw - px, (r + 0.5) * ch - py
                d2 = dx * dx + dy * dy
                if d2 > REACH * REACH:
                    continue
                i = (r, c)
                f = 1 - d2 ** 0.5 / REACH
                if now < next_flip.get(i, 0):
                    continue
                if rnd.random() > (0.25 + f * 0.75 if is_mark(r, c) else f * f * 0.8 * quiet[r][c]):
                    next_flip[i] = now + 60
                    continue
                glyph[i] = rnd.choice(SET)
                swapped[i] = rnd.random() < TINT
                next_flip[i] = now + 50 + rnd.randrange(140)
                hot_until[i] = now + TRAIL * (0.4 + rnd.random() * 0.6)
        for i in list(hot_until):
            if now >= hot_until[i]:
                del hot_until[i]
            elif now >= next_flip[i]:
                glyph[i] = rnd.choice(SET)
                next_flip[i] = now + 70 + rnd.randrange(160)
        if exposure and now >= t_end - exposure:
            for i in hot_until:
                seen[i] = (glyph[i], swapped[i])
    if exposure:
        return seen
    return {i: (glyph[i], swapped[i]) for i in hot_until}


def field(k, parent, t, cw, ch, mark_at=None, path=None, seed=7, blocks=(), dots=True, w=W, h=H, all_hot=False,
          exposure=0):
    """The web's character field as text layers on one cw × ch grid.

    mark_at = (col, row) of the mark's top-left cell (Home · standby only); blocks = the text and card rects
    that quiet the field; path = the pointer's recent way, ending where the pointer is now;
    exposure = ms of that way to add up (0: the single frame the web would draw);
    all_hot = draw every cell hot (the fade diagram on the anatomy sheet).
    """
    rnd = random.Random(seed)
    cols, rows = int(w // cw) + 1, int(h // ch) + 1
    blank = lambda: [[" "] * cols for _ in range(rows)]  # noqa: E731
    layers = {n: blank() for n in ("dot", "ink", "cyan")}
    base = {}  # mark cells: (r, c) -> "ink" | "cyan"
    for r in range(rows):
        for c in range(cols):
            if dots and ((c * 73856093) ^ (r * 19349663)) % 100 < 5:
                layers["dot"][r][c] = "·"
    if mark_at:
        mc0, mr0 = mark_at
        for mr in range(40):
            for mc in range(76):
                d = int(MARK["dens"][mr][mc])
                r, c = mr0 + mr, mc0 + mc
                if not d or not (0 <= r < rows and 0 <= c < cols):
                    continue
                layers["dot"][r][c] = " "
                base[(r, c)] = "cyan" if MARK["cyan"][mr][mc] == "1" else "ink"
                layers[base[(r, c)]][r][c] = RAMP[d]
    quiet = quiet_map(cols, rows, cw, ch, blocks)
    hot = {}
    if all_hot:
        hot = {(r, c): (rnd.choice(SET), rnd.random() < TINT) for r in range(rows) for c in range(cols)}
    elif path:
        hot = trail(path, cw, ch, cols, rows, quiet, lambda r, c: (r, c) in base, rnd, exposure=exposure)
    hot_layers = {}
    for (r, c), (gl, sw) in hot.items():
        for n in layers:
            layers[n][r][c] = " "
        if (r, c) in base:
            tone = base[(r, c)] if not sw else ("ink" if base[(r, c)] == "cyan" else "cyan")
        else:
            tone = "cyan" if sw else "dim"
        b = max(1, min(BUCKETS, round(quiet[r][c] * BUCKETS)))  # opacity = the cell's q, in steps of 0.2
        hot_layers.setdefault((tone, b), blank())[r][c] = gl
    fs = cw / 0.6
    colours = dict(dot=t["dot"], ink=t["ink"], cyan=t["cyan"], dim=t["glyph"])
    box = k.frame(parent, "field", 0, 0, w, h, clip=True)

    def put(grid, name, colour, opacity=None):
        s = "\n".join("".join(row).rstrip() for row in grid)
        if not s.strip():
            return
        kw = {"opacity": opacity} if opacity is not None and opacity < 1 else {}
        k.text(box, s, 0, 0, size=fs, colour=colour, family=MONO, name=name, lineHeight=ch, letterSpacing=0,
               textAutoResize="widthAndHeight", features={"liga": False, "calt": False}, **kw)

    for n, grid in layers.items():
        put(grid, f"field/{n}", colours[n])
    for (tone, b), grid in sorted(hot_layers.items()):
        put(grid, f"field/hot {tone} {b / BUCKETS:.1f}", colours[tone], b / BUCKETS)
    return box


def grid_lines(k, parent, t, xs, y0=0, y1=H):
    for x in xs:
        k.line(parent, x, y0, 1, y1 - y0, t["grid"], name="grid")


# ---------------------------------------------------------------- pieces

def label(k, parent, t, x, y, idx, text, size=12):
    """[ 02 ]  DEVELOPMENT: the site's section label."""
    a = k.text(parent, f"[ {idx} ]", x, y, size=size, colour=t["cyan_text"], family=MONO, letterSpacing=1)
    k.text(parent, text.upper(), x + size * 4.6, y, size=size, colour=t["muted"], family=MONO, letterSpacing=1.8)
    return a


# ---------------------------------------------------------------- layout rules

CHROME = 80  # assumed height of Helium's tab strip + toolbar, in logical px
TILES = len(SITES) + 1  # the group's sites + the "new site" tile
INFO_H = 206  # height of the weather block, the taller of the two info blocks
MAX_BLOCK = 2600  # the content block stops growing here; beyond it the block is centred
SIDE_W, SIDE_GUTTER = 240, 24  # the side column for todo + weather, and its distance from the grid
DENSITY = {
    # card width limits, card height, gap between cards
    "dense": dict(min=150, max=190, h=64, gap=12),     # icon, name, host; the description shows on hover
    "normal": dict(min=200, max=260, h=112, gap=16),  # + one truncated line of description; the default
    "spacious": dict(min=240, max=320, h=148, gap=24),   # + two lines of description and the tile's number
}


def layout(w, h, density="normal", cols=None, tiles=TILES):
    """Every measure of the start screen, derived from the viewport (logical px). Nothing is scaled.

    rail      14.5 % of the width, 280–360 px
    margin    48 / 80 / 96 px; a content block wider than 2600 px is centred
    columns   the largest count that keeps the cards at the density's minimum width; the width is shared
              between them up to the maximum. `cols` (4–12) fixes the count instead; a card is then at least 140 px
    rows      at least three must show. On a short screen the hero gives way first: the search moves beside the
              clock, then the clock shrinks. A group with more rows than fit scrolls inside the grid's area
    clock     9.5 % of the height, 88–128 px; on tall screens 176 px, with the search on the same row
    info      todo + weather: a strip under the grid on tall screens, a side column from 1800 px width,
              otherwise the todo sits in the hero and the weather stays in the header
    """
    D = DENSITY[density]
    gap = D["gap"]
    L = dict(w=w, h=h, density=density)
    rail = min(360, max(280, round(w * 0.145 / 8) * 8))
    m = 48 if w < 2200 else 80 if w < 3000 else 96
    x0 = rail + m
    area_top, area_bottom = 65, h - 40
    area = area_bottom - area_top
    avail = w - m - x0
    if avail > MAX_BLOCK:
        x0 += (avail - MAX_BLOCK) // 2
        avail = MAX_BLOCK
    tall = h >= 1200
    place = "strip" if tall else "side" if w >= 1800 else "hero"
    grid_w = avail - (SIDE_W + SIDE_GUTTER if place == "side" else 0)
    if cols:
        n = cols
        card_w = max(140, int((grid_w - (n - 1) * gap) / n))
    else:
        n = max(1, int((grid_w + gap) // (D["min"] + gap)))
        card_w = int(min(D["max"], (grid_w - (n - 1) * gap) / n))
    main_w = n * card_w + (n - 1) * gap
    right = x0 + main_w
    rows_total = -(-tiles // n)
    card_h = 192 if density == "spacious" and tall else D["h"]
    pitch = card_h + gap
    col = lambda c: x0 + c * (card_w + gap)  # noqa: E731
    span = lambda c: c * card_w + (c - 1) * gap  # noqa: E731
    clock = 176 if tall else min(128, max(88, round(h * 0.095 / 8) * 8))
    sh = 52 if w < 1800 else 60
    inline = tall
    sec_gap = 28 if h < 950 else 40
    pad = 32
    hero_of = lambda: 20 + 1.03 * clock + (4 if inline else 26 + sh)  # noqa: E731
    if tall:
        # hero, grid and info strip share the height; what is left over becomes rhythm between them
        hero_h = hero_of()
        rows_fit = int((area - hero_h - 30 - INFO_H - 4 * 40 + gap) // pitch)
        rows_vis = min(rows_total, max(1, rows_fit))
        scroll = rows_total > rows_vis
        view_h = rows_vis * pitch - gap + (pitch // 2 if scroll else 0)
        free = area - (hero_h + 30 + view_h + INFO_H)
        sec_gap, strip_gap = round(free * 0.2), round(free * 0.22)
        top = round(area_top + free * 0.25)
    else:
        fit = lambda: int((area - hero_of() - sec_gap - 30 - 2 * pad + gap) // pitch)  # noqa: E731
        want = min(3, rows_total)
        if fit() < want:
            inline = True
        while fit() < want and clock > 64:
            clock -= 8
        hero_h = hero_of()
        rows_vis = min(rows_total, max(1, fit()))
        scroll = rows_total > rows_vis
        if scroll:
            top = area_top + pad
            view_h = area_bottom - 12 - round(top + hero_h + sec_gap + 30)  # the next row peeks in
        else:
            view_h = rows_vis * pitch - gap
            top = round(area_top + max(pad, (area - (hero_h + sec_gap + 30 + view_h)) * 0.42))
    clock_y = top + 20
    todo_x = right - 240
    if inline and any(col(c) >= x0 + 3.45 * clock + 40 for c in range(n)):
        # the search starts on the first column edge clear of the clock and its seconds
        c0 = next(c for c in range(n) if col(c) >= x0 + 3.45 * clock + 40)
        sw = span(n - c0) - (300 if place == "hero" else 0)
        search = (col(c0), round(clock_y + 1.03 * clock - sh), sw, sh)
    else:
        limit = todo_x - x0 - 60 if place == "hero" else 920
        c1 = max([c for c in range(1, n + 1) if span(c) <= limit] or [1])
        search = (x0, round(clock_y + 1.03 * clock + 26), span(c1), sh)
    sec_y = round(top + hero_h + sec_gap)
    grid_y = sec_y + 30
    rects = []
    for i in range(tiles):
        r, c = divmod(i, n)
        if r < rows_vis + (1 if scroll else 0):
            rects.append((col(c), grid_y + r * pitch, card_w, card_h))
    weather_at = None
    if place == "side":
        sx = right + SIDE_GUTTER
        todo_at = (sx, top)
        weather_at = (sx, top + 196, SIDE_W)
    elif place == "strip":
        sy = grid_y + view_h + strip_gap
        todo_at = (x0, sy)
        weather_at = (next(col(c) for c in range(n) if col(c) >= x0 + 400), sy, 340)
    else:
        todo_at = (todo_x, top)
    L.update(rail=rail, m=m, gap=gap, x0=x0, n=n, rows=rows_vis, rows_total=rows_total, scroll=scroll,
             card_w=card_w, card_h=card_h, pitch=pitch, main_w=main_w, right=right, clock=clock, clock_y=clock_y,
             top=top, search=search, sec_y=sec_y, grid_y=grid_y, view_h=view_h, grid_bottom=grid_y + view_h,
             rects=rects, tiles=tiles, place=place, todo=todo_at, weather=weather_at, inline=inline,
             bottom=area_bottom)
    return L


def header(k, parent, t, w=W, x0=328, sync=None):
    k.rect(parent, 0, 0, w, 64, t["bg"], name="header bg", opacity=0.92)
    k.line(parent, 0, 64, w, 1, t["line"], name="header rule")
    k.svg(parent, t["logo"], 32, 20, h=24)
    # sync status, on the content's left edge
    if sync:  # offline: a ring, not a dot
        k.frame(parent, "sync ring", x0, 29, 6, 6, stroke=t["muted"], radius=3)
    else:
        k.rect(parent, x0, 29, 6, 6, t["cyan"], name="sync dot", cornerRadius=3)
    k.text(parent, sync or "synced · 2 min ago", x0 + 14, 24, size=13, colour=t["muted"], family=MONO)
    # right: weather, theme toggle, settings, account; the cluster ends on the 32 px page edge
    r = w - 32
    k.icon(parent, "cloud-sun", r - 354, 22, 20, t["muted"])
    k.text(parent, "4 °C  Budapest", r - 326, 23, size=13, colour=t["muted"], family=MONO)
    b = k.frame(parent, "mode", r - 208, 14, 112, 36, stroke=t["line"])
    k.text(b, "◐  " + ("Light" if t is THEMES["dark"] else "Dark"), 16, 9, size=13, colour=t["ink"], family=MONO)
    s = k.frame(parent, "settings", r - 84, 14, 36, 36, stroke=t["line"])
    k.icon(s, "gear-six", 8, 8, 20, t["ink"])
    a = k.frame(parent, "account", r - 36, 14, 36, 36, fill=t["surface"], stroke=t["line"])
    k.text(a, "HB", 0, 9, size=13, colour=t["ink"], family=MONO, style="SemiBold", w=36, textAlign="center")


WHEEL_OFFS = [0, 64, 116, 158]
WHEEL_SIZE = [26, 17, 15, 13]
WHEEL_OP = [1, 0.72, 0.48, 0.3]
WHEEL_TICKS = [(196, 0.8), (222, 0.62), (242, 0.46), (256, 0.32), (265, 0.22), (270, 0.14)]


def wheel_scale(h):
    s = min(1.6, max(1.0, (h / 2 - 96) / 250))  # the drum grows with the rail
    fb = min(1.25, s)
    return round(h / 2), s, fb, round(42 * fb)


def wheel_blocks(x, y, w, h, active=ACTIVE):
    """The wheel's text as rects (frame coordinates): what quiets the field on the rail."""
    cy, s, fb, lh = wheel_scale(h)
    pad, n = 32, len(GROUPS)
    out = [(x + pad, y + 24, 130, 14), (x + pad, y + h - 40, 100, 16)]
    for d in range(-3, 4):
        name = GROUPS[(active + d) % n]
        a = abs(d)
        size = round(WHEEL_SIZE[a] * fb)
        if d == 0:
            out.append((x + pad, y + cy - lh + 8, len(name) * 0.6 * size, 2 * lh - 16))
            continue
        off = WHEEL_OFFS[a] * s * (1 if d > 0 else -1)
        if 56 < cy + off < h - 60:
            out.append((x + pad, y + round(cy + off - size * 0.65), 28 + len(name) * 0.6 * size, round(size * 1.4)))
    return out


def wheel(k, parent, t, x, y, w, h, active=ACTIVE, ruler=True, ghost=None, head=True):
    """The category wheel: a drum of groups, the active one in the lens at the centre.

    The drum is endless: three neighbours each way, wrapping round the list. Spacing, size and opacity fall
    off towards the limb; past the last name a column of short ticks closes up, the drum turning away.
    """
    box = k.frame(parent, "category wheel", x, y, w, h, clip=True)
    cy, s, fb, lh = wheel_scale(h)
    pad = 32
    n = len(GROUPS)
    lo, hi = (56, h - 60) if head else (8, h - 8)
    for off, op in WHEEL_TICKS:
        for sign in (-1, 1):
            yy = round(cy + sign * off * s)
            if lo + 12 < yy < hi - 12:
                k.rect(box, pad, yy, 12, 1, t["muted"], name="tick/limb", opacity=op * 0.55)
    # lens
    k.rect(box, 0, cy - lh, w, 2 * lh, t["surface"], name="lens", opacity=0.9)
    k.line(box, 0, cy - lh, w, 1, t["line"], name="lens top")
    k.line(box, 0, cy + lh, w, 1, t["line"], name="lens bottom")
    k.rect(box, 0, cy - lh, 3, 2 * lh + 1, t["cyan"], name="lens marker")
    for d in range(-3, 4):
        i = (active + d) % n
        name = GROUPS[i]
        a = abs(d)
        off = WHEEL_OFFS[a] * s * (1 if d > 0 else -1)
        size = round(WHEEL_SIZE[a] * fb)
        if d == 0:
            size = min(size, int((w - pad - 40) / (len(name) * 0.6)))
            if ghost is not None:
                k.text(box, name, pad, cy - lh + 8, size=22, colour=t["ink"], family=MONO, style="SemiBold",
                       opacity=0.55)
                continue
            k.text(box, f"[ {i + 1:02d} ]", pad, cy - lh + 8, size=11, colour=t["cyan_text"], family=MONO,
                   letterSpacing=1)
            k.text(box, name, pad, cy - round(size * 0.68), size=size, colour=t["ink"], family=MONO,
                   style="SemiBold")
            k.text(box, f"{COUNTS[i]} sites", pad, cy + lh - 24, size=11, colour=t["muted"], family=MONO)
            continue
        if not (lo < cy + off < hi):
            continue
        row = k.frame(box, f"group/{name}", pad, round(cy + off - size * 0.65), w - pad - 40, round(size * 1.4),
                      opacity=WHEEL_OP[a])
        k.text(row, f"{i + 1:02d}", 0, round(size * 0.3), size=10, colour=t["muted"], family=MONO)
        k.text(row, name, 28, 0, size=size, colour=t["ink"], family=MONO)
    if ghost is not None:
        # scrolling: the next group slides up into the lens while the current one leaves upwards
        k.text(box, GROUPS[ghost], pad, cy + 4, size=22, colour=t["ink"], family=MONO, style="SemiBold",
               opacity=0.45, name="incoming")
        k.rect(box, w - 44, cy - 30, 2, 60, t["cyan"], name="motion", opacity=0.5)
    if head:
        k.text(box, f"GROUPS · {n}", pad, 24, size=11, colour=t["muted"], family=MONO, letterSpacing=1.8)
        k.text(box, "+ new group", pad, h - 40, size=12, colour=t["muted"], family=MONO)
    if ruler:
        rx = w - 22
        cnt = int((h - 40) // 7)
        for j in range(cnt):
            yy = 20 + j * 7
            k.line(box, rx + (6 if j % 4 else 0), yy, 10 if j % 4 else 16, 1, t["line"], name="tick")
        span = (h - 40) / n
        for i in range(n):
            yy = round(20 + span * i + span / 2)
            k.line(box, rx - 4, yy, 20, 1, t["cyan"] if i == active else t["glyph"], name=f"mark/{i + 1}")
        k.rect(box, rx + 14, round(20 + span * active), 2, round(span), t["cyan"], name="position")
    return box


def card(k, parent, t, x, y, w, h, i, site, state="idle"):
    """An icon card, drawn for the density its height stands for:
    dense (up to 72 px): icon, name, host; normal (up to 120 px): + one line of description;
    spacious: + two lines and the tile's number, in three sizes (compact, roomy from 150 px tall and 260 px wide,
    large from 176 px tall, where the host moves into a footer under a rule)."""
    name, ic, desc, host = site
    hover = state == "hover"
    dense, normal = h <= 72, 72 < h <= 120
    large = h >= 176
    roomy = not large and h >= 150 and w >= 260
    pad = 12 if dense else 14 if normal else 24 if large else 22 if roomy else 18
    ts = 28 if dense else 32 if normal else 48 if large else 40
    c = k.frame(parent, f"card/{name}", x, y, w, h, fill=t["surface"], stroke=t["cyan"] if hover else t["line"],
                opacity=1)
    k.set(c, fills=[{"type": "solid", "color": t["surface"], "opacity": 0.86}])
    k.f.cmd("effect.add", ids=[c], effect={"type": "backgroundBlur", "radius": 10})
    ty = (h - ts) // 2 if dense else pad + (2 if normal else 0)
    tile = k.frame(c, "icon tile", pad, ty, ts, ts, stroke=t["cyan"] if hover else t["line"],
                   fill=t["cyan"] if hover else "none")
    isz = 16 if dense else 18 if normal else 26 if large else 22
    k.icon(tile, ic, (ts - isz) / 2, (ts - isz) / 2, isz, t["on_cyan"] if hover else t["ink"])
    if hover:
        for (cx, cy, rw, rh) in [(0, 0, 10, 2), (0, 0, 2, 10), (w - 10, h - 2, 10, 2), (w - 2, h - 10, 2, 10)]:
            k.rect(c, cx, cy, rw, rh, t["cyan"], name="corner")
    if dense or normal:
        tx = pad + ts + 10
        tw = w - tx - pad
        k.text(c, name, tx, ty - 1, size=13 if dense else 14, colour=t["ink"], family=MONO,
               style="SemiBold" if hover else "Regular", w=tw, textAutoResize="truncate", maxLines=1)
        k.text(c, host, tx, ty + (15 if dense else 18), size=11, colour=t["muted"], family=MONO, w=tw,
               textAutoResize="truncate", maxLines=1)
        if normal:
            k.text(c, desc, pad, h - pad - 24, size=12.5, colour=t["muted"], family=SANS, w=w - 2 * pad,
                   lineHeight=18, textAutoResize="truncate", maxLines=1)
        return c
    k.text(c, f"{i + 1:02d}", w - pad - 24, pad + 2, size=12, colour=t["cyan_text"] if hover else t["muted"],
           family=MONO, w=24, textAlign="right")
    tx = pad + ts + 14
    tw = w - tx - pad - 20
    ns = (18 if w >= 300 else 16) if large else 16 if roomy else 15
    k.text(c, name, tx, pad + (11 if large else 0), size=ns, colour=t["ink"], family=MONO,
           style="SemiBold" if hover else "Regular", w=tw, textAutoResize="truncate", maxLines=1)
    if large:
        k.line(c, pad, h - 46, w - 2 * pad, 1, t["line"], name="footer rule")
        k.text(c, host, pad, h - 32, size=12, colour=t["muted"], family=MONO, w=w - 2 * pad - 28,
               textAutoResize="truncate", maxLines=1)
        k.text(c, desc, pad, pad + ts + 14, size=15, colour=t["muted"], family=SANS, w=w - 2 * pad, lineHeight=24,
               maxLines=2, textAutoResize="height")
        if hover:
            k.icon(c, "arrow-up-right", w - pad - 16, h - 33, 16, t["cyan"])
    else:
        k.text(c, host, tx, pad + (24 if roomy else 22), size=12 if roomy else 11, colour=t["muted"], family=MONO,
               w=w - tx - pad, textAutoResize="truncate", maxLines=1)
        k.text(c, desc, pad, pad + (60 if roomy else 56), size=14 if roomy else 13, colour=t["muted"], family=SANS,
               w=w - 2 * pad - (20 if hover else 0), lineHeight=22 if roomy else 20, maxLines=2,
               textAutoResize="height")
        if hover:
            k.icon(c, "arrow-up-right", w - pad - 16, h - pad - 14, 16, t["cyan"])
    return c


def add_tile(k, parent, t, x, y, w, h):
    c = k.frame(parent, "card/add", x, y, w, h, stroke=t["muted"], dashes=[4, 4])
    k.set(c, fills=[{"type": "solid", "color": t["bg"], "opacity": 0.8}])
    if h <= 72:  # one line: plus and label side by side
        k.icon(c, "plus", w / 2 - 44, h / 2 - 9, 18, t["muted"])
        k.text(c, "new site", w / 2 - 18, h / 2 - 9, size=13, colour=t["muted"], family=MONO)
        return c
    k.icon(c, "plus", w / 2 - 12, h / 2 - 26, 24, t["muted"])
    k.text(c, "new site", 0, h / 2 + 6, size=13, colour=t["muted"], family=MONO, w=w, textAlign="center")
    return c


def grid(k, parent, t, L, hover_i=None):
    """The group's tiles in their own clipped area. When the group has more rows than fit, the next row peeks
    in under a fade and a thumb on the right shows how far the list goes."""
    x0, gy, vh = L["x0"], L["grid_y"], L["view_h"]
    box = k.frame(parent, "grid", x0, gy, L["main_w"], vh, clip=True)
    for i, (rx, ry, rw, rh) in enumerate(L["rects"]):
        if i < len(SITES):
            card(k, box, t, rx - x0, ry - gy, rw, rh, i, SITES[i], "hover" if i == hover_i else "idle")
        else:
            add_tile(k, box, t, rx - x0, ry - gy, rw, rh)
    if L["scroll"]:
        steps, fh = 8, min(56, L["pitch"] // 2)
        for j in range(steps):  # a stepped fade: FigCraft's gradient endpoints are not documented
            k.rect(box, 0, vh - fh + j * fh / steps, L["main_w"], fh / steps + 1, t["bg"], name="fade",
                   opacity=(j + 1) / steps * 0.94)
        track_x = L["right"] + 8
        k.rect(parent, track_x, gy, 2, vh, t["line"], name="scroll track")
        k.rect(parent, track_x, gy, 2, round(vh * min(1, vh / (L["rows_total"] * L["pitch"]))), t["muted"],
               name="scroll thumb")
        more = L["tiles"] - L["rows"] * L["n"]
        k.text(parent, f"↓ {more} more", L["right"] - 90, gy + vh - 4, size=11, colour=t["muted"], family=MONO, w=90,
               textAlign="right", name="scroll hint")
    return box


def search(k, parent, t, x, y, w, h=52, open_=False):
    s = k.frame(parent, "search", x, y, w, h, fill=t["surface"], stroke=t["cyan"] if open_ else t["line"])
    fs = 16 if h <= 52 else 18
    e = h - 16
    eng = k.frame(s, "engine", 8, 8, e, e, stroke=t["line"])
    k.text(eng, "ddg", 0, (e - 16) / 2, size=12, colour=t["muted"], family=MONO, w=e, textAlign="center")
    px = 8 + e + 14
    k.text(s, "›", px, (h - fs * 1.3) / 2 - 2, size=fs + 4, colour=t["cyan"], family=MONO)
    tx = px + 20
    ty = round((h - fs * 1.3) / 2)
    q = "twincat ads" if open_ else "search or address"
    k.text(s, q, tx, ty, size=fs, colour=t["ink"] if open_ else t["muted"], family=MONO)
    k.rect(s, round(tx + len(q) * 0.6 * fs + 3), (h - 20) / 2, 9, 20, t["cyan"], name="caret",
           opacity=1 if open_ else 0.8)
    kb = k.frame(s, "kbd", w - 52, (h - 24) / 2, 40, 24, stroke=t["line"])
    k.text(kb, "/", 0, 3, size=13, colour=t["muted"], family=MONO, w=40, textAlign="center")
    return s


def status_bar(k, parent, t, w=W, h=H, agent=None):
    k.rect(parent, 0, h - 40, w, 40, t["bg"], name="status bg", opacity=0.92)
    k.line(parent, 0, h - 40, w, 1, t["line"], name="status rule")
    k.text(parent, f"{len(GROUPS)} groups · {sum(COUNTS)} sites · 23 opens today", 32, h - 28, size=12, colour=t["muted"], family=MONO)
    if agent:  # a change that came from an agent key: the key's name, and the way back
        k.frame(parent, "agent dot", 372, h - 24, 6, 6, fill=t["cyan"], radius=3)
        k.text(parent, agent, 386, h - 28, size=12, colour=t["cyan_text"], family=MONO, name="agent change")
    hints = "↕ wheel: group   1–8: jump   /: search   e: edit   s: standby"
    k.text(parent, hints, w - 32 - 620, h - 28, size=12, colour=t["muted"], family=MONO, w=620, textAlign="right")


def todo(k, parent, t, x, y):
    label(k, parent, t, x, y, "✓", "To do · 1 / 3")
    todos = [("Client: review the quote", False), ("Code review: PR #41", False), ("Brand repo v2.3 tag", True)]
    for j, (s, done) in enumerate(todos):
        yy = y + 32 + j * 30
        bx = k.frame(parent, "check", x, yy + 2, 14, 14, stroke=t["cyan"] if done else t["muted"],
                     fill=t["cyan"] if done else "none")
        if done:
            k.icon(bx, "check", 1, 1, 12, t["on_cyan"])
        k.text(parent, s, x + 26, yy, size=14, colour=t["muted"] if done else t["ink"], family=SANS,
               textDecoration="strikethrough" if done else "none")
    k.text(parent, "+ new to-do", x + 26, y + 122, size=13, colour=t["muted"], family=MONO)


def weather(k, parent, t, x, y, w):
    """The longer weather block of the ultrawide's info column (the header keeps the one-liner)."""
    label(k, parent, t, x, y, "☼", "Weather · Budapest")
    k.icon(parent, "cloud-sun", x, y + 36, 32, t["cyan"])
    k.text(parent, "4 °C", x + 46, y + 28, size=36, colour=t["ink"], family=MONO, letterSpacing=-1)
    k.text(parent, "overcast, light rain in the afternoon", x, y + 84, size=14, colour=t["muted"], family=SANS)
    k.line(parent, x, y + 118, w, 1, t["line"])
    for j, (day, temp, what) in enumerate([("Tuesday", "6° / 1°", "rain"), ("Wednesday", "5° / 0°", "cloudy"),
                                           ("Thursday", "3° / −2°", "sleet")]):
        yy = y + 132 + j * 26
        k.text(parent, day, x, yy, size=13, colour=t["ink"], family=MONO)
        k.text(parent, temp, x + 88, yy, size=13, colour=t["ink"], family=MONO)
        k.text(parent, what, x + 110, yy, size=13, colour=t["muted"], family=MONO, w=w - 110, textAlign="right")


def hero(k, parent, t, L, with_search=True):
    x0, top, cs = L["x0"], L["top"], L["clock"]
    label(k, parent, t, x0, top, "00", "Monday · 23 November 2026 · week 48")
    f = cs / 88
    k.text(parent, "14:32", x0 - round(4 * f), L["clock_y"], size=cs, colour=t["ink"], family=MONO,
           letterSpacing=-2 * f)
    ss = round(cs / 4)
    k.text(parent, ":07", x0 + round(5 * 0.6 * cs), round(L["clock_y"] + 1.03 * (cs - ss)), size=ss,
           colour=t["muted"], family=MONO, opacity=0.7)
    if with_search:
        search(k, parent, t, *L["search"])
    todo(k, parent, t, *L["todo"])
    if L["weather"]:
        weather(k, parent, t, *L["weather"])


def section_row(k, parent, t, L, idx, text):
    """The grid's own label; on its right the density (dense / normal / spacious) and the layout switch
    (classic / simple / compact)."""
    y = L["sec_y"]
    label(k, parent, t, L["x0"], y, idx, text)
    x = L["right"]
    for j, name in enumerate(["compact", "simple", "classic"]):
        tw = len(name) * 7.2
        x -= tw
        on = j == 2
        k.text(parent, name, round(x), y, size=12, colour=t["ink"] if on else t["muted"], family=MONO)
        if on:
            k.rect(parent, round(x), y + 19, round(tw), 1, t["cyan"], name="layout active")
        x -= 20
    if L["main_w"] >= 900:
        d = f"density: {L['density']}"
        k.text(parent, d, round(x - 16 - len(d) * 7.2), y, size=12, colour=t["muted"], family=MONO)


CARD_W, CARD_H = 254, 140  # the reference card, as drawn on the anatomy sheet
GEO = {}  # frame id -> its layout, for the states drawn on top of a main screen


def quiet_blocks(L, h, empty=False):
    """Everything that quiets the field on a start screen, as the web's QUIET selector would pick it up:
    cards, search, the hero's label and clock, todo, weather, the grid's label row, the wheel's text.
    The header and the status bar are left out, as the web leaves out its nav."""
    x0, cs = L["x0"], L["clock"]
    b = [(x0, L["top"], 430, 16), (x0, L["clock_y"] + 0.27 * cs, 3.7 * cs, 0.76 * cs), L["search"],
         (L["todo"][0], L["todo"][1], 240, 140)]
    if L["weather"]:
        wx, wy, ww = L["weather"]
        b.append((wx, wy, ww, INFO_H))
    b += wheel_blocks(0, 65, L["rail"], h - 105, active=4 if empty else ACTIVE)
    if empty:
        e = L["sec_y"] + 40
        b += [(x0, e, 200, 16), (x0, e + 36, 440, 40), (x0, e + 90, 420, 46), (x0, e + 170, 440, 48),
              (x0, e + 240, 270, 16)]
    else:
        gb = L["grid_bottom"]
        b += [(x0, L["sec_y"], 290, 16), (L["right"] - 380, L["sec_y"], 380, 20)]
        b += [(rx, ry, rw, min(rh, gb - ry)) for rx, ry, rw, rh in L["rects"] if ry < gb]
    return b


EXPOSURE = 600  # ms of the pointer's way added up on the start frames


def pointer_path(L, empty=False):
    """The pointer's recent way: a curve through open field, where the cells are at full strength, then to
    the cards' edge and into a gap between them, where they fade to 0.2. The last point is the pointer."""
    if empty:
        e = L["sec_y"] + 40
        ex, ey = L["x0"] + 476, e + 196
        return curve([(ex + 520, ey + 40), (ex + 400, ey + 180), (ex + 260, ey + 110), (ex + 130, ey + 150),
                      (ex + 44, ey + 44), (ex, ey)])
    n, gap, pitch, x0 = L["n"], L["gap"], L["pitch"], L["x0"]
    col_gap = lambda c: x0 + c * (L["card_w"] + gap) - gap // 2  # noqa: E731  the gap before column c
    if L["place"] == "side":
        # the room is in the side column under the weather: down it, to the grid's edge, into a row gap
        sx = L["weather"][0]
        wb = L["weather"][1] + INFO_H
        gy = L["grid_y"] + 3 * pitch - gap // 2
        return curve([(sx + 190, wb + 320), (sx + 150, wb + 190), (sx + 90, wb + 130), (sx + 30, wb + 170),
                      (sx - 6, gy - 30), (sx - SIDE_GUTTER - 46, gy)])
    if L["place"] == "strip":
        # open field under the grid, beside the info strip; and the empty end of a last row that is not full
        c = n - 2
        full = (L["rows"] - 1) * n + c < L["tiles"]  # is there a card right of that gap in the last row?
        gb = L["grid_bottom"] if full else L["grid_bottom"] - pitch
        gx = col_gap(c)
        return curve([(gx + 400, gb + 250), (gx + 330, gb + 130), (gx + 220, gb + 190), (gx + 110, gb + 96),
                      (gx + 26, gb + 44), (gx, gb - 36)])
    # no spare field but the channel between the search and the todo: down it, to the top of the grid
    sx, sy, sw, sh = L["search"]
    cx = (sx + sw + L["todo"][0]) // 2
    c = next(c for c in range(1, n) if col_gap(c) >= cx - 40)
    return curve([(cx + 70, 76), (cx - 26, L["top"] + 50), (cx + 24, L["top"] + 120), (cx - 6, sy + sh + 4),
                  (col_gap(c) + 6, L["grid_y"] - 22), (col_gap(c), L["grid_y"] + 30)])


def main_screen(k, parent, t, name, x=0, y=0, w=W, h=H, hover=True, empty=False, density="normal", cols=None,
                sync=None, agent=None):
    L = layout(w, h, density, cols)
    f = k.frame(parent, name, x, y, w, h, fill=t["bg"], clip=True)
    GEO[f] = L
    rail, x0 = L["rail"], L["x0"]
    grid_lines(k, f, t, list(range(rail, w, 408)), y1=h)
    cw, ch = (7, 14) if w < 2200 else (8, 16)
    path = pointer_path(L, empty) if hover or empty else None
    field(k, f, t, cw, ch, path=path, blocks=quiet_blocks(L, h, empty), w=w, h=h, exposure=EXPOSURE)
    header(k, f, t, w, x0, sync)
    k.line(f, rail, 65, 1, h - 105, t["line"], name="rail rule")
    wheel(k, f, t, 0, 65, rail, h - 105, active=4 if empty else ACTIVE)
    hero(k, f, t, L)
    if empty:
        b = L["sec_y"] + 40
        label(k, f, t, x0, b, "05", "Media · 0 sites")
        k.text(f, "This group is still empty.", x0, b + 32, size=32, colour=t["ink"], family=MONO)
        k.text(f, "Add sites here one by one, or bring them over from the browser's bookmarks: "
                  "a bookmark folder becomes a group.", x0, b + 88, size=15, colour=t["muted"], family=SANS,
               w=420, lineHeight=24)
        b1 = k.frame(f, "add site", x0, b + 170, 168, 48, fill=t["cyan"])
        k.text(b1, "+ new site", 0, 14, size=14, colour=t["on_cyan"], family=MONO, w=168, textAlign="center")
        b2 = k.frame(f, "import", x0 + 180, b + 170, 260, 48, stroke=t["line"], fill=t["bg"])
        k.icon(b2, "bookmarks-simple", 18, 14, 20, t["ink"])
        k.text(b2, "Import from bookmarks", 48, 14, size=14, colour=t["ink"], family=MONO)
        k.text(f, "or drag a link here from the address bar", x0, b + 240, size=12, colour=t["muted"], family=MONO)
    else:
        section_row(k, f, t, L, f"{ACTIVE + 1:02d}", f"{GROUPS[ACTIVE]} · {COUNTS[ACTIVE]} sites")
        grid(k, f, t, L)
    if path:
        k.f.tool("create_node", {"type": "vector", "parent": f, "x": path[-1][0], "y": path[-1][1],
                                 "name": "pointer", "path": "M0 0 L0 17 L4.5 13 L7.5 20 L10 19 L7 12 L13 12 Z",
                                 "closed": True, "props": {"fill": "#FFFFFF", "stroke": "#0E0F10", "strokeWeight": 1},
                                 "select": False})
    status_bar(k, f, t, w, h, agent)
    return f


# ---------------------------------------------------------------- other frames

def note(k, parent, t, x, y, idx, title, body, w=360):
    label(k, parent, t, x, y, idx, title, size=11)
    return k.text(parent, body, x, y + 24, size=13, colour=t["muted"], family=SANS, w=w, lineHeight=20)


ANATOMY_H = 1880


def anatomy(k, parent, t, x, y):
    f = k.frame(parent, "Anatomy · wheel and cards", x, y, W, ANATOMY_H, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=ANATOMY_H)
    k.text(f, "Wheel and cards", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, "The Monknow features in the Qubernetic form: groups, icon cards with descriptions, search, clock, to-dos.",
           48, 96, size=15, colour=t["muted"], family=SANS, w=900)
    k.line(f, 0, 140, W, 1, t["line"])

    # wheel states
    label(k, f, t, 48, 168, "01", "Category wheel")
    for j, (title, kw) in enumerate([("at rest", {}), ("while scrolling", {"ghost": 2}),
                                     ("3 · Qubernetic", {"active": 2})]):
        bx = 48 + j * 300
        frame = k.frame(f, f"wheel/{title}", bx, 204, 280, 520, fill=t["bg"], stroke=t["line"])
        wheel(k, frame, t, 0, 0, 280, 520, **kw)
        k.text(f, title, bx, 736, size=12, colour=t["muted"], family=MONO)
    note(k, f, t, 960, 204, "a", "Lens",
         "The middle band is the active group: large type, number, site count. The neighbours recede round "
         "the drum: smaller and fainter.")
    note(k, f, t, 960, 330, "b", "Wheel",
         "Mouse wheel anywhere on the left rail or outside the card grid: one click = one group, with a "
         "spring settle. On a touchpad it has momentum, and the lens always settles on one group.")
    note(k, f, t, 960, 476, "c", "Scale",
         "The ruler on the right edge shows the whole list. A cyan mark shows where you are. Click a mark "
         "to jump straight there; the number keys 1–8 do the same.")
    note(k, f, t, 960, 602, "d", "On switching",
         "The new group's cards are written out of the character field: a few frames of random glyphs "
         "(scramble, as in the website's headings), then the text settles. 240 ms, none under reduced motion.")
    k.line(f, 0, 790, W, 1, t["line"])

    # card variants
    label(k, f, t, 48, 818, "02", "Icon card · layouts and states")
    s = SITES[0]
    card(k, f, t, 48, 856, CARD_W, CARD_H, 0, s)
    k.text(f, "classic · default", 48, 1006, size=12, colour=t["muted"], family=MONO)
    card(k, f, t, 318, 856, CARD_W, CARD_H, 0, s, "hover")
    k.text(f, "classic · hover", 318, 1006, size=12, colour=t["muted"], family=MONO)
    # simple
    sx = 588
    for j, st in enumerate(SITES[:3]):
        tile = k.frame(f, f"simple/{st[0]}", sx + j * 84, 856, 64, 64, fill=t["surface"], stroke=t["line"])
        k.icon(tile, st[1], 18, 18, 28, t["ink"])
        k.text(f, st[0], sx + j * 84, 928, size=11, colour=t["muted"], family=MONO, w=64, textAlign="center")
    k.text(f, "simple · icon only", sx, 1006, size=12, colour=t["muted"], family=MONO)
    # compact rows
    cx = 860
    for j, st in enumerate(SITES[:4]):
        r = k.frame(f, f"compact/{st[0]}", cx, 856 + j * 36, 300, 32, fill=t["surface"], stroke=t["line"])
        k.icon(r, st[1], 8, 6, 20, t["ink"])
        k.text(r, st[0], 38, 7, size=13, colour=t["ink"], family=MONO)
        k.text(r, st[3], 186, 8, size=11, colour=t["muted"], family=MONO, w=104, textAutoResize="truncate",
               maxLines=1)
    k.text(f, "compact · list", cx, 1006, size=12, colour=t["muted"], family=MONO)
    # editing
    ex = 1180
    e = card(k, f, t, ex, 856, 220, CARD_H, 1, SITES[1])
    k.set(e, dashes=[4, 4])
    k.icon(e, "dots-six-vertical", 196, 60, 16, t["muted"])
    bar = k.frame(f, "edit bar", ex, 1006, 220, 32, stroke=t["line"], fill=t["surface"])
    k.icon(bar, "pencil-simple", 10, 7, 18, t["ink"])
    k.text(bar, "edit", 34, 8, size=12, colour=t["ink"], family=MONO)
    k.icon(bar, "trash", 120, 7, 18, t["muted"])
    k.text(bar, "delete", 144, 8, size=12, colour=t["muted"], family=MONO)
    k.text(f, "edit mode (e) · drag to move", ex, 1048, size=12, colour=t["muted"], family=MONO)

    # search suggestions
    label(k, f, t, 48, 1110, "03", "Search · suggestions and history")
    k.text(f, "Suggestions: a choice of provider. History: the last 5 searches, on this machine only. "
              "Switch engine: Tab or the chip on the left. A match among your own sites comes first, with its group.",
           48, 1140, size=13, colour=t["muted"], family=SANS, w=520, lineHeight=20)
    sx, sy = 640, 1110
    k.line(f, 0, 1082, W, 1, t["line"])
    search(k, f, t, sx, sy, 600, open_=True)
    suggestions(k, f, t, sx, sy + 58, 600)

    # pointer trail: the web's rule in numbers, and the fade around one card
    k.line(f, 0, 1456, W, 1, t["line"])
    label(k, f, t, 48, 1484, "04", "Pointer trail · the character field round the pointer")
    rows = [
        ("reach", "60 px around the pointer. A cell flips to a random glyph with probability f² · 0.8 · q; f is 1 at "
                  "the pointer and 0 at the rim."),
        ("fade", "Behind text and cards q = 0.2, rising to 1 quadratically over 80 px. A hot glyph's opacity is "
                 "q itself."),
        ("trail", "A cell stays hot for 80–200 ms (the limit is 200 ms), flickering meanwhile, then resets."),
        ("colour", "25% of glyphs are cyan, the rest the field's faint glyph colour."),
        ("exception", "The header and the status bar do not quiet it, as the website's nav does not."),
        ("source", "qubernetic-web, src/components/field/field.ts. The trail in the frames comes from this rule, "
                   "computed frame by frame."),
        ("in the images", "The start frames show a long exposure: every hot cell of the last 600 ms at once. Live, "
                          "only 10–25 cells burn in a single frame."),
    ]
    for j, (key, val) in enumerate(rows):
        yy = 1524 + j * 46
        k.text(f, key, 48, yy, size=13, colour=t["ink"], family=MONO)
        k.text(f, val, 168, yy - 1, size=14, colour=t["muted"], family=SANS, w=460, lineHeight=20)
    dx, dy, dw, dh = 700, 1520, 692, 308
    demo = k.frame(f, "pointer trail · fade round a card", dx, dy, dw, dh, fill=t["bg"], stroke=t["line"],
                   clip=True)
    cr = ((dw - CARD_W) // 2, (dh - CARD_H) // 2, CARD_W, CARD_H)
    field(k, demo, t, 7, 14, blocks=[cr], dots=False, w=dw, h=dh, all_hot=True)
    k.frame(demo, "80 px", cr[0] - FADE, cr[1] - FADE, CARD_W + 2 * FADE, CARD_H + 2 * FADE, stroke=t["cyan"],
            dashes=[4, 4], radius=FADE)
    card(k, demo, t, *cr, 0, SITES[0])
    k.text(f, "Every cell drawn hot. Dashed line: 80 px from the card; beyond it q = 1, at the card's edge and "
              "behind it q = 0.2.", dx, dy + dh + 12, size=12, colour=t["muted"], family=MONO, w=dw,
           lineHeight=18)
    return f


def suggestions(k, parent, t, x, y, w):
    d = k.frame(parent, "suggestions", x, y, w, 204, fill=t["surface"], stroke=t["line"])
    rows = [("browser", "beckhoff infosys", f"{GROUPS[ACTIVE]} · own site", True),
            ("magnifying-glass", "twincat ads notification", "suggestion", False),
            ("magnifying-glass", "twincat ads rust crate", "suggestion", False),
            ("clock-counter-clockwise", "twincat 3.1.4026 release notes", "history", False)]
    for j, (ic, s, meta, hit) in enumerate(rows):
        yy = 8 + j * 48
        if j == 0:
            k.rect(d, 1, yy, w - 2, 44, t["bg"], name="active row")
            k.rect(d, 1, yy, 3, 44, t["cyan"], name="marker")
        k.icon(d, ic, 18, yy + 12, 20, t["cyan"] if hit else t["muted"])
        k.text(d, s, 52, yy + 6, size=14, colour=t["ink"], family=MONO)
        k.text(d, meta, 52, yy + 25, size=11, colour=t["muted"], family=MONO)
        if j == 0:
            k.text(d, "↵", w - 32, yy + 12, size=14, colour=t["muted"], family=MONO)
    return d


def standby(k, parent, t, x, y):
    """Home and standby are one page: the clock, the weather, the next todo, and the mark."""
    f = k.frame(parent, "Home · standby", x, y, W, H, fill=t["bg"], clip=True)
    cw, ch = 9, 18
    # the only page with the ASCII mark; the pointer has just crossed it
    blocks = [(940, 250, 400, 16), (940, 320, 430, 115), (940, 470, 270, 28), (940, 556, 260, 28),
              (940, 610, 280, 20), (940, 820, 330, 16)]
    field(k, f, t, cw, ch, mark_at=(int(110 / cw), int(90 / ch)), blocks=blocks,
          path=bezier((800, 240), (700, 330), (590, 440)))
    grid_lines(k, f, t, [880])
    label(k, f, t, 940, 250, "H", "Home · standby · after 5 minutes idle")
    k.text(f, "14:32", 930, 280, size=150, colour=t["ink"], family=MONO, letterSpacing=-4)
    k.text(f, "Monday, 23 November", 940, 470, size=22, colour=t["muted"], family=MONO)
    k.line(f, 940, 530, 420, 1, t["line"])
    k.icon(f, "cloud-sun", 940, 556, 28, t["cyan"])
    k.text(f, "4 °C · overcast · Budapest", 984, 558, size=18, colour=t["ink"], family=MONO)
    k.text(f, "next: Client: review the quote", 940, 610, size=15, colour=t["muted"], family=SANS)
    k.text(f, "any key or mouse movement: back", 940, 820, size=12, colour=t["muted"], family=MONO)
    return f


def add_dialog(k, parent, t, x, y):
    f = main_screen(k, parent, t, "Add site", x, y, hover=False)
    k.rect(f, 0, 0, W, H, t["scrim"], name="scrim", opacity=0.78)
    dw, dh = 600, 620
    d = k.frame(f, "dialog", (W - dw) / 2, (H - dh) / 2, dw, dh, fill=t["surface"], stroke=t["line"])
    k.shadow(d)
    k.rect(d, 0, 0, dw, 3, t["cyan"], name="top accent")
    label(k, d, t, 32, 32, "+", "New site · Development")
    k.icon(d, "x", dw - 48, 28, 20, t["muted"])

    def field_(yy, lab, val, focus=False, ph=False, hh=44):
        k.text(d, lab, 32, yy, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
        b = k.frame(d, f"field/{lab}", 32, yy + 22, dw - 64, hh, fill=t["bg"],
                    stroke=t["cyan"] if focus else t["line"])
        k.text(b, val, 14, 12, size=14, colour=t["muted"] if ph else t["ink"], family=MONO if not ph else SANS,
               w=dw - 96)
        return b

    field_(76, "ADDRESS", "https://grafana.example.local", focus=True)
    field_(156, "NAME", "grafana")
    field_(236, "DESCRIPTION", "Cameras, inference times and error rate in real time.", hh=64)
    k.text(d, "ICON", 32, 336, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    opts = [("favicon", None, False), ("chart-line-up", "Phosphor", True), ("G", "monogram", False),
            ("image", "upload", False)]
    for j, (ic, sub, sel) in enumerate(opts):
        ox = 32 + j * 104
        o = k.frame(d, f"icon option {j}", ox, 360, 88, 88, fill=t["bg"], stroke=t["cyan"] if sel else t["line"],
                    sw=2 if sel else 1)
        if ic == "favicon":
            k.rect(o, 30, 22, 28, 28, t["line"], name="favicon")
            k.text(o, "favicon", 0, 60, size=11, colour=t["muted"], family=MONO, w=88, textAlign="center")
        elif ic == "G":
            k.text(o, "g", 0, 14, size=32, colour=t["ink"], family=MONO, w=88, textAlign="center")
            k.text(o, sub, 0, 60, size=11, colour=t["muted"], family=MONO, w=88, textAlign="center")
        else:
            k.icon(o, ic, 30, 22, 28, t["cyan"] if sel else t["ink"])
            k.text(o, sub, 0, 60, size=11, colour=t["muted"], family=MONO, w=88, textAlign="center")
    k.text(d, "GROUP", 32, 472, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    grp = k.frame(d, "group select", 32, 494, 260, 44, fill=t["bg"], stroke=t["line"])
    k.text(grp, "02  Development", 14, 12, size=14, colour=t["ink"], family=MONO)
    k.icon(grp, "caret-down", 228, 12, 18, t["muted"])
    c = k.frame(d, "cancel", dw - 292, dh - 72, 120, 44, stroke=t["line"])
    k.text(c, "Cancel", 0, 12, size=14, colour=t["ink"], family=MONO, w=120, textAlign="center")
    ok = k.frame(d, "add", dw - 160, dh - 72, 128, 44, fill=t["cyan"])
    k.text(ok, "Add", 0, 12, size=14, colour=t["on_cyan"], family=MONO, w=128, textAlign="center")
    return f


TARGETS = [
    dict(file="10-start-1920x1080", title="1920×1080 @100%", who="common Full HD display", phys="1920×1080",
         scale=1.0, w=1920, h=1080,
         rule="Six columns and a side column for the to-dos and the weather. Four rows show, the fifth peeks in: "
              "the grid scrolls in its own area."),
    dict(file="11-start-2286x1349", title="eDP-1 · 3200×2000 @140%", who="laptop", phys="3200×2000",
         scale=1.4, w=2286, h=1429,
         rule="Eight columns, all four rows show. A large clock on one line with the search; below the grid, a "
              "strip with the to-dos and the weather."),
    dict(file="12-start-2560x1360", title="DP-6 · 3840×2160 @150%", who="4K monitor", phys="3840×2160",
         scale=1.5, w=2560, h=1440,
         rule="Nine columns, four rows. The same three tiers: clock and search, grid, to-dos and weather."),
    dict(file="14-start-3440x1360", title="HDMI-A-1 · 3440×1440 @100%", who="ultrawide", phys="3440×1440",
         scale=1.0, w=3440, h=1440,
         rule="Twelve columns, three rows. The block stops at 2600 px and sits in the centre, with the character "
              "field on both sides (centred or left-aligned is still an open question)."),
]


def schematic(k, parent, t, x, y, L, sc):
    """A small wireframe of one layout, drawn from the same numbers as the real frame."""
    r = lambda v: round(v * sc)  # noqa: E731
    box = k.frame(parent, f"sketch {L['w']}×{L['h']}", x, y, r(L["w"]), r(L["h"]), fill=t["bg"], stroke=t["line"],
                  clip=True)
    k.rect(box, 0, 0, r(L["rail"]), r(L["h"]), t["surface"], name="rail")
    k.line(box, 0, r(64), r(L["w"]), 1, t["line"])
    k.line(box, 0, r(L["h"] - 40), r(L["w"]), 1, t["line"])
    k.rect(box, 0, r(L["h"] / 2) - 3, r(L["rail"]), 6, t["cyan"], name="lens", opacity=0.5)
    k.rect(box, r(L["x0"]), r(L["clock_y"] + L["clock"] * 0.27), r(L["clock"] * 2.9), r(L["clock"] * 0.76),
           t["glyph"], name="clock")
    sx, sy, sw, sh = L["search"]
    k.frame(box, "search", r(sx), r(sy), r(sw), max(4, r(sh)), stroke=t["muted"])
    for (cx, cy, cw_, ch_) in L["rects"]:
        k.frame(box, "card", r(cx), r(cy), r(cw_), r(ch_), fill=t["surface"], stroke=t["line"])
    blocks = [(L["todo"][0], L["todo"][1], 240, 140)]
    if L["weather"]:
        wx, wy, ww = L["weather"]
        blocks.append((wx, wy, ww, INFO_H))
    for (bx, by, bw, bh) in blocks:
        b = k.frame(box, "info", r(bx), r(by), r(bw), r(bh), stroke=t["cyan"])
        k.set(b, fills=[{"type": "solid", "color": t["cyan"], "opacity": 0.14}])
    return box


def sizes(k, parent, t, x, y):
    """Sizes: the four target viewports, their logical size and the layout rule each one gets."""
    fh = 1440
    f = k.frame(parent, "Sizes · four displays", x, y, W, fh, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=fh)
    k.text(f, "Sizes", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, "The start page does not follow the display by scaling: every size comes from a rule. The frames are in "
              f"logical (CSS) pixels; the height loses the Helium tab strip and toolbar, which is taken as {CHROME} px "
              "(an assumption, to be measured live).",
           48, 96, size=15, colour=t["muted"], family=SANS, w=980, lineHeight=24)
    k.line(f, 0, 172, W, 1, t["line"])
    label(k, f, t, 48, 200, "01", "Rules")
    rules = [
        ("rail", "14.5% of the width, between 280 and 360 px; margin 48 / 80 / 96 px"),
        ("density", "dense 150–190 × 64 px, gap 12 · normal 200–260 × 112 px, gap 16 (default) · spacious 240–320 × 148 px, gap 24"),
        ("columns", "as many as fit at the density's smallest card width; the width is shared out up to the upper limit"),
        ("fixed", "the column count can also be set by hand (4–12); a card is then at least 140 px wide"),
        ("rows", "at least three show: when the height is short, the search moves beside the clock first, then the clock shrinks"),
        ("scrolling", "when the group does not fit, the grid scrolls in its own area; it fades at the bottom, a thumb on the right shows the position"),
        ("to-dos", "a strip under the grid on tall displays, a side column from 1800 px, otherwise beside the clock"),
        ("ASCII mark", "none on the card page; it lives only on the Home · standby page. The dotted character field stays everywhere"),
    ]
    for j, (key, val) in enumerate(rules):
        yy = 236 + j * 26
        k.text(f, key, 48, yy, size=13, colour=t["ink"], family=MONO)
        k.text(f, val, 168, yy, size=14, colour=t["muted"], family=SANS)
    k.line(f, 0, 458, W, 1, t["line"])
    label(k, f, t, 48, 484, "02", "Four targets · the 1440×900 set stays the reference")
    sc = 0.115
    yy = 526
    for j, tg in enumerate(TARGETS):
        L = layout(tg["w"], tg["h"] - CHROME)
        schematic(k, f, t, 48, yy, L, sc)
        tx = 496
        k.text(f, tg["title"], tx, yy - 2, size=20, colour=t["ink"], family=MONO)
        k.text(f, tg["who"], tx + 520, yy + 4, size=13, colour=t["muted"], family=MONO, w=376, textAlign="right")
        sc_txt = f"{tg['scale']:.1f}"
        facts = (f"physical {tg['phys']}  ·  scale {sc_txt}×  ·  logical {tg['w']}×{tg['h']}  ·  "
                 f"frame {tg['w']}×{tg['h'] - CHROME}")
        k.text(f, facts, tx, yy + 34, size=13, colour=t["cyan_text"], family=MONO)
        where = {"side": "side column", "strip": "strip under the grid", "hero": "beside the clock"}[L["place"]]
        per = []
        for d in DENSITY:
            Ld = layout(tg["w"], tg["h"] - CHROME, d)
            per.append(f"{d} {Ld['n']} × {Ld['rows']}" + (f" (/{Ld['rows_total']})" if Ld["scroll"] else ""))
        nums = (f"normal: {L['n']} columns × {L['rows']} rows, {L['card_w']}×{L['card_h']} px  ·  clock {L['clock']} px"
                f"  ·  to-dos: {where}")
        k.text(f, nums, tx, yy + 58, size=13, colour=t["muted"], family=MONO)
        k.text(f, "columns × visible rows:  " + "  ·  ".join(per), tx, yy + 80, size=13, colour=t["muted"],
               family=MONO)
        k.text(f, tg["rule"], tx, yy + 108, size=14, colour=t["ink"], family=SANS, w=820, lineHeight=22)
        yy += max(round((tg["h"] - CHROME) * sc), 156) + 52
        if j < len(TARGETS) - 1:
            k.line(f, 48, yy - 30, W - 96, 1, t["line"])
    k.text(f, "The sketches are drawn from the same numbers as the real frames: rail, grid, search; cyan: to-dos "
              "and weather.", 48, fh - 48, size=12, colour=t["muted"], family=MONO)
    return f


def density_sheet(k, parent, t, x, y):
    """Density: the same group at 1920×1000 in the three densities, grids at 1:1."""
    Ls = {d: layout(1920, 1000, d) for d in DENSITY}
    fh = 196 + sum(L["view_h"] + 122 for L in Ls.values()) + 40
    f = k.frame(parent, "Density · dense, normal, spacious", x, y, W, fh, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=fh)
    k.text(f, "Density", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, f"The same group ({len(SITES)} sites) on the 1920×1000 frame, in three densities, at actual size. "
              "The default is normal; in dense, the description shows only on hover.", 48, 96, size=15,
           colour=t["muted"], family=SANS, w=980, lineHeight=24)
    k.line(f, 0, 160, W, 1, t["line"])
    what = {"dense": "icon, name, address", "normal": "icon, name, address, one line of description",
            "spacious": "icon, name, address, two lines of description, number"}
    yy = 188
    for j, (d, L) in enumerate(Ls.items()):
        label(k, f, t, 48, yy, f"{j + 1:02d}", d)
        rows = f"{L['rows']} rows show" + (f" of {L['rows_total']}, the grid scrolls" if L["scroll"] else "")
        k.text(f, f"{L['n']} columns · {rows} · card {L['card_w']}×{L['card_h']} px · gap {L['gap']} px · "
                  f"{what[d]}", 48, yy + 26, size=13, colour=t["muted"], family=MONO)
        gy = yy + 62
        dx, dy = 48 - L["x0"], gy - L["grid_y"]
        L2 = dict(L, x0=48, grid_y=gy, right=48 + L["main_w"],
                  rects=[(rx + dx, ry + dy, rw, rh) for rx, ry, rw, rh in L["rects"]])
        grid(k, f, t, L2)
        yy = gy + L["view_h"] + 60
        k.line(f, 48, yy - 30, W - 96, 1, t["line"])
    k.text(f, "A fixed column count (4–12) overrides the rule; a card is then at least 140 px wide.", 48,
           fh - 48, size=12, colour=t["muted"], family=MONO)
    return f, fh


# ---------------------------------------------------------------- server settings (beta epic 2)
# The Server section of the settings panel, drawn with the panel's own parts (board.css `.hb-panel`): 320 px wide,
# 16 px padding, 12 px gaps, 11 px letter-spaced heads, 13 px mono rows, `.seg` options, `.wide` buttons, `.hint`
# lines and the `.error` box. The one thing the panel does not have yet is a text field; it takes the look of the
# Add site dialog's fields (page fill, 1 px line, cyan when it has focus).

PW, PAD, GAP = 320, 16, 12
INNER = PW - 2 * PAD
CH = 7.8  # the advance of one 13 px mono character


class Panel:
    """A settings panel under construction: parts are added top to bottom, the frame grows to fit."""

    def __init__(self, k, parent, t, name, x, y):
        self.k, self.t = k, t
        self.f = k.frame(parent, name, x, y, PW, 100, fill=t["surface"], stroke=t["line"])
        k.shadow(self.f)
        self.y = PAD

    def _h(self, nid):
        return self.k.f.tool("get_node", {"id": nid, "depth": 0})["height"]

    def _done(self, h):
        self.y += h + GAP

    def head(self, text):
        self.k.text(self.f, text.upper(), PAD, self.y, size=11, colour=self.t["muted"], family=MONO,
                    letterSpacing=1.8, name="head")
        self._done(14)

    def hint(self, text, colour=None):
        n = self.k.text(self.f, text, PAD, self.y, size=11, colour=colour or self.t["muted"], family=MONO,
                        w=INNER, lineHeight=16.5, name="hint")
        self._done(self._h(n))

    def status(self, text, online=True):
        """The dot of the page's sync mark, then who is signed in where."""
        if online:
            self.k.rect(self.f, PAD, self.y + 6, 6, 6, self.t["cyan"], name="status dot", cornerRadius=3)
        else:
            self.k.frame(self.f, "status ring", PAD, self.y + 6, 6, 6, stroke=self.t["muted"], radius=3)
        self.k.text(self.f, text, PAD + 14, self.y, size=13, colour=self.t["ink"], family=MONO, name="status")
        self._done(17)

    def seg_row(self, label, options, pressed):
        t, k = self.t, self.k
        k.text(self.f, label, PAD, self.y + 5, size=13, colour=t["ink"], family=MONO)
        widths = [round(len(o) * CH + 18) for o in options]
        x = PW - PAD - (sum(widths) - len(options) + 1)
        for o, w in zip(options, widths):
            b = k.frame(self.f, f"seg/{o}", x, self.y, w, 28, stroke=t["cyan"] if o == pressed else t["line"])
            k.text(b, o, 9, 5, size=13, colour=t["cyan_text"] if o == pressed else t["ink"], family=MONO)
            x += w - 1
        self._done(28)

    def field(self, label, value, focus=False, secret=False, error=False):
        t, k = self.t, self.k
        k.text(self.f, label, PAD, self.y, size=11, colour=t["muted"], family=MONO, name="field label")
        b = k.frame(self.f, f"field/{label}", PAD, self.y + 20, INNER, 28, fill=t["bg"],
                    stroke=t["cyan"] if focus else t["ink"] if error else t["line"])
        k.text(b, "•" * 12 if secret else value, 8, 5, size=13, colour=t["ink"], family=MONO, w=INNER - 16)
        if focus:  # the caret, after the text
            k.rect(b, 9 + (12 * CH if secret else len(value) * CH), 6, 1, 16, t["cyan"], name="caret")
        self._done(48)

    def button(self, text, primary=False, disabled=False, icon=None):
        t, k = self.t, self.k
        b = k.frame(self.f, f"button/{text}", PAD, self.y, INNER, 28, fill=t["cyan"] if primary else "none",
                    stroke=None if primary else t["line"])
        col = t["on_cyan"] if primary else t["muted"] if disabled else t["ink"]
        k.text(b, text, 9, 5, size=13, colour=col, family=MONO)
        if icon:
            k.icon(b, icon, INNER - 28, 4, 20, col)
        self._done(28)

    def error(self, text, tag="error"):
        """The `.error` box: a 1 px ink frame, the tag in mono, the sentence in Plex Sans 13 px."""
        t, k = self.t, self.k
        b = k.frame(self.f, "error", PAD, self.y, INNER, 80, stroke=t["ink"])
        k.text(b, tag.upper(), 10, 8, size=11, colour=t["muted"], family=MONO, letterSpacing=1.8)
        n = k.text(b, text, 10, 26, size=13, colour=t["ink"], family=SANS, w=INNER - 20, lineHeight=19.5)
        h = round(self._h(n)) + 26 + 8
        k.set(b, height=h)
        self._done(h)

    def tag(self, right, y, text, hot=False):
        t, k = self.t, self.k
        w = round(len(text) * 6.6 + 12)
        b = k.frame(self.f, f"tag/{text}", right - w, y, w, 18, stroke=t["cyan"] if hot else t["line"])
        k.text(b, text, 0, 1, size=11, colour=t["cyan_text"] if hot else t["muted"], family=MONO, w=w,
               textAlign="center")

    def item(self, name, meta, line2, action=None, hot=False):
        """A list row: the name and a tag on the first line, the detail and a small button on the second."""
        t, k = self.t, self.k
        k.text(self.f, name, PAD, self.y, size=13, colour=t["ink"], family=MONO, name="item name")
        self.tag(PW - PAD, self.y - 1, meta, hot)
        k.text(self.f, line2, PAD, self.y + 22, size=11, colour=t["muted"], family=MONO, name="item detail")
        right = PW - PAD
        for a in ([action] if isinstance(action, str) else action or []):
            w = round(len(a) * 6.6 + 16)
            b = k.frame(self.f, f"button/{a}", right - w, self.y + 18, w, 22, stroke=t["line"])
            k.text(b, a, 0, 3, size=11, colour=t["ink"], family=MONO, w=w, textAlign="center")
            right -= w + 8
        self._done(40)

    def entry(self, when, command, detail, refused=False):
        t, k = self.t, self.k
        k.text(self.f, when, PAD, self.y + 2, size=11, colour=t["muted"], family=MONO, name="log time")
        k.text(self.f, command, PAD + 72, self.y, size=13, colour=t["ink"], family=MONO, name="log command")
        k.text(self.f, detail, PAD + 72, self.y + 20, size=11, colour=t["ink"] if refused else t["muted"],
               family=MONO, w=INNER - 72, lineHeight=14, name="log detail")
        self._done(52 if refused else 38)

    def close(self):
        self.k.set(self.f, height=self.y - GAP + PAD)
        return self.f


ADDRESS = "hboard.example.com"


def panel_connect(k, p):
    p.head("Server")
    p.seg_row("mode", ["local", "server"], "server")
    p.field("Server address", "https://" + ADDRESS, focus=True)
    p.hint("https only. http works for localhost and 127.0.0.1. Your browser asks you to allow this address "
           "when you connect.")
    p.button("Connect", primary=True)
    p.hint("Local keeps the library in this browser only. Nothing is sent anywhere.")


def panel_setup(k, p):
    p.head("Server · first sign-in")
    p.status(ADDRESS)
    p.hint("This server has no users yet. Enter the setup code from the server's log to create the admin account.")
    p.field("Setup code", "K7QD-4M2X-9TRW")
    p.field("Admin name", "anna")
    p.field("Password", "", secret=True, focus=True)
    p.field("Repeat password", "", secret=True)
    p.button("Create admin and sign in", primary=True)
    p.hint("The code works once. Choose a password you do not use anywhere else.")


def panel_signin(k, p):
    p.head("Server · sign in")
    p.status(ADDRESS)
    p.field("User name", "mari")
    p.field("Password", "", secret=True, focus=True)
    p.error("Wrong user name or password. Wait a moment before you try again.")
    p.button("Sign in", primary=True)
    p.button("Use local mode")


def panel_password(k, p):
    p.head("Server · password")
    p.status("mari · " + ADDRESS)
    p.field("Current password", "", secret=True)
    p.field("New password", "", secret=True, focus=True)
    p.field("Repeat new password", "", secret=True)
    p.button("Change password", primary=True)
    p.button("Cancel")
    p.hint("Your other signed-in browsers are signed out when it changes.")


def panel_forced(k, p):
    p.head("Server · new password")
    p.status("paul · " + ADDRESS)
    p.error("Your password is temporary. Choose your own to go on.", tag="notice")
    p.field("Temporary password", "", secret=True)
    p.field("New password", "", secret=True, focus=True)
    p.field("Repeat new password", "", secret=True)
    p.button("Set password and sign in", primary=True)
    p.button("Sign out")


def panel_users(k, p):
    p.head("Server")
    p.status("anna · admin · " + ADDRESS)
    p.button("Change password")
    p.button("Sign out")
    p.head("Users · 3")
    p.item("anna", "admin", "own library · 84 sites")
    p.item("mari", "user", "own library · 41 sites", ["Remove", "Reset"])
    p.item("paul", "user", "temporary password", ["Remove", "Reset"])
    p.button("New user…", icon="plus")
    p.hint("Everyone has an own library and own agent keys.")


def panel_keys(k, p):
    p.head("Server")
    p.status("mari · " + ADDRESS)
    p.head("Agent keys · 3")
    p.item("claude-desktop", "edit", "last used 2 min ago", "Revoke")
    p.item("n8n-nightly", "read", "last used yesterday, 02:00", "Revoke")
    p.item("old-laptop", "owner", "never used", "Revoke", hot=True)
    p.button("New key…", icon="plus")
    p.button("Key log…")
    p.hint("A key acts as you, within its scope. Every change it makes is kept as a snapshot under its name.")


def panel_log(k, p):
    p.head("Agent keys · log")
    p.button("‹ Back to the keys")
    p.entry("11:42:07", "site.add", "claude-desktop · edit · done")
    p.entry("11:42:05", "site.update", "claude-desktop · edit · done")
    p.entry("02:00:02", "site.add", "n8n-nightly · read · refused, the read scope only reads", refused=True)
    p.entry("Mon 09:15", "group.remove", "claude-desktop · edit · refused, needs the owner scope", refused=True)
    p.entry("Mon 09:12", "site.remove", "claude-desktop · edit · done")
    p.hint("The last 100 uses of all your keys, newest first.")


def panel_offline(k, p):
    p.head("Server")
    p.status("offline · " + ADDRESS, online=False)
    p.error("The server cannot be reached. You see the copy saved at 14:20. Editing, users and keys need the "
            "server.", tag="read only")
    p.button("Try again", primary=True)
    p.button("Change password", disabled=True)
    p.button("New key…", disabled=True)
    p.button("Sign out")


def server_dialog(k, parent, t, name, x, y, title, h, build):
    """A dialog on the start page, in the Add site dialog's frame (600 px, scrim, cyan top rule)."""
    f = main_screen(k, parent, t, name, x, y, hover=False)
    k.rect(f, 0, 0, W, H, t["scrim"], name="scrim", opacity=0.78)
    dw = 600
    d = k.frame(f, "dialog", (W - dw) / 2, (H - h) / 2, dw, h, fill=t["surface"], stroke=t["line"])
    k.shadow(d)
    k.rect(d, 0, 0, dw, 3, t["cyan"], name="top accent")
    label(k, d, t, 32, 32, "+", title)
    k.icon(d, "x", dw - 48, 28, 20, t["muted"])
    build(d, dw)
    return f


def dialog_field(k, t, d, dw, yy, lab, val):
    k.text(d, lab, 32, yy, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    b = k.frame(d, f"field/{lab}", 32, yy + 22, dw - 64, 44, fill=t["bg"], stroke=t["line"])
    k.text(b, val, 14, 12, size=14, colour=t["ink"], family=MONO, w=dw - 96)


def shown_once(k, t, d, dw, yy, lab, val):
    """The secret in a field of its own with its copy button."""
    k.text(d, lab, 32, yy, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    b = k.frame(d, "secret", 32, yy + 22, dw - 64 - 116, 44, fill=t["bg"], stroke=t["cyan"])
    k.text(b, val, 14, 12, size=14, colour=t["ink"], family=MONO, w=dw - 64 - 116 - 28)
    c = k.frame(d, "copy", dw - 32 - 104, yy + 22, 104, 44, stroke=t["line"])
    k.icon(c, "copy", 14, 12, 20, t["ink"])
    k.text(c, "Copy", 44, 12, size=14, colour=t["ink"], family=MONO)


def done_button(k, t, d, dw, dh):
    ok = k.frame(d, "done", dw - 160, dh - 72, 128, 44, fill=t["cyan"])
    k.text(ok, "Done", 0, 12, size=14, colour=t["on_cyan"], family=MONO, w=128, textAlign="center")


def new_user_dialog(k, parent, t, x, y, reset=False):
    dh = 380

    def build(d, dw):
        dialog_field(k, t, d, dw, 76, "USER NAME", "paul")
        shown_once(k, t, d, dw, 156, "TEMPORARY PASSWORD", "tulip-brisk-ember-92")
        k.text(d, "Shown once. Give it to paul in person; the server keeps only a hash of it.", 32, 244, size=13,
               colour=t["ink"], family=SANS, w=dw - 64, lineHeight=19.5)
        k.text(d, "paul replaces it at the first sign-in and can do nothing else before that.", 32, 272, size=13,
               colour=t["muted"], family=SANS, w=dw - 64, lineHeight=19.5)
        done_button(k, t, d, dw, dh)

    name, title = ("Server · password reset", "Password reset") if reset else ("Server · new user", "New user · created")
    return server_dialog(k, parent, t, name, x, y, title, dh, build)


def new_key_dialog(k, parent, t, x, y):
    dh = 520

    def build(d, dw):
        dialog_field(k, t, d, dw, 76, "NAME", "claude-desktop")
        k.text(d, "SCOPE", 32, 156, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
        tw = (dw - 64 - 2 * 8) / 3
        for j, (o, desc) in enumerate([("read", "reads the library"), ("edit", "reads and changes it"),
                                       ("owner", "may also delete, restore, import")]):
            sel = o == "edit"
            b = k.frame(d, f"scope/{o}", 32 + j * (tw + 8), 178, tw, 64, fill=t["bg"],
                        stroke=t["cyan"] if sel else t["line"], sw=2 if sel else 1)
            k.text(b, o, 12, 10, size=14, colour=t["cyan_text"] if sel else t["ink"], family=MONO)
            k.text(b, desc, 12, 32, size=11, colour=t["muted"], family=MONO, w=tw - 22, lineHeight=14)
        shown_once(k, t, d, dw, 266, "KEY", "hbk_3f9a1c7e5b2d4a60b8c1e97d2f4a6b03")
        k.text(d, "Shown once. Copy it now and keep it as you keep a password; the server keeps only a hash.",
               32, 354, size=13, colour=t["ink"], family=SANS, w=dw - 64, lineHeight=19.5)
        k.text(d, "Revoke it any time in the key list. Everything it changes is kept as a snapshot under its name.",
               32, 402, size=13, colour=t["muted"], family=SANS, w=dw - 64, lineHeight=19.5)
        done_button(k, t, d, dw, dh)

    return server_dialog(k, parent, t, "Server · new key", x, y, "New agent key · created", dh, build)


PANELS = [
    ("15-server-connect", "connect", panel_connect),
    ("16-server-first-sign-in", "first sign-in", panel_setup),
    ("17-server-sign-in", "sign in", panel_signin),
    ("18-server-password", "password", panel_password),
    ("19-server-password-forced", "password, forced", panel_forced),
    ("20-server-users", "users", panel_users),
    ("22-server-keys", "agent keys", panel_keys),
    ("24-server-key-log", "key log", panel_log),
]


def panel_sheet(k, parent, t, name, x, y, build):
    """One panel on the page's own ground: the width of the panel plus a margin."""
    m = 40
    f = k.frame(parent, name, x, y, PW + 2 * m, 100, fill=t["bg"], clip=True)
    p = Panel(k, f, t, "settings panel", m, m)
    build(k, p)
    p.close()
    h = round(p.y - GAP + PAD + 2 * m)
    k.set(f, height=h)
    return f, h


def server_frames(k, out, y0):
    """Every server frame, dark then light; returns the y below them."""
    y, sx = y0, W + 120
    for theme, suffix in ((THEMES["dark"], "dark"), (THEMES["light"], "light")):
        x, row_h = 0, 0
        for i, (file, title, build) in enumerate(PANELS):
            if i == 4:
                y, x, row_h = y + row_h + 120, 0, 0
            f, h = panel_sheet(k, None, theme, f"Server · {title} · {suffix}", x, y, build)
            out.append((f"{file}-{suffix}", f, None))
            x += PW + 80 + 120
            row_h = max(row_h, h)
        y += row_h + 160
        out.append((f"21-server-new-user-{suffix}", new_user_dialog(k, None, theme, 0, y), None))
        out.append((f"23-server-new-key-{suffix}", new_key_dialog(k, None, theme, sx, y), None))
        y += H + 120
        out.append((f"27-server-password-reset-{suffix}", new_user_dialog(k, None, theme, 0, y, reset=True), None))
        y += H + 120
        off = main_screen(k, None, theme, f"Server · offline · {suffix}", 0, y, hover=False,
                          sync="offline · last synced 12 min ago")
        p = Panel(k, off, theme, "settings panel", W - 32 - PW, 58)
        panel_offline(k, p)
        p.close()
        out.append((f"25-server-offline-{suffix}", off, None))
        ag = main_screen(k, None, theme, f"Server · agent change · {suffix}", sx, y, hover=False,
                         agent="claude-desktop added “grafana” to Development · z: undo")
        out.append((f"26-server-agent-change-{suffix}", ag, None))
        y += H + 240
    return y


def main():
    f = FC(ROOT)
    k = K(f)
    pages = f.cmd("page.list")
    first = pages[0]["id"] if isinstance(pages, list) else pages["pages"][0]["id"]
    f.cmd("page.rename", id=first, name="Qubernetic Start")
    f.cmd("page.setBackground", color="#0A0B0C")
    dark, light = THEMES["dark"], THEMES["light"]
    out = []  # (file name, node id, extra export scale or None)
    sx_, sy_ = W + 120, H + 120
    # reference set, 1440×900
    out.append(("01-start-dark", main_screen(k, None, dark, "Start · dark", 0, 0), None))
    out.append(("02-start-light", main_screen(k, None, light, "Start · light", sx_, 0), None))
    out.append(("07-empty-group", main_screen(k, None, dark, "Empty group", 2 * sx_, 0, empty=True), None))
    a = main_screen(k, None, dark, "Start · search", 0, sy_, hover=False)
    # open search state on top of the main screen
    k.rect(a, 0, 65, W, H - 105, dark["scrim"], name="dim", opacity=0.55)
    sx, sy, sw, sh = GEO[a]["search"]
    search(k, a, dark, sx, sy, sw, sh, open_=True)
    suggestions(k, a, dark, sx, sy + sh + 6, sw)
    out.append(("03-start-search", a, None))
    out.append(("04-new-site", add_dialog(k, None, dark, sx_, sy_), None))
    out.append(("05-home-standby", standby(k, None, dark, 2 * sx_, sy_), None))
    y2 = 2 * sy_
    out.append(("06-anatomy", anatomy(k, None, dark, 0, y2), None))
    out.append(("08-sizes", sizes(k, None, dark, sx_, y2), None))
    dens, dens_h = density_sheet(k, None, dark, 2 * sx_, y2)
    out.append(("09-density", dens, None))
    # one frame per real viewport
    y3 = y2 + max(ANATOMY_H, dens_h) + 240
    tg = {t_["file"]: t_ for t_ in TARGETS}

    def target(key, theme, x, y, suffix="", name_suffix="", density="normal"):
        t_ = tg[key]
        w, h = t_["w"], t_["h"] - CHROME
        nid = main_screen(k, None, theme, f"Start · {t_['title']}{name_suffix}", x, y, w, h, density=density)
        out.append((key + suffix, nid, t_["scale"] if t_["scale"] != 1 else None))
        return w, h

    w1, h1 = target("10-start-1920x1080", dark, 0, y3)
    w2, h2 = target("11-start-2286x1349", dark, w1 + 160, y3)
    y4 = y3 + max(h1, h2) + 160
    w3, h3 = target("12-start-2560x1360", dark, 0, y4)
    target("12-start-2560x1360", light, w3 + 160, y4, suffix="-light", name_suffix=" · light")
    y5 = y4 + h3 + 160
    _, h5 = target("14-start-3440x1360", dark, 0, y5)
    # the other two densities on the 1920 frame
    y6 = y5 + h5 + 160
    w6, _ = target("10-start-1920x1080", dark, 0, y6, suffix="-suru", name_suffix=" · dense", density="dense")
    target("10-start-1920x1080", dark, w6 + 160, y6, suffix="-tagas", name_suffix=" · spacious", density="spacious")
    server_frames(k, out, y6 + 1000 + 240)
    f.tool("save_file", {"path": os.path.join(ROOT, "h-board.figcraft")})
    png = os.path.join(ROOT, "png")
    for name, nid, scale in out:
        f.tool("export", {"ids": [nid], "format": "png", "scale": 1, "path": os.path.join(png, name + ".png")})
        if scale:
            f.tool("export", {"ids": [nid], "format": "png", "scale": scale,
                              "path": os.path.join(png, f"{name}-@{scale}x.png")})
    f.close()
    print("__BUILD_OK")


if __name__ == "__main__":
    main()
