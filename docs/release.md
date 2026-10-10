# Release validation

The launch candidate is 0.5.0. Building or packing it does not publish it to npm. The registry
keeps serving the earlier release until the candidate is explicitly published.

## Versions

Four files name the version, and the Claude Code plugin starts the package at exactly the version it
pins, so a release moves all four together:
- `package.json`
- `plugin/.claude-plugin/plugin.json`
- the `motioneer@<version>` argument in `plugin/.mcp.json`
- the plugin entry in `.claude-plugin/marketplace.json`

`verify/launch.mjs` fails when they disagree.

## Checks

```sh
npm ci
npm audit
npm run verify:all
npm run verify:editor
node verify/film.mjs
npm run verify:package
claude plugin validate --strict plugin
claude plugin validate --strict .
npm pack
```

`prepack` builds the editor and core before making a tarball. The package verification does
several things:
- installs the tarball into an isolated directory with no development dependencies
- exercises the CLI and the MCP handshake
- starts the packaged studio
- renders a short film with the cached local renderer

The npm file allowlist includes the editor, source capture and scoring tools, fonts and their
licences, examples, documentation and the plugin. Workspace state and credentials are excluded.

## The plugin, before publishing

Load the plugin into a session from a directory, with its MCP entry pointed at the packed tarball.
Run this in a project outside this repository, so the repository's own `.mcp.json` stays out of
it:

```sh
cp -R plugin /tmp/plugin-check
# in /tmp/plugin-check/.mcp.json: "args": ["-y", "--package=/abs/path/motioneer-0.5.0.tgz", "motioneer", "mcp"]
cd /tmp/some-project
claude -p "/motioneer:look http://127.0.0.1:PORT" --plugin-dir /tmp/plugin-check --output-format stream-json --verbose
```

Read the stream:
- The init event should list `plugin:motioneer:motioneer` as connected and the four
  `motioneer:` commands.
- The command should call `mcp__plugin_motioneer_motioneer__look` without a permission prompt.

## Publishing

For a first-download check, run the packed CLI's `setup` with `MOTIONEER_RENDER_CACHE` pointing at a
new temporary directory, then run `doctor --json`. This needs network access for Chromium and FFmpeg.
The regular repository verification does not download them. Validate each advertised operating
system before declaring platform support; a successful Mac run is not evidence for Linux or Windows.

After reviewing the tarball and release checks, publish the exact reviewed artifact using the
maintainer's npm account:

```sh
npm publish ./motioneer-0.5.0.tgz --access public
```

Then check `npm view motioneer version`. Test `npx -y motioneer@0.5.0 setup --claude` in a new
project; no keys or authenticated workspace files belong in that project's MCP entry. Then test the
plugin from the marketplace:

```text
/plugin marketplace add AminKhorramii/Motioneer
/plugin install motioneer@motioneer
```
