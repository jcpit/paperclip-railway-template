import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { resolveApprovedRemoteHttpAddresses as resolve } from '../test-runtime/remote-http-endpoint-guard.js';
import { guardedRemoteHttpFetch as fetchGuarded } from '../test-runtime/remote-http-fetch.js';
import { matchesPrivateMcpEndpoint as matches, readPrivateMcpEndpointPolicy as readPolicy, privateMcpEndpointOptions } from '../test-runtime/mcp-private-endpoint-policy.js';
const policy={origin:'https://192.168.1.6:3443',address:'192.168.1.6',ca:'test-only'};
const error=(message,code)=>Object.assign(new Error(message),{code});
const options={privateMcpEndpointPolicy:policy,error,connectTimeoutMs:1000,responseTimeoutMs:1000};
test('public MCP does not depend on private configuration or CA files',()=>{
 const old=process.env.PAPERCLIP_PRIVATE_MCP_CONFIG;
 process.env.PAPERCLIP_PRIVATE_MCP_CONFIG='/nonexistent/private/config.json';
 try { assert.deepEqual(privateMcpEndpointOptions('https://mcp.cloudflare.com/mcp'),{});
 assert.deepEqual(privateMcpEndpointOptions('https://1.1.1.1/mcp'),{}); }
 finally { if(old===undefined) delete process.env.PAPERCLIP_PRIVATE_MCP_CONFIG; else process.env.PAPERCLIP_PRIVATE_MCP_CONFIG=old; }
});
test('same approved host permits current and future MCP paths',async()=>{
 for(const path of ['/cipp/mcp','/future-service/mcp','/future-service/mcp?session=opaque']){
  const u=new URL(policy.origin+path); assert.equal(matches(u,policy),true);
  assert.deepEqual(await resolve(u,options,error),[policy.address]);
 }
});
test('other hosts, ports, plaintext, metadata and linklocal remain blocked',async()=>{
 for(const url of ['https://192.168.1.7:3443/mcp','https://10.0.0.1:3443/mcp',
 'https://172.16.0.1:3443/mcp','https://127.0.0.1:3443/mcp','http://192.168.1.6:3443/mcp',
 'https://192.168.1.6:3444/mcp','http://169.254.169.254/latest/meta-data/',
 'https://[::1]:3443/mcp','https://[fe80::1]:3443/mcp','https://[fd00::1]:3443/mcp']){
  assert.equal(matches(new URL(url),policy),false,url);
  await assert.rejects(resolve(new URL(url),options,error),undefined,url);
 }
});
test('unconfigured policy cannot approve private targets',async()=>{
 assert.equal(readPolicy({}),undefined);
 await assert.rejects(resolve(new URL(policy.origin+'/mcp'),{},error));
 assert.equal(matches(new URL('https://user:password@192.168.1.6:3443/mcp'),policy),false);
});
test('public Cloudflare-style DNS keeps approved public address and rejects rebinding answer',async()=>{
 let calls=0;
 const lookup=async()=>{calls++;return [{address:'104.16.132.229',family:4}];};
 assert.deepEqual(await resolve(new URL('https://mcp.cloudflare.com/mcp'),{...options,lookup},error),['104.16.132.229']);
 assert.equal(calls,1);
 await assert.rejects(resolve(new URL('https://mcp.cloudflare.com/mcp'),
 {...options,lookup:async()=>[{address:'192.168.1.6',family:4}]},error));
});
test('public literal retains platform fetch and private policy is not applied',async()=>{
 let calls=0;
 const response=await fetchGuarded('https://1.1.1.1/mcp',{},{
 ...options,unpinnedFetch:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response('public');}});
 assert.equal(await response.text(),'public');assert.equal(calls,1);
});
test('actual socket peer mismatch fails before TLS or request bytes',async()=>{
 let bytes=0;let sockets=[];
 const server=net.createServer(s=>{sockets.push(s);s.on('data',b=>{bytes+=b.length;});});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port;
 try{
  await assert.rejects(fetchGuarded(policy.origin+'/mcp',{},{
   ...options,socketFactory:()=>net.connect({host:'127.0.0.1',port})
  }),{code:'remote_http_private_endpoint'});
  assert.equal(bytes,0);
 }finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
});

