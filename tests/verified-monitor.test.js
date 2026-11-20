import test from 'node:test';
import assert from 'node:assert/strict';
import { isOfficialApplicationURL } from '../shared/jobs.js';
import { syncVerifiedSource, validateSourceInput } from '../server/verified-monitor.js';

test('career source setup only accepts matching official board URLs', () => {
  assert.deepEqual(
    validateSourceInput({
      provider: 'greenhouse',
      boardId: 'acme',
      careerUrl: 'https://boards.greenhouse.io/acme',
      pollIntervalMinutes: 60
    }),
    {
      provider: 'greenhouse',
      board_id: 'acme',
      career_url: 'https://boards.greenhouse.io/acme',
      poll_interval_minutes: 60
    }
  );
  assert.throws(() => validateSourceInput({
    provider: 'greenhouse',
    boardId: 'other',
    careerUrl: 'https://boards.greenhouse.io/acme'
  }), /must match/);
  assert.throws(() => validateSourceInput({
    provider: 'lever',
    boardId: 'acme',
    careerUrl: 'https://example.com/acme'
  }), /must match/);
  assert.throws(() => validateSourceInput({
    provider: 'ashby',
    boardId: 'acme',
    careerUrl: 'https://jobs.ashbyhq.com/acme',
    pollIntervalMinutes: 0
  }), /between 15 minutes/);
});

test('application links must be official and job-specific', () => {
  assert.equal(isOfficialApplicationURL('greenhouse', 'https://boards.greenhouse.io/acme'), false);
  assert.equal(isOfficialApplicationURL('greenhouse', 'https://boards.greenhouse.io/acme/jobs/123'), true);
  assert.equal(isOfficialApplicationURL('lever', 'https://jobs.lever.co/acme'), false);
  assert.equal(isOfficialApplicationURL('lever', 'https://jobs.lever.co/acme/abc-123'), true);
  assert.equal(isOfficialApplicationURL('ashby', 'https://user@jobs.ashbyhq.com/acme/abc'), false);
});

class Query {
  constructor(client, table, action = 'select', payload = null) {
    this.client = client;
    this.table = table;
    this.action = action;
    this.payload = payload;
    this.filters = {};
  }
  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  order() { return this; }
  range() { return this; }
  maybeSingle() {
    return Promise.resolve({ data: this.client.company, error: null });
  }
  upsert(rows, options) {
    this.client.upserted = rows;
    this.client.upsertOptions = options;
    return Promise.resolve({ error: null });
  }
  update(values) {
    this.payload = values;
    return this;
  }
  insert(rows) {
    this.client.logs.push(...rows);
    return Promise.resolve({ error: null });
  }
  then(resolve, reject) {
    let data = [];
    if (this.table === 'jobs' && this.action === 'select') data = this.client.previousJobs;
    if (this.table === 'jobs' && this.action === 'update') {
      this.client.closedJobs = this.payload;
    }
    if (this.table === 'company_sources' && this.action === 'update') {
      this.client.sourceUpdates.push(this.payload);
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}

function fakeClient() {
  return {
    company: { id: 7, name: 'Acme', website: 'https://acme.example', country: 'India' },
    previousJobs: [],
    upserted: [],
    logs: [],
    sourceUpdates: [],
    from(table) {
      return {
        select: () => new Query(this, table),
        upsert: (rows, options) => new Query(this, table).upsert(rows, options),
        update: (values) => {
          const query = new Query(this, table, 'update', values);
          query.eq = function (key, value) {
            this.filters[key] = value;
            if (this.table === 'jobs') this.client.closedJobs = this.payload;
            if (this.table === 'company_sources') this.client.sourceUpdates.push(this.payload);
            return Promise.resolve({ error: null });
          };
          return query;
        },
        insert: (rows) => new Query(this, table).insert(rows)
      };
    }
  };
}

test('a successful feed sync stores only verified job-specific listings and leaves monitoring unchanged', async () => {
  const client = fakeClient();
  const source = {
    id: 11,
    company_id: 7,
    provider: 'greenhouse',
    board_id: 'acme',
    career_url: 'https://boards.greenhouse.io/acme',
    poll_interval_minutes: 360,
    failure_count: 0,
    monitoring_enabled: false,
    verified_at: null
  };
  const result = await syncVerifiedSource(client, source, {
    now: '2026-11-20T12:00:00.000Z',
    fetcher: async () => new Response(JSON.stringify({
      jobs: [{
        id: 123,
        title: 'Software Engineering Intern',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/123',
        location: { name: 'Bengaluru, India' },
        content: '<p>12 week internship</p>',
        updated_at: '2026-11-19T10:00:00Z'
      }]
    }))
  });
  assert.deepEqual(result, {
    checkedAt: '2026-11-20T12:00:00.000Z',
    active: 1,
    added: 1,
    updated: 0,
    closed: 0
  });
  assert.equal(client.upserted.length, 1);
  assert.equal(client.upserted[0].is_verified, true);
  assert.equal(client.upserted[0].change_status, 'new');
  assert.equal(client.upserted[0].application_url, 'https://boards.greenhouse.io/acme/jobs/123');
  assert.equal(client.upserted[0].salary_text, null);
  assert.equal(client.upsertOptions.onConflict, 'source_id,external_job_id');
  assert.equal(source.monitoring_enabled, false);
  assert.equal(client.logs.some((entry) => entry.event_type === 'new'), true);
  assert.equal(client.sourceUpdates.at(-1).monitoring_enabled, undefined);
  assert.equal(client.sourceUpdates.at(-1).connection_status, 'connected');
});

test('a qualifying posting with a non-ATS application link fails sync without replacing listings', async () => {
  const client = fakeClient();
  await assert.rejects(
    syncVerifiedSource(client, {
      id: 11,
      company_id: 7,
      provider: 'greenhouse',
      board_id: 'acme',
      career_url: 'https://boards.greenhouse.io/acme',
      poll_interval_minutes: 360,
      failure_count: 0,
      monitoring_enabled: true
    }, {
      now: '2026-11-20T12:00:00.000Z',
      fetcher: async () => new Response(JSON.stringify({
        jobs: [{
          id: 123,
          title: 'Software Engineering Intern',
          absolute_url: 'https://careers.example/apply/123',
          location: { name: 'Bengaluru, India' }
        }]
      }))
    }),
    /job-specific official application URL/
  );
  assert.equal(client.upserted.length, 0);
  assert.equal(client.sourceUpdates.at(-1).connection_status, 'failed');
  assert.equal(client.logs.at(-1).event_type, 'failure');
});
