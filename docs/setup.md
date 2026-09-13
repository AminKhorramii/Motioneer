# Agent setup

Motioneer runs locally on Node 20+. Its model provider is separate from the agent client: Claude
Code already signed in on PATH is the default, and studio Settings supports API providers. A client
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

`setup` without `--claude` only prepares the renderer. `setup --json` reports readiness as JSON;
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
