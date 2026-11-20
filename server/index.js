import express from 'express';
import {MongoClient} from 'mongodb';
import {collectCompanyJobs, normalizeCompany, testCompanyConnection} from '../shared/jobs.js';
import {searchVerifiedJobs} from './job-search.js';
import {supabasePublic,supabaseAdmin} from './supabase.js';
import {runDueSourceSync, syncVerifiedSource, validateSourceInput} from './verified-monitor.js';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));

let database = null;
let companies = [];
let snapshot = {jobs:[], sources:[], activity:[], checkedAt:null};
let syncInFlight = null;

if (process.env.MONGODB_URI) {
  try {
    const client = new MongoClient(process.env.MONGODB_URI, {serverSelectionTimeoutMS:5000});
    await client.connect();
    database = client.db();
    companies = await database.collection('companies').find({}).toArray();
    const saved = await database.collection('feeds').findOne({_id:'current'});
    if (saved?.snapshot) snapshot = saved.snapshot;
    snapshot.jobs = snapshot.jobs.filter(job => companies.some(company => company.id === job.sourceId));
    console.log('MongoDB persistence connected.');
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exitCode = 1;
    throw error;
  }
}

async function persist() {
  if (!database) return;
  const collection = database.collection('companies');
  if (companies.length) await collection.bulkWrite(companies.map(company => ({
    replaceOne:{filter:{id:company.id}, replacement:company, upsert:true}
  })));
  await collection.deleteMany(companies.length ? {id:{$nin:companies.map(company => company.id)}} : {});
  await database.collection('feeds').updateOne({_id:'current'}, {$set:{snapshot}}, {upsert:true});
}
function adminOnly(req, res, next) {
  if (process.env.ADMIN_TOKEN && req.get('authorization') !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({error:'Admin authorization required.'});
  }
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_TOKEN) {
    return res.status(503).json({error:'Set ADMIN_TOKEN before enabling company management in production.'});
  }
  next();
}
function logActivity(type, company, details = '') {
  snapshot.activity.unshift({id:crypto.randomUUID(), type, company:company?.name || 'System', details, at:new Date().toISOString()});
  snapshot.activity = snapshot.activity.slice(0, 200);
}
function dueForSync(company, now = Date.now()) {
  if (!company.enabled) return false;
  return !company.lastCheckedAt || now - Date.parse(company.lastCheckedAt) >= company.pollingMinutes * 60000;
}
function duplicateSource(existing, candidate) {
  return existing.careers.toLowerCase() === candidate.careers.toLowerCase()
    || existing.ats === candidate.ats && existing.boardId && candidate.boardId && existing.boardId.toLowerCase() === candidate.boardId.toLowerCase();
}

async function syncCompany(company) {
  const checkedAt = new Date().toISOString();
  try {
    const fresh = await collectCompanyJobs(company);
    const previous = snapshot.jobs.filter(job => job.sourceId === company.id);
    const previousById = new Map(previous.map(job => [job.id, job]));
    const freshById = new Map(fresh.map(job => [job.id, job]));
    for (const job of fresh) {
      const old = previousById.get(job.id);
      if (!old) {
        job.status = 'active';
        job.changeStatus = 'new';
        job.firstSeenAt = checkedAt;
        logActivity('new', company, job.title);
      } else {
        const changed = old.title !== job.title || old.description !== job.description || old.location !== job.location;
        job.firstSeenAt = old.firstSeenAt || checkedAt;
        job.changeStatus = changed ? 'updated' : old.changeStatus === 'new' && Date.now() - Date.parse(job.firstSeenAt) < 86_400_000 ? 'new' : null;
        if (changed) logActivity('updated', company, job.title);
      }
    }
    for (const old of previous) {
      if (!freshById.has(old.id) && old.status !== 'closed') {
        fresh.push({...old, status:'closed', changeStatus:'closed', lastCheckedAt:checkedAt});
        logActivity('closed', company, old.title);
      }
    }
    snapshot.jobs = snapshot.jobs.filter(job => job.sourceId !== company.id).concat(fresh);
    company.connectionStatus = 'connected';
    company.lastSuccessfulAt = checkedAt;
    company.lastCheckedAt = checkedAt;
    company.lastError = null;
    logActivity('sync', company, `${fresh.filter(job => job.status === 'active').length} active openings`);
  } catch (error) {
    company.connectionStatus = error.code === 'NOT_SUPPORTED' ? 'not_supported' : 'failed';
    company.lastCheckedAt = checkedAt;
    company.lastError = error.message;
    snapshot.jobs = snapshot.jobs.map(job => job.sourceId === company.id && job.status === 'active' ? {...job, stale:true} : job);
    logActivity('failure', company, error.message);
  }
  company.updatedAt = checkedAt;
  snapshot.checkedAt = checkedAt;
}
async function syncDueCompanies(forceIds = null) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async() => {
    const now = Date.now();
    const due = companies.filter(company => company.enabled && (!forceIds || forceIds.includes(company.id)) && (forceIds || dueForSync(company, now)));
    await Promise.all(due.map(syncCompany));
    if (due.length) await persist();
  })().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

