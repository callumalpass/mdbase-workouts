# MDBase Workouts

A workout tracking application that stores all data as markdown files with YAML frontmatter, managed by [mdbase](https://github.com/callumalpass/mdbase-spec). Users plan workouts, log sessions with per-set tracking, record quick one-off exercises, and browse their history -- all persisted as human-readable `.md` files on disk rather than in a traditional database.

This project is an implementation of [mdbase-spec](https://github.com/callumalpass/mdbase-spec).

## Repository purpose

- Provide a working app that stores and queries workout data from markdown files with YAML frontmatter.
- Exercise spec-defined concepts in code: collection config, type definitions, validation, queries, links, and CRUD operations.
- Serve as an implementation example, not the normative spec.

## Architecture

The app has three layers:

- **Frontend** (`src/`): A single-page React application built with Vite, TypeScript, and Tailwind CSS. It communicates with the backend exclusively through JSON API calls. The UI is a four-tab layout (Today, Calendar, History, Chat) with bottom navigation. Full-screen sheet components handle workout logging, plan creation, and quick log entry.
- **Backend API** (`server/`): A Hono server running on Node. Each resource type (exercises, sessions, plans, plan-templates, quick-logs) has its own route file exposing standard CRUD endpoints. A `/api/today` endpoint aggregates today's plans, sessions, quick logs, and available templates into a single response. The server uses `@callumalpass/mdbase` to read, write, query, and validate markdown records.
- **Data storage** (`data/`): Plain markdown files organized into folders by type. Each file has YAML frontmatter containing structured fields and an optional markdown body. Type definitions in `data/_types/*.md` declare the schema for each record type. Cross-record references use wikilink syntax (e.g. `[[exercises/bench-press]]`).

An optional chat endpoint (`POST /api/chat/message`) uses the Claude Agent SDK to stream responses over SSE. The agent runs with its working directory set to `data/` and has access to file tools (Read, Write, Edit, Glob, Grep), so it can inspect and modify the same markdown files the app uses.

In development, Vite proxies `/api` requests to the backend. In production, the backend serves the built frontend assets from `dist/`.

## Why `mdbase` works well with Claude tooling

- `mdbase` gives the app a typed API (`query`, `read`, `create`, `update`, `delete`) over plain markdown files, so backend code can enforce structure without moving data into a separate database.
- The same records remain directly readable as files (`data/**/*.md`), which means Claude Code can inspect and edit them with normal file tools.
- In `server/routes/chat.ts`, Claude Agent SDK runs with `cwd` set to `data/` and file-oriented tools enabled (`Read`, `Write`, `Edit`, `Glob`, `Grep`), so chat operations happen against the same source-of-truth files used by the app.
- Type definitions in `data/_types/*.md` keep the collection shape explicit for both programmatic access (`mdbase`) and agent/file-based workflows.

## Frontend features

The UI is organized into four tabs, plus several sheet overlays for data entry.

### Today tab

![Today tab mobile screenshot](docs/screenshots/mobile-today.png)

The landing screen for daily use. It shows four sections:

- **Templates**: A collapsible list of reusable workout blueprints (plan templates). Each template card displays its title, exercises with target sets/reps/weight, and a "Start" button that opens the session logger directly -- no scheduling step required.
- **Planned**: Today's workout plans, filtered by date. Each plan card shows its title, status (scheduled / completed / skipped), and exercise list with targets. A "Start Workout" button opens the session logger pre-filled from the plan. A "+ New" button opens the plan creator sheet, where the user picks exercises from the library, sets targets, and assigns a date.
- **Completed**: Sessions logged today, showing the time, duration, exercises performed, and sets (formatted as weight x reps).
- **Quick Logs**: Individual exercise entries logged today outside of a full session, showing the exercise name, set data, and timestamp.

A floating action button (+) in the bottom-right corner opens the **quick log sheet**. This is a bottom sheet where the user picks an exercise (with a search field and recently-used list), enters a single set of data (weight/reps/duration/distance depending on the exercise's tracking type), and taps "Log". Weight and reps are pre-filled from the last-used values stored in localStorage.

### Calendar tab

![Calendar tab mobile screenshot](docs/screenshots/mobile-calendar.png)

A month-view calendar for browsing workout history across dates. Each day cell shows colored dot indicators: blue for plans, green for sessions, and pink for quick logs. Users navigate between months with Prev/Next buttons.

Selecting a day displays that date's plans, sessions, and quick logs in a detail panel below the grid. Plans on the selected day can be started directly from the calendar, opening the session logger.

### History tab

![History tab mobile screenshot](docs/screenshots/mobile-history.png)

A two-panel view toggled between "sessions" and "exercises":

- **Sessions view**: A reverse-chronological list of all logged sessions, loaded in pages with a "Load more" button for pagination. Each session card shows the date, duration, exercises, and set details.
- **Exercises view**: A searchable list of all exercise definitions. Typing in the search field filters exercises by name. Selecting an exercise opens the **exercise detail view**, which contains:
  - The exercise name, equipment type, tracking mode, and muscle groups.
  - A **stats panel** with computed values that vary by tracking type: for weight_reps exercises this includes PR weight, best set, total volume, and average sets per session; for reps_only it shows max reps and total reps; for timed exercises it shows longest and total duration; for distance exercises it shows longest and total distance. All stats also show total entries and first/last logged dates.
  - An **edit form** for updating the exercise name, equipment, tracking type, and muscle groups.
  - A **history timeline** listing every session and quick log entry for that exercise, in reverse chronological order, with set data and source type (session or quick log).

### Session logger

A full-screen overlay used to record a workout. It opens from a plan card ("Start Workout") or a template card ("Start"). The logger provides:

- A running elapsed timer displayed in the header.
- A progress bar showing completed sets out of total sets across all exercises.
- Tabbed navigation across exercises, with color-coded tab states: default (not started), partial (some sets done), and complete (all sets done).
- Per-exercise set rows with input fields adapted to the exercise's tracking type: weight + reps for `weight_reps`, reps only for `reps_only`, seconds for `timed`, or kilometers for `distance`. Each set has a done/check button.
- Buttons to add or remove sets beyond the target count.
- Weight and reps inputs pre-fill from the plan/template targets, falling back to the last-used values from localStorage.
- A "Finish" screen that shows a summary (total sets completed, elapsed time), and allows the user to optionally override the duration, assign a 1-5 rating, and add notes before saving.

### Chat tab

![Chat tab mobile screenshot](docs/screenshots/mobile-chat.png)

A conversational interface connected to a Claude agent. The user types a message and receives a streamed response rendered as markdown (with GitHub Flavored Markdown and line break support). While the agent works, tool-use indicators appear (e.g. "Using Read...") to show what file operations are happening.

Chat history is persisted locally and tied to a session ID returned by the server. The user can clear the conversation to start a new session. The agent has read and write access to all files in `data/`, so it can answer questions about workout history, create plans, look up exercises, and perform other data operations.

## Data layout

Collection root: `data/`

- Config: `data/mdbase.yaml`
- Type definitions: `data/_types/*.md`
- Records:
  - `data/exercises/*.md`
  - `data/plans/*.md`
  - `data/plan-templates/*.md`
  - `data/sessions/*.md`
  - `data/quick-logs/*.md`

### Record types

There are five record types, each stored in its own folder:

- **exercise** (`exercises/`): Defines what an exercise is and how it is tracked. Fields include `name`, `muscle_groups` (list of strings like "chest", "quads"), `equipment` (one of barbell, dumbbell, bodyweight, cable, machine, kettlebell, band, none), and `tracking` (one of `weight_reps`, `reps_only`, `timed`, `distance`). The tracking type determines which set fields are relevant when logging -- for example, a `weight_reps` exercise uses weight and reps, while a `timed` exercise uses duration_seconds. Exercises are referenced by plans, templates, sessions, and quick logs via wikilinks.

- **plan** (`plans/`): A scheduled workout for a specific date. Fields include `date` (the date the workout is planned for, not when the file was created), `title`, `status` (`scheduled`, `completed`, or `skipped`), an ordered list of `exercises` with optional `target_sets`, `target_reps`, and `target_weight`, and a `session` link that points to the session record created when the plan is executed. Plans appear on the Today tab if their date matches today, and on the Calendar tab for their respective date.

- **plan-template** (`plan-templates/`): A reusable workout blueprint without a date. Same exercise list structure as a plan, but `target_reps` is a string (allowing values like "8", "10-12", or "AMRAP") rather than a number. Templates appear in a collapsible section on the Today tab and can be started directly into the session logger without creating an intermediate plan. Sessions logged from templates are standalone (no plan link).

- **session** (`sessions/`): A completed workout recording what was actually performed. Fields include `date` (ISO datetime of when the session took place), a list of `exercises` each containing an ordered list of `sets` with actual `reps`, `weight`, `duration_seconds`, and/or `distance` values, plus optional `duration_minutes`, `rating` (1-5), `notes`, and a `plan` link if the session originated from a plan. Session filenames use the format `YYYYMMDDTHHmmss.md`.

- **quick-log** (`quick-logs/`): A single-exercise log entry for recording one-off sets outside of a structured session. Fields include `exercise` (link), `reps`, `weight`, `duration_seconds`, `distance`, `logged_at` (ISO timestamp), and `notes`. Filenames use the same `YYYYMMDDTHHmmss.md` format.

### Cross-record references

Records reference each other using wikilink syntax, for example `[[exercises/bench-press]]`. A plan's exercise list contains links to exercise definitions, and a session's `plan` field links back to the plan it was based on.

## API

Base path: `/api`

- `GET /api/health`
- `GET /api/exercises`
- `GET /api/exercises/:slug`
- `POST /api/exercises`
- `PUT /api/exercises/:slug`
- `DELETE /api/exercises/:slug`
- `GET /api/exercises/:slug/history`
- `GET /api/sessions?limit=&offset=`
- `GET /api/sessions/:id`
- `POST /api/sessions`
- `PUT /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `GET /api/plans?status=`
- `GET /api/plans/:id`
- `POST /api/plans`
- `PUT /api/plans/:id`
- `DELETE /api/plans/:id`
- `GET /api/plan-templates`
- `GET /api/plan-templates/:id`
- `POST /api/plan-templates`
- `PUT /api/plan-templates/:id`
- `DELETE /api/plan-templates/:id`
- `GET /api/quick-logs?limit=`
- `POST /api/quick-logs`
- `GET /api/today`
- `POST /api/chat/message` (SSE)

## Requirements

- Node.js 18+
- npm
- Optional for chat endpoint: Anthropic API key in environment

## Setup

Install dependencies:

```bash
npm install
```

Run frontend + backend in dev mode:

```bash
npm run dev
```

Default local endpoints:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3002`

Vite proxies `/api` requests to the backend.

## Seed data

Populate starter exercises (skips files that already exist):

```bash
npm run seed
```

## Tests

Run tests once:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Run Playwright end-to-end tests:

```bash
npm run test:e2e
```

Current e2e coverage (`tests/app.e2e.spec.ts`):
- tab navigation (today, calendar, history, chat)
- quick log flow (create + payload assertion)
- plan creation flow (exercise selection + payload assertion)
- session logger flow (set completion + metadata + payload assertion)
- history pagination and exercise filtering
- calendar loading and chat streaming flow (including clear/reset)

Regenerate mobile screenshots:

```bash
npm run screenshots
```

## Production run

Build and start:

```bash
./start.sh
```

Equivalent commands:

```bash
npm run build
npm start
```

In production (`NODE_ENV=production`), the backend serves static files from `dist/`.

## Scripts

- `npm run dev` - start frontend and backend concurrently
- `npm run dev:fe` - start frontend only
- `npm run dev:be` - start backend only
- `npm run build` - build frontend assets
- `npm test` - run Vitest
- `npm run test:watch` - run Vitest in watch mode
- `npm run test:e2e` - run Playwright tests
- `npm run screenshots` - capture mobile screenshots to `docs/screenshots/`
- `npm run seed` - seed exercise markdown records
- `npm start` - start backend in production mode

## Scope note

This repository is an application-level POC. `../mdbase-spec` remains the source of truth for normative behavior and conformance definitions.
