import test from 'node:test';
import assert from 'node:assert/strict';
import { searchVerifiedJobs } from '../server/job-search.js';

test('job search clamps result windows and maps filters to the RPC', async () => {
  let called;
  const client = {
    async rpc(name, args) {
      called = { name, args };
      return { data: { total: 1, items: [{ id: 8 }] }, error: null };
    }
  };
  const result = await searchVerifiedJobs(client, {
    q: '  Software Engineer Intern  ',
    type: 'full_time',
    work_mode: 'remote',
    experience: '0-2',
    sort: 'newest',
    page: '9999999',
    limit: '5000'
  });
  assert.equal(result.page, 1_000_000);
  assert.equal(result.pageSize, 50);
  assert.deepEqual(result.items, [{ id: 8 }]);
  assert.equal(called.name, 'search_verified_jobs');
  assert.equal(called.args.p_query, 'Software Engineer Intern');
  assert.equal(called.args.p_job_type, null);
  assert.equal(called.args.p_employment_type, 'full_time');
  assert.equal(called.args.p_experience_min, 0);
  assert.equal(called.args.p_experience_max, 2);
  assert.equal(called.args.p_offset, 49_999_950);
});

test('search reports an uninitialized migration rather than returning fake jobs', async () => {
  const client = {
    async rpc() {
      return { data: null, error: { code: 'PGRST202' } };
    }
  };
  await assert.rejects(
    searchVerifiedJobs(client, {}),
    { status: 503, message: 'Verified job search is not initialized. Apply the Supabase jobs migration first.' }
  );
});