app.get('/api/jobs', async (req, res) => {
  try {
    await syncDueCompanies();
    const sources = companies.map(company => ({
      id:company.id, name:company.name, color:'#176d52', careers:company.careers,
      status:company.connectionStatus === 'connected' ? 'healthy' : 'unavailable',
      connectionStatus:company.connectionStatus, checkedAt:company.lastCheckedAt,
      count:snapshot.jobs.filter(job => job.sourceId === company.id && job.status === 'active').length,
      error:company.lastError || null
    }));
    res.set('Cache-Control', 'no-store').json({
      ...snapshot, sources, jobs:snapshot.jobs.filter(job => job.status === 'active'),
      storage:database ? 'mongodb' : 'memory',
      refreshMode:'per-company polling; dashboard may poll every 15 seconds'
    });
  } catch (error) {
    console.error(`Job synchronization failed: ${error.message}`);
    res.status(503).json({error:'Could not synchronize career feeds. Please retry.'});
  }
});
app.get('/api/search/jobs', async (req, res) => {
  try {
    const result = await searchVerifiedJobs(supabasePublic, req.query);
    res.set('Cache-Control','private, max-age=15').json(result);
  } catch (error) {
    if (error.status >= 500) console.error(`Verified job search failed (${error.code || 'configuration'}).`);
    res.status(error.status || 502).json({error:error.message});
  }
});
app.get('/api/verified-sources', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  const {data:sources,error} = await supabaseAdmin.from('company_sources')
    .select('id,company_id,provider,board_id,career_url,connection_status,is_verified,verified_at,monitoring_enabled,poll_interval_minutes,last_checked_at,next_sync_at,failure_count,last_error')
    .order('created_at',{ascending:false});
  if (error) return res.status(502).json({error:'Could not load verified career sources.'});
  const companyIds = [...new Set((sources || []).map(source => source.company_id))];
  const {data:companiesForSources,error:companyError} = companyIds.length
    ? await supabaseAdmin.from('companies').select('id,name').in('id',companyIds)
    : {data:[],error:null};
  if (companyError) return res.status(502).json({error:'Could not load source company names.'});
  const names = new Map((companiesForSources || []).map(company => [String(company.id),company.name]));
  res.set('Cache-Control','no-store').json((sources || []).map(source => ({
    ...source, company_name:names.get(String(source.company_id)) || 'Company'
  })));
});
app.post('/api/verified-sources', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  let sourceInput;
  try {
    sourceInput = validateSourceInput(req.body);
  } catch (error) {
    return res.status(400).json({error:error.message});
  }
  const companyId = req.body.companyId;
  if (companyId === undefined || companyId === null || String(companyId).trim() === '') {
    return res.status(400).json({error:'Select a company ID from the Supabase directory.'});
  }
  const {data:company,error:companyError} = await supabaseAdmin.from('companies')
    .select('id').eq('id',companyId).maybeSingle();
  if (companyError) return res.status(502).json({error:'Could not verify the selected company.'});
  if (!company) return res.status(404).json({error:'Company record not found in Supabase.'});
  const {data:source,error} = await supabaseAdmin.from('company_sources')
    .insert({...sourceInput,company_id:company.id,connection_status:'not_tested',is_verified:false,monitoring_enabled:false})
    .select('*').single();
  if (error) {
    const duplicate = error.code === '23505';
    return res.status(duplicate ? 409 : 502).json({
      error:duplicate ? 'This ATS board is already configured.' : 'Could not save career source configuration.'
    });
  }
  try {
    const result = await syncVerifiedSource(supabaseAdmin,source);
    return res.status(201).json({sourceId:source.id,result});
  } catch (syncError) {
    return res.status(502).json({sourceId:source.id,error:`Source saved but verification failed: ${syncError.message}`});
  }
});
app.post('/api/verified-sources/:id/test', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  const {data:source,error} = await supabaseAdmin.from('company_sources').select('*')
    .eq('id',req.params.id).maybeSingle();
  if (error) return res.status(502).json({error:'Could not load the configured career source.'});
  if (!source) return res.status(404).json({error:'Career source not found.'});
  try {
    const result = await syncVerifiedSource(supabaseAdmin,source);
    res.json(result);
  } catch (syncError) {
    res.status(502).json({error:syncError.message});
  }
});
app.patch('/api/verified-sources/:id/monitoring', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({error:'Monitoring state must be explicitly enabled or disabled.'});
  const {data:source,error:readError} = await supabaseAdmin.from('company_sources')
    .select('id,is_verified').eq('id',req.params.id).maybeSingle();
  if (readError) return res.status(502).json({error:'Could not load the configured career source.'});
  if (!source) return res.status(404).json({error:'Career source not found.'});
  if (req.body.enabled && !source.is_verified) return res.status(409).json({error:'Test and verify this source before enabling monitoring.'});
  const {data,error} = await supabaseAdmin.from('company_sources').update({
    monitoring_enabled:req.body.enabled,
    next_sync_at:req.body.enabled ? new Date().toISOString() : null,
    updated_at:new Date().toISOString()
  }).eq('id',source.id).select('id,monitoring_enabled,next_sync_at').single();
  if (error) return res.status(502).json({error:'Could not update monitoring state.'});
  res.json(data);
});
app.delete('/api/verified-sources/:id', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  const {error} = await supabaseAdmin.from('company_sources').delete().eq('id',req.params.id);
  if (error) return res.status(502).json({error:'Could not remove the career source.'});
  res.status(204).end();
});
app.get('/api/verified-activity', adminOnly, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:'Server-side Supabase service role is not configured.'});
  const {data,error} = await supabaseAdmin.from('monitoring_logs')
    .select('id,source_id,event_type,message,created_at')
    .order('created_at',{ascending:false}).limit(100);
  if (error) return res.status(502).json({error:'Could not load verified monitoring activity.'});
  res.set('Cache-Control','no-store').json(data || []);
});
app.get('/api/jobs/:source/:id', (req, res) => {
  const job = snapshot.jobs.find(item => item.sourceId === req.params.source && item.sourceJobId === req.params.id);
  job ? res.json({description:job.description, deadline:job.deadline, sourcePublishedAt:job.updatedAt, applyUrl:job.applyUrl})
      : res.status(404).json({error:'Unknown listing.'});
});
app.get('/api/companies', (req, res) => res.set('Cache-Control','no-store').json(companies));
app.post('/api/companies', adminOnly, async (req, res) => {
  try {
    const company = normalizeCompany(req.body);
    if (companies.some(item => duplicateSource(item, company))) {
      return res.status(409).json({error:'This career board is already on your company list.'});
    }
    companies.push(company);
    await persist();
    res.status(201).json(company);
  } catch (error) { res.status(400).json({error:error.message}); }
});
app.put('/api/companies/:id', adminOnly, async (req, res) => {
  const index = companies.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({error:'Company not found.'});
  try {
    const old = companies[index];
    const changedPortal = ['ats','boardId','careers'].some(key => req.body[key] !== undefined && req.body[key] !== old[key]);
    const updated = normalizeCompany({
      ...old, ...req.body, id:old.id,
      ...(changedPortal ? {connectionStatus:'not_tested',lastCheckedAt:null,lastSuccessfulAt:null,lastError:null} : {})
    }, old.id);
    if (companies.some((item, itemIndex) => itemIndex !== index && duplicateSource(item, updated))) {
      return res.status(409).json({error:'This career board is already on another company record.'});
    }
    companies[index] = updated;
    if (changedPortal) snapshot.jobs = snapshot.jobs.filter(job => job.sourceId !== old.id);
    await persist();
    res.json(companies[index]);
  } catch (error) { res.status(400).json({error:error.message}); }
});
app.delete('/api/companies/:id', adminOnly, async (req, res) => {
  const company = companies.find(item => item.id === req.params.id);
  if (!company) return res.status(404).json({error:'Company not found.'});
  companies = companies.filter(item => item.id !== company.id);
  snapshot.jobs = snapshot.jobs.filter(job => job.sourceId !== company.id);
  logActivity('removed', company);
  await persist();
  res.status(204).end();
});
app.post('/api/companies/:id/test', adminOnly, async (req, res) => {
  const company = companies.find(item => item.id === req.params.id);
  if (!company) return res.status(404).json({error:'Company not found.'});
  const result = await testCompanyConnection(company);
  company.connectionStatus = result.status;
  company.lastCheckedAt = new Date().toISOString();
  company.lastError = result.error || null;
  if (result.status === 'connected') company.lastSuccessfulAt = company.lastCheckedAt;
  logActivity(result.status === 'connected' ? 'test' : 'failure', company, result.error || `${result.count} qualifying openings`);
  await persist();
  res.json({...result, lastCheckedAt:company.lastCheckedAt});
});
app.post('/api/companies/:id/check', adminOnly, async (req, res) => {
  const company = companies.find(item => item.id === req.params.id);
  if (!company) return res.status(404).json({error:'Company not found.'});
  await syncDueCompanies([company.id]);
  await persist();
  res.json(company);
});
app.post('/api/companies/import', adminOnly, async (req, res) => {
  if (!Array.isArray(req.body.companies) || req.body.companies.length > 500) {
    return res.status(400).json({error:'Upload a CSV with up to 500 company rows.'});
  }
  const imported = [], errors = [];
  for (const [index, row] of req.body.companies.entries()) {
    try {
      const company = normalizeCompany(row);
      if (companies.some(item => duplicateSource(item, company))) {
        throw new Error('Career board already exists.');
      }
      companies.push(company);
      imported.push(company);
    } catch (error) { errors.push({row:index + 2, name:row.name || '', error:error.message}); }
  }
  await persist();
  res.status(200).json({imported:imported.length, errors});
});
app.get('/api/activity', (req, res) => res.set('Cache-Control','no-store').json(snapshot.activity));
app.get('/api/health', (req, res) => res.json({ok:true,storage:database ? 'mongodb' : 'memory', companyCount:companies.length}));

