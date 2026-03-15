# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Political campaign website for Monty Tadier, Deputy for St Brelade in Jersey's 2026 election. Single-page static site with no build system or framework.

## Architecture

- **`index.html`** — The entire site: HTML structure, inline `<style>` block (~870 lines of CSS), inline `<script>` for the AI survey chat widget, and all page content. All CSS and JS are self-contained in this file.
- **`styles.css`** — Duplicate/external version of the same CSS (kept in sync with the inline styles in `index.html`). The inline styles in `index.html` take precedence at runtime.
- **`worker.js`** — Cloudflare Worker that proxies the AI survey chat. 3-tier logic: (1) reject abuse/off-topic via regex, (2) response bank with step detection based on assistant message count, (3) Claude Haiku fallback via Anthropic API. Deployed separately to Cloudflare Workers with `ANTHROPIC_API_KEY` as an environment variable.
- **`img/`** — Static images (candidate photo, St Brelade/St Aubin images).

## Development

No build step, package manager, or test suite. Open `index.html` directly in a browser or serve with any static file server.

## Key Design Conventions

- **Color palette** defined via CSS custom properties on `:root` — navy blues (`--blue-deep`, `--blue-mid`, `--blue-bright`), gold accent (`--gold`), cream/silver neutrals.
- **Typography**: `Cormorant Garamond` (serif, headings) + `Outfit` (sans-serif, body), loaded from Google Fonts.
- **Layout**: CSS Grid and Flexbox throughout; responsive breakpoints at 960px and 600px.
- **Animations**: CSS keyframe animations (`fadeUp`, `pulse`, `bounce`, `msgIn`) with intersection observer triggering in JS.

## AI Survey Chat System

Two-part architecture:
1. **Client** (inline in `index.html`): Chat UI styled to match the navy/gold theme. Sends conversation history to the Cloudflare Worker endpoint via POST to `/chat`.
2. **Server** (`worker.js`): Cloudflare Worker with 3-tier processing — abuse/off-topic regex filter → step-based response bank (detects survey step by counting assistant messages) → Claude Haiku API fallback. The survey follows a fixed 6-step sequence: age group → biggest concern → housing rating → daily life improvement → government listening → campaign updates/email.

When modifying the chat flow, keep the client greeting and worker step numbering in sync — the worker counts assistant messages (including the client-side welcome) to determine which survey question the user is answering.
