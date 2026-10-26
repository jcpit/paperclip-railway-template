import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import https from 'node:https';
import { once } from 'node:events';
import { guardedRemoteHttpFetch as fetchGuarded } from '../test-runtime/remote-http-fetch.js';
import { readPrivateMcpEndpointPolicy as readPolicy } from '../test-runtime/mcp-private-endpoint-policy.js';
const dir=process.env.MCP_TEST_CERT_DIR;
const error=(message,code)=>Object.assign(new Error(message),{code});
const tests=dir?test:test.skip;
async function fixture(cert,fn){
 const sockets=new Set();let requests=0;
 const server=https.createServer({key:fs.readFileSync(dir+'/server.key'),cert:fs.readFileSync(dir+'/'+cert)},(req,res)=>{
  requests++;
  if(req.url==='/redirect'){res.writeHead(302,{location:'https://169.254.169.254/latest/meta-data/'});res.end();}
  else{res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');}
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const policy={origin:'https://192.168.1.6:3443',address:'192.168.1.6',ca:fs.readFileSync(dir+'/ca.crt','utf8')};
 const options={privateMcpEndpointPolicy:policy,error,connectTimeoutMs:1500,responseTimeoutMs:1500,
 socketFactory:({address})=>{
  const s=net.connect({host:'127.0.0.1',port:server.address().port});
  Object.defineProperty(s,'remoteAddress',{get:()=>address});return s;
 }};
 try{await fn({policy,options,requests:()=>requests});}
 finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
}
tests('private service CA and certificate identity permit real TLS request',async()=>{
 await fixture('server.crt',async({policy,options,requests})=>{
  const response=await fetchGuarded(policy.origin+'/future-service/mcp',{},options);
  assert.deepEqual(await response.json(),{ok:true});assert.equal(requests(),1);
 });
});
tests('private redirect is rejected without following it',async()=>{
 await fixture('server.crt',async({policy,options,requests})=>{
  await assert.rejects(fetchGuarded(policy.origin+'/redirect',{},options),{code:'remote_http_private_redirect_rejected'});
  assert.equal(requests(),1);
 });
});
tests('wrong certificate identity fails before HTTP request',async()=>{
 await fixture('wrong-name.crt',async({policy,options,requests})=>{
  await assert.rejects(fetchGuarded(policy.origin+'/mcp',{},options));assert.equal(requests(),0);
 });
});
tests('private service CA is never supplied to a public endpoint',async()=>{
 await fixture('server.crt',async({options,requests})=>{
  await assert.rejects(fetchGuarded('https://mcp.cloudflare.com/mcp',{},{
   ...options,lookup:async()=>[{address:'104.16.132.229',family:4}]
  }));assert.equal(requests(),0);
 });
});
(dir && process.platform === 'linux' ? test : test.skip)('administrator configuration is root owned and future paths use same origin',()=>{
 const path=dir+'/config.json';
 fs.writeFileSync(path,JSON.stringify({version:1,origin:'https://192.168.1.6:3443',caFile:dir+'/ca.crt'}),{mode:0o644});
 const p=readPolicy({PAPERCLIP_PRIVATE_MCP_CONFIG:path});
 assert.equal(p.address,'192.168.1.6');
 fs.chmodSync(path,0o666);
 assert.throws(()=>readPolicy({PAPERCLIP_PRIVATE_MCP_CONFIG:path}),/root owned/);
 fs.chmodSync(path,0o644);
});

