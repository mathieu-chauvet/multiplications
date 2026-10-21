# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A flashcard PWA for practicing multiplication, addition, and subtraction tables. Built with Go backend and vanilla JavaScript frontend.

## Commands

```bash
make build       # Run tests and build binary to bin/vic_multi
make air         # Run dev server with hot reload (requires air installed)
```

The server runs on port 8080. Visit http://localhost:8080 to access the app.

## Architecture

**Backend (main.go)**
- Go HTTP server using standard library
- Static files embedded via `go:embed static/*`
- Routes:
  - `/` → redirects to `/static/`
  - `/static/*` → serves embedded static files
  - `/api/flashcards` → GET flashcards for selected tables
  - `/api/update` → POST update a flashcard
  - `/api/result` → POST results to Google Sheets webhook

**Frontend (static/)**
- `index.html` - Main page with table selection and quiz UI
- `app.js` - Flashcard logic, timer, scoring, cookie-based user sessions
- PWA-enabled with service worker and manifest

**Environment Variables**
- `SHEETS_WEBHOOK_URL` - Google Apps Script webhook URL for result tracking (optional)

## Version

`const Version` in `version.go` is the only place to bump it.
`supermaths_server -version` prints it as the first token, then the commit and
its date, which Go stamps from git. The OTA support agent reads that first token
as the device's version, so bump it for every deployed build and commit before
`make build` (an uncommitted tree shows as `-dirty`). The Makefile builds the
package (`.`), not `main.go`: Go only stamps the commit for a package build.

## Code Conventions

- French language used in UI strings and some code comments
- Module name is `flashCards` (go.mod)