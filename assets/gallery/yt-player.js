import {validVideoId} from './video-link.js';
const params=new URLSearchParams(location.search),id=params.get('v'),list=params.get('list'),validList=/^[A-Za-z0-9_-]{10,128}$/.test(list||''),play=document.getElementById('play'),slot=document.getElementById('player');
if(!validVideoId(id)&&!validList){play.disabled=true;document.getElementById('status').textContent='Escolhe uma ligação válida.';}
function close(){slot.replaceChildren();if(parent!==window)parent.postMessage({type:'workshop-reader-close'},location.origin);}
play.addEventListener('click',()=>{
 if(!validVideoId(id)&&!validList)return;
 const iframe=document.createElement('iframe');iframe.title='Vídeo YouTube — controlos e legendas';iframe.allow='fullscreen; encrypted-media; picture-in-picture';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
 const target=validList?'videoseries?list='+encodeURIComponent(list)+'&':id+'?';
 iframe.src='https://www.youtube-nocookie.com/embed/'+target+'autoplay=0&controls=1&playsinline=1&cc_load_policy=1&cc_lang_pref=pt&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
 slot.replaceChildren(iframe);play.hidden=true;document.getElementById('close').focus();
});
document.getElementById('close').addEventListener('click',close);addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
document.getElementById('close').focus();


const ALLOWED_FUNCS=Object.freeze({playVideo:1,pauseVideo:1,stopVideo:1,mute:1,unMute:1,setVolume:1});
addEventListener('message',ev=>{
 if(ev.source!==window.parent)return;
 // Legacy file:// callers explicitly opt in; source must still be the actual parent.
 const legacyFile=ev.origin==='null'&&params.get('legacyFile')==='1';
 if(ev.origin!==location.origin&&!legacyFile)return;
 let data=ev.data;if(typeof data==='string'){try{data=JSON.parse(data);}catch{return;}}
 if(!data||typeof data!=='object')return;
 const func=data.func;
 if(typeof func!=='string'||!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCS,func))return;
 const iframe=slot.querySelector('iframe');if(!iframe)return; // Consent cannot be bypassed by messages.
 let args=[];
 if(func==='setVolume'){const volume=Array.isArray(data.args)?data.args[0]:NaN;if(typeof volume!=='number'||!Number.isFinite(volume))return;args=[Math.max(0,Math.min(100,volume))];}
 iframe.contentWindow.postMessage(JSON.stringify({event:'command',func,args}),'https://www.youtube-nocookie.com');
});
