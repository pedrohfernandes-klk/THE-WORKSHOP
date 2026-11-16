// Authored for Claude to run AFTER applying statues-integration.patch. Not executed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceManager } from '../assets/gallery/voice-manager.js';
function context(){
 const ac={currentTime:0,state:'running'};
 ac.createGain=()=>({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelAndHoldAtTime(){},cancelScheduledValues(){}},connect(){},disconnect(){}});
 return ac;
}
test('24 admissions are shared between two audio contexts',()=>{
 const a=context(),b=context(),manager=createVoiceManager(a),tokens=[];
 for(let i=0;i<24;i++)tokens.push(manager.acquireVoice({priority:1,foreground:false,ms:10000,sourceContext:i%2?a:b}));
 assert.ok(tokens.every(Boolean));assert.equal(manager.stats().voices,24);
 assert.equal(manager.acquireVoice({priority:1,ms:10000,sourceContext:b}),null);
 manager.dispose();assert.equal(manager.stats().voices,0);
});
test('foreground cap remains six across both contexts',()=>{
 const a=context(),b=context(),manager=createVoiceManager(a);
 for(let i=0;i<6;i++)assert.ok(manager.acquireVoice({priority:3,foreground:true,ms:10000,sourceContext:i%2?a:b}));
 assert.equal(manager.acquireVoice({priority:3,foreground:true,ms:1000,sourceContext:b}),null);
 manager.dispose();
});
test('suspended NPC clock retains a voice while ambient time advances',()=>{
 const a=context(),b=context(),manager=createVoiceManager(a);
 const token=manager.acquireVoice({priority:2,foreground:true,ms:1000,sourceContext:b});
 b.currentTime=.4;b.state='suspended';a.currentTime=120;manager.tick();assert.equal(token.active,true);
 assert.equal(manager.acquireVoice({ms:1000,sourceContext:b}),null);
 b.state='running';b.currentTime=.99;manager.tick();assert.equal(token.active,true);
 b.currentTime=1.01;manager.tick();assert.equal(token.active,false);
});
test('global quiet retires voices even while their context is suspended',()=>{
 const a=context(),b=context(),manager=createVoiceManager(a);
 const token=manager.acquireVoice({priority:3,foreground:true,ms:5000,sourceContext:b});
 b.state='suspended';let released=0;token.onRelease=()=>released++;
 manager.stopAll('quiet');assert.equal(token.active,false);assert.equal(released,1);assert.equal(manager.stats().voices,0);
});
test('a higher priority still retires the oldest suspended voice without a fade slot',()=>{
 const a=context(),b=context(),manager=createVoiceManager(a);
 const paused=manager.acquireVoice({priority:1,foreground:true,ms:5000,sourceContext:b});b.state='suspended';
 for(let i=0;i<5;i++)manager.acquireVoice({priority:3,foreground:true,ms:5000,sourceContext:a});
 assert.ok(manager.acquireVoice({priority:3,foreground:true,ms:1000,sourceContext:a}));
 assert.equal(paused.active,false);assert.equal(manager.stats().fading,0);assert.equal(manager.stats().stolen,1);manager.dispose();
});
