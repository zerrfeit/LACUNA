# LACUNA

> **Excavate what a repository forgot.**

**LACUNA is a product of [MOURNINGSTAR](https://github.com/zerrfeit/Project-MOURNINGSTAR).**

LACUNA is a read-only repository archaeology system. Give it a public GitHub repository and it reconstructs the project's surviving history as an explorable archive: major events, deleted-file fossils, contributor records, language composition, chronological playback, and direct comparisons between two commits.

## What the first release does

- Reads up to the 100 most recent commits from a public repository
- Inspects the 15 newest commits in detail
- Detects expansions, extinctions, dormant periods, and file resurrections
- Catalogues recently deleted files as **fossils**
- Displays repository age, branches, contributors, and language composition
- Replays observed commits chronologically
- Compares any two observed commits through GitHub's comparison record
- Exports a branded Markdown repository chronicle
- Never clones, executes, or modifies repository code

## Run it

LACUNA has no dependencies and no build step.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Paste a public GitHub repository URL and select **Begin Excavation**.

For the most consistent local behavior, serve the folder with any static web server. GitHub Pages works without modification.

## Publish with GitHub Pages

This repository includes a Pages workflow. In your GitHub repository, open **Settings → Pages**, choose **GitHub Actions** as the source, and push to `main`.

## Current limits

- Public repositories only
- GitHub's unauthenticated API request limit applies
- LACUNA can only inspect history that still exists on GitHub
- History that was force-purged, garbage-collected, or never pushed cannot be recovered
- Detailed fossil detection is intentionally limited to 15 recent commits in version 0.1

## Privacy and safety

LACUNA operates entirely in the browser. It requests public repository metadata directly from GitHub, does not execute analyzed code, and does not write to the source repository.

## Project identity

LACUNA is developed under **Project MOURNINGSTAR**.

**MOURNINGSTAR — SEE EVERYTHING. MISS NOTHING.**

## License

MIT © 2026 MOURNINGSTAR
