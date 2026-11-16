import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {WORKS} from '../assets/gallery/catalogue.js';
const root=new URL('../',import.meta.url),manifestURL=new URL('assets/gallery/previews/manifest.json',root);
const manifestBytes=fs.readFileSync(manifestURL),manifest=JSON.parse(manifestBytes);
const digest=data=>createHash('sha256').update(data).digest('hex');
test('every WORKS source has an existing, current WebP preview and source digest',()=>{
 assert.equal(manifest.workCount,WORKS.length);
 for(const work of WORKS){const entry=manifest.bySrc[work.src];assert.ok(entry,'Missing manifest artwork '+work.id);assert.equal(manifest.byId[work.id],entry.preview);
  assert.match(entry.preview,/^assets\/gallery\/previews\/[a-zA-Z0-9_.-]+\.webp$/);
  const data=fs.readFileSync(new URL(entry.preview,root));assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(data.length,entry.bytes);assert.equal(digest(data),entry.sha256);const source=fs.readFileSync(new URL(work.src,root));assert.equal(digest(source),entry.sourceSha256);assert.equal(source.length,entry.sourceBytes);
 }
});
test('previews retain aspect, never upscale, and respect file and 15-frame budgets',()=>{
 const entries=Object.values(manifest.bySrc);assert.equal(entries.length,manifest.sourceCount);
 for(const e of entries){assert.ok(e.width>0&&e.height>0);assert.ok(Math.max(e.width,e.height)<=512);assert.ok(e.width<=e.sourceWidth&&e.height<=e.sourceHeight);assert.ok(e.bytes<=36000);assert.ok(Math.abs(e.width/e.height-e.sourceWidth/e.sourceHeight)<=2/e.height);}
 const largest=entries.map(e=>e.bytes).sort((a,b)=>b-a).slice(0,15).reduce((a,b)=>a+b,0);assert.equal(largest,manifest.largest15Bytes);assert.ok(largest+manifestBytes.length<=600000);
});
