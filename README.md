# InternRadar

India-focused internship and fresher-job search backed by the existing Supabase company directory. Company records are not vacancy records; job results appear only after an official source has been verified and successfully synchronized.

## Architecture

```text
React + Vite search UI
        ├── Supabase directory reads, 50 companies per page
        └── Search/filter URL state
        │ same-origin JSON REST
Express API
        ├── Bounded verified-job search (Supabase RPC)
        ├── Admin-only career-source verification and configuration
        ├── Greenhouse / Lever / Ashby public feed connectors
        ├── Opt-in due-source scheduler, backoff, deduplication and closure detection
        └── Existing company-management and MongoDB monitoring APIs
```

The existing repository is a React/Vite/Express application, so the redesign extends that architecture. It does not replace the existing database or management APIs. The 12,000+ Supabase companies are queried using server-side ranges and filters; the browser never loads the entire directory. The old MongoDB company-monitoring API remains available and is separate from the verified Supabase jobs flow.

## Project layout

```text
src/main.jsx          Search UI, company directory, source setup, saved jobs
src/search.css        Responsive search experience
src/supabase.js       Read-only browser Supabase client
server/index.js       REST APIs and source scheduler
server/job-search.js  Bounded, parameterized Supabase job search
server/verified-monitor.js  ATS verification and incremental job synchronization
shared/jobs.js        Feed connectors, qualification, and URL validation
supabase/migrations/  Additive verified-jobs schema and search RPC
tests/                Connector and verified synchronization tests
```

## Directory and verified listings

- `public.companies` remains the company directory. The **Companies → Directory** view reads only 50 rows at a time and supports name/country filtering.
- Apply `supabase/migrations/20261120200000_verified_jobs_search.sql` to add `company_sources`, `jobs`, `monitoring_logs`, indexes, RLS policies, and the bounded search RPC.
- Verified sources are separate from the directory. **Companies → Feed status** requires server-side Supabase service-role access and an admin token; adding a source tests its official ATS feed but leaves monitoring disabled.
- Enable monitoring explicitly for an already-tested source. The scheduler checks due sources every 15 seconds, but external feed polling follows each source's configured interval, bounded concurrency, and exponential retry backoff.
- The worker upserts by `(source_id, external_job_id)`, records new/updated/closed events, and only marks a job verified when its application URL is job-specific and on the source's official ATS host.
- Supabase job search returns at most 50 rows per request and only listings verified within the previous seven days. Until the migration is applied and an admin configures a source, search results are empty or show a clear setup error; no sample jobs are injected.
- Existing MongoDB persistence and company monitoring remain separate and unchanged. Set `MONGODB_URI` to retain that legacy data; without it the old API runs in memory.

## Run locally

Requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317. Use **Companies → Feed status** to associate a company from Supabase with an official ATS board:

- Greenhouse: `https://boards.greenhouse.io/<board>`
- Lever: `https://jobs.lever.co/<company>`
- Ashby: `https://jobs.ashbyhq.com/<board>`
- SmartRecruiters: `https://careers.smartrecruiters.com/<company>`

The provider, board ID, and HTTPS career URL must match. Only Greenhouse, Lever, and Ashby are supported by the verified Supabase jobs flow. Creating and testing a source does not turn on monitoring. The existing MongoDB company admin continues to support CSV import; Excel files are not currently supported there.

### Admin access

For local development, write access is available without a token. Before production, configure a strong `ADMIN_TOKEN`; production write endpoints refuse to run without it. Enter the same token in **Manage companies**. Do not commit credentials.

Copy `.env.example` to `.env` and run `node --env-file=.env server/index.js`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for read-only directory access. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` for admin source configuration and synchronization. Never add the service-role key to a `VITE_*` variable or expose it to the browser. Configure `ADMIN_TOKEN` before production use.

## Connector and eligibility limits

- The verified jobs flow supports Greenhouse, Lever, and Ashby public feeds. The legacy MongoDB monitor still has a separate SmartRecruiters adapter.
- Workday and generic career pages are explicitly **Not supported**; this app does not scrape them.
- Collection is restricted to technical internship titles and titles/descriptions with graduate, junior, associate, trainee, or entry-level indicators. Listings with explicit 3+ years requirements and senior/lead/manager roles are excluded. This conservative text qualification can miss roles; verify requirements on the employer's listing.
- Salary, stipend, eligibility, graduation years, duration, and deadlines are not fabricated. Unknown data stays null and the UI shows “Not specified” where appropriate.
- Provider timestamps are not guaranteed to be the original posting date. The app does not submit applications.
- Search results are loaded on demand and refreshed in the background every 15 seconds while the page is visible, without reloading the page. The source scheduler checks which feeds are due every 15 seconds; it does not request every ATS feed at that interval.

## Verify and build

```sh
npm test
npm run build
```
