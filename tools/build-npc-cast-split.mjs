import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const input=process.argv[2]||'assets/data/npc-cast.json';
const npcSource=process.argv[3]||'assets/gallery/spaces/npcs.js';
const out=process.argv[4]||'assets/data/cast';
const bytes=fs.readFileSync(input),data=JSON.parse(bytes);
const source=fs.readFileSync(npcSource,'utf8');
const specs=source.slice(source.indexOf('const SPECS = ['),source.indexOf('// ---------- casting ----------'));
const slots=[];
for(const match of specs.matchAll(/\{ name: '([^']+)'[\s\S]*?home: \[([^\]]+)\]/g)){
 const home=match[2].split(',').map(v=>Number(v.trim()));if(home.length!==2||home.some(v=>!Number.isFinite(v)))throw Error('Invalid home '+match[1]);
 slots.push({slot:slots.length,legacyId:match[1],defaultId:match[1]==='rooster'?'fabinhe':match[1],home});
}
// Fourteen campus slots (SPECS) and four for the influencers (EXTRA: the market and the campus stop).
if(slots.length!==18)throw Error('Expected eighteen source slots, got '+slots.length);
fs.mkdirSync(out,{recursive:true});
const {characters,...metadata}=data;
const manifest={version:1,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.length,metadata,slots,characters:[]};
for(const entry of characters){
 if(!/^[a-z0-9_]+$/.test(entry.id))throw Error('Unsafe id');
 const file=entry.id+'.json',text=JSON.stringify(entry)+'\n';
 fs.writeFileSync(path.join(out,file),text);
 manifest.characters.push({id:entry.id,file,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),legacy:!!entry.legacy,enabledByDefault:!!entry.enabledByDefault});
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({characters:characters.length,sourceBytes:bytes.length,total:manifest.characters.reduce((s,c)=>s+c.bytes,0),max:Math.max(...manifest.characters.map(c=>c.bytes)),manifest:fs.statSync(path.join(out,'manifest.json')).size,slots:slots.length}));
