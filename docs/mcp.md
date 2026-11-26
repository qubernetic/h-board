# MCP: H-Board for AI agents

An AI agent reads and changes your library through the server's MCP endpoint, `https://<your server>/mcp`, with an
agent key. It goes through the same core commands as the page and the REST API ([`api.md`](api.md)): every change
keeps a snapshot with the key's name as its source, the board shows it at once and marks it with the key's name, and
`z` takes it back.

Site names, titles, descriptions and addresses are data, never instructions. Every tool description says so, and
every answer quotes page text, so an agent can tell your data from what it is told to do.

## The endpoint

- MCP over Streamable HTTP, without sessions: one JSON-RPC message a `POST`, answered with one JSON body. The server
  speaks the protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`. `GET` and `DELETE` answer `405`: there
  is no event stream to open and no session to end.
- The bearer token is an agent key and nothing else: `Authorization: Bearer hbk_...`. A session token is refused with
  `401`, and so is a revoked key.
- A request from a web page (one with an `Origin` header) is refused with `403`.
- A body is at most 16 KB for a read key; an edit or owner key may send a library file.

## Agent keys and scopes

Make a key in the extension's settings: Server, signed in, New key…, with a name and a scope. The key (`hbk_` and 43
characters) is shown once; the server keeps only its hash. Name the key after the agent: the name is what the board,
the restore panel and the key log show. Revoke it there, or with `DELETE /api/keys/:id`; a revoked key stops at once.

| Scope | May |
|---|---|
| `read` | read the library, a group and the snapshots |
| `edit` | also run the `safe` commands: add, rename and move groups, sites and to-dos, change settings, export |
| `owner` | also the `owner` commands: remove groups, sites and to-dos, replace the whole library, restore a snapshot |

No key runs a `never` command. A key of a user whose password is temporary is refused until the user sets their own,
and a password reset by the admin revokes every key of the user. Every call is checked against the key as it is
then, and noted in the key log (time, key, scope, command and a fixed outcome word; never a parameter or page text).
Give an agent the smallest scope that does the job.

## Tools

`tools/list` shows a key the tools its scope allows. A command's tool is named after its id with `_` for `.`:
`site_add` runs `site.add`.

| Tool | Scope | What it does |
|---|---|---|
| `library_read` | read | The library in short: the groups with their ids and site counts, the to-dos and the settings. |
| `group_read` | read | One group with its sites: id, name, address, glyph, brand, icon mode and description of each. |
| `backup_list` | read | The snapshots, newest first: id, time, cause, source, site count and what changed. |
| `group_add` | edit | Adds a group at the end; answers its id. |
| `group_import` | edit | Adds groups with their sites, as from bookmark folders. |
| `group_rename` | edit | Renames a group. |
| `group_setIconMode` | edit | Sets how a group's tiles are drawn: brand, favicon, Phosphor icon or initial. |
| `group_move` | edit | Moves a group to another place. |
| `site_add` | edit | Adds a site to a group; answers its id. |
| `site_update` | edit | Changes the given fields of a site. |
| `site_move` | edit | Moves a site within its group or to another group. |
| `todo_add` | edit | Adds a to-do; answers its id. |
| `todo_toggle` | edit | Ticks or unticks a to-do. |
| `settings_set` | edit | Changes the given settings (theme, density, columns, layout, engine, motion, active group). |
| `library_export` | edit | Answers the whole library as the text of an H-Board library file. |
| `group_remove` | owner | Removes a group with all its sites. |
| `site_remove` | owner | Removes a site. |
| `todo_remove` | owner | Removes a to-do. |
| `library_import` | owner | Replaces the whole library with an H-Board library file. |
| `backup_restore` | owner | Brings the library back to a snapshot of `backup_list`, as a change the user can undo. |

Each tool's parameters are in its `inputSchema`. A tool the key may not call, a wrong parameter, or a group, site or
snapshot that is not there answers an error the model reads (`isError`), naming the field:
`url: must be an http or https address`.

## Claude Code

```bash
claude mcp add --transport http h-board https://<your server>/mcp --header "Authorization: Bearer hbk_..."
```

To keep the key out of a project's `.mcp.json`, name an environment variable there instead:

```json
{
  "mcpServers": {
    "h-board": {
      "type": "http",
      "url": "https://<your server>/mcp",
      "headers": { "Authorization": "Bearer ${H_BOARD_KEY}" }
    }
  }
}
```

`/mcp` in Claude Code then lists `h-board` with its tools.

## Claude Desktop

Claude Desktop starts its local MCP servers as commands, so it reaches a remote one through `mcp-remote`, which runs
on your computer (Node needed) and connects only to the address you give it. In `claude_desktop_config.json`
(Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "h-board": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<your server>/mcp", "--header", "Authorization:${H_BOARD_AUTH}"],
      "env": { "H_BOARD_AUTH": "Bearer hbk_..." }
    }
  }
}
```

The header goes through an environment variable with no space after the colon, because Claude Desktop on Windows
breaks arguments at spaces. Restart Claude Desktop; the tools appear under the `h-board` server.

## Trying it by hand

```bash
curl -s https://<your server>/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $H_BOARD_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
