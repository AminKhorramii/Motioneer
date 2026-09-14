# Agent setup

Motioneer runs locally on Node 20+. Its model provider is separate from the agent client: Claude
Code or Codex already signed in on PATH can generate motions, and studio Settings supports API providers. A client
connecting over MCP does not itself supply model access to Motioneer.

## Claude Code project

```sh
cd /path/to/project
npx -y motioneer setup --claude
```

Setup installs the private Chromium/FFmpeg renderer and checks readiness. `--claude` merges a
version-pinned entry into `.mcp.json`, preserving other servers. A conflicting Motioneer entry or
invalid JSON is reported for review rather than overwritten. Restart Claude Code and accept the
project’s MCP server when prompted. No editor interaction is needed to make the first film.

`setup` without `--claude` or `--codex` only prepares the renderer. `setup --json` reports readiness as JSON;
installation progress goes to stderr. A configured provider can still need authentication; setup
never spends a model request to test credentials.

## Other clients and automation

```sh
npx -y motioneer mcp-config --dir /path/to/project
npx -y motioneer mcp --dir /path/to/project
npx -y motioneer doctor --dir /path/to/project --json
```

Copy the generated `motioneer` entry into the MCP client’s server configuration. It uses stdio and
pins both the package version and workspace. `MOTIONEER_WORKSPACE` lets a desktop client select the
project even when it starts the server from another directory. Diagnostics are also available as
the MCP `doctor` tool. Both film paths prepare their renderer automatically before capture.

Keep `dir` on film calls absolute so exported MP4s and storyboards arrive in the intended directory.
Automatic film starts do not open browser windows. The `studio` and `open` tools remain available
when the user wants the UI.

## Storage and ports

Projects, imported assets, model settings and session state live under the studio working
directory’s `.studio/`. The renderer is cached under `~/.cache/motioneer/renderer-1`, shared across
workspaces. Override it with `MOTIONEER_RENDER_CACHE` when provisioning an environment. The browser
and encoder are downloaded during setup or the first film, not during npm package installation.
Keep `.studio/` out of version control; it can contain model credentials and captured project data.

A running studio is reused at port 4321 by default. For independent studios, choose different
ports when connecting each project:

```sh
npx -y motioneer setup --claude --port 4322
npx -y motioneer --dir /path/to/project --port 4322 --no-open
```

The generated MCP entry retains that port. Set `MOTIONEER_PORT` for a manually configured client.
On a shared server, use separate working directories and renderer caches where accounts should
not share data. Motioneer's local studio binds to `127.0.0.1` and rejects foreign Host and Origin
headers. The bookmarklet has a write-only capture exception. Do not expose the studio through a
public tunnel or reverse proxy: it has no user authentication, and proxied pages execute in the
studio origin. Capture sites you trust. `MOTIONEER_PUBLIC` restricts proxy destinations; it does
not make the editor safe to host publicly.

## Troubleshooting

Run `npx -y motioneer doctor --json`. Each failed check includes a next step.

- Missing model: sign in to Claude Code or configure a provider in studio Settings.
- Missing renderer: run `npx -y motioneer setup`; downloads are cached and can be retried.
- Linux browser launch failure: install the system libraries named in Chromium’s error. Setup
  does not request root access or modify OS packages.
- Port occupied: stop the process you own or choose another `--port` and configure MCP to match.
- Existing MCP entry: compare it with `npx -y motioneer mcp-config` before updating it.

The package requires no repository checkout or development dependencies. See [release validation](release.md)
for the packed-artifact checks.

## Codex and ChatGPT

Install the current [Codex CLI](https://developers.openai.com/codex/cli/) and run `codex login`.
In an existing writable project directory:

```sh
npx -y motioneer setup --codex
```

This installs the renderer and creates project-scoped `.codex/config.toml`. Codex must trust the
project before loading it. Restart Codex and use `/mcp` to confirm the server. Setup never changes
`~/.codex/config.toml`; it refuses to overwrite a different existing project file. To merge with
one, print `npx -y motioneer mcp-config --codex` and add or update its two `motioneer` tables in
your existing file. Do not duplicate an existing table. Keep `tool_timeout_sec = 1200`: the
Codex default of 60 seconds is too short for capture, generation and rendering.

The generated entry pins the Motioneer package version, absolute workspace, optional `--port`,
and `MOTIONEER_PROVIDER = "codex-cli"`. To connect Claude Code too, run `setup --claude` separately.
Both clients see the same saved projects. A studio already running keeps its current provider;
select Codex in Settings or restart that studio to use the new environment default.

**Generation.** Codex is also a selectable studio provider. It runs `codex exec` in an ephemeral
temporary directory, with a read-only sandbox, user configuration excluded, and the default shell,
apps, hooks and web search disabled. It passes captured images with the prompt, reuses CLI login,
and removes temporary prompt/image/reply files after success, failure or cancellation. The
completion arrives as one final reply. It does not inherit the user's preferred model from their
Codex config: leave Model empty for Codex's built-in default, or select an accessible model explicitly.
Update Codex if it does not recognize `--ignore-user-config` or `--ephemeral`.

Saved studio model settings take precedence over client defaults. On a new workspace without an
explicit client preference, detection uses Claude Code, then Codex, then `ANTHROPIC_API_KEY`, then
`OPENAI_API_KEY`. Doctor checks availability without a model call; use Settings → Test connection
to verify authentication. The OpenAI API provider uses a separately configured API key; a ChatGPT
subscription does not supply that key.

**ChatGPT desktop.** According to the [official MCP documentation](https://developers.openai.com/codex/mcp/),
ChatGPT desktop, Codex CLI and the IDE extension share MCP configuration on the same Codex host.
Open the trusted project on that host and restart the client. Availability depends on the installed
client and workspace configuration.

**ChatGPT web.** The web client does not read local Codex configuration or start local stdio
servers. Its [developer-mode apps](https://developers.openai.com/api/docs/guides/developer-mode)
use remote MCP over streaming HTTP or SSE. Motioneer currently ships local stdio only; a hosted
ChatGPT connector is not implemented. Keep the studio on localhost. A future remote connector
needs authentication, workspace isolation and remotely accessible artifacts before this is a
supported web flow.

Codex completion behavior follows the official [noninteractive guide](https://developers.openai.com/codex/noninteractive/).
