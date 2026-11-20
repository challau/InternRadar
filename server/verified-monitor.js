import { collectCompanyJobs, isOfficialApplicationURL } from '../shared/jobs.js';

const PROVIDERS = new Set(['greenhouse', 'lever', 'ashby']);
const SOURCE_HOSTS = {
  greenhouse: new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']),
  lever: new Set(['jobs.lever.co']),
  ashby: new Set(['jobs.ashbyhq.com'])
};
const JOB_FIELDS = [
  'company_name',
  'company_website',
  'title',
  'description',
  'location_text',
  'city',
  'state',
  'country',
  'job_type',
  'employment_type',
  'work_mode',
  'experience_min_years',
  'experience_max_years',
  'experience_text',
  'salary_text',
  'eligibility_text',
  'graduation_year',
  'internship_duration',
  'posted_at',
  'application_deadline',
  'application_url'
];

export function validateSourceInput(input = {}) {
  const provider = String(input.provider || '').toLowerCase();
  const boardId = String(input.boardId || '').trim();
  const careerUrl = String(input.careerUrl || '').trim();
  const interval = input.pollIntervalMinutes === undefined || input.pollIntervalMinutes === ''
    ? 360
    : Number(input.pollIntervalMinutes);
  if (!PROVIDERS.has(provider)) throw new Error('Choose Greenhouse, Lever, or Ashby.');
  if (!/^[\w.-]{1,200}$/.test(boardId)) throw new Error('A valid ATS board ID is required.');
  if (!Number.isInteger(interval) || interval < 15 || interval > 10080) {
    throw new Error('Polling interval must be between 15 minutes and 7 days.');
  }
  let url;
  try {
    url = new URL(careerUrl);
  } catch {
    throw new Error('Enter the official HTTPS career-board URL.');
  }
  const firstPathSegment = url.pathname.split('/').filter(Boolean)[0] || '';
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !SOURCE_HOSTS[provider].has(url.hostname.toLowerCase()) ||
    firstPathSegment !== boardId
  ) {
    throw new Error('The career URL must match the selected ATS provider and board ID.');
  }
  return {
    provider,
    board_id: boardId,
    career_url: url.href,
    poll_interval_minutes: interval
  };
}

function toConnectorCompany(source, company) {
  return {
    id: String(source.id),
    name: company.name,
    website: company.website || source.career_url,
    careers: source.career_url,
    ats: source.provider,
    boardId: source.board_id,
    pollingMinutes: source.poll_interval_minutes,
    country: company.country || 'Not specified'
  };
}

function validDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function scalarText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text && text !== 'Not specified' ? text : null;
}

function experienceFrom(description) {
  const range = description.match(/\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:years?|yrs?)\b/i);
  if (range) {
    return {
      text: range[0],
      min: Number(range[1]),
      max: Number(range[2])
    };
  }
  const minimum = description.match(/\b(\d+)\s*\+\s*(?:years?|yrs?)\b/i);
  if (minimum) {
    return {
      text: minimum[0],
      min: Number(minimum[1]),
      max: null
    };
  }
  return { text: null, min: null, max: null };
}

function graduationYearFrom(description) {
  const match = description.match(/\b(?:graduat(?:e|ing|ion)(?:\s+in|\s+year)?|class\s+of)\s*(20\d{2})\b/i);
  return match ? Number(match[1]) : null;
}

function databaseJob(source, company, job, now) {
  const experience = experienceFrom(job.description || '');
  return {
    source_id: source.id,
    company_id: company.id,
    external_job_id: String(job.sourceJobId),
    company_name: company.name,
    company_website: company.website || null,
    title: job.title,
    description: job.description || null,
    location_text: job.location && job.location !== 'Not specified' ? job.location : null,
    city: null,
    state: null,
    country: job.country && job.country !== 'Not specified' ? job.country : null,
    job_type: job.opportunityType === 'Internship'
      ? 'internship'
      : /\bgraduate\b|\bnew\s+grad\b/i.test(`${job.title} ${job.description || ''}`)
        ? 'graduate'
        : 'fresher',
    employment_type: job.employmentType || null,
    work_mode: {
      Remote: 'remote',
      Hybrid: 'hybrid',
      'On-site': 'onsite'
    }[job.workplace] || 'unknown',
    experience_min_years: experience.min,
    experience_max_years: experience.max,
    experience_text: experience.text,
    salary_text: scalarText(job.salary),
    eligibility_text: job.eligibility && job.eligibility !== 'Not specified' ? job.eligibility : null,
    graduation_year: graduationYearFrom(job.description || ''),
    internship_duration: scalarText(job.duration),
    posted_at: validDate(job.postedAt),
    application_deadline: validDate(job.deadline),
    last_verified_at: now,
    application_url: job.applyUrl,
    status: 'active',
    is_verified: true,
    updated_at: now
  };
}

