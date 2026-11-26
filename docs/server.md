# Running your own H-Board server

The server keeps one library per user, with its snapshots, in one SQLite file. The extension connects to it in its
settings; AI agents reach it through the REST API ([`api.md`](api.md)) and MCP ([`mcp.md`](mcp.md)) with agent keys.
Nothing leaves the server: it calls no third party and sends no telemetry.

The beta (`0.2.0-beta.1`) has no published image yet: you build it from this repository.

## Run it with compose

On the machine that runs it, with Docker or Podman and its compose:

```bash
git clone https://github.com/qubernetic/h-board.git && cd h-board
cp .env.example .env            # optional: to change the port or trust a proxy
docker compose up -d --build
curl -s http://127.0.0.1:8787/api/health
```

The last line answers `{"ok":true,"version":"0.2.0-beta.1"}`. `compose.yaml` builds the image from
`packages/host-server/Dockerfile` and runs it with a read-only file system, no capabilities and
`no-new-privileges`, as the unprivileged `node` user. The database lives in the volume `h-board-data`, mounted at
`/data`. The port is bound to `127.0.0.1` only: put your reverse proxy in front of it (below) to reach it from
elsewhere.

### The settings

| Setting | Where | Default | What |
|---|---|---|---|
| `HBOARD_PORT` | `.env` | `8787` | The port on `127.0.0.1` of the host where the server answers. |
| `HBOARD_TRUST_PROXY` | `.env` | `0` | `1` behind exactly one reverse proxy of your own (below). |
| `HBOARD_DATA_DIR` | the image | `/data` | The folder of the database file `h-board.sqlite`. Change it only when you run the server without the image. |

There are no secrets in `.env`: the setup code, the passwords, the session tokens and the agent keys are never set
in a file, and the server keeps only their hashes.

## The setup code

At a start with no account the server writes a one-time setup code to its log:

```bash
docker compose logs h-board | grep 'setup code'
# setup code: 7K3M-Q9TB-... (it makes the first account, an admin, and works once)
```

It is the only secret the server ever logs. Each start before the first account writes a new one, and the old one
stops working. Then, in the extension:

1. Open the settings (the toolbar button), Server, and choose `server`.
2. Enter the server's address, for example `https://board.example.net`. The browser asks you to allow that one
   server.
3. Choose the first sign-in, and enter the setup code, your name and a password of at least 10 characters. You are
   the admin.

The extension offers to send this browser's library to the empty server. As the admin you add the other users in the
same section; each gets a temporary password, shown once, that signs in once and must be replaced. A reset by the
admin signs the user out everywhere and revokes their agent keys: it is the way to take back an account whose token
or key has leaked.

## TLS through a reverse proxy

The server speaks plain HTTP and is meant to sit behind a reverse proxy that does TLS. The extension accepts
`https://` addresses, and `http://` only for `localhost`, `127.0.0.1` and `[::1]`.

Behind a proxy, set `HBOARD_TRUST_PROXY=1` in `.env` and start again (`docker compose up -d`), so that the slow-down
of failed sign-ins counts the caller's address and not the proxy's. The server then reads the caller's address from
the last entry of `X-Forwarded-For`. This is safe only when:

- exactly one proxy sits in front of the server,
- that proxy appends the caller's address to `X-Forwarded-For`, and
- the server's port is reachable only through it (the compose file binds it to `127.0.0.1`).

Otherwise a caller can name any address. Leave it `0` when nothing sits in front.

The event stream (`/api/events`) sends a heartbeat every 15 seconds; the proxy must not buffer it and must not close
it sooner.

Caddy gets and renews the certificate itself, and appends `X-Forwarded-For`:

```text
board.example.net {
    reverse_proxy 127.0.0.1:8787
}
```

nginx, with a certificate you already have:

```nginx
server {
    listen 443 ssl;
    server_name board.example.net;
    ssl_certificate     /etc/ssl/board.example.net/fullchain.pem;
    ssl_certificate_key /etc/ssl/board.example.net/privkey.pem;
    client_max_body_size 11m;    # room for a library file sent with library.import

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;     # for the event stream
        proxy_read_timeout 1h;
    }
}
```

The server may live under a path of the proxy, for example `location /h-board/ { proxy_pass http://127.0.0.1:8787/; }`
in nginx: the extension's address is then `https://example.net/h-board`, and MCP is at `https://example.net/h-board/mcp`.

## Backup

Everything is in the volume: `h-board.sqlite`, and while the server runs its `-wal` and `-shm` files. Back up both the
library and the accounts with one of these.

While it runs, with SQLite's own backup, which gives a consistent copy:

```bash
docker compose exec h-board node -e "new (require('better-sqlite3'))('/data/h-board.sqlite', { readonly: true }).backup('/data/backup.sqlite').then(() => console.log('done'))"
docker compose cp h-board:/data/backup.sqlite ./h-board-$(date +%F).sqlite
docker compose exec h-board rm /data/backup.sqlite
```

Or stopped, as a copy of the whole volume:

```bash
docker compose stop h-board
docker compose run --rm --no-deps -T --entrypoint tar h-board -C /data -czf - . > h-board-data-$(date +%F).tgz
docker compose start h-board
```

To restore a copy made while it ran, stop the server, put the copy in place as `h-board.sqlite` with no `-wal` and
`-shm` beside it, and start it again:

```bash
docker compose stop h-board
docker compose run --rm --no-deps -T --entrypoint sh h-board \
  -c 'cat > /data/h-board.sqlite && rm -f /data/h-board.sqlite-wal /data/h-board.sqlite-shm' < h-board-2026-11-26.sqlite
docker compose start h-board
```

A backup holds password, token and key hashes, and every user's library: keep it as private as the server.

Every user also has the library's own history: up to 20 recent snapshots and one a day for 7 days, restored from the
extension (`v`). Export in the settings saves one library as a JSON file.

## A newer version

Back up first, then:

```bash
git pull
docker compose up -d --build
```

The server moves the database to the newest schema at its start; a database of a newer version than the server is
not opened.

## Without a container

With Node 22.13 or newer, from a clone of this repository:

```bash
npm ci
npm run build --workspace @h-board/host-server
HBOARD_DATA_DIR=./data PORT=8787 node packages/host-server/dist/main.js
```

`PORT` is the port the server listens on (8787 when left out); it listens on every address, so keep it behind a
firewall or the proxy.
