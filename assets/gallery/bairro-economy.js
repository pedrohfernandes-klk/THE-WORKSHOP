import {createBairroWallet,GOODS} from './bairro-wallet.js';

export function createBairroEconomy(ctx,{camera,controls,canAct=()=>true,setOverlay=()=>{},weather=()=>null,now=()=>performance.now()/1000,day=()=>new Date().getDay()}={}) {
  const ud=ctx.scene.userData,fx={patienceUntil:0,courageUntil:0,silenceUntil:0,saudadeUntil:0,mondayUntil:0,wifiHint:false};
  ud.bairroEffects=fx;
  let store=null;try{store=globalThis.localStorage;}catch{}
  let list=null,balance=null,dialog=null,previousFocus=null,previousSky=null,saudadeActive=false,serial=0,disposed=false;
  const restored=new WeakSet(),position={x:0,y:0,z:0};
  const toast=text=>ctx.ui?.toast?.(text);
  const wallet=createBairroWallet({storage:store,day,changed:render});
  function emit(type,value){ctx.events?.dispatchEvent(new CustomEvent('workshop',{detail:{type,value}}));}
  function canBuy(id){const why=wallet.reason(id);if(why)toast(why);return !why;}
  function buy(id){if(!canBuy(id)||!wallet.collect(id))return false;toast('Troco? Dois botões.');return true;}
  function visitor(){if(controls?.readPosition)controls.readPosition(position);else if(camera){position.x=camera.position.x;position.y=camera.position.y;position.z=camera.position.z;}return position;}
  function closestGrudge(){const actors=ud.combatAPI?.actors||[],p=visitor();let best=null,distance=12.25;
    for(let i=0;i<actors.length;i++){const n=actors[i],id=n.S.name;if(!n.rancor&&!wallet.state.rancor[id])continue;
      const dx=n.x-p.x,dz=n.z-p.z,d=dx*dx+dz*dz;if(Math.abs((n.baseY||0)-(p.y-1.62))<1&&d<=distance){best=n;distance=d;}}
    return best;}
  function use(index){if(disposed||!Number.isInteger(index)||index<0||index>=wallet.state.inventory.length)return false;
    const id=wallet.state.inventory[index],g=GOODS[id],t=now();let target=null;
    if(id==='courage'&&day()!==2){toast('Coragem só às terças.');return false;}
    if(id==='apology'){target=closestGrudge();if(!target||!ud.combatAPI?.apologize(target.S.name)){toast('Aproxima-te de quem guarda rancor.');return false;}}
    if(id==='patience'){fx.patienceUntil=t+60;toast('Hoje não me apetece porrada.');}
    else if(id==='courage'){fx.courageUntil=t+30;toast('Compraste coragem? Nota-se.');}
    else if(id==='silence'){fx.silenceUntil=t+20;toast('Vinte segundos. Ouve o silêncio.');}
    else if(id==='saudade'){if(!saudadeActive)previousSky=ud.weather?.mode||'golden';saudadeActive=true;fx.saudadeUntil=t+60;weather()?.set?.('golden');toast('Saudade. Ainda agora chegaste.');}
    else if(id==='wifi'){fx.wifiHint=true;toast('O vizinho sabe a senha.');}
    else if(id==='monday'){fx.mondayUntil=t+45;toast('Hoje o bairro arrasta-se.');}
    else if(id==='apology'){wallet.reconcile(target.S.name);emit('reconciled',{npcId:target.S.name});toast('O rancor ficou na máquina.');}
    wallet.consume(index);emit('vending-use',{id,useId:'good:'+ ++serial});return true;
  }
  function onEvent(event){const d=event.detail;if(!d)return;const v=d.value;
    if(d.type==='porrada-win'||d.type==='porrada-loss')wallet.fight(d.type==='porrada-win',v);
    else if(d.type==='quest-done'&&typeof v?.id==='string')wallet.reward('quest:'+v.id,15);
    else if(d.type==='password-ok'&&typeof v?.buildingId==='string')wallet.reward('password:'+v.buildingId,5);
    else if(d.type==='reconciled'&&typeof v?.npcId==='string')wallet.reconcile(v.npcId);
  }
  function render(){if(!balance||!list)return;balance.textContent=wallet.state.pride+' ORGULHO';
    list.replaceChildren();if(!wallet.state.inventory.length){const p=document.createElement('p');p.textContent='Três bolsos. Ainda nenhum bem.';list.append(p);return;}
    wallet.state.inventory.forEach((id,index)=>{const b=document.createElement('button');b.type='button';b.textContent='Usar '+GOODS[id].name;b.addEventListener('click',()=>{if(use(index))close();});list.append(b);});}
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./bairro-ui.css',import.meta.url).href;document.head.append(css);
  const hud=document.createElement('div');hud.id='bairro-hud';hud.hidden=true;balance=document.createElement('span');balance.setAttribute('aria-live','polite');
  const openButton=document.createElement('button');openButton.type='button';openButton.textContent='BOLSO · I';openButton.addEventListener('click',open);hud.append(balance,openButton);document.body.append(hud);
  dialog=document.createElement('dialog');dialog.id='bairro-dialog';dialog.setAttribute('aria-labelledby','bairro-title');
  const title=document.createElement('h2');title.id='bairro-title';title.textContent='Bens imateriais';
  const help=document.createElement('p');help.textContent='Até três bens. Escolhe um para usar.';list=document.createElement('div');
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='Fechar';closeButton.addEventListener('click',close);dialog.append(title,help,list,closeButton);document.body.append(dialog);
  function open(){if(!canAct()||dialog.open)return;previousFocus=document.activeElement;setOverlay(true);controls?.exitLock?.();
    try{dialog.showModal();list.querySelector('button')?.focus();}catch{setOverlay(false);}}
  function close(){if(dialog.open)dialog.close();}
  dialog.addEventListener('close',()=>{setOverlay(false);previousFocus?.isConnected&&previousFocus.focus({preventScroll:true});previousFocus=null;});
  for(const type of ['keydown','keyup','pointerdown','pointerup','click'])dialog.addEventListener(type,e=>{if(type==='keydown')key(e);e.stopPropagation();});
  function key(e){if(e.code!=='KeyI'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(dialog.open){e.preventDefault();close();}else if(canAct()){e.preventDefault();open();}}
  window.addEventListener('keydown',key);ctx.events?.addEventListener('workshop',onEvent);render();
  function update(){if(disposed)return;const t=now();hud.hidden=!canAct()&&!dialog.open;
    if(saudadeActive&&t>=fx.saudadeUntil){saudadeActive=false;if(ud.weather?.mode==='golden')weather()?.set?.(previousSky);previousSky=null;}
    const actors=ud.combatAPI?.actors;if(!actors)return;
    for(let i=0;i<actors.length;i++){const n=actors[i];if(restored.has(n))continue;restored.add(n);n.rancor=Math.max(n.rancor||0,wallet.state.rancor[n.S.name]||0);}
  }
  function dispose(){if(disposed)return;disposed=true;close();window.removeEventListener('keydown',key);ctx.events?.removeEventListener('workshop',onEvent);hud.remove();dialog.remove();css.remove();if(ud.bairroInventory===api)delete ud.bairroInventory;if(ud.bairroEffects===fx)delete ud.bairroEffects;}
  const api={wallet,inventory:wallet.state.inventory,goods:GOODS,effects:fx,canBuy,buy,use,update,dispose};ud.bairroInventory=api;return api;
}
