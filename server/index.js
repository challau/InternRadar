import express from 'express';
import {MongoClient} from 'mongodb';
import {collectJobs, jobDetail, REFRESH_MS} from '../shared/jobs.js';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=express();app.disable('x-powered-by');
let snapshot=null, inFlight=null, database=null;
if(process.env.MONGODB_URI){
  try{
    const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});await client.connect();database=client.db();
    snapshot=(await database.collection('feeds').findOne({_id:'current'}))?.snapshot||null;
    console.log('MongoDB persistence connected.');
  }catch{console.error('MongoDB could not connect. Continuing with temporary memory storage.');}
}
async function refresh(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{snapshot=await collectJobs(snapshot);if(database)try{await database.collection('feeds').updateOne({_id:'current'},{$set:{snapshot}},{upsert:true});}catch{console.error('Feed persistence failed; memory snapshot is available.');}return snapshot;})().finally(()=>{inFlight=null});return inFlight;
}
app.get('/api/jobs',async(req,res)=>{try{if(!snapshot||Date.now()-Date.parse(snapshot.checkedAt)>REFRESH_MS)await refresh();res.set('Cache-Control','no-store').json({...snapshot,storage:database?'mongodb':'memory',refreshMode:'background'});}catch{res.status(503).json({error:'The feeds are temporarily unavailable. Please try again.'});}});
app.get('/api/jobs/:source/:id',async(req,res)=>{try{const d=await jobDetail(req.params.source,req.params.id);d?res.json(d):res.status(404).json({error:'Unknown listing.'});}catch{res.status(502).json({error:'Could not load this description. Please open the official application page.'});}});
app.get('/api/health',(req,res)=>res.json({ok:true,storage:database?'mongodb':'memory'}));
if(existsSync(path.join(root,'dist/client/index.html'))){app.use(express.static(path.join(root,'dist/client')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/client/index.html')));}else{
 const {createServer}=await import('vite');const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const port=Number(process.env.PORT||4317);app.listen(port,'127.0.0.1',()=>console.log(`InternRadar: http://127.0.0.1:${port}`));
refresh().catch(()=>{});setInterval(()=>refresh().catch(()=>{}),REFRESH_MS).unref();
