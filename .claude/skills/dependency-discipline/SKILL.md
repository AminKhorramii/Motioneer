---
name: dependency-discipline
description: What Wall is allowed to depend on, and why a shipped page is a single file with no requests. Use before adding a package, a font, a CDN link, a runtime asset, or anything that makes a network call at page load.
---

# What Wall depends on

Wall has no runtime dependencies. `package.json` lists devDependencies only, and
`server/index.mjs` is one file with no dependencies at all. That is a property worth checking
before it is lost, because the first runtime dependency is the expensive one and every one after
it is easy.

## The promises being kept

**A shipped page is one file.** Inlined CSS, no framework, no runtime of Wall's, no requests.
Model authored CSS runs inside a sandboxed iframe and `safeCss()` still strips imports and
remote urls, because the promise that a shipped page is one file is worth more than the
flexibility of letting a model reach for a font.

**Fonts are bundled, not fetched.** Inter Variable ships with the app so it works offline and
loads nothing from a third party. A CDN font is a request, a tracking surface, and a flash of
unstyled text, in exchange for a few kilobytes.

**One binary for every shell.** Real compute lives in `crates/wall-image`, compiled to wasm and
inlined, so the desktop app, the web build and a served deployment run the same code rather than
three implementations that drift.

**Drawn beats generated.** Backdrops are drawn from the taste sheet at about 2KB inside the
page. A generated image costs roughly a megabyte and is the fastest way to look like every other
page, which is why drawn is the default and generated is opt in.

## Before adding a package

Answer these in the commit message or the code comment, because a dependency nobody can justify
later is a dependency nobody dares remove:

1. Does it run at build time or at run time? Build time is cheap and reversible. Run time enters
   the shipped artefact and the security surface of every user.
2. What does it weigh in the bundle, and what does it pull in transitively?
3. What would writing the part you need cost? Wall's SSE parsing, static server, and JSON walk
   are all hand written because each is tens of lines and a library for it is a dependency plus
   an API to learn plus a version to track.
4. Does it work in all three shells, including the desktop webview and the headless core with no
   DOM?
5. What happens when it is unmaintained in two years?

If the honest answer to 3 is that the library is doing something genuinely hard, take it. That
is what `playwright`, `vite`, `typescript` and the Tauri plugins are.

## Things to refuse outright

- A CDN link, a remote font, or a remote stylesheet anywhere in a shipped page, because it
  breaks the one file promise and makes an offline page fail silently.
- A second copy of a vendor request shape outside `shared/providers.mjs`, because two copies
  drift and disagree in production only.
- A polyfill for a platform Wall does not target. `engines` says Node 20 and up, and the browser
  target is whatever the webview and Vite agree on.
- A dependency added to make one test easier. Suites drive the real app through `harness.mjs`,
  and a test only dependency that shapes the app's code has changed the app to suit the test.

## When you do add one

Add it to devDependencies unless it genuinely ships, check whether `files` in `package.json`
needs to carry anything new, and run `npm run verify:update`, which asserts that the tarball npm
would build carries everything the entry points import. A missing file in the published package
is invisible locally and total in the field.
