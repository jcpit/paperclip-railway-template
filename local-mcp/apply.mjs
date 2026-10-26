import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root=process.argv[2] ?? '/app';
const manifest=JSON.parse(fs.readFileSync(new URL('./source-hashes.json',import.meta.url)));
const changes=JSON.parse(fs.readFileSync(new URL('./replacements.json',import.meta.url)));
for(const [file,expected] of Object.entries(manifest)){
 const actual=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 if(actual!==expected) throw new Error('Pinned upstream source mismatch: '+file);
}
const targets=new Map();
for(const change of changes){
 const file=path.join(root,change.path);
 let source=targets.get(file) ?? fs.readFileSync(file,'utf8');
 const count=source.split(change.oldText).length-1;
 if(count!==(change.all?2:1)) throw new Error('Patch anchor mismatch: '+change.path);
 targets.set(file,source.split(change.oldText).join(change.newText));
}
targets.set(path.join(root,'server/src/services/mcp-private-endpoint-policy.ts'),
 fs.readFileSync(new URL('./policy.ts',import.meta.url),'utf8'));
const require=createRequire(path.join(root,'server/package.json'));
const { transform }=require('esbuild');
for(const [file,source] of targets){
 fs.writeFileSync(file,source);
 const dest=file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
 const compiled=await transform(source,{loader:'ts',format:'esm',target:'node24',sourcefile:file});
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,compiled.code);
}
console.log('PRIVATE_MCP_PATCH_APPLIED',targets.size);

