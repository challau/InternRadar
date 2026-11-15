export const SOURCES = [
  {id:'stripe', name:'Stripe', color:'#635bff', careers:'https://stripe.com/jobs'},
  {id:'figma', name:'Figma', color:'#222222', careers:'https://www.figma.com/careers/'},
  {id:'databricks', name:'Databricks', color:'#ee4938', careers:'https://www.databricks.com/company/careers'},
  {id:'cloudflare', name:'Cloudflare', color:'#ec861e', careers:'https://www.cloudflare.com/careers/'},
  {id:'verkada', name:'Verkada', color:'#245f9e', careers:'https://www.verkada.com/careers/'}
];
export const REFRESH_MS = 15 * 60 * 1000;
export function cleanText(value='') {
  let text=String(value);
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',bull:'•'};
  for(let i=0;i<3;i++) text=text.replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|bull);/g,(_,name)=>entities[name]).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):'';});
  return text.replace(/<\/(p|div|li|h[1-6])>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\n\s*\n/g,'\n\n').trim();
}
export function countriesFor(location='') {
  const patterns=[['India',/\bindia\b|bengaluru|bangalore|hyderabad|mumbai|delhi|pune|chennai/i],['United States',/united states|\busa\b|san francisco|new york|seattle|san mateo|mountain view|california|austin|boston|chicago|washington|\b(?:CA|NY|TX|WA),? (?:US|United States)\b/i],['Canada',/canada|toronto|vancouver|montreal/i],['United Kingdom',/united kingdom|\buk\b|london/i],['Ireland',/ireland|dublin/i],['Singapore',/singapore/i],['Australia',/australia|sydney|melbourne/i],['Netherlands',/netherlands|amsterdam/i],['Germany',/germany|berlin|munich/i],['France',/france|paris/i],['Japan',/japan|tokyo/i],['Denmark',/denmark|aarhus|copenhagen/i],['Serbia',/serbia|belgrade/i]];
  const matches=patterns.filter(([,re])=>re.test(location)).map(([c])=>c);
  return matches;
}
export function countryFor(location='') {
  const matches=countriesFor(location);
  return matches.length>1?'Multiple countries':matches[0]||'Not specified';
}
export function roleFor(title='') {
  if(/data|machine learning|\bai\b|scientist|analytics/i.test(title)) return 'AI & Data';
  if(/design|ux|ui\b/i.test(title)) return 'Design';
  if(/software|engineer|developer|security|technical|\bit\b/i.test(title)) return 'Engineering';
  if(/product|business|sales|marketing|finance|people|hr\b|control|account|operations/i.test(title)) return 'Business';
  return 'Other';
}
export function safeURL(value) { try { const url=new URL(value); return url.protocol==='https:'?url.href:null; } catch {return null;} }
export function normalizeJob(raw,source,checkedAt) {
  if(!/\bintern(?:ship)?\b/i.test(raw.title||'')) return null;
  const applyUrl=safeURL(raw.absolute_url); if(!applyUrl) return null;
  const location=raw.location?.name?.trim()||'Location not specified';
  return {id:`${source.id}:${raw.id}`,sourceId:source.id,sourceJobId:String(raw.id),company:source.name,color:source.color,title:raw.title,location,country:countryFor(location),countries:countriesFor(location),category:roleFor(raw.title),workplace:/remote/i.test(location)?'Remote':/hybrid/i.test(location)?'Hybrid':/in.office|on.site/i.test(location)?'On-site':'Not specified',applyUrl,updatedAt:raw.updated_at||null,lastCheckedAt:checkedAt};
}
export async function collectJobs(previous=null,fetcher=fetch) {
  const results=await Promise.all(SOURCES.map(async source=>{
    const now=new Date().toISOString();
    try{
      const response=await fetcher(`https://boards-api.greenhouse.io/v1/boards/${source.id}/jobs`,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Source returned ${response.status}`);
      const data=await response.json();if(!Array.isArray(data.jobs))throw new Error('Invalid source response');
      const jobs=data.jobs.map(raw=>normalizeJob(raw,source,now)).filter(Boolean);
      return {jobs,source:{...source,status:'healthy',checkedAt:now,count:jobs.length}};
    }catch(error){
      const old=previous?.sources?.find(s=>s.id===source.id);
      const jobs=(previous?.jobs||[]).filter(j=>j.sourceId===source.id).map(j=>({...j,stale:true}));
      return {jobs,source:{...source,status:'unavailable',checkedAt:old?.checkedAt||null,count:jobs.length,error:'Could not reach this career feed. Retrying on the next refresh.'}};
    }
  }));
  return {jobs:[...new Map(results.flatMap(r=>r.jobs).map(j=>[j.id,j])).values()],sources:results.map(r=>r.source),checkedAt:new Date().toISOString(),refreshMinutes:15};
}
export async function jobDetail(sourceId,id,fetcher=fetch){
  if(!SOURCES.some(s=>s.id===sourceId)||!/^\d+$/.test(id))return null;
  const r=await fetcher(`https://boards-api.greenhouse.io/v1/boards/${sourceId}/jobs/${id}`,{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('This listing could not be loaded from the company.');
  const data=await r.json();
  return {description:cleanText(data.content),deadline:data.application_deadline||null,sourcePublishedAt:data.first_published||null,applyUrl:safeURL(data.absolute_url)};
}
