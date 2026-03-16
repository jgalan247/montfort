# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Political campaign website for Monty Tadier, Deputy for St Brelade in Jersey's 2026 election. Single-page static site with no build system or framework.

## Architecture

- **`index.html`** — The entire site: HTML structure, inline `<style>` block (~870 lines of CSS), inline `<script>` block with intersection-observer animations and chat widget logic. All CSS and JS are self-contained in this file.
- **`styles.css`** — Duplicate/external version of the same CSS (kept in sync with the inline styles in `index.html`). The inline styles in `index.html` take precedence at runtime.
- **`worker.js`** — Cloudflare Worker that powers the campaign survey chatbot. Uses a 3-tier response system: (1) abuse/off-topic regex filter, (2) pattern-matched response bank keyed by survey step, (3) Claude Haiku fallback via Anthropic API. Deployed separately to Cloudflare Workers with `ANTHROPIC_API_KEY` as an environment variable.
- **`img/`** — Static images (candidate photo, banner, St Brelade/St Aubin images, logo SVG).

## Chat Survey Flow

The chat widget in `index.html` walks users through a 6-step survey (age group → top concern → housing rating → improvement suggestion → government listening → email opt-in). The client sends the full message history to the worker's `POST /chat` endpoint. The worker determines the current step by counting assistant messages, tries pattern-matching first, and falls back to Haiku only when needed.

## Development

No build step, package manager, or test suite. Open `index.html` directly in a browser or serve with any static file server. The worker can be tested with `wrangler dev` if the Cloudflare CLI is installed.

## Key Design Conventions

- **Color palette** defined via CSS custom properties on `:root` — navy blues (`--blue-deep`, `--blue-mid`, `--blue-bright`), gold accent (`--gold`), cream/silver neutrals.
- **Typography**: `Cormorant Garamond` (serif, headings) + `Outfit` (sans-serif, body), loaded from Google Fonts.
- **Layout**: CSS Grid and Flexbox throughout; responsive breakpoints at 960px and 600px.
- **Animations**: CSS keyframe animations (`fadeUp`, `pulse`, `bounce`, `msgIn`) with intersection observer triggering in JS.
