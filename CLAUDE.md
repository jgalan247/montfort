# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Political campaign website for Monty Tadier, Deputy for St Brelade in Jersey's 2026 election. Single-page static site with no build system or framework.

## Architecture

- **`index.html`** — The entire site: HTML structure, inline `<style>` block (~870 lines of CSS), and all page content. All CSS and JS are self-contained in this file.
- **`styles.css`** — Duplicate/external version of the same CSS (kept in sync with the inline styles in `index.html`). The inline styles in `index.html` take precedence at runtime.
- **`img/`** — Static images (candidate photo, St Brelade/St Aubin images).

## Development

No build step, package manager, or test suite. Open `index.html` directly in a browser or serve with any static file server.

## Key Design Conventions

- **Color palette** defined via CSS custom properties on `:root` — navy blues (`--blue-deep`, `--blue-mid`, `--blue-bright`), gold accent (`--gold`), cream/silver neutrals.
- **Typography**: `Cormorant Garamond` (serif, headings) + `Outfit` (sans-serif, body), loaded from Google Fonts.
- **Layout**: CSS Grid and Flexbox throughout; responsive breakpoints at 960px and 600px.
- **Animations**: CSS keyframe animations (`fadeUp`, `pulse`, `bounce`, `msgIn`) with intersection observer triggering in JS.

