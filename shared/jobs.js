export const SOURCES = [];
export const REFRESH_MS = 15 * 60 * 1000;
export const ATS_PROVIDERS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'official'];

export function cleanText(value = '') {
  let text = String(value);
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',bull:'•'};
  for (let i = 0; i < 3; i++) text = text.replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|bull);/g, (_, name) => entities[name]).replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
  return text.replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n').trim();
}

export function countriesFor(location = '') {
  const patterns = [['India',/\bindia\b|bengaluru|bangalore|hyderabad|mumbai|delhi|pune|chennai/i],['United States',/united states|\busa\b|san francisco|new york|seattle|san mateo|mountain view|california|austin|boston|chicago|washington|\b(?:CA|NY|TX|WA),? (?:US|United States)\b/i],['Canada',/canada|toronto|vancouver|montreal/i],['United Kingdom',/united kingdom|\buk\b|london/i],['Ireland',/ireland|dublin/i],['Singapore',/singapore/i],['Australia',/australia|sydney|melbourne/i],['Netherlands',/netherlands|amsterdam/i],['Germany',/germany|berlin|munich/i],['France',/france|paris/i],['Japan',/japan|tokyo/i],['Denmark',/denmark|aarhus|copenhagen/i],['Serbia',/serbia|belgrade/i]];
  return patterns.filter(([, re]) => re.test(location)).map(([country]) => country);
}
export function countryFor(location = '') {
  const matches = countriesFor(location);
  return matches.length > 1 ? 'Multiple countries' : matches[0] || 'Not specified';
}
export function roleFor(title = '') {
  if (/data|machine learning|\bai\b|scientist|analytics/i.test(title)) return 'AI & Data';
  if (/design|ux|ui\b/i.test(title)) return 'Design';
  if (/software|engineer|developer|security|technical|\bit\b/i.test(title)) return 'Engineering';
  if (/product|business|sales|marketing|finance|people|hr\b|control|account|operations/i.test(title)) return 'Business';
  return 'Other';
}
export function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function isOfficialApplicationURL(provider, value) {
  const url = safeURL(value);
  if (!url) return false;
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.split('/').filter(Boolean);
  const hosts = {
    greenhouse:new Set(['boards.greenhouse.io','job-boards.greenhouse.io']),
    lever:new Set(['jobs.lever.co']),
    ashby:new Set(['jobs.ashbyhq.com'])
  };
  if (!hosts[provider]?.has(host)) return false;
  if (provider === 'greenhouse') return path.length >= 3 && path[1] === 'jobs' && Boolean(path[2]);
  return path.length >= 2 && path.every(Boolean);
}