if (existsSync(path.join(root, 'dist/client/index.html'))) {
  app.use(express.static(path.join(root, 'dist/client')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/client/index.html')));
} else {
  const {createServer} = await import('vite');
  const vite = await createServer({root, server:{middlewareMode:true}, appType:'spa'});
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4317);
let verifiedSyncInFlight = null;
let lastVerifiedSchedulerErrorAt = 0;
async function syncDueVerifiedSources() {
  if (!supabaseAdmin || verifiedSyncInFlight) return;
  verifiedSyncInFlight = runDueSourceSync(supabaseAdmin)
    .then(results => {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(`Verified source sync failed: ${result.reason.message}`);
        }
      }
    })
    .catch(error => {
      if (Date.now() - lastVerifiedSchedulerErrorAt > 300_000) {
        console.error(`Could not schedule verified source sync: ${error.message}`);
        lastVerifiedSchedulerErrorAt = Date.now();
      }
    })
    .finally(() => { verifiedSyncInFlight = null; });
  return verifiedSyncInFlight;
}
app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`InternConnect: http://127.0.0.1:${port}`));
await syncDueCompanies().catch(error => console.error(`Initial synchronization failed: ${error.message}`));
setInterval(() => syncDueCompanies().catch(error => console.error(`Scheduled synchronization failed: ${error.message}`)), 15_000).unref();
await syncDueVerifiedSources();
setInterval(() => syncDueVerifiedSources(), 15_000).unref();
