import {collectJobs,jobDetail,REFRESH_MS} from '../shared/jobs.js';
import {ASSETS} from './generated-assets.js';
let snapshot=null,inFlight=null;
async function getSnapshot(request){
  const cache=globalThis.caches?.default;
  const key=new Request(new URL('/__feed_snapshot',request.url));
  if(!snapshot&&cache){const cached=await cache.match(key);if(cached)snapshot=await cached.json();}
  if(snapshot&&Date.now()-Date.parse(snapshot.checkedAt)<REFRESH_MS)return snapshot;
  if(!inFlight)inFlight=(async()=>{snapshot=await collectJobs(snapshot);if(cache)await cache.put(key,new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'}}));return snapshot;})().finally(()=>inFlight=null);
  return inFlight;
}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
  if(url.pathname==='/api/jobs'){
    try{return Response.json({...await getSnapshot(request),storage:'edge-cache',refreshMode:'on-visit'},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'The feeds are temporarily unavailable. Please try again.'},{status:503});}
  }
  const match=url.pathname.match(/^\/api\/jobs\/([a-z]+)\/(\d+)$/);
  if(match){try{const detail=await jobDetail(match[1],match[2]);return detail?Response.json(detail):Response.json({error:'Unknown listing.'},{status:404});}catch{return Response.json({error:'Could not load the description. Open the official application page instead.'},{status:502});}}
  const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];
  if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
}};