async function getCompany(client, companyId) {
  const { data, error } = await client
    .from('companies')
    .select('id,name,website,country')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the company record: ${error.message}`);
  if (!data) throw new Error('Company record not found.');
  return data;
}

async function fetchListings(source, company, fetcher, now) {
  const connectorCompany = toConnectorCompany(source, company);
  const listings = await collectCompanyJobs(connectorCompany, fetcher, now);
  const nonOfficialLink = listings.find(
    (job) => !isOfficialApplicationURL(source.provider, job.applyUrl)
  );
  if (nonOfficialLink) {
    throw new Error('ATS feed returned a qualifying listing without a job-specific official application URL.');
  }
  const unique = new Map();
  for (const job of listings) {
    if (
      job.sourceJobId &&
      !unique.has(String(job.sourceJobId))
    ) {
      unique.set(String(job.sourceJobId), job);
    }
  }
  return [...unique.values()];
}

async function insertLogs(client, sourceId, events) {
  if (!events.length) return;
  const { error } = await client.from('monitoring_logs').insert(
    events.map(({ event_type, message }) => ({
      source_id: sourceId,
      event_type,
      message: String(message).slice(0, 1000)
    }))
  );
  if (error) throw new Error(`Could not write monitoring history: ${error.message}`);
}

export async function syncVerifiedSource(client, source, options = {}) {
  const now = options.now || new Date().toISOString();
  const fetcher = options.fetcher || fetch;
  let company;
  try {
    company = await getCompany(client, source.company_id);
    const listings = await fetchListings(source, company, fetcher, now);
    const records = listings.map((job) => databaseJob(source, company, job, now));
    const previous = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error } = await client
        .from('jobs')
        .select(`id,external_job_id,${JOB_FIELDS.join(',')}`)
        .eq('source_id', source.id)
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not read existing listings: ${error.message}`);
      previous.push(...(page || []));
      if (!page || page.length < 1000) break;
      if (offset >= 99_000) throw new Error('Source has too many active listings to safely reconcile in one sync.');
    }

    const previousByExternalId = new Map(
      previous.map((job) => [job.external_job_id, job])
    );
    const currentIds = new Set(records.map((job) => job.external_job_id));
    const events = [];
    for (const record of records) {
      const old = previousByExternalId.get(record.external_job_id);
      if (!old) {
        record.change_status = 'new';
        events.push({ event_type: 'new', message: `${company.name}: ${record.title}` });
      } else if (JOB_FIELDS.some((field) => (old[field] ?? null) !== (record[field] ?? null))) {
        record.change_status = 'updated';
        events.push({ event_type: 'updated', message: `${company.name}: ${record.title}` });
      } else {
        record.change_status = null;
      }
    }

    const closeIds = previous
      .filter((job) => !currentIds.has(job.external_job_id))
      .map((job) => job.id);
    if (records.length) {
      const { error } = await client
        .from('jobs')
        .upsert(records, { onConflict: 'source_id,external_job_id' });
      if (error) throw new Error(`Could not save verified listings: ${error.message}`);
    }
    if (closeIds.length) {
      const { error } = await client
        .from('jobs')
        .update({ status: 'closed', last_verified_at: now, updated_at: now })
        .in('id', closeIds);
      if (error) throw new Error(`Could not close missing listings: ${error.message}`);
      for (const job of previous) {
        if (closeIds.includes(job.id)) {
          events.push({ event_type: 'closed', message: `${company.name}: ${job.title}` });
        }
      }
    }

    const interval = source.poll_interval_minutes || 360;
    const { error: sourceError } = await client
      .from('company_sources')
      .update({
        connection_status: 'connected',
        is_verified: true,
        verified_at: source.verified_at || now,
        last_checked_at: now,
        next_sync_at: new Date(Date.parse(now) + interval * 60_000).toISOString(),
        failure_count: 0,
        last_error: null,
        updated_at: now
      })
      .eq('id', source.id);
    if (sourceError) throw new Error(`Could not update source status: ${sourceError.message}`);
    events.push({ event_type: 'sync', message: `${company.name}: checked ${records.length} qualifying listings` });
    await insertLogs(client, source.id, events);
    return {
      checkedAt: now,
      active: records.length,
      added: events.filter((event) => event.event_type === 'new').length,
      updated: events.filter((event) => event.event_type === 'updated').length,
      closed: closeIds.length
    };
  } catch (error) {
    const failureCount = (source.failure_count || 0) + 1;
    const backoffMinutes = Math.min(
      1440,
      Math.max(source.poll_interval_minutes || 360, 15) * 2 ** Math.min(failureCount - 1, 8)
    );
    const nextSyncAt = new Date(Date.parse(now) + backoffMinutes * 60_000).toISOString();
    const message = error.message || 'Source synchronization failed.';
    const { error: updateError } = await client
      .from('company_sources')
      .update({
        connection_status: 'failed',
        last_checked_at: now,
        next_sync_at: nextSyncAt,
        failure_count: failureCount,
        last_error: message.slice(0, 1000),
        updated_at: now
      })
      .eq('id', source.id);
    if (updateError) {
      throw new Error(`${message}; could not record source failure: ${updateError.message}`);
    }
    await insertLogs(client, source.id, [{ event_type: 'failure', message }]);
    throw error;
  }
}

export async function runDueSourceSync(client, options = {}) {
  const now = options.now || new Date().toISOString();
  const concurrency = Math.min(4, Math.max(1, options.concurrency || 2));
  const { data: sources, error } = await client
    .from('company_sources')
    .select('*')
    .eq('is_verified', true)
    .eq('monitoring_enabled', true)
    .lte('next_sync_at', now)
    .order('next_sync_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(`Could not load due sources: ${error.message}`);
  const results = [];
  for (let index = 0; index < (sources || []).length; index += concurrency) {
    const batch = sources.slice(index, index + concurrency);
    results.push(...await Promise.allSettled(
      batch.map((source) => syncVerifiedSource(client, source, options))
    ));
  }
  return results;
}
