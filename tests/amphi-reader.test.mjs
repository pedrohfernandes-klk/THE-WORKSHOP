import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {youtubeId} from '../assets/gallery/video-link.js';
test('only explicit YouTube video links are accepted',()=>{for(const link of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk'])assert.equal(youtubeId(link),'abcdefghijk');for(const link of ['javascript:alert(1)','https://youtube.com.evil.org/watch?v=abcdefghijk','https://user:pass@youtube.com/watch?v=abcdefghijk','https://youtube.com/watch?v=abc','https://youtube.com/playlist?list=PL123'])assert.equal(youtubeId(link),null);});
test('relay has no remote JS/API and parent close bridge checks origin, sender and active frame',async()=>{const root='../';const yt=await readFile(new URL(root+'yt.html',import.meta.url),'utf8'),ui=await readFile(new URL(root+'assets/gallery/ui.js',import.meta.url),'utf8');assert.doesNotMatch(yt,/iframe_api|unsafe-inline|s.ytimg/);assert.match(yt,/frame-src https:\/\/www.youtube-nocookie.com/);assert.match(ui,/event.origin!==location.origin\|\|event.source!==appFrame.contentWindow/);assert.match(ui,/!appBox.classList.contains\('is-on'\)/);});

import vm from 'node:vm';
test('actual relay enforces consent, sender, origin, verbs and finite volume for playlists',async()=>{
 const source=(await readFile(new URL('../assets/gallery/yt-player.js',import.meta.url),'utf8')).replace("import {validVideoId} from './video-link.js';", "const validVideoId=id=>/^[A-Za-z0-9_-]{11}$/.test(id||'');");
 const handlers={},clicks={},sent=[],parent={},sibling={};let child=null;
 const elements={play:{addEventListener:(_e,fn)=>clicks.play=fn},close:{addEventListener:(_e,fn)=>clicks.close=fn,focus(){}},status:{},player:{replaceChildren(value){child=value||null;},querySelector(){return child;}}};
 const context={URLSearchParams,location:{origin:'https://workshop.test',search:'?list=PLabcdefghijk'},parent,window:{parent},document:{getElementById:id=>elements[id],createElement:()=>({contentWindow:{postMessage:(data,origin)=>sent.push({data:JSON.parse(data),origin})}})},addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(source,context);
 const send=(data,origin='https://workshop.test',source=parent)=>handlers.message({data,origin,source});
 send({func:'playVideo'});assert.equal(sent.length,0);clicks.play();assert.match(child.src,/videoseries\?list=PLabcdefghijk/);
 send({func:'playVideo'},'https://evil.test');send({func:'playVideo'},'https://workshop.test',sibling);send({func:'constructor'});send({func:'setVolume',args:[Infinity]});assert.equal(sent.length,0);
 send({func:'setVolume',args:[150]});assert.equal(sent[0].data.args[0],100);assert.equal(sent[0].origin,'https://www.youtube-nocookie.com');
 send(JSON.stringify({event:'command',func:'pauseVideo'}));assert.equal(sent[1].data.func,'pauseVideo');
});
