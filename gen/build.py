"""Qubernetic Start: a FigCraft concept for a new-tab page (groups of sites, category wheel, search, clock).

Run: python3 build.py   ->  ../h-board.figcraft and ../png/*.png
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
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

GROUPS = ["Kezdő", "Fejlesztés", "Qubernetic", "Automatizálás", "Média", "Pénzügy", "Olvasnivaló", "Eszközök"]
COUNTS = [9, 11, 7, 12, 0, 5, 14, 8]
ACTIVE = 1
SITES = [
    ("github", "github-logo", "Repók, pull requestek és a CI-futások egy helyen.", "github.com"),
    ("claude", "sparkle", "Beszélgetések, projektek és artifactok.", "claude.ai"),
    ("copia", "git-branch", "PLC-projektek verziókezelése, diffek, review.", "copia.io"),
    ("beckhoff infosys", "book-open", "TwinCAT 3 dokumentáció és könyvtár-referencia.", "infosys.beckhoff.com"),
    ("docs.rs", "code", "Minden Rust crate dokumentációja, verziónként.", "docs.rs"),
    ("crates.io", "cube", "A Rust csomagregiszter: verziók, letöltések.", "crates.io"),
    ("mdn", "globe", "Webes referencia: HTML, CSS, JavaScript.", "developer.mozilla.org"),
    ("flathub", "package", "Linuxos alkalmazások, Flatpakként.", "flathub.org"),
    ("nextcloud", "cloud", "Saját felhő: fájlok, naptár, névjegyek.", "cloud.example.com"),
    ("hetzner", "hard-drives", "Szerverek, tűzfal, konzol és számlák.", "console.hetzner.cloud"),
    ("qubernetic.com", "browser", "A saját weboldal, élőben.", "qubernetic.com"),
    ("gitlab", "gitlab-logo", "Saját runnerek, pipeline-ok és registry.", "gitlab.com"),
    ("codeberg", "tree-structure", "Nyílt forráskódú repók, Forgejo-alapon.", "codeberg.org"),
    ("rust-lang", "gear", "A Rust könyv, a referencia és a blog.", "rust-lang.org"),
    ("tauri", "app-window", "Asztali alkalmazás webes felülettel, Rustban.", "tauri.app"),
    ("egui", "paint-brush-broad", "Azonnali módú GUI Rusthoz: példák, demó.", "egui.rs"),
    ("playwright", "test-tube", "Böngészős tesztek és automatizálás.", "playwright.dev"),
    ("npm", "package", "JavaScript-csomagok és verzióik.", "npmjs.com"),
    ("pypi", "stack", "Python-csomagok, kiadások, letöltések.", "pypi.org"),
    ("ghcr", "cube-transparent", "Konténerképek a GitHub registryben.", "ghcr.io"),
    ("docker hub", "anchor", "Hivatalos és közösségi konténerképek.", "hub.docker.com"),
    ("grafana", "chart-line-up", "Mérőszámok, panelek és riasztások.", "grafana.example.local"),
    ("home assistant", "house-line", "Otthoni automatizálás és érzékelők.", "ha.example.com"),
    ("te1000 docs", "books", "TwinCAT 3 XAE: mérnöki kézikönyvek.", "infosys.beckhoff.com/te1000"),
    ("stack overflow", "stack-overflow-logo", "Kérdések és válaszok hibakereséshez.", "stackoverflow.com"),
    ("lib.rs", "file-rs", "Rust crate-ek kategóriák szerint.", "lib.rs"),
    ("ads docs", "plugs-connected", "Az ADS-protokoll és a hibakódok leírása.", "infosys.beckhoff.com/ads"),
    ("regex101", "brackets-curly", "Reguláris kifejezések kipróbálása.", "regex101.com"),
    ("devdocs", "terminal-window", "Sok nyelv és könyvtár dokumentációja egy helyen.", "devdocs.io"),
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
    """[ 02 ]  FEJLESZTÉS  — the site's section label."""
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
    "sűrű": dict(min=150, max=190, h=64, gap=12),     # icon, name, host; the description shows on hover
    "normál": dict(min=200, max=260, h=112, gap=16),  # + one truncated line of description; the default
    "tágas": dict(min=240, max=320, h=148, gap=24),   # + two lines of description and the tile's number
}


def layout(w, h, density="normál", cols=None, tiles=TILES):
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
    card_h = 192 if density == "tágas" and tall else D["h"]
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


