import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
const source=process.argv[2] ?? 'patched/server/src/services';
const out=process.argv[3] ?? 'test-runtime';
fs.mkdirSync(out,{recursive:true});
for(const name of ['mcp-private-endpoint-policy','remote-http-endpoint-guard','remote-http-fetch','remote-connection-failure']){
 const candidate=source+'/'+name+'.ts';
 const file=fs.existsSync(candidate)?candidate:'upstream/server/src/services/'+name+'.ts';
 fs.writeFileSync(path.join(out,name+'.js'),stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'transform'}));
}
fs.writeFileSync(path.join(out,'package.json'),'{"type":"module"}');

