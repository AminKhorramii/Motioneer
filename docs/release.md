# Release validation

The launch candidate is 0.3.0. Building or packing it does not publish it to npm. The registry can
continue serving an earlier release until the candidate is explicitly published.

```sh
npm ci
npm audit
npm run verify:all
npm run verify:package
npm pack
```

`prepack` builds the editor and core before making a tarball. The package verification installs the
tarball into an isolated directory with no development dependencies, exercises the CLI and MCP
handshake, starts the packaged studio, and renders a short film with the cached local renderer.
The npm file allowlist includes the editor, source capture/scoring tools, fonts and their licenses,
examples and documentation. Workspace state and credentials are excluded.

For a first-download check, run the packed CLI’s `setup` with `MOTIONEER_RENDER_CACHE` pointing at a
new temporary directory, then run `doctor --json`. This needs network access for Chromium and FFmpeg.
The regular repository verification does not download them. Validate each advertised operating
system before declaring platform support; a successful Mac run is not evidence for Linux or Windows.

After reviewing the tarball and release checks, publish the exact reviewed artifact using the
maintainer’s npm account:

```sh
npm publish ./motioneer-0.3.0.tgz --access public
```

Then check `npm view motioneer version`, and test `npx -y motioneer@0.3.0 setup --claude` in a new
project. No keys or authenticated workspace files belong in that project’s MCP entry.
