# InternRadar

An internship search portal built for students. Search real company career feeds, filter by role and country, save opportunities, read job descriptions, and open the official application page.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317. No API key is needed for the five public company feeds.

### Enable MongoDB persistence

The Express server works immediately with temporary memory storage. To persist its collected listings across restarts, provide your own MongoDB database connection in a local `.env` file (never commit it):

```sh
cp .env.example .env
# Edit MONGODB_URI in .env to your database connection.
node --env-file=.env server/index.js
```

MongoDB has not been provisioned or connected automatically. Bookmarks are browser-local, not user-account data.

## Stack and layout

- `src/main.jsx`: React interface, search, filters, pagination, bookmarks, detail dialog.
- `src/styles.css`: responsive interface and mobile layouts.
- `shared/jobs.js`: source registry, feed adapters, normalization, safe application links.
- `server/index.js`: Node.js + Express API, 15-minute background refresh, optional MongoDB snapshot persistence.
- `server/worker.js`: Sites hosting adapter using an edge cache instead of MongoDB.
- `scripts/build.mjs`: builds the React frontend and a self-contained Sites Worker.
- `tests/jobs.test.js`: tests for internship detection, source failures, closures, country parsing, and safe links.

## Current coverage

Five verified Greenhouse company boards: Stripe, Figma, Databricks, Cloudflare, and Verkada. The interface displays the current collected count and source health. This is not an exhaustive worldwide index. Internships are selected by internship terms in titles; title conventions can cause omissions. Country and role filters are conservative rules inferred from listing text, not employer-verified metadata. Unknown eligibility and deadlines are not invented.

## Refresh and freshness

- **Express backend:** refreshes every 15 minutes while the Node process remains running, even with no visitors. MongoDB stores the last snapshot if configured.
- **Hosted Sites version:** refreshes on a visit when its feed snapshot is older than 15 minutes. The page also checks every 15 minutes while open. This adapter does not run an unattended background schedule.
- Failed feeds retain previously known records with a stale indicator. Listings are removed only after their source successfully returns a new snapshot without them.
- “Source updated” is the employer feed update timestamp, not necessarily the original publication date.
- Apply links open employer-provided URLs. No application is submitted by InternRadar.

## Verify and build

```sh
npm test
npm run build
```

The production build generates `dist/client` (for Express) and `dist/server/index.js` (for Sites). The hosted Site is owner-private by default. The Site project ID is saved in `.openai/hosting.json`.

## Suggested learning order

1. Follow the React search form and filters.
2. Trace `/api/jobs` through Express to the shared collector.
3. Add a small feature yourself, such as a company filter.
4. Connect MongoDB and inspect the stored feed snapshot.
5. Add tests before integrating another career platform.

## Next milestones

Expand the source registry; add Lever/Ashby adapters; connect persistent production MongoDB; deploy Express to an always-running host; add user accounts and saved-search alerts. AI matching can come after reliable collection and search.
