# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server (HMR)
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run lint       # ESLint over the whole repo
```

There is no test suite configured in this project.

### Running inside Docker

This project is developed inside a Docker container (`node:latest`) with the repo bind-mounted at `/app`; Node/npm are not installed on the host. `vite.config.js` sets `server.host: true` — without it, Vite binds to the container's loopback interface only and the host machine cannot reach it through the container's port mapping, even though the port looks correctly forwarded.

## Architecture

This is a single-page marketing + internal-tools demo site for a civil engineering consultancy ("NK Consultancy"), built with Vite + React 19, no TypeScript, no backend, and no router.

**Everything lives in `src/App.jsx`** (~590 lines) as one file: design tokens, mock data, and all page components. It is organized top-to-bottom as:
1. `C` — a design-token object of hex colors (navy, orange, paper, etc.) used via inline `style={{ }}` props for brand colors, layered with Tailwind utility classes (`className`) for layout, spacing, and responsive breakpoints. This split is intentional and consistent throughout the file — brand colors go through `C`, everything else through Tailwind.
2. Mock data arrays (`SERVICES`, `EMPLOYEES`, `INITIAL_TASKS`, `INITIAL_CLIENTS`) and `*_META` lookup objects (`STATUS_META`, `PRIORITY_META`, `PAY_STATUS_META`) mapping status/priority enum values to their label/color/bg. There is no backend or API — all "persisted" state (task status, client call logs) lives in React `useState` and resets on page reload.
3. Page components, each a self-contained section of the file: `TopNav`, `Landing` (hero + services + team + footer), `WorkBoard` (kanban-style task board with drag-free move-left/move-right buttons), `Payments` (receivables tracker with call-logging).
4. `App` — the root component. Page switching (`home` / `work` / `payments`) is done via a `useState` string in `App`, **not** URL routing — there is no react-router, so browser back/forward and deep links to a specific page don't work.

**Styling pipeline**: Tailwind v4 via the `@tailwindcss/vite` plugin (configured in `vite.config.js`), entry point `src/index.css`. That file also defines the custom non-Tailwind classes used across `App.jsx` (`f-display`/`f-body`/`f-mono` font classes, `contour-bg`, `grid-bg`, `card-hover`, `no-scrollbar`) and imports the Google Fonts stylesheet. **The Google Fonts `@import` must stay above `@import "tailwindcss"`** — Tailwind's import expands into a large block of generated rules at that position, and CSS requires all `@import`s to precede any other rule, so reversing the order breaks the build.

Icons come from `lucide-react`.

## Deployment

Deployed on Vercel. `vercel.json` explicitly sets `framework: vite` and `outputDirectory: dist` — Vercel's default framework detection expected a `build` output folder and failed without this.

The GitHub remote has two branches, `main` and `master`; `main` is the default branch Vercel deploys from.
