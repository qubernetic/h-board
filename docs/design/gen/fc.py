"""A small MCP client that drives a headless FigCraft (figcraft-cli mcp) over stdio."""
import json
import os
import shutil
import subprocess

APP = "ai.storyteller.figcraft"


class FigCraftError(RuntimeError):
    pass


class FC:
    def __init__(self, workdir):
        self.workdir = workdir
        if shutil.which("flatpak"):
            argv = ["flatpak", "run", f"--filesystem={workdir}", "--command=figcraft-cli", APP, "mcp"]
        else:  # the Horde image ships figcraft-cli directly
            argv = ["figcraft-cli", "mcp"]
        self.p = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1,
        )
        self.n = 0
        self._rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                 "clientInfo": {"name": "inboxcraft-design-gen", "version": "1"}})
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _send(self, msg):
        self.p.stdin.write(json.dumps(msg) + "\n")
        self.p.stdin.flush()

    def _rpc(self, method, params):
        self.n += 1
        my = self.n
        self._send({"jsonrpc": "2.0", "id": my, "method": method, "params": params})
        while True:
            line = self.p.stdout.readline()
            if not line:
                raise FigCraftError("figcraft mcp closed")
            d = json.loads(line)
            if d.get("id") == my:
                if "error" in d:
                    raise FigCraftError(f"{method}: {d['error']}")
                return d["result"]

    def tool(self, name, args):
        r = self._rpc("tools/call", {"name": name, "arguments": args})
        texts = [c.get("text", "") for c in r.get("content", []) if c.get("type") == "text"]
        if r.get("isError"):
            raise FigCraftError(f"{name} {json.dumps(args)[:400]}: {' '.join(texts)[:800]}")
        if r.get("structuredContent") is not None:
            return r["structuredContent"]
        joined = "\n".join(texts)
        try:
            return json.loads(joined)
        except (ValueError, TypeError):
            return joined

    def cmd(self, command, **params):
        r = self.tool("run_command", {"command": command, "params": params})
        if isinstance(r, dict) and "result" in r and set(r) <= {"result", "ok", "command"}:
            return r["result"]
        return r

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(timeout=10)
        except Exception:
            self.p.kill()
