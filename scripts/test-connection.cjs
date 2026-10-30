const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const child = spawn(process.execPath, ['server/index.js'], {env:{...process.env,PORT:'3197',API_ACCESS_TOKEN:process.env.TEST_NO_TOKEN === 'true' ? '' : 'test-only-token',PUBLIC_READ_ONLY:process.env.TEST_PUBLIC_READ || 'false',PUBLIC_FULL_ACCESS:process.env.TEST_FULL_ACCESS || 'false',DB_SERVER:'127.0.0.1',DB_PORT:'1'},stdio:'ignore'});
(async()=>{
 try {
  let ready=false;
  for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:3197/dashboard.html');ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready,'Server did not start');
  for(const path of ['/server/index.js','/database/04_data.sql','/.env','/package.json']) assert.equal((await fetch('http://127.0.0.1:3197'+path)).status,404,path);
  assert.equal((await fetch('http://127.0.0.1:3197/dashboard.html')).status,200);
  const read=await fetch('http://127.0.0.1:3197/api/health');
  if(process.env.TEST_PUBLIC_READ === 'true' || process.env.TEST_FULL_ACCESS === 'true') assert.notEqual(read.status,401);
  else assert.equal(read.status,401);
  for(const method of ['POST','PUT','DELETE']) {
    const result=await fetch('http://127.0.0.1:3197/api/customers/0',{method});
    if(process.env.TEST_FULL_ACCESS === 'true') assert.notEqual(result.status,401,method);
    else assert.equal(result.status,401,method);
  }
  const pre=await fetch('http://127.0.0.1:3197/api/health',{method:'OPTIONS',headers:{Origin:'https://kwtt15.github.io','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://kwtt15.github.io');
  assert.equal((await fetch('http://127.0.0.1:3197/api/health',{headers:{Origin:'https://other.example'}})).status,403);
  const authed=await fetch('http://127.0.0.1:3197/api/health',{headers:{Authorization:'Bearer test-only-token',Origin:'https://kwtt15.github.io'}});
  if(process.env.TEST_NO_TOKEN !== 'true') assert.notEqual(authed.status,401);assert.equal(authed.headers.get('access-control-allow-origin'),'https://kwtt15.github.io');
  console.log('Passed: static allowlist, authentication, allowed and rejected origins, preflight. SQL Server unavailable here; database not validated.');
 } finally{child.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
