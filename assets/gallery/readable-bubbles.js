const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const bubbleDuration=text=>1.8+.060*String(text).length;
// CSS pixels, not drawing-buffer pixels: high-DPI phones remain readable.
export function bubbleLayout(width,height,headX,headY,near,out){
 out.width=Math.min(256,width*.4,height*.4);out.height=Math.min(out.width,height*.4);
 const gap=12,hw=out.width/2,hh=out.height/2;
 let cx=near?headX+(headX<width*.5?1:-1)*(hw+32):headX;
 let cy=near?headY:headY-hh-28;
 out.x=clamp(cx,gap+hw,width-gap-hw);out.y=clamp(cy,gap+hh,height-gap-hh);
 out.tail=Math.round(Math.atan2(headY-out.y,headX-out.x)/(Math.PI/4));return out;
}
export function createReadableBubbles(THREE,{renderer,userData}){
 const records=[],byNpc=new WeakMap(),chosen=[null,null,null],distances=new Float64Array(3);
 const rectangles=new Float64Array(12);
 const head=new THREE.Vector3(),view=new THREE.Vector3(),position=new THREE.Vector3();
 const layout={x:0,y:0,width:0,height:0,tail:0};let width=0,height=0;
 function viewport(){
  const canvas=renderer?.domElement;
  const w=canvas?.clientWidth||globalThis.innerWidth||800,h=canvas?.clientHeight||globalThis.innerHeight||600;
  if(w===width&&h===height)return false;width=w;height=h;return true;
 }
 function register(n){
  if(byNpc.has(n)||!n.sprite||!n.bctx)return;
  n.bctx.canvas.width=n.bctx.canvas.height=256;n.sprite.center.set(.5,.5);n.sprite.material.depthTest=false;
  const r={n,text:'',pages:[],page:0,tail:2,width:0,height:0,dirty:true,duration:0};records.push(r);byNpc.set(n,r);
 }
 function paginate(r,text){
  const g=r.n.bctx,pixels=Math.min(256,width*.4,height*.4),font=Math.ceil(17*256/pixels),lineHeight=font*1.18;
  const rows=Math.max(1,Math.floor((256-50)/lineHeight));g.font=`600 ${font}px "Instrument Sans",sans-serif`;
  const lines=[];let line='';
  // Break exceptionally long words as well; never shrink below 17 CSS pixels.
  for(const word of text.split(/\s+/)){
   const candidate=line?line+' '+word:word;
   if(g.measureText(candidate).width<=212){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   for(const character of word){if(g.measureText(line+character).width>212&&line){lines.push(line);line='';}line+=character;}
  }if(line)lines.push(line);
  r.pages=[];for(let i=0;i<lines.length;i+=rows)r.pages.push(lines.slice(i,i+rows));if(!r.pages.length)r.pages.push(['']);
  r.font=font;r.lineHeight=lineHeight;r.text=text;r.page=0;r.dirty=true;r.duration=Math.max(bubbleDuration(text),r.pages.length*1.8+text.length*.06);
 }
 function setText(n,text){register(n);viewport();const r=byNpc.get(n);if(!r)return bubbleDuration(text);paginate(r,text);return r.duration;}
 function paint(r){
  const g=r.n.bctx;g.clearRect(0,0,256,256);
  const a=r.tail*Math.PI/4,dx=Math.cos(a),dy=Math.sin(a),edge=107/Math.max(Math.abs(dx),Math.abs(dy)),cx=128+dx*edge,cy=128+dy*edge;
  g.fillStyle='#fffdf7';g.strokeStyle='#191b21';g.lineWidth=2;
  g.beginPath();if(g.roundRect)g.roundRect(17,17,222,222,14);else g.rect(17,17,222,222);g.fill();g.stroke();
  g.beginPath();g.moveTo(cx-dy*11,cy+dx*11);g.lineTo(128+dx*125,128+dy*125);g.lineTo(cx+dy*11,cy-dx*11);g.closePath();g.fill();g.stroke();
  g.fillStyle='#191b21';g.font=`600 ${r.font}px "Instrument Sans",sans-serif`;g.textAlign='center';g.textBaseline='middle';
  const lines=r.pages[r.page],y=128-(lines.length-1)*r.lineHeight*.5;for(let i=0;i<lines.length;i++)g.fillText(lines[i],128,y+i*r.lineHeight);
  r.n.btex.needsUpdate=true;r.dirty=false;
 }
 // In a fight the only speech is the answer of the one who was asked (n.fightLineT, set by npcs.js),
 // anchored in the world above the head: the fight's camera is not the one these bubbles follow.
 function anchor(r,resized){
  const n=r.n;if(resized)paginate(r,r.text);
  if(n.head?.getWorldPosition)n.head.getWorldPosition(head);else head.set(n.x,(n.baseY||0)+1.7,n.z);head.y+=Math.max(.1,n.bOff||.1)+.55;
  if(r.tail!==2||r.page!==0){r.tail=2;r.page=0;r.dirty=true;}if(r.dirty)paint(r);
  if(n.sprite.parent)n.sprite.parent.worldToLocal(head);n.sprite.position.copy(head);n.sprite.scale.set(1.05,1.05,1);n.sprite.visible=true;
 }
 function update(camera){
  const resized=viewport(),fight=!!userData.combatState?.active,hush=!!(userData.questQuiet||userData.tramHallQuiet),quiet=hush||fight;
  distances.fill(Infinity);chosen.fill(null);let reply=null;
  for(let i=0;i<records.length;i++){
   const r=records[i],n=r.n;n.sprite.visible=false;
   if(fight&&!hush&&n.fightLineT>0&&n.talkT>0&&!n.combatHidden&&n.root?.visible!==false){reply=r;continue;}
   if(quiet||n.talkT<=0||n.combatHidden||n.combatControlled||n.root?.visible===false)continue;
   if(resized){paginate(r,r.text);n.talkT=Math.max(n.talkT,r.duration);}
   const dx=n.x-camera.position.x,dz=n.z-camera.position.z,d=dx*dx+dz*dz;if(d>1600)continue;
   for(let k=0;k<3;k++)if(d<distances[k]){for(let j=2;j>k;j--){chosen[j]=chosen[j-1];distances[j]=distances[j-1];}chosen[k]=r;distances[k]=d;break;}
  }
  for(let i=0;i<3;i++){
   const r=chosen[i];if(!r)continue;const n=r.n;
   if(n.head?.getWorldPosition)n.head.getWorldPosition(head);else head.set(n.x,(n.baseY||0)+1.7,n.z);head.y+=Math.max(.1,n.bOff||.1);
   view.copy(head).applyMatrix4(camera.matrixWorldInverse);const behind=view.z>=-.1,depth=clamp(-view.z,1.2,35);
   if(behind){head.x=view.x>=0?width*1.5:-width*.5;head.y=height*.5-view.y*50;}
   else {head.project(camera);head.x=(head.x+1)*width*.5;head.y=(1-head.y)*height*.5;}
   bubbleLayout(width,height,head.x,head.y,distances[i]<2.25,layout);
   // Keep nearby speech apart when the viewport has room; fixed scratch storage.
   const baseX=layout.x,baseY=layout.y,hw=layout.width/2,hh=layout.height/2;
   let bestX=baseX,bestY=baseY,bestOverlap=Infinity;
   for(let candidate=0;candidate<7;candidate++){
    const cx=clamp(baseX+(candidate===5?-1:candidate===6?1:0)*(layout.width+8),12+hw,width-12-hw);
    const cy=clamp(baseY+(candidate===1?-1:candidate===2?1:candidate===3?-2:candidate===4?2:0)*(layout.height+8),12+hh,height-12-hh);
    let overlap=0;for(let j=0;j<i;j++){const k=j*4;overlap+=Math.max(0,Math.min(cx+hw,rectangles[k+2])-Math.max(cx-hw,rectangles[k]))*Math.max(0,Math.min(cy+hh,rectangles[k+3])-Math.max(cy-hh,rectangles[k+1]));}
    if(overlap<bestOverlap){bestOverlap=overlap;bestX=cx;bestY=cy;}if(!overlap)break;
   }
   layout.x=bestX;layout.y=bestY;layout.tail=Math.round(Math.atan2(head.y-bestY,head.x-bestX)/(Math.PI/4));
   rectangles[i*4]=bestX-hw;rectangles[i*4+1]=bestY-hh;rectangles[i*4+2]=bestX+hw;rectangles[i*4+3]=bestY+hh;
   if(r.tail!==layout.tail){r.tail=layout.tail;r.dirty=true;}
   const elapsed=Math.max(0,r.duration-n.talkT),page=Math.min(r.pages.length-1,Math.floor(elapsed/(r.duration/r.pages.length)));
   if(page!==r.page){r.page=page;r.dirty=true;}if(r.dirty)paint(r);
   const unit=2*depth/(height*camera.projectionMatrix.elements[5]);
   position.set((layout.x-width*.5)*unit,(height*.5-layout.y)*unit,-depth).applyMatrix4(camera.matrixWorld);
   if(n.sprite.parent)n.sprite.parent.worldToLocal(position);n.sprite.position.copy(position);n.sprite.scale.set(layout.width*unit,layout.height*unit,1);n.sprite.visible=true;
  }
  if(reply)anchor(reply,resized);
 }
 return {register,setText,update,hide(){for(const r of records)r.n.sprite.visible=false;}};
}
