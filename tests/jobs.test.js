import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCompany,collectCompanyJobs,testCompanyConnection,countryFor,countriesFor,cleanText} from '../shared/jobs.js';

const company = normalizeCompany({
  id:'acme',name:'Acme',website:'https://acme.example',careers:'https://boards.greenhouse.io/acme',
  country:'India',industry:'Software',ats:'greenhouse',pollingMinutes:30
});
const feed = {jobs:[
  {id:100,title:'Software Engineering Intern',location:{name:'Bengaluru, India'},absolute_url:'https://jobs.example/100',updated_at:'2026-11-01T00:00:00Z',content:'12 week internship'},
  {id:101,title:'Graduate Software Engineer',location:{name:'Remote'},absolute_url:'https://jobs.example/101',content:'New graduate role. 0-2 years of experience.'},
  {id:102,title:'Senior Software Engineer',location:{name:'New York'},absolute_url:'https://jobs.example/102'},
  {id:103,title:'Product Manager',location:{name:'London'},absolute_url:'https://jobs.example/103'},
  {id:104,title:'Software Engineer',location:{name:'London'},absolute_url:'https://jobs.example/104',content:'Requires 5+ years of professional experience.'}
]};

test('company validation requires safe URLs and bounded poll interval',()=>{
  assert.throws(()=>normalizeCompany({...company,website:'javascript:alert(1)'}),/valid HTTPS URLs/);
  assert.throws(()=>normalizeCompany({...company,pollingMinutes:5}),/between 15 minutes and 7 days/);
  assert.equal(company.boardId,'acme');
});
test('Greenhouse feed normalizes only internships and entry-level technical jobs',async()=>{
  const jobs=await collectCompanyJobs(company,async url=>{
    assert.match(url,/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs/);
    return new Response(JSON.stringify(feed));
  },'2026-11-15T12:00:00Z');
  assert.deepEqual(jobs.map(job=>job.opportunityType),['Internship','Fresher Job']);
  assert.equal(jobs[0].country,'India');
  assert.equal(jobs[0].duration,'Not specified');
  assert.equal(jobs[1].experience,'0–2 years or graduate-level (verify listing)');
  assert.equal(jobs[1].deadline,'Not specified');
});
test('Lever, Ashby, and SmartRecruiters use their public feed endpoints',async()=>{
  const cases=[
    ['lever','https://jobs.lever.co/acme','https://api.lever.co/v0/postings/acme?mode=json',[{id:'a',text:'Software Engineering Intern',hostedUrl:'https://jobs.example/a',categories:{location:'Remote'}}]],
    ['ashby','https://jobs.ashbyhq.com/acme','https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true',{jobs:[{id:'b',title:'Software Engineering Intern',jobUrl:'https://jobs.example/b',location:'Remote'}]}],
    ['smartrecruiters','https://careers.smartrecruiters.com/acme','https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100',{content:[{id:'c',name:'Software Engineering Intern',applyUrl:'https://jobs.example/c',location:{city:'Remote'}}]}]
  ];
  for(const [ats,careers,endpoint,payload] of cases){
    const target=normalizeCompany({...company,ats,careers,boardId:'acme'});
    const jobs=await collectCompanyJobs(target,async url=>{assert.equal(url,endpoint);return new Response(JSON.stringify(payload));});
    assert.equal(jobs.length,1,`${ats} should normalize its feed`);
  }
});
test('a provider is never marked connected unless its public feed can be fetched',async()=>{
  const unsupported=normalizeCompany({...company,ats:'workday'});
  assert.deepEqual(await testCompanyConnection(unsupported),{status:'not_supported',error:'No tested public connector is available for this provider or career URL.'});
  const failed=await testCompanyConnection(company,async()=>new Response('{}',{status:503}));
  assert.equal(failed.status,'failed');
  const connected=await testCompanyConnection(company,async()=>new Response(JSON.stringify(feed)));
  assert.equal(connected.status,'connected');
  assert.equal(connected.count,2);
});
test('does not trust unsafe apply links and records unknown details honestly',async()=>{
  const jobs=await collectCompanyJobs(company,async()=>new Response(JSON.stringify({jobs:[
    {id:1,title:'Software Engineering Intern',absolute_url:'javascript:alert(1)'}
  ]})));
  assert.equal(jobs.length,0);
});
test('country recognition and text cleanup remain conservative',()=>{
  assert.equal(countryFor('Remote'),'Not specified');
  assert.deepEqual(countriesFor('San Francisco, California; Vancouver, Canada'),['United States','Canada']);
  assert.equal(cleanText('&lt;p&gt;Build &amp; learn&lt;/p&gt;&lt;p&gt;Apply today&lt;/p&gt;'),'Build & learn\nApply today');
});
