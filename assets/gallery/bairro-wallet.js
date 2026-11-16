// Storage and transactions only. No rendering, time loop or dependency on levels.
export const GOODS = Object.freeze({
  patience:{name:'PACIÊNCIA',price:5,seconds:60}, courage:{name:'CORAGEM',price:15,seconds:30},
  silence:{name:'SILÊNCIO',price:10,seconds:20}, saudade:{name:'SAUDADE',price:10,seconds:60},
  wifi:{name:'WI-FI DO VIZINHO',price:5,seconds:0}, monday:{name:'SEGUNDA-FEIRA',price:5,seconds:45},
  apology:{name:'DESCULPA',price:20,seconds:0},
});
const KEY='workshop.bairro.wallet.v1';
const amount=n=>Number.isFinite(n)?Math.min(1000000,Math.max(0,Math.floor(n))):0;
export function createBairroWallet({storage=null,day=()=>new Date().getDay(),changed=()=>{}}={}) {
  const state={version:1,pride:0,inventory:[],rancor:Object.create(null),rewards:[]};
  const fights=new Set();
  try { const s=JSON.parse(storage?.getItem(KEY)||'null'); if(s?.version===1){
    state.pride=amount(s.pride);
    if(Array.isArray(s.inventory))state.inventory=s.inventory.filter(id=>Object.hasOwn(GOODS,id)).slice(0,3);
    if(s.rancor&&typeof s.rancor==='object')for(const id of Object.keys(s.rancor).slice(0,100))if(/^[a-z0-9_-]{1,48}$/.test(id))state.rancor[id]=amount(s.rancor[id]);
    if(Array.isArray(s.rewards))state.rewards=s.rewards.filter(id=>typeof id==='string'&&id.length<100).slice(0,128);
  }} catch { /* A disabled or corrupt store never blocks a visit. */ }
  function save(){try{storage?.setItem(KEY,JSON.stringify(state));}catch{} changed(state);}
  function reason(id){if(!Object.hasOwn(GOODS,id))return 'Esse bem não existe.';
    if(state.inventory.length>=3)return 'Os três bolsos estão cheios.';
    if(id==='courage'&&day()!==2)return 'Coragem só às terças.';
    if(state.pride<GOODS[id].price)return 'Falta ORGULHO para isso.';return '';}
  // Called ONLY by the tray collection action. A jam never calls this function.
  function collect(id){if(reason(id))return false;state.pride-=GOODS[id].price;state.inventory.push(id);save();return true;}
  function consume(index){if(!Number.isInteger(index)||index<0||index>=state.inventory.length)return false;state.inventory.splice(index,1);save();return true;}
  function fight(win,value){if(!value||!['string','number'].includes(typeof value.fightId)||!Number.isFinite(value.brioRemaining))return false;
    const id=String(value.fightId);if(fights.has(id))return false;fights.add(id);
    const brio=Math.min(100,Math.max(0,value.brioRemaining));state.pride=amount(state.pride+(win?10+Math.floor(brio/10):-5));
    if(!win&&/^[a-z0-9_-]{1,48}$/.test(value.opponentId||''))state.rancor[value.opponentId]=Math.max(1,state.rancor[value.opponentId]||0);
    save();return true;
  }
  function reward(id,n){if(typeof id!=='string'||id.length>99||state.rewards.includes(id)||!Number.isFinite(n)||n<=0)return false;
    if(state.rewards.length>=128)return false;state.rewards.push(id);state.pride=amount(state.pride+n);save();return true;}
  function reconcile(id){if(!Object.hasOwn(state.rancor,id))return;delete state.rancor[id];save();}
  return {state,reason,collect,consume,fight,reward,reconcile,save};
}
