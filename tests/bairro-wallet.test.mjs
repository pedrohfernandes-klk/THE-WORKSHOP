// Written for Claude; not executed during authoring.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBairroWallet,GOODS} from '../assets/gallery/bairro-wallet.js';
const fight=(fightId,brioRemaining=100,extra={})=>({fightId,brioRemaining,opponentId:'forcado',...extra});
function funded(day=2){const w=createBairroWallet({day:()=>day});w.reward('fixture',100);return w;}
test('loss never makes ORGULHO negative',()=>{
 const w=createBairroWallet();assert.equal(w.fight(false,fight('loss',0)),true);assert.equal(w.state.pride,0);
 assert.equal(w.state.rancor.forcado,1);
});
test('win formula uses remaining BRIO, not the supplied amount',()=>{
 const w=createBairroWallet();w.fight(true,fight('full',100,{amount:999999}));assert.equal(w.state.pride,20);
 w.fight(true,fight('partial',55,{amount:-999}));assert.equal(w.state.pride,35);
});
test('one fight cannot pay twice, including numeric/string aliases',()=>{
 const w=createBairroWallet();assert.equal(w.fight(true,fight(7,100)),true);assert.equal(w.fight(true,fight('7',100)),false);
 assert.equal(w.fight(false,fight(7,0)),false);assert.equal(w.state.pride,20);
});
test('BRIO is clamped and invalid fight payloads do not pay',()=>{
 const w=createBairroWallet();assert.equal(w.fight(true,fight('invalid',NaN)),false);assert.equal(w.fight(true,null),false);
 w.fight(true,fight('high',999));w.fight(true,fight('negative',-50));assert.equal(w.state.pride,30);
});
test('availability checks do not charge: collection is the transaction',()=>{
 const w=funded(),before=w.state.pride;
 for(let i=0;i<10;i++)assert.equal(w.reason('patience'),'');
 assert.equal(w.state.pride,before);assert.deepEqual(w.state.inventory,[]);
 assert.equal(w.collect('patience'),true);assert.equal(w.state.pride,before-GOODS.patience.price);assert.deepEqual(w.state.inventory,['patience']);
});
test('insufficient funds and unknown goods leave inventory and balance intact',()=>{
 const w=createBairroWallet();assert.ok(w.reason('patience'));assert.equal(w.collect('patience'),false);assert.equal(w.collect('invented'),false);
 assert.equal(w.state.pride,0);assert.deepEqual(w.state.inventory,[]);
});
test('three pockets maximum; rejected fourth collection is not charged',()=>{
 const w=funded();for(let i=0;i<3;i++)assert.equal(w.collect('patience'),true);
 const before=w.state.pride;assert.equal(w.collect('wifi'),false);assert.equal(w.state.pride,before);assert.equal(w.state.inventory.length,3);
 assert.equal(w.consume(1),true);assert.equal(w.collect('wifi'),true);assert.equal(w.state.inventory.length,3);
 assert.equal(w.consume(-1),false);assert.equal(w.consume(3),false);
});
test('CORAGEM can only be collected on Tuesday',()=>{
 const monday=funded(1),tuesday=funded(2);assert.equal(monday.collect('courage'),false);assert.equal(monday.state.pride,100);
 assert.equal(tuesday.collect('courage'),true);assert.equal(tuesday.state.pride,85);
});
test('blocked storage cannot prevent collecting or rewarding',()=>{
 const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 const w=createBairroWallet({storage});assert.equal(w.reward('quest:one',15),true);assert.equal(w.collect('patience'),true);assert.equal(w.state.pride,10);
});
test('malformed stored JSON starts safely with an empty wallet',()=>{
 const w=createBairroWallet({storage:{getItem:()=>'{broken',setItem(){}}});assert.equal(w.state.pride,0);assert.deepEqual(w.state.inventory,[]);
});
test('loaded data is bounded and filters unknown goods',()=>{
 const raw=JSON.stringify({version:1,pride:-8,inventory:['fake','wifi','patience','silence','monday'],rancor:{forcado:3,'bad id':99},rewards:['quest:old']});
 const w=createBairroWallet({storage:{getItem:()=>raw,setItem(){}}});assert.equal(w.state.pride,0);assert.deepEqual(w.state.inventory,['wifi','patience','silence']);
 assert.equal(w.state.rancor.forcado,3);assert.equal(w.state.rancor['bad id'],undefined);
});
test('quest and password rewards pay once and remain deduplicated after reload',()=>{
 let saved=null;const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
 const w=createBairroWallet({storage});assert.equal(w.reward('quest:nata',15),true);assert.equal(w.reward('quest:nata',15),false);
 assert.equal(w.reward('password:studio',5),true);assert.equal(w.reward('password:studio',5),false);assert.equal(w.state.pride,20);
 const loaded=createBairroWallet({storage});assert.equal(loaded.reward('quest:nata',15),false);assert.equal(loaded.reward('password:studio',5),false);assert.equal(loaded.state.pride,20);
});
test('reconciliation removes only the named grudge, not reward history',()=>{
 const w=createBairroWallet();w.fight(false,fight('loss',0));w.reward('quest:nata',15);w.reconcile('forcado');
 assert.equal(w.state.rancor.forcado,undefined);assert.deepEqual(w.state.rewards,['quest:nata']);assert.equal(w.state.pride,15);
});
