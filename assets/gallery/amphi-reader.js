import {youtubeId} from './video-link.js';
const sites=[['SayWhat','https://pedrohfernandes-klk.github.io/SayWhat/'],['No Worries','https://pedrohfernandes-klk.github.io/NO-WORRIES/'],['Português','https://pedrohfernandes-klk.github.io/pt/'],['Lente','https://pedrohfernandes-klk.github.io/lente/']];
const frame=document.getElementById('content'),view=document.getElementById('view'),status=document.getElementById('status');let returnFocus=null;
function clear(){frame.src='about:blank';frame.removeAttribute('src');view.hidden=true;returnFocus?.focus();}
function close(){clear();if(parent!==window)parent.postMessage({type:'workshop-reader-close'},location.origin);}
function open(url,title){returnFocus=document.activeElement;frame.title=title;frame.src=url;view.hidden=false;document.getElementById('back').focus();}
for(const [title,url] of sites){const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',()=>open(url,title));document.getElementById('sites').append(b);}
document.getElementById('video-form').addEventListener('submit',e=>{e.preventDefault();const id=youtubeId(document.getElementById('video-url').value.trim());if(!id){status.textContent='Ligação do YouTube inválida.';return;}status.textContent='';open('../../yt.html?v='+encodeURIComponent(id),'Vídeo escolhido');});
document.getElementById('back').addEventListener('click',clear);document.getElementById('close').addEventListener('click',close);
addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||view.hidden)return;if(e.data?.type==='workshop-reader-close')close();});
document.getElementById('close').focus();

