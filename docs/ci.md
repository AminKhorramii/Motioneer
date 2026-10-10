# Films that stay current

A screen recording goes stale with the next release. A Motioneer film is a recipe over the live
interface: a url, what to pick, the pace, the length and the person's words. Filming the recipe
again gives the same film of the product as it looks today. Every film stores its recipe in
`project.film.recipe`, so the same film can be made again from the terminal, from CI, or by an agent.

## From the terminal

```sh
npx motioneer film http://localhost:3000 --mode capture --pick "the pricing cards" --pace fast
npx motioneer refresh <projectId>
npx motioneer films motioneer.films.json --out films
```

- `film` takes the same arguments an agent passes, as flags: `--mode`, `--pick`, `--pace`,
  `--seconds`, `--direction`, `--count` and `--out`.
- `refresh` films an earlier film again from its stored recipe, as a new film that records which
  one it renews. The earlier film is kept. It needs that film's project, so it works on the machine
  that made it.
- `films` films every recipe in a file. CI starts from an empty workspace with no earlier projects,
  so a recipe file is how CI knows what to film.

Each film writes an MP4 and a live HTML film into `<out>/motioneer/`. Progress goes to stderr, and
`--json` prints the results as JSON. The run exits with 1 when any film fails, so CI marks the job.

## The recipe file

Each entry holds the arguments of one `film` call, plus an optional `name` for the report:

```json
{
  "films": [
    { "name": "pricing", "url": "http://localhost:3000/pricing", "mode": "capture", "pick": "the pricing cards and the plan toggle", "pace": "fast", "seconds": 12 },
    { "name": "launch", "url": "http://localhost:3000", "mode": "auto", "seconds": 18, "direction": "A precise 18-second launch film. Dark surfaces, real interface details, the logo last." }
  ]
}
```

Write `direction` in the words you would say to an agent, since every plan and motion reads it.

## In GitHub Actions

This films the app on every release and keeps the films as an artifact of the run:

```yaml
name: films
on:
  release:
    types: [published]
  workflow_dispatch:
jobs:
  films:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      # the app has to be running, because a film is made of its real interface
      - run: npm ci && npm run build
      - run: npm start &
      - run: npx -y wait-on http://localhost:3000
      # the renderer: Chromium and FFmpeg, downloaded once per run
      - run: npx -y motioneer@0.5.0 setup
      - run: npx -y motioneer@0.5.0 films motioneer.films.json --out films
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: films
          path: films/motioneer/
```

The studio's model calls use the `claude` command when it is installed and signed in. A runner
usually has neither, so the key in `ANTHROPIC_API_KEY` is used instead; keep it in the repository's
secrets, because a key in the workflow file is readable by anybody who can read the repository.

Validate the workflow on the operating system the runner uses before relying on it. A run that
works on a Mac does not show that the renderer installs on Linux.
