const JOB_TYPES = new Set(['internship','fresher','graduate']);
const EMPLOYMENT_TYPES = new Set(['full_time','part_time']);
const WORK_MODES = new Set(['remote','hybrid','onsite']);
const SORTS = new Set(['relevance','newest','verified']);

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}
function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function searchVerifiedJobs(client, query) {
  if (!client) {
    const error = new Error('Public Supabase search is not configured on the server.');
    error.status = 503;
    throw error;
  }
  const pageSize = boundedInteger(query.limit, 25, 1, 50);
  const page = boundedInteger(query.page, 1, 1, 1_000_000);
  const experience = boundedText(query.experience, 8);
  const experienceBounds = {
    '0': [0,0],
    '0-1': [0,1],
    '0-2': [0,2]
  }[experience] || [null,null];
  const jobType = boundedText(query.type, 20);
  const employmentType = EMPLOYMENT_TYPES.has(jobType) ? jobType : null;
  const workMode = boundedText(query.work_mode, 20);
  const sort = boundedText(query.sort, 20);

  const {data,error} = await client.rpc('search_verified_jobs', {
    p_query:boundedText(query.q, 120),
    p_country:boundedText(query.country, 80),
    p_city:boundedText(query.city, 80),
    p_job_type:JOB_TYPES.has(jobType) ? jobType : null,
    p_employment_type:employmentType,
    p_work_mode:WORK_MODES.has(workMode) ? workMode : null,
    p_experience_min:experienceBounds[0],
    p_experience_max:experienceBounds[1],
    p_sort:SORTS.has(sort) ? sort : 'relevance',
    p_limit:pageSize,
    p_offset:(page - 1) * pageSize
  });
  if (error) {
    const migrationMissing = error.code === 'PGRST202' || error.code === 'PGRST205';
    const failure = new Error(migrationMissing
      ? 'Verified job search is not initialized. Apply the Supabase jobs migration first.'
      : 'Could not search verified job listings.');
    failure.status = migrationMissing ? 503 : 502;
    failure.code = error.code;
    throw failure;
  }
  return {
    items:Array.isArray(data?.items) ? data.items : [],
    total:Number.isSafeInteger(Number(data?.total)) ? Number(data.total) : 0,
    page,
    pageSize
  };
}