export function normalizeCompany(input, id = input.id || crypto.randomUUID()) {
  const name = String(input.name || '').trim();
  const website = safeURL(input.website);
  const careers = safeURL(input.careers);
  const ats = String(input.ats || 'official').toLowerCase();
  if (!name || name.length > 120) throw new Error('Company name is required and must be 120 characters or fewer.');
  if (!website || !careers) throw new Error('Use valid HTTPS URLs for the company website and career portal.');
  if (!ATS_PROVIDERS.includes(ats)) throw new Error('Select a supported ATS provider option.');
  const interval = Number(input.pollingMinutes || 60);
  if (!Number.isInteger(interval) || interval < 15 || interval > 10080) throw new Error('Polling interval must be between 15 minutes and 7 days.');
  return {
    id, name, website, careers, country: String(input.country || '').trim() || 'Not specified',
    industry: String(input.industry || '').trim() || 'Not specified', ats,
    boardId: String(input.boardId || '').trim() || inferBoardId(careers, ats),
    pollingMinutes: interval, enabled: input.enabled !== false,
    connectionStatus: input.connectionStatus || 'not_tested',
    lastCheckedAt: input.lastCheckedAt || null, lastSuccessfulAt: input.lastSuccessfulAt || null,
    createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

function inferBoardId(careers, ats) {
  try {
    const host = new URL(careers).hostname.toLowerCase();
    const parts = new URL(careers).pathname.split('/').filter(Boolean);
    if (ats === 'greenhouse' && /greenhouse\.io$/.test(host)) return parts[0] || '';
    if (ats === 'lever' && /lever\.co$/.test(host)) return parts[0] || '';
    if (ats === 'ashby' && /ashbyhq\.com$/.test(host)) return parts[0] || '';
    if (ats === 'smartrecruiters' && /smartrecruiters\.com$/.test(host)) return parts[0] || '';
  } catch { /* URL validation occurs in normalizeCompany. */ }
  return '';
}

function supported(company) {
  return ['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(company.ats) && Boolean(company.boardId);
}
function isRelevantTitle(title = '') {
  return /(software|developer|engineering|engineer|full.?stack|backend|frontend|data science|data analyst|machine learning|\bAI\b|\bML\b|cloud|devops|research|technical|graduate|trainee|\bSDE\b)/i.test(title)
    && !/\b(senior|sr\.?|staff|principal|lead|manager|director|head|chief|experienced)\b/i.test(title);
}
function categoryFor(title = '', description = '') {
  if (/\bintern(ship)?\b/i.test(title)) return 'Internship';
  if (/\b(intern(ship)?|co.?op|students? only)\b/i.test(description)) return null;
  if (/\b(?:3|4|5|6|7|8|9|10)\s*(?:\+|[-–]\s*\d+)?\s*(?:years?|yrs?)\b|\b(?:three|four|five|six|seven|eight|nine|ten)\s+years?\b/i.test(description)) return null;
  if (/\b(0\s*[-–to]+\s*2|one to two|entry.level|new grad|graduate|fresher|junior|associate|trainee|engineer i\b|developer i\b|sde i\b|level 1)\b/i.test(`${title}\n${description}`)) return 'Fresher Job';
  return null;
}
function normalizeRaw(raw, company, now) {
  const title = raw.title || raw.text || raw.name || '';
  const description = cleanText(raw.content || raw.description || raw.descriptionPlain || '');
  const category = categoryFor(title, description);
  const applyUrl = safeURL(raw.absolute_url || raw.hostedUrl || raw.jobUrl || raw.applyUrl || raw.ref || raw.url);
  if (!category || !isRelevantTitle(title) || !applyUrl) return null;
  const locationValue = raw.location;
  const location = locationValue?.name || [locationValue?.city, locationValue?.region, locationValue?.country].filter(Boolean).join(', ')
    || raw.categories?.location || (typeof locationValue === 'string' ? locationValue : '') || raw.address?.addressLocality || 'Not specified';
  const employmentValue = String(raw.employment_type || raw.employmentType || raw.categories?.commitment || raw.commitment || '');
  const workplaceValue = `${location} ${raw.workplaceType || raw.workplace_type || raw.locationType || ''}`;
  const employmentType = /\bpart[\s-]?time\b/i.test(employmentValue) ? 'part_time'
    : /\bfull[\s-]?time\b/i.test(employmentValue) ? 'full_time'
    : null;
  const id = String(raw.id || raw.jobId || raw.externalId || applyUrl);
  return {
    id: `${company.id}:${id}`, sourceId: company.id, sourceJobId: id,
    company: company.name, color: '#176d52', title: cleanText(title), location: cleanText(location),
    country: countryFor(location), countries: countriesFor(location), category: roleFor(title),
    opportunityType: category, workplace: /remote/i.test(workplaceValue) ? 'Remote' : /hybrid/i.test(workplaceValue) ? 'Hybrid' : /in.office|on.site/i.test(workplaceValue) ? 'On-site' : 'Not specified',
    applyUrl, careers: company.careers, postedAt:raw.createdAt||raw.first_published||raw.postedAt||null,
    updatedAt: raw.updated_at || raw.updatedAt || raw.createdAt || raw.first_published || null,
    lastCheckedAt: now, description, eligibility: 'Not specified',
    experience: /0\s*[-–to]+\s*2|entry.level|new grad|graduate|fresher|junior/i.test(`${title} ${description}`) ? '0–2 years or graduate-level (verify listing)' : 'Not specified',
    graduationYear: (description.match(/\b20(?:2[7-9]|3\d)\b/) || [])[0] || 'Not specified',
    duration: raw.duration || 'Not specified',
    salary: raw.compensationTierSummary || raw.compensation || raw.salary || 'Not specified',
    deadline: raw.application_deadline || raw.deadline || 'Not specified',
    status: 'active',
    employmentType
  };
}

async function providerResponse(company, fetcher) {
  if (!supported(company)) throw Object.assign(new Error('No tested public connector is available for this provider or career URL.'), {code:'NOT_SUPPORTED'});
  const board = encodeURIComponent(company.boardId);
  const base = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${board}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${board}/postings?limit=100`
  }[company.ats];
  const response = await fetcher(base, { signal: AbortSignal.timeout(12000), headers: {Accept:'application/json'} });
  if (!response.ok) throw new Error(`Career feed returned HTTP ${response.status}.`);
  const payload = await response.json();
  const list = company.ats === 'greenhouse' ? payload.jobs : company.ats === 'ashby' ? payload.jobs : company.ats === 'smartrecruiters' ? payload.content : payload;
  if (!Array.isArray(list)) throw new Error('The career feed returned an unexpected response.');
  return list;
}

export async function testCompanyConnection(company, fetcher = fetch) {
  try {
    const jobs = await providerResponse(company, fetcher);
    return { status:'connected', count:jobs.map(job => normalizeRaw(job, company, new Date().toISOString())).filter(Boolean).length };
  } catch (error) {
    return { status:error.code === 'NOT_SUPPORTED' ? 'not_supported' : 'failed', error:error.message };
  }
}

export async function collectCompanyJobs(company, fetcher = fetch, now = new Date().toISOString()) {
  const feed = await providerResponse(company, fetcher);
  return feed.map(raw => normalizeRaw(raw, company, now)).filter(Boolean);
}

export async function collectJobs(previous = null, fetcher = fetch) {
  const now = new Date().toISOString();
  return {jobs:[], sources:[], checkedAt:now, refreshMinutes:REFRESH_MS / 60000, ...(previous || {})};
}

export async function jobDetail(sourceId, id, fetcher = fetch) {
  const safeId = String(id);
  if (!sourceId || !/^[\w.-]+$/.test(safeId)) return null;
  return null;
}
