import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';

const read=p=>fs.readFileSync(new URL('../assets/'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('data/cast/manifest.json'));
const home=id=>manifest.slots.find(s=>s.defaultId===id).home;

// With the comedy engine on, the old inline answers (barks, half-barked sentences, the shout) are
// refused, so for the barkers (mano, velho) and the forcado a third of the talks used to show
// nothing at all. Every talk must now get a visible answer, or start a scene that speaks.
test('talking to the mano, the old man and the forcado always gets a visible answer',async()=>{
  const previous=globalThis.fetch,previousRandom=Math.random,errors=[];
  globalThis.fetch=async url=>{const path=new URL(url).pathname,m=path.match(/assets\/(data\/.+\.json)$/);if(!m)return {ok:false};return {ok:true,text:async()=>read(m[1])};};
  const scene=new THREE.Scene(),ctx={THREE,scene,startup:{moved:true},quality:'low',audio:{muted:true},M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},yieldBuild:async()=>{},onActorError:(id,e)=>errors.push([id,e.message])};
  let mod,seed=7;
  try{
    const {build}=await import('../assets/gallery/spaces/npcs.js');mod=build(ctx);
    const camera=new THREE.PerspectiveCamera();let time=0;const frame=()=>({camera,time:time+=.1,level:0});
    const step=async(n)=>{for(let i=0;i<n;i++){mod.update(.1,frame());await new Promise(r=>setTimeout(r,1));}};
    for(const id of ['mano','velho','forcado']){
      const [hx,hz]=home(id);camera.position.set(hx+2,1.62,hz+2);camera.updateMatrixWorld();
      await step(140);
      const n=mod.actors.find(a=>a.S.name===id);assert.ok(n,id+' streamed in');
      let silent=0;
      for(let k=0;k<14;k++){
        // Walk the dice through every branch the old code had (bark 35%, shout 12%, again 55%).
        const v=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);Math.random=()=>v;
        // A wind-up (about to slap you) or a pest who finally gets listened to answer with the body.
        const busy=n.windT>0||n.pestT>0;
        mod.onPick(n.hit);Math.random=previousRandom;
        // The answer, or the first line of a scene the talk started (a scene waits for the
        // speaker's little turn, about a second), must show within 2.5 s.
        let heard=false;for(let i=0;i<25&&!heard;i++){await step(1);heard=mod.actors.some(a=>a.talkT>0&&a.curText);}
        if(!heard&&!busy)silent++;
        await step(60);   // let the bubble and any scene finish before the next try
      }
      assert.equal(silent,0,id+': talks with no visible answer');
    }
    assert.deepEqual(errors,[]);
  }finally{Math.random=previousRandom;mod?.dispose();globalThis.fetch=previous;}
});