def header(k, parent, t, w=W, x0=328):
    k.rect(parent, 0, 0, w, 64, t["bg"], name="header bg", opacity=0.92)
    k.line(parent, 0, 64, w, 1, t["line"], name="header rule")
    k.svg(parent, t["logo"], 32, 20, h=24)
    # sync status, on the content's left edge
    k.rect(parent, x0, 29, 6, 6, t["cyan"], name="sync dot", cornerRadius=3)
    k.text(parent, "szinkronban · 2 perce", x0 + 14, 24, size=13, colour=t["muted"], family=MONO)
    # right: weather, theme toggle, settings, account; the cluster ends on the 32 px page edge
    r = w - 32
    k.icon(parent, "cloud-sun", r - 354, 22, 20, t["muted"])
    k.text(parent, "4 °C  Budapest", r - 326, 23, size=13, colour=t["muted"], family=MONO)
    b = k.frame(parent, "mode", r - 208, 14, 112, 36, stroke=t["line"])
    k.text(b, "◐  " + ("Világos" if t is THEMES["dark"] else "Sötét"), 16, 9, size=13, colour=t["ink"], family=MONO)
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
            k.text(box, f"{COUNTS[i]} oldal", pad, cy + lh - 24, size=11, colour=t["muted"], family=MONO)
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
        k.text(box, f"CSOPORTOK · {n}", pad, 24, size=11, colour=t["muted"], family=MONO, letterSpacing=1.8)
        k.text(box, "+ új csoport", pad, h - 40, size=12, colour=t["muted"], family=MONO)
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
    sűrű (up to 72 px): icon, name, host; normál (up to 120 px): + one line of description;
    tágas: + two lines and the tile's number, in three sizes (compact, roomy from 150 px tall and 260 px wide,
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
        k.text(c, "új oldal", w / 2 - 18, h / 2 - 9, size=13, colour=t["muted"], family=MONO)
        return c
    k.icon(c, "plus", w / 2 - 12, h / 2 - 26, 24, t["muted"])
    k.text(c, "új oldal", 0, h / 2 + 6, size=13, colour=t["muted"], family=MONO, w=w, textAlign="center")
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
        k.text(parent, f"↓ még {more}", L["right"] - 90, gy + vh - 4, size=11, colour=t["muted"], family=MONO, w=90,
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
    q = "twincat ads" if open_ else "keresés vagy cím"
    k.text(s, q, tx, ty, size=fs, colour=t["ink"] if open_ else t["muted"], family=MONO)
    k.rect(s, round(tx + len(q) * 0.6 * fs + 3), (h - 20) / 2, 9, 20, t["cyan"], name="caret",
           opacity=1 if open_ else 0.8)
    kb = k.frame(s, "kbd", w - 52, (h - 24) / 2, 40, 24, stroke=t["line"])
    k.text(kb, "/", 0, 3, size=13, colour=t["muted"], family=MONO, w=40, textAlign="center")
    return s


def status_bar(k, parent, t, w=W, h=H):
    k.rect(parent, 0, h - 40, w, 40, t["bg"], name="status bg", opacity=0.92)
    k.line(parent, 0, h - 40, w, 1, t["line"], name="status rule")
    k.text(parent, f"{len(GROUPS)} csoport · {sum(COUNTS)} oldal · ma 23 megnyitás", 32, h - 28, size=12, colour=t["muted"], family=MONO)
    hints = "↕ görgő: csoport   1–8: ugrás   /: keresés   e: szerkesztés   s: standby"
    k.text(parent, hints, w - 32 - 620, h - 28, size=12, colour=t["muted"], family=MONO, w=620, textAlign="right")


def todo(k, parent, t, x, y):
    label(k, parent, t, x, y, "✓", "Teendők · 1 / 3")
    todos = [("Ügyfél: ajánlat átnézése", False), ("Kódreview: PR #41", False), ("Brand repo v2.3 tag", True)]
    for j, (s, done) in enumerate(todos):
        yy = y + 32 + j * 30
        bx = k.frame(parent, "check", x, yy + 2, 14, 14, stroke=t["cyan"] if done else t["muted"],
                     fill=t["cyan"] if done else "none")
        if done:
            k.icon(bx, "check", 1, 1, 12, t["on_cyan"])
        k.text(parent, s, x + 26, yy, size=14, colour=t["muted"] if done else t["ink"], family=SANS,
               textDecoration="strikethrough" if done else "none")
    k.text(parent, "+ új teendő", x + 26, y + 122, size=13, colour=t["muted"], family=MONO)


def weather(k, parent, t, x, y, w):
    """The longer weather block of the ultrawide's info column (the header keeps the one-liner)."""
    label(k, parent, t, x, y, "☼", "Időjárás · Budapest")
    k.icon(parent, "cloud-sun", x, y + 36, 32, t["cyan"])
    k.text(parent, "4 °C", x + 46, y + 28, size=36, colour=t["ink"], family=MONO, letterSpacing=-1)
    k.text(parent, "borult, délután gyenge eső", x, y + 84, size=14, colour=t["muted"], family=SANS)
    k.line(parent, x, y + 118, w, 1, t["line"])
    for j, (day, temp, what) in enumerate([("kedd", "6° / 1°", "eső"), ("szerda", "5° / 0°", "felhős"),
                                           ("csütörtök", "3° / −2°", "havas eső")]):
        yy = y + 132 + j * 26
        k.text(parent, day, x, yy, size=13, colour=t["ink"], family=MONO)
        k.text(parent, temp, x + 88, yy, size=13, colour=t["ink"], family=MONO)
        k.text(parent, what, x + 110, yy, size=13, colour=t["muted"], family=MONO, w=w - 110, textAlign="right")


def hero(k, parent, t, L, with_search=True):
    x0, top, cs = L["x0"], L["top"], L["clock"]
    label(k, parent, t, x0, top, "00", "Hétfő · 2026. november 23. · 48. hét")
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
    """The grid's own label; on its right the density (sűrű / normál / tágas) and the layout switch
    (classic / simple / compact)."""
    y = L["sec_y"]
    label(k, parent, t, L["x0"], y, idx, text)
    x = L["right"]
    for j, name in enumerate(["tömör", "egyszerű", "klasszikus"]):
        tw = len(name) * 7.2
        x -= tw
        on = j == 2
        k.text(parent, name, round(x), y, size=12, colour=t["ink"] if on else t["muted"], family=MONO)
        if on:
            k.rect(parent, round(x), y + 19, round(tw), 1, t["cyan"], name="layout active")
        x -= 20
    if L["main_w"] >= 900:
        d = f"sűrűség: {L['density']}"
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


def main_screen(k, parent, t, name, x=0, y=0, w=W, h=H, hover=True, empty=False, density="normál", cols=None):
    L = layout(w, h, density, cols)
    f = k.frame(parent, name, x, y, w, h, fill=t["bg"], clip=True)
    GEO[f] = L
    rail, x0 = L["rail"], L["x0"]
    grid_lines(k, f, t, list(range(rail, w, 408)), y1=h)
    cw, ch = (7, 14) if w < 2200 else (8, 16)
    path = pointer_path(L, empty) if hover or empty else None
    field(k, f, t, cw, ch, path=path, blocks=quiet_blocks(L, h, empty), w=w, h=h, exposure=EXPOSURE)
    header(k, f, t, w, x0)
    k.line(f, rail, 65, 1, h - 105, t["line"], name="rail rule")
    wheel(k, f, t, 0, 65, rail, h - 105, active=4 if empty else ACTIVE)
    hero(k, f, t, L)
    if empty:
        b = L["sec_y"] + 40
        label(k, f, t, x0, b, "05", "Média · 0 oldal")
        k.text(f, "Ez a csoport még üres.", x0, b + 32, size=32, colour=t["ink"], family=MONO)
        k.text(f, "Tegyél ide oldalakat egyenként, vagy hozd át őket a böngésző könyvjelzőiből: "
                  "egy könyvjelzőmappa egy csoport lesz.", x0, b + 88, size=15, colour=t["muted"], family=SANS,
               w=420, lineHeight=24)
        b1 = k.frame(f, "add site", x0, b + 170, 168, 48, fill=t["cyan"])
        k.text(b1, "+ új oldal", 0, 14, size=14, colour=t["on_cyan"], family=MONO, w=168, textAlign="center")
        b2 = k.frame(f, "import", x0 + 180, b + 170, 260, 48, stroke=t["line"], fill=t["bg"])
        k.icon(b2, "bookmarks-simple", 18, 14, 20, t["ink"])
        k.text(b2, "Import könyvjelzőkből", 48, 14, size=14, colour=t["ink"], family=MONO)
        k.text(f, "vagy húzz ide egy linket a címsorból", x0, b + 240, size=12, colour=t["muted"], family=MONO)
    else:
        section_row(k, f, t, L, f"{ACTIVE + 1:02d}", f"{GROUPS[ACTIVE]} · {COUNTS[ACTIVE]} oldal")
        grid(k, f, t, L)
    if path:
        k.f.tool("create_node", {"type": "vector", "parent": f, "x": path[-1][0], "y": path[-1][1],
                                 "name": "pointer", "path": "M0 0 L0 17 L4.5 13 L7.5 20 L10 19 L7 12 L13 12 Z",
                                 "closed": True, "props": {"fill": "#FFFFFF", "stroke": "#0E0F10", "strokeWeight": 1},
                                 "select": False})
    status_bar(k, f, t, w, h)
    return f


# ---------------------------------------------------------------- other frames

def note(k, parent, t, x, y, idx, title, body, w=360):
    label(k, parent, t, x, y, idx, title, size=11)
    return k.text(parent, body, x, y + 24, size=13, colour=t["muted"], family=SANS, w=w, lineHeight=20)


ANATOMY_H = 1880


def anatomy(k, parent, t, x, y):
    f = k.frame(parent, "Anatómia · görgő és kártyák", x, y, W, ANATOMY_H, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=ANATOMY_H)
    k.text(f, "Görgő és kártyák", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, "A Monknow funkciói Qubernetic-formában: csoportok, ikonkártyák leírással, kereső, óra, teendők.",
           48, 96, size=15, colour=t["muted"], family=SANS, w=900)
    k.line(f, 0, 140, W, 1, t["line"])

    # wheel states
    label(k, f, t, 48, 168, "01", "Kategóriaváltó görgő")
    for j, (title, kw) in enumerate([("nyugalmi", {}), ("görgetés közben", {"ghost": 2}),
                                     ("3 · Qubernetic", {"active": 2})]):
        bx = 48 + j * 300
        frame = k.frame(f, f"wheel/{title}", bx, 204, 280, 520, fill=t["bg"], stroke=t["line"])
        wheel(k, frame, t, 0, 0, 280, 520, **kw)
        k.text(f, title, bx, 736, size=12, colour=t["muted"], family=MONO)
    note(k, f, t, 960, 204, "a", "Lencse",
         "A középső sáv az aktív csoport: nagy betű, sorszám, oldalszám. A szomszédok a henger palástján "
         "távolodnak: kisebbek és halványabbak.")
    note(k, f, t, 960, 330, "b", "Görgő",
         "Egérgörgő bárhol a bal sávon vagy a kártyarácson kívül: egy kattanás = egy csoport, rugós "
         "beállással. Érintőpadon lendület, a lencse mindig egy csoportra áll be.")
    note(k, f, t, 960, 476, "c", "Skála",
         "A jobb szélen lévő vonalzó az egész listát mutatja. Cián jel: hol vagy. A jelre kattintva "
         "egyből oda ugrik; 1–8 számbillentyű ugyanezt teszi.")
    note(k, f, t, 960, 602, "d", "Váltáskor",
         "Az új csoport kártyái a karaktermezőből íródnak ki: néhány képkockáig véletlen jelek "
         "(scramble, mint a weboldal címeinél), aztán megáll a szöveg. 240 ms, reduced-motionnél nincs.")
    k.line(f, 0, 790, W, 1, t["line"])

    # card variants
    label(k, f, t, 48, 818, "02", "Ikonkártya · elrendezések és állapotok")
    s = SITES[0]
    card(k, f, t, 48, 856, CARD_W, CARD_H, 0, s)
    k.text(f, "klasszikus · alap", 48, 1006, size=12, colour=t["muted"], family=MONO)
    card(k, f, t, 318, 856, CARD_W, CARD_H, 0, s, "hover")
    k.text(f, "klasszikus · hover", 318, 1006, size=12, colour=t["muted"], family=MONO)
    # simple
    sx = 588
    for j, st in enumerate(SITES[:3]):
        tile = k.frame(f, f"simple/{st[0]}", sx + j * 84, 856, 64, 64, fill=t["surface"], stroke=t["line"])
        k.icon(tile, st[1], 18, 18, 28, t["ink"])
        k.text(f, st[0], sx + j * 84, 928, size=11, colour=t["muted"], family=MONO, w=64, textAlign="center")
    k.text(f, "egyszerű · csak ikon", sx, 1006, size=12, colour=t["muted"], family=MONO)
    # compact rows
    cx = 860
    for j, st in enumerate(SITES[:4]):
        r = k.frame(f, f"compact/{st[0]}", cx, 856 + j * 36, 300, 32, fill=t["surface"], stroke=t["line"])
        k.icon(r, st[1], 8, 6, 20, t["ink"])
        k.text(r, st[0], 38, 7, size=13, colour=t["ink"], family=MONO)
        k.text(r, st[3], 186, 8, size=11, colour=t["muted"], family=MONO, w=104, textAutoResize="truncate",
               maxLines=1)
    k.text(f, "tömör · lista", cx, 1006, size=12, colour=t["muted"], family=MONO)
    # editing
    ex = 1180
    e = card(k, f, t, ex, 856, 220, CARD_H, 1, SITES[1])
    k.set(e, dashes=[4, 4])
    k.icon(e, "dots-six-vertical", 196, 60, 16, t["muted"])
    bar = k.frame(f, "edit bar", ex, 1006, 220, 32, stroke=t["line"], fill=t["surface"])
    k.icon(bar, "pencil-simple", 10, 7, 18, t["ink"])
    k.text(bar, "szerk.", 34, 8, size=12, colour=t["ink"], family=MONO)
    k.icon(bar, "trash", 120, 7, 18, t["muted"])
    k.text(bar, "törlés", 144, 8, size=12, colour=t["muted"], family=MONO)
    k.text(f, "szerkesztő mód (e) · húzd át", ex, 1048, size=12, colour=t["muted"], family=MONO)

    # search suggestions
    label(k, f, t, 48, 1110, "03", "Kereső · javaslatok és előzmények")
    k.text(f, "Javaslatok: választható szolgáltató. Előzmények: az utolsó 5 keresés, csak ezen a gépen. "
              "Motorváltás: Tab vagy a bal oldali chip. Egyezés a saját oldalaid közt: elsőként, csoporttal.",
           48, 1140, size=13, colour=t["muted"], family=SANS, w=520, lineHeight=20)
    sx, sy = 640, 1110
    k.line(f, 0, 1082, W, 1, t["line"])
    search(k, f, t, sx, sy, 600, open_=True)
    suggestions(k, f, t, sx, sy + 58, 600)

    # pointer trail: the web's rule in numbers, and the fade around one card
    k.line(f, 0, 1456, W, 1, t["line"])
    label(k, f, t, 48, 1484, "04", "Egérnyom · a karaktermező az egér körül")
    rows = [
        ("hatósugár", "60 px az egér körül. Egy cella f² · 0,8 · q eséllyel vált véletlen jelre; f az egérnél 1, "
                      "a peremen 0."),
        ("halványítás", "Szöveg és kártya mögött q = 0,2, onnan 80 px-en át négyzetesen nő 1-ig. A forró jel "
                        "átlátszósága maga a q."),
        ("nyom", "A cella 80–200 ms-ig marad forró (a határ 200 ms), közben tovább villog, aztán visszaáll."),
        ("szín", "A jelek 25%-a cián, a többi a mező halvány jelszíne."),
        ("kivétel", "A fejléc és az állapotsor nem csendesít, ahogy a weben a nav sem."),
        ("forrás", "qubernetic-web, src/components/field/field.ts. A keretek nyoma ebből a szabályból jön, "
                   "képkockánként kiszámolva."),
        ("a képeken", "A kezdőlap-keretek hosszú expozíciót mutatnak: az utolsó 600 ms minden forró cellája "
                      "egyszerre látszik. Élőben egy képkockán csak 10–25 cella ég."),
    ]
    for j, (key, val) in enumerate(rows):
        yy = 1524 + j * 46
        k.text(f, key, 48, yy, size=13, colour=t["ink"], family=MONO)
        k.text(f, val, 168, yy - 1, size=14, colour=t["muted"], family=SANS, w=460, lineHeight=20)
    dx, dy, dw, dh = 700, 1520, 692, 308
    demo = k.frame(f, "egérnyom · halványítás egy kártya körül", dx, dy, dw, dh, fill=t["bg"], stroke=t["line"],
                   clip=True)
    cr = ((dw - CARD_W) // 2, (dh - CARD_H) // 2, CARD_W, CARD_H)
    field(k, demo, t, 7, 14, blocks=[cr], dots=False, w=dw, h=dh, all_hot=True)
    k.frame(demo, "80 px", cr[0] - FADE, cr[1] - FADE, CARD_W + 2 * FADE, CARD_H + 2 * FADE, stroke=t["cyan"],
            dashes=[4, 4], radius=FADE)
    card(k, demo, t, *cr, 0, SITES[0])
    k.text(f, "Minden cella forrón rajzolva. Szaggatott vonal: 80 px a kártyától; azon kívül q = 1, a kártya "
              "szélén és mögötte q = 0,2.", dx, dy + dh + 12, size=12, colour=t["muted"], family=MONO, w=dw,
           lineHeight=18)
    return f


def suggestions(k, parent, t, x, y, w):
    d = k.frame(parent, "suggestions", x, y, w, 204, fill=t["surface"], stroke=t["line"])
    rows = [("browser", "beckhoff infosys", "Fejlesztés · saját oldal", True),
            ("magnifying-glass", "twincat ads notification", "javaslat", False),
            ("magnifying-glass", "twincat ads rust crate", "javaslat", False),
            ("clock-counter-clockwise", "twincat 3.1.4026 release notes", "előzmény", False)]
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
    label(k, f, t, 940, 250, "H", "Home · standby · 5 perc tétlenség után")
    k.text(f, "14:32", 930, 280, size=150, colour=t["ink"], family=MONO, letterSpacing=-4)
    k.text(f, "hétfő, november 23.", 940, 470, size=22, colour=t["muted"], family=MONO)
    k.line(f, 940, 530, 420, 1, t["line"])
    k.icon(f, "cloud-sun", 940, 556, 28, t["cyan"])
    k.text(f, "4 °C · borult · Budapest", 984, 558, size=18, colour=t["ink"], family=MONO)
    k.text(f, "következő: Ügyfél: ajánlat átnézése", 940, 610, size=15, colour=t["muted"], family=SANS)
    k.text(f, "bármely billentyű vagy egérmozdulat: vissza", 940, 820, size=12, colour=t["muted"], family=MONO)
    return f


def add_dialog(k, parent, t, x, y):
    f = main_screen(k, parent, t, "Új oldal hozzáadása", x, y, hover=False)
    k.rect(f, 0, 0, W, H, t["scrim"], name="scrim", opacity=0.78)
    dw, dh = 600, 620
    d = k.frame(f, "dialog", (W - dw) / 2, (H - dh) / 2, dw, dh, fill=t["surface"], stroke=t["line"])
    k.shadow(d)
    k.rect(d, 0, 0, dw, 3, t["cyan"], name="top accent")
    label(k, d, t, 32, 32, "+", "Új oldal · Fejlesztés")
    k.icon(d, "x", dw - 48, 28, 20, t["muted"])

    def field_(yy, lab, val, focus=False, ph=False, hh=44):
        k.text(d, lab, 32, yy, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
        b = k.frame(d, f"field/{lab}", 32, yy + 22, dw - 64, hh, fill=t["bg"],
                    stroke=t["cyan"] if focus else t["line"])
        k.text(b, val, 14, 12, size=14, colour=t["muted"] if ph else t["ink"], family=MONO if not ph else SANS,
               w=dw - 96)
        return b

    field_(76, "CÍM", "https://grafana.example.local", focus=True)
    field_(156, "NÉV", "grafana")
    field_(236, "LEÍRÁS", "Kamerák, inferencia-idők és hibaarány valós időben.", hh=64)
    k.text(d, "IKON", 32, 336, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    opts = [("favicon", None, False), ("chart-line-up", "Phosphor", True), ("G", "monogram", False),
            ("image", "feltöltés", False)]
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
    k.text(d, "CSOPORT", 32, 472, size=12, colour=t["muted"], family=MONO, letterSpacing=1)
    grp = k.frame(d, "group select", 32, 494, 260, 44, fill=t["bg"], stroke=t["line"])
    k.text(grp, "02  Fejlesztés", 14, 12, size=14, colour=t["ink"], family=MONO)
    k.icon(grp, "caret-down", 228, 12, 18, t["muted"])
    c = k.frame(d, "cancel", dw - 292, dh - 72, 120, 44, stroke=t["line"])
    k.text(c, "Mégse", 0, 12, size=14, colour=t["ink"], family=MONO, w=120, textAlign="center")
    ok = k.frame(d, "add", dw - 160, dh - 72, 128, 44, fill=t["cyan"])
    k.text(ok, "Hozzáadás", 0, 12, size=14, colour=t["on_cyan"], family=MONO, w=128, textAlign="center")
    return f


TARGETS = [
    dict(file="10-start-1920x1080", title="1920×1080 @100%", who="általános Full HD kijelző", phys="1920×1080",
         scale=1.0, w=1920, h=1080,
         rule="Hat oszlop és oldaloszlop a teendőknek, az időjárásnak. Négy sor látszik, az ötödik beles: "
              "a rács saját területén görög."),
    dict(file="11-start-2286x1349", title="eDP-1 · 3200×2000 @140%", who="laptop", phys="3200×2000",
         scale=1.4, w=2286, h=1429,
         rule="Nyolc oszlop, mind a négy sor látszik. Nagy óra a keresővel egy sorban; a rács alatt a teendők "
              "és az időjárás sávja."),
    dict(file="12-start-2560x1360", title="DP-6 · 3840×2160 @150%", who="4K monitor", phys="3840×2160",
         scale=1.5, w=2560, h=1440,
         rule="Kilenc oszlop, négy sor. Ugyanaz a három szint: óra és kereső, rács, teendők és időjárás."),
    dict(file="14-start-3440x1360", title="HDMI-A-1 · 3440×1440 @100%", who="ultrawide", phys="3440×1440",
         scale=1.0, w=3440, h=1440,
         rule="Tizenkét oszlop, három sor. A blokk 2600 px-nél megáll és középen ül, kétoldalt a karaktermező "
              "(a középre vagy balra igazítás még nyitott kérdés)."),
]


def schematic(k, parent, t, x, y, L, sc):
    """A small wireframe of one layout, drawn from the same numbers as the real frame."""
    r = lambda v: round(v * sc)  # noqa: E731
    box = k.frame(parent, f"vázlat {L['w']}×{L['h']}", x, y, r(L["w"]), r(L["h"]), fill=t["bg"], stroke=t["line"],
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
    """Méretek: the four target viewports, their logical size and the layout rule each one gets."""
    fh = 1440
    f = k.frame(parent, "Méretek · négy kijelző", x, y, W, fh, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=fh)
    k.text(f, "Méretek", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, "A kezdőlap nem nagyítva követi a kijelzőt: minden méret szabályból jön. A keretek logikai (CSS) "
              f"pixelben vannak; a magasságból lejön a Helium füles sávja és eszköztára, ezt {CHROME} px-nek "
              "vettem (feltételezés, élesben mérni kell).",
           48, 96, size=15, colour=t["muted"], family=SANS, w=980, lineHeight=24)
    k.line(f, 0, 172, W, 1, t["line"])
    label(k, f, t, 48, 200, "01", "Szabályok")
    rules = [
        ("sáv", "a szélesség 14,5%-a, 280 és 360 px között; margó 48 / 80 / 96 px"),
        ("sűrűség", "sűrű 150–190 × 64 px, köz 12 · normál 200–260 × 112 px, köz 16 (alap) · tágas 240–320 × 148 px, köz 24"),
        ("oszlop", "annyi, ahány a sűrűség legkisebb kártyaszélességével kifér; a szélességet elosztják a felső határig"),
        ("rögzítve", "az oszlopszám kézzel is megadható (4–12); a kártya ekkor legalább 140 px széles"),
        ("sor", "legalább három látszik: ha kevés a magasság, előbb a kereső kerül az óra mellé, aztán az óra kisebb"),
        ("görgetés", "ha a csoport nem fér ki, a rács a saját területén görög; alul elhalványul, jobbra csúszka mutatja"),
        ("teendők", "magas kijelzőn sáv a rács alatt, 1800 px-től oldaloszlop, különben az óra mellett"),
        ("ASCII-jel", "kártyás lapon nincs; csak a Home · standby lapon él. A pontozott karaktermező mindenhol marad"),
    ]
    for j, (key, val) in enumerate(rules):
        yy = 236 + j * 26
        k.text(f, key, 48, yy, size=13, colour=t["ink"], family=MONO)
        k.text(f, val, 168, yy, size=14, colour=t["muted"], family=SANS)
    k.line(f, 0, 458, W, 1, t["line"])
    label(k, f, t, 48, 484, "02", "Négy cél · a 1440×900-as készlet marad a referencia")
    sc = 0.115
    yy = 526
    for j, tg in enumerate(TARGETS):
        L = layout(tg["w"], tg["h"] - CHROME)
        schematic(k, f, t, 48, yy, L, sc)
        tx = 496
        k.text(f, tg["title"], tx, yy - 2, size=20, colour=t["ink"], family=MONO)
        k.text(f, tg["who"], tx + 520, yy + 4, size=13, colour=t["muted"], family=MONO, w=376, textAlign="right")
        sc_txt = f"{tg['scale']:.1f}".replace(".", ",")
        facts = (f"fizikai {tg['phys']}  ·  skála {sc_txt}×  ·  logikai {tg['w']}×{tg['h']}  ·  "
                 f"keret {tg['w']}×{tg['h'] - CHROME}")
        k.text(f, facts, tx, yy + 34, size=13, colour=t["cyan_text"], family=MONO)
        where = {"side": "oldaloszlop", "strip": "sáv a rács alatt", "hero": "az óra mellett"}[L["place"]]
        per = []
        for d in DENSITY:
            Ld = layout(tg["w"], tg["h"] - CHROME, d)
            per.append(f"{d} {Ld['n']} × {Ld['rows']}" + (f" (/{Ld['rows_total']})" if Ld["scroll"] else ""))
        nums = (f"normál: {L['n']} oszlop × {L['rows']} sor, {L['card_w']}×{L['card_h']} px  ·  óra {L['clock']} px"
                f"  ·  teendők: {where}")
        k.text(f, nums, tx, yy + 58, size=13, colour=t["muted"], family=MONO)
        k.text(f, "oszlop × látható sor:  " + "  ·  ".join(per), tx, yy + 80, size=13, colour=t["muted"],
               family=MONO)
        k.text(f, tg["rule"], tx, yy + 108, size=14, colour=t["ink"], family=SANS, w=820, lineHeight=22)
        yy += max(round((tg["h"] - CHROME) * sc), 156) + 52
        if j < len(TARGETS) - 1:
            k.line(f, 48, yy - 30, W - 96, 1, t["line"])
    k.text(f, "A vázlatok a valódi keretekkel közös számokból rajzolódnak: sáv, rács, kereső; cián: teendők "
              "és időjárás.", 48, fh - 48, size=12, colour=t["muted"], family=MONO)
    return f


def density_sheet(k, parent, t, x, y):
    """Sűrűség: the same group at 1920×1000 in the three densities, grids at 1:1."""
    Ls = {d: layout(1920, 1000, d) for d in DENSITY}
    fh = 196 + sum(L["view_h"] + 122 for L in Ls.values()) + 40
    f = k.frame(parent, "Sűrűség · sűrű, normál, tágas", x, y, W, fh, fill=t["bg"], clip=True)
    field(k, f, t, 7, 14, dots=True, h=fh)
    k.text(f, "Sűrűség", 48, 40, size=40, colour=t["ink"], family=MONO)
    k.text(f, f"Ugyanaz a csoport ({len(SITES)} oldal) a 1920×1000-es kereten, három sűrűségben, valós méretben. "
              "Az alap a normál; a sűrűben a leírás csak rámutatáskor látszik.", 48, 96, size=15,
           colour=t["muted"], family=SANS, w=980, lineHeight=24)
    k.line(f, 0, 160, W, 1, t["line"])
    what = {"sűrű": "ikon, név, cím", "normál": "ikon, név, cím, egy sor leírás",
            "tágas": "ikon, név, cím, két sor leírás, sorszám"}
    yy = 188
    for j, (d, L) in enumerate(Ls.items()):
        label(k, f, t, 48, yy, f"{j + 1:02d}", d)
        rows = f"{L['rows']} sor látszik" + (f" a {L['rows_total']}-ből, a rács görög" if L["scroll"] else "")
        k.text(f, f"{L['n']} oszlop · {rows} · kártya {L['card_w']}×{L['card_h']} px · köz {L['gap']} px · "
                  f"{what[d]}", 48, yy + 26, size=13, colour=t["muted"], family=MONO)
        gy = yy + 62
        dx, dy = 48 - L["x0"], gy - L["grid_y"]
        L2 = dict(L, x0=48, grid_y=gy, right=48 + L["main_w"],
                  rects=[(rx + dx, ry + dy, rw, rh) for rx, ry, rw, rh in L["rects"]])
        grid(k, f, t, L2)
        yy = gy + L["view_h"] + 60
        k.line(f, 48, yy - 30, W - 96, 1, t["line"])
    k.text(f, "Rögzített oszlopszám (4–12) felülírja a szabályt; a kártya ekkor legalább 140 px széles.", 48,
           fh - 48, size=12, colour=t["muted"], family=MONO)
    return f, fh


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
    out.append(("01-start-dark", main_screen(k, None, dark, "Start · sötét", 0, 0), None))
    out.append(("02-start-light", main_screen(k, None, light, "Start · világos", sx_, 0), None))
    out.append(("07-empty-group", main_screen(k, None, dark, "Üres csoport", 2 * sx_, 0, empty=True), None))
    a = main_screen(k, None, dark, "Start · keresés", 0, sy_, hover=False)
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

    def target(key, theme, x, y, suffix="", name_suffix="", density="normál"):
        t_ = tg[key]
        w, h = t_["w"], t_["h"] - CHROME
        nid = main_screen(k, None, theme, f"Start · {t_['title']}{name_suffix}", x, y, w, h, density=density)
        out.append((key + suffix, nid, t_["scale"] if t_["scale"] != 1 else None))
        return w, h

    w1, h1 = target("10-start-1920x1080", dark, 0, y3)
    w2, h2 = target("11-start-2286x1349", dark, w1 + 160, y3)
    y4 = y3 + max(h1, h2) + 160
    w3, h3 = target("12-start-2560x1360", dark, 0, y4)
    target("12-start-2560x1360", light, w3 + 160, y4, suffix="-light", name_suffix=" · világos")
    y5 = y4 + h3 + 160
    _, h5 = target("14-start-3440x1360", dark, 0, y5)
    # the other two densities on the 1920 frame
    y6 = y5 + h5 + 160
    w6, _ = target("10-start-1920x1080", dark, 0, y6, suffix="-suru", name_suffix=" · sűrű", density="sűrű")
    target("10-start-1920x1080", dark, w6 + 160, y6, suffix="-tagas", name_suffix=" · tágas", density="tágas")
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
