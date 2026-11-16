// Walkable carriage. Campus actors remain owned by npcs; no actors are spawned.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTramScore } from '../commuter-score.js';
import { reserveModuleVoice, finishModuleVoice } from '../audio-lease.js';
const STOPS=[
  {id:'campus',x:86,z:29,y:.35,boardX:83.8,boardZ:29},
  {id:'mercado',x:115,z:37,y:.35,boardX:112.8,boardZ:37},
  {id:'marginal',x:32,z:81,y:.35,boardX:29.8,boardZ:81}
];
// ---- rails: every leg runs on track. The light-rail's east straight (metro.js, x=86) carries
// the campus stop; two new spurs leave it: east to the Mercado (south branch at z=42, wye back
// north at z=60) and west to the Marginal (from z=60). Pieces are lines and circular arcs.
const PI=Math.PI,Ln=(x0,z0,x1,z1)=>({l:[x0,z0,x1,z1]}),Ar=(cx,cz,r,a0,a1)=>({a:[cx,cz,r,a0,a1]});
const M_SOUTH=Ar(96,42,10,PI,PI/2),M_STEM=Ln(94,52,105,52),M_TURN=Ar(105,42,10,PI/2,0),M_END=Ln(115,42,115,28),M_WYE=Ar(94,60,8,-PI/2,-PI);
const G_TURN=Ar(78,60,8,0,PI/2),G_WEST=Ln(78,68,40,68),G_NORTH=Ar(40,76,8,-PI/2,-PI),G_END=Ln(32,76,32,91);
const NEW_TRACK=[M_SOUTH,M_STEM,M_TURN,M_END,M_WYE,G_TURN,G_WEST,G_NORTH,G_END];
// The light-rail's loop (metro.js: rounded rectangle x -84..86, z -56..98, radius 22, flat rail
// base -0.04..-0.03 all round, tunnel on the north straight), in its own direction of travel.
const R22=22,L_NE=Ar(64,76,R22,0,PI/2),L_NORTH=Ln(64,98,-62,98),L_NW=Ar(-62,76,R22,PI/2,PI),L_WEST=Ln(-84,76,-84,-34),L_SW=Ar(-62,-34,R22,PI,1.5*PI),L_SOUTH=Ln(-62,-56,64,-56),L_SE=Ar(64,-34,R22,-PI/2,0);
const LOOP_CCW=[[L_NE],[L_NORTH],[L_NW],[L_WEST],[L_SW],[L_SOUTH],[L_SE]],LOOP_CW=[[L_SE,1],[L_SOUTH,1],[L_SW,1],[L_WEST,1],[L_NW,1],[L_NORTH,1],[L_NE,1]];
// Legs from stop to stop: [piece, reversed]; sub-lines are written out where a leg uses part of one.
// Campus to Mercado goes the long way: once round the whole campus, through the tunnel, then
// past the campus stop again and onto the Mercado spur. Marginal to Campus goes round the other
// way and passes the campus stop without stopping first. Mercado to Marginal stays direct.
const LEGS=[
  [[Ln(86,29,86,76)],...LOOP_CCW,[Ln(86,-34,86,42)],[M_SOUTH],[Ln(96,52,105,52)],[M_TURN],[Ln(115,42,115,37)]],
  [[Ln(115,37,115,42)],[M_TURN,1],[Ln(105,52,94,52)],[M_WYE],[G_TURN],[G_WEST],[G_NORTH],[Ln(32,76,32,81)]],
  [[Ln(32,81,32,76)],[G_NORTH,1],[G_WEST,1],[G_TURN,1],[Ln(86,60,86,-34)],...LOOP_CW,[Ln(86,76,86,29)]]
];
function samplePiece(piece,step,out,reversed=false){
  const pts=[];
  if(piece.l){const [x0,z0,x1,z1]=piece.l,n=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/step));for(let i=0;i<=n;i++)pts.push([x0+(x1-x0)*i/n,z0+(z1-z0)*i/n]);}
  else{const [cx,cz,r,a0,a1]=piece.a,n=Math.max(2,Math.ceil(Math.abs(a1-a0)*r/step));for(let i=0;i<=n;i++){const t=a0+(a1-a0)*i/n;pts.push([cx+r*Math.cos(t),cz+r*Math.sin(t)]);}}
  if(reversed)pts.reverse();
  for(const q of pts){const last=out[out.length-1];if(last&&Math.hypot(q[0]-last[0],q[1]-last[1])<1e-6)continue;out.push(q);}
  return out;
}
// Arc-length table with unit tangents (direction of travel).
function trackTable(pts){
  const n=pts.length,x=new Float32Array(n),z=new Float32Array(n),s=new Float32Array(n),tx=new Float32Array(n),tz=new Float32Array(n);
  for(let i=0;i<n;i++){x[i]=pts[i][0];z[i]=pts[i][1];if(i)s[i]=s[i-1]+Math.hypot(x[i]-x[i-1],z[i]-z[i-1]);}
  for(let i=0;i<n;i++){const a=Math.max(0,i-1),b=Math.min(n-1,i+1),dx=x[b]-x[a],dz=z[b]-z[a],l=Math.hypot(dx,dz)||1;tx[i]=dx/l;tz[i]=dz/l;}
  // Pacing: a tram slows for curves. Curvature (smoothed over ±3 m, so speed changes gently at
  // a curve's ends) weighs each metre; a leg's time is spread evenly over that weight.
  const k=new Float32Array(n),c=new Float32Array(n);
  for(let i=1;i<n-1;i++){const da=Math.atan2(tx[i+1]*tz[i-1]-tz[i+1]*tx[i-1],tx[i+1]*tx[i-1]+tz[i+1]*tz[i-1]),ds=s[i+1]-s[i-1];k[i]=ds>0?Math.abs(da)/ds:0;}
  for(let i=1;i<n;i++){let sum=0,cnt=0;for(let j=Math.max(0,i-12);j<=Math.min(n-1,i+12);j++){sum+=k[j];cnt++;}c[i]=c[i-1]+(s[i]-s[i-1])*(1+CURVE_WEIGHT*sum/cnt);}
  return {x,z,s,tx,tz,c,length:s[n-1],cost:c[n-1],n};
}
const CURVE_WEIGHT=22;
// Accelerate over the first fifth, cruise, brake over the last fifth (peak 1.25× the mean speed).
const RAMP=.2,easeTrip=u=>u<RAMP?u*u/(2*RAMP*(1-RAMP)):u>1-RAMP?1-(1-u)*(1-u)/(2*RAMP*(1-RAMP)):(u-RAMP/2)/(1-RAMP);
// Seconds per leg: the two tours of the campus are about 670 m and 710 m (~11 m/s on average).
const LEG_SECONDS=[60,21,62];
function costToDistance(t,cost){
  cost=Math.max(0,Math.min(t.cost,cost));let lo=0,hi=t.n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(t.c[m]<=cost)lo=m;else hi=m;}
  const span=t.c[hi]-t.c[lo];return t.s[lo]+(span>0?(cost-t.c[lo])/span:0)*(t.s[hi]-t.s[lo]);
}
const LEG_TABLES=LEGS.map(leg=>{const pts=[];for(const [piece,rev] of leg)samplePiece(piece,.25,pts,!!rev);return trackTable(pts);});
function trackAt(t,d,o){
  d=Math.max(0,Math.min(t.length,d));let lo=0,hi=t.n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(t.s[m]<=d)lo=m;else hi=m;}
  const span=t.s[hi]-t.s[lo],v=span>0?(d-t.s[lo])/span:0;
  o.x=t.x[lo]+(t.x[hi]-t.x[lo])*v;o.z=t.z[lo]+(t.z[hi]-t.z[lo])*v;
  const ax=t.tx[lo]+(t.tx[hi]-t.tx[lo])*v,az=t.tz[lo]+(t.tz[hi]-t.tz[lo])*v,l=Math.hypot(ax,az)||1;o.tx=ax/l;o.tz=az/l;return o;
}
const TAU=Math.PI*2,wrap=a=>a-TAU*Math.round(a/TAU);
export function build(ctx){
  const {THREE,M}=ctx,group=new THREE.Group();group.name='tram-ride';
  const car=new THREE.Group();group.add(car);car.position.set(86,0,29);
  car.userData.noBatch=true;
  const regions=[],colliders=[],pickables=[],parts=[[],[],[]];
  const color=new THREE.Color(),matrix=new THREE.Matrix4(),dummy=new THREE.Object3D();
  const materials=[M.get('plaster',{color:0xffffff,roughness:.47}).clone(),M.get('fabric',{color:0x665844,roughness:.94}).clone(),M.get('steel',{color:0xc5b79c,roughness:.28}).clone()];
  materials[0].vertexColors=true;
  function box(list,w,h,d,x,y,z,tint=0xe2d5bb){const g=new THREE.BoxGeometry(w,h,d);M.boxUV(g);g.translate(x,y,z);if(list===0){color.setHex(tint);const a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=color.r;a[i+1]=color.g;a[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));}parts[list].push(g);}
  function localBox(x0,x1,z0,z1,y0=.35,y1=2.7){return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:y0,maxY:y1};}
  const localRegions=[{minX:-1.48,maxX:1.48,minZ:-4,maxZ:4,y:.35}];
  const localColliders=[localBox(-1.63,-1.48,-4,-1.2),localBox(-1.63,-1.48,1.2,4),localBox(1.48,1.63,-4,-1.2),localBox(1.48,1.63,1.2,4),localBox(-1.6,1.6,-4.12,-4),localBox(-1.6,1.6,4,4.12)];
  // Doors on both sides: on the return legs the car runs backward without turning, as a
  // bidirectional tram does, so either side may face the platform.
  const doorCol=localBox(-1.64,-1.46,-1.2,1.2),doorColR=localBox(1.46,1.64,-1.2,1.2);localColliders.push(doorCol,doorColR);
  // Livery: the yellow and cream of a Lisbon electric outside, wood inside, a dark skirt over the rails.
  const YELLOW=0xf2b81c,CREAM=0xf3ead2,WOOD=0x9c6b3f,SKIRT=0x262626,ROOF=0xe8e3d6;
  box(0,3.2,.2,8.3,0,.25,0,0x7f7770);box(0,3.2,.12,8.3,0,2.95,0,ROOF);
  box(0,3.2,.52,.12,0,.61,-4.1,YELLOW);box(0,3.2,.52,.12,0,.61,4.1,YELLOW);
  for(const x of [-1.62,1.62])box(0,.05,.13,8.3,x,.115,0,SKIRT);for(const z of [-4.17,4.17])box(0,3.2,.13,.05,0,.115,z,SKIRT);
  for(const x of [-1.56,1.56]){
    for(const z of [-2.65,2.65]){box(0,.06,.72,2.9,x+(x>0?.03:-.03),.81,z,YELLOW);box(0,.06,.72,2.9,x-(x>0?.03:-.03),.81,z,WOOD);box(0,.12,.22,2.9,x,2.78,z,CREAM);}
    for(const z of [-4.04,-1.18,1.18,4.04])box(0,.12,1.86,.12,x,1.94,z,0x73655b);
  }
  for(const z of [-4.06,4.06]){box(0,.8,1.85,.1,-1.2,1.92,z,YELLOW);box(0,.8,1.85,.1,1.2,1.92,z,YELLOW);box(0,1.6,.25,.1,0,2.78,z,CREAM);}
  const seats=[];
  for(const x of [-1.08,1.08])for(const z of [-2.75,2.75]){
    box(1,.62,.13,1.65,x,.81,z);box(1,.1,.65,1.65,x+(x<0?-.28:.28),1.1,z);
    box(2,.08,.42,1.3,x,.55,z);localColliders.push(localBox(x-.32,x+.32,z-.84,z+.84,.35,1.47));
    seats.push({x:86+x,y:.875,z:29+z,facing:[x<0?1:-1,0]});
  }
  for(const z of [-1.05,1.05])for(const x of [-.86,.86]){
    const rod=new THREE.CylinderGeometry(.023,.023,2.48,8);M.boxUV(rod);rod.translate(x,1.59,z);parts[2].push(rod);
    const grip=new THREE.TorusGeometry(.09,.013,5,10);M.boxUV(grip);grip.rotateY(Math.PI/2);grip.translate(x,2.34,z+.25);parts[2].push(grip);
  }
  box(2,1.72,.035,.035,0,2.65,-1.05);box(2,1.72,.035,.035,0,2.65,1.05);
  // Pantograph up to the contact wire, 4.5 m over the rail base (the light-rail's own height).
  const rodTmp=new THREE.Object3D(),va=new THREE.Vector3(),vb=new THREE.Vector3();
  const rod=(ax,ay,az,bx,by,bz,t=.05)=>{va.set(ax,ay,az);vb.set(bx,by,bz);const g=new THREE.BoxGeometry(t,t,va.distanceTo(vb));M.boxUV(g);rodTmp.position.copy(va).add(vb).multiplyScalar(.5);rodTmp.lookAt(vb);rodTmp.updateMatrix();g.applyMatrix4(rodTmp.matrix);parts[2].push(g);};
  box(2,.62,.1,.5,0,3.06,-.9);for(const x of [-.42,.42]){rod(x,3.1,-.9,x,3.86,.12);rod(x,3.86,.12,x,4.43,-.5);}rod(-.75,4.46,-.5,.75,4.46,-.5,.06);
  for(let i=0;i<3;i++){const merged=mergeGeometries(parts[i],false);const mesh=new THREE.Mesh(merged,materials[i]);mesh.castShadow=i!==2;mesh.receiveShadow=true;car.add(mesh);for(const g of parts[i])g.dispose();if(i===1){mesh.userData.action={type:'sit',seats};pickables.push(mesh);}}
  // One batch for every station's connected concrete platform, all new ground.
  const platformGeos=[];
  for(const s of STOPS){const minX=s.id==='marginal'?26.8:s.id==='mercado'?109.8:81.8;const maxX=s.x-1.05;const r={minX,maxX,minZ:s.z-1.2,maxZ:s.z+1.2,y:.35};regions.push(r);const g=new THREE.BoxGeometry(maxX-minX,.95,2.4);M.boxUV(g);g.translate((minX+maxX)/2,-.125,s.z);platformGeos.push(g);}
  const platform=new THREE.Mesh(mergeGeometries(platformGeos,false),M.get('concreteWall',{color:0xb9ad97,roughness:.85}));platform.receiveShadow=true;group.add(platform);for(const g of platformGeos)g.dispose();
  // ---- new track (the main line is metro.js's): slab, shoulders, rails, contact wire, masts, buffers.
  // Same profiles and materials as the light-rail, 4 mm lower so the junctions never z-fight.
  {
    const base=-.034,H_RAIL=.1,WIRE=4.5,dbl=m=>{const c=m.clone();c.side=THREE.DoubleSide;return c;};
    const rail=c=>[[c-.07,0],[c+.07,0],[c+.07,.02],[c+.015,.03],[c+.015,.075],[c+.04,.082],[c+.04,H_RAIL],[c-.04,H_RAIL],[c-.04,.082],[c-.015,.075],[c-.015,.03],[c-.07,.02],[c-.07,0]];
    const PROF={slab:[[[-1.6,0],[1.6,0]],[[1.6,0],[1.6,-.7]],[[-1.6,0],[-1.6,-.7]]],gravel:[[[1.6,0],[4.6,-1.5]],[[-1.6,0],[-4.6,-1.5]]],rails:[rail(-.7175),rail(.7175)],wire:[[[0,WIRE-.012],[.012,WIRE],[0,WIRE+.012],[-.012,WIRE],[0,WIRE-.012]]]};
    const MAT={slab:dbl(M.get('concreteFloor')),gravel:dbl(M.get('gravel')),rails:M.get('steel'),wire:new THREE.MeshBasicMaterial({color:0x15171a,side:THREE.DoubleSide})};
    const geos={slab:[],gravel:[],rails:[],wire:[]};
    for(const piece of NEW_TRACK){
      const t=trackTable(samplePiece(piece,piece.a?.5:1,[]));
      for(const key in PROF){
        const polys=PROF[key];let vc=0;for(const q of polys)vc+=t.n*q.length;
        const pos=new Float32Array(vc*3),uv=new Float32Array(vc*2),idx=[];let w=0,u=0,b0=0;
        for(const q of polys){
          const m=q.length,cum=[0];for(let j=1;j<m;j++)cum.push(cum[j-1]+Math.hypot(q[j][0]-q[j-1][0],q[j][1]-q[j-1][1]));
          for(let k=0;k<t.n;k++){const rx=-t.tz[k],rz=t.tx[k];for(let j=0;j<m;j++){pos[w++]=t.x[k]+rx*q[j][0];pos[w++]=base+q[j][1];pos[w++]=t.z[k]+rz*q[j][0];uv[u++]=t.s[k];uv[u++]=cum[j];}}
          for(let k=0;k<t.n-1;k++)for(let j=0;j<m-1;j++){const a=b0+k*m+j,c=a+m;idx.push(a,c,a+1,c,c+1,a+1);}
          b0+=t.n*m;
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();geos[key].push(g);
      }
    }
    // Buffer stops at the two dead ends.
    for(const [x,z,dz] of [[115,28,-1],[32,91,1]]){const beam=new THREE.BoxGeometry(2.1,.42,.3);beam.translate(x,base+.62,z+dz*.15);geos.rails.push(beam);for(const sx of [-.75,.75]){const post=new THREE.BoxGeometry(.16,.9,.16);post.translate(x+sx,base+.45,z+dz*.35);geos.rails.push(post);}}
    for(const key in geos){
      const merged=mergeGeometries(geos[key],false);for(const g of geos[key])g.dispose();
      const mesh=new THREE.Mesh(merged,MAT[key]);mesh.name='tram-track-'+key;mesh.receiveShadow=key!=='wire';mesh.castShadow=false;mesh.userData.noBatch=true;group.add(mesh);
    }
    // Catenary masts on the straights, on the side away from the platforms (as metro.js builds them).
    const graphite=new THREE.MeshPhysicalMaterial({color:0x24272c,roughness:.35,metalness:.4,clearcoat:.6,clearcoatRoughness:.3});
    const pole=new THREE.CylinderGeometry(.07,.11,6.2,8);pole.translate(0,3.1,0);const arm=new THREE.BoxGeometry(2.9,.09,.09);arm.translate(1.45,5.7,0);const drop=new THREE.BoxGeometry(.03,1.2,.03);drop.translate(2.9,4.95,0);
    const mastGeo=mergeGeometries([pole,arm,drop]);pole.dispose();arm.dispose();drop.dispose();
    const MASTS=[[100,52,1,0,-1],[115,34,0,-1,-1],[68,68,-1,0,1],[50,68,-1,0,1],[32,87,0,1,1]];   // x, z, tangent x, tangent z, side (1 = right of travel)
    const masts=new THREE.InstancedMesh(mastGeo,graphite,MASTS.length),d=new THREE.Object3D();
    MASTS.forEach(([x,z,tx,tz,side],i)=>{d.position.set(x+side*tz*2.9,base,z-side*tx*2.9);d.rotation.set(0,Math.atan2(-side*tx,-side*tz),0);d.updateMatrix();masts.setMatrixAt(i,d.matrix);});
    masts.castShadow=true;masts.userData.noBatch=true;group.add(masts);
  }
  // Open windows show the real campus; no worlds or media loaded.
  const doors=new THREE.InstancedMesh(new THREE.BoxGeometry(.075,2.3,1.15),materials[2],4);M.boxUV(doors.geometry);car.add(doors);doors.userData.action={type:'custom',label:'PARTIR'};pickables.push(doors);
  const bags=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.46,.22),M.get('leather',{color:0x6a4633,roughness:.7}),2);M.boxUV(bags.geometry);car.add(bags);
  const warm=M.get('plaster',{color:0xffe6bb,roughness:.55}).clone();warm.emissive.setHex(0xffc785);warm.emissiveIntensity=.45;
  // Headlamps (white) and tail lamps (red) on both ends; emissive, no real lights.
  {const head=M.get('plaster',{color:0xffffff,roughness:.3}).clone();head.emissive.setHex(0xfff4d8);head.emissiveIntensity=1.6;
   const tail=M.get('plaster',{color:0xb01818,roughness:.4}).clone();tail.emissive.setHex(0xff2010);tail.emissiveIntensity=1.2;
   for(const z of [-4.13,4.13])for(const x of [-1.05,1.05]){const h=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.05,14),head);h.rotation.x=PI/2;h.position.set(x,.72,z);car.add(h);const t=new THREE.Mesh(new THREE.BoxGeometry(.16,.09,.04),tail);t.position.set(x*.62,.72,z);car.add(t);}}
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,6.5),warm);M.boxUV(lamp.geometry);lamp.position.set(0,2.86,0);car.add(lamp);lamp.userData.action={type:'custom',label:'PARTIR'};pickables.push(lamp);
  const dynamicRegion={minX:84.5,maxX:87.5,minZ:25,maxZ:33,y:.35};regions.push(dynamicRegion);
  const globalBoxes=localColliders.map(()=>localBox(0,0,0,0));colliders.push(...globalBoxes);
  const passengers=new Array(4).fill(null),previousFixed=new Array(4).fill(false),previousTilt=new Float32Array(4),previousWaypoint=new Float32Array(8),renderPose=new Float32Array(12),renderRoots=new Array(4).fill(null),passengerSeats=[[-.4,-2.6],[.4,-2.6],[0,-3.55],[0,-1.45]],seatPositions=[[-1.08,-2.75],[-1.08,2.75],[1.08,-2.75],[1.08,2.75]];
  const tramMusic=ctx.scene.userData.tramMusic||(ctx.scene.userData.tramMusic={mode:'home'});
  const score=createTramScore(ctx),view=ctx.scene.userData.tramView={fov:0,roll:0};
  const eventState=ctx.scene.userData.lastTramEvent={type:'',sequence:0,tripId:0,value:null};
  const impulse=ctx.scene.userData.tramImpulse={sequence:0,x:0,z:0,duration:.3};
  const carrier={x:86,z:29,yaw:0,fromX:86,fromZ:29,fromYaw:0,riding:false,localWorld:{regions:localRegions,colliders:localColliders}};
  let stationIndex=0,nextStation=1,phase='docked',phaseTime=0,tripId=0,travelTime=0,travelProgress=0,smallUntil=0,route=LEG_TABLES[0],routeLength=0,facing=1,finalFrom=0,lastDistance=0,speed=0,curveRoll=0,saidMid=0,passedCampus=false;
  const trackPoint={x:0,z:0,tx:0,tz:1};
  let readVisitor=null;const visitorPosition={x:86,y:1.97,z:29};
  function readVisitorPosition(){if(readVisitor)readVisitor(visitorPosition);else if(camera){visitorPosition.x=camera.position.x;visitorPosition.y=camera.position.y;visitorPosition.z=camera.position.z;}return visitorPosition;}
  let camera=null,doorOpen=1,incident=false,climax=false,fightStarted=false,accelUntil=0,quiet=false,sleep=false,visitorWasInside=false;
  let lastTime=0,disposed=false,rideSurvived=false,lastCombatResult=0;
  let announcement=null,announcementVoice=null;
  function stopAnnouncement(){if(announcement&&typeof speechSynthesis!=='undefined')speechSynthesis.cancel();announcement=null;announcementVoice?.release();announcementVoice=null;}
  function announce(text){
    if(quiet||ctx.audio?.muted||ctx.scene.userData.questQuiet)return;
    ctx.ui?.toast?.(text);
    if(typeof speechSynthesis==='undefined'||typeof SpeechSynthesisUtterance==='undefined')return;
    const voices=speechSynthesis.getVoices();let voice=null;for(const v of voices)if(v.localService&&/^pt[-_]PT$/i.test(v.lang)){voice=v;break;}if(!voice)return;
    stopAnnouncement();const token=ctx.audio?.acquireVoice?.({priority:3,foreground:true,ms:6500});if(!token)return;
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='pt-PT';utterance.voice=voice;utterance.rate=1;announcement=utterance;announcementVoice=token;
    token.onRelease=()=>{if(announcement===utterance){speechSynthesis.cancel();announcement=null;announcementVoice=null;}};
    utterance.onend=utterance.onerror=()=>{if(announcement===utterance){announcement=null;announcementVoice=null;}token.release();};ctx.audio?.duck?.(6);speechSynthesis.speak(utterance);
  }
  // The voice of the line: dry, a bit unhinged, always in pt-PT.
  const NAME={campus:'Campus',mercado:'Mercado',marginal:'Marginal'};
  const DEPART={mercado:['Próxima paragem: Mercado, pelo caminho mais comprido. Damos a volta ao campus todo, porque sim.','Próxima paragem: Mercado. Segurem-se: hoje vamos pelo túnel, e o maquinista bebeu três bicas.'],
    marginal:['Próxima paragem: Marginal. É proibido dar chapadas ao maquinista.','Próxima paragem: Marginal. Os influencers sentam-se à janela, por causa da luz.'],
    campus:['Próxima paragem: Campus, com volta ao quarteirão. Os stories agradecem.','Próxima paragem: Campus. Este elétrico não tem pressa. Tem é estilo.']};
  const MID=['Informamos que há carteiristas a bordo. E influencers. Escolham o mal menor.','Validem os bilhetes. Ninguém está a ver, mas o pombo está.','Senhores passageiros: o túnel não é um portal. Ou é.','Por favor, não alimentem o maquinista.','Lembramos que os assentos são para pessoas, não para mochilas, nem para egos.'];
  const ARRIVE={campus:'Paragem: Campus. Saída pelo lado da plataforma. O outro lado não abre, não insistam.',mercado:'Paragem: Mercado. Cuidado com os tremoços e com quem os filma.',marginal:'Paragem: Marginal. Vista para o canal, sem custos adicionais.'};
  const pick=(list,k)=>list[(k%list.length+list.length)%list.length];
  // "Dlim-dlim": two bell strikes from the car (sine partials with a long ring), through the voice broker.
  function bell(){
    const ac=ctx.audio?.context;if(!ac||quiet)return;
    const lease=reserveModuleVoice(ctx,3,true,1.3,ctx.audio.bus);if(!lease)return;
    try{
      const p=ac.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=3;p.maxDistance=60;p.positionX.value=carrier.x;p.positionY.value=2.6;p.positionZ.value=carrier.z;
      lease.gain.disconnect();lease.gain.connect(p);p.connect(ctx.audio.bus);
      const t=Math.max(ac.currentTime,lease.startAt);let last=null;
      for(const [k,at] of [[0,0],[1,.28]])for(const [f,lv] of [[1318.5,.11],[2637,.045],[3951,.02]]){const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f*(k?1.002:1);g.gain.setValueAtTime(.0001,t+at);g.gain.linearRampToValueAtTime(lv,t+at+.004);g.gain.exponentialRampToValueAtTime(.0001,t+at+.95);o.connect(g);g.connect(lease.gain);lease.track(o);o.start(t+at);o.stop(t+at+1);last=o;o.addEventListener('ended',()=>{o.disconnect();g.disconnect();},{once:true});}
      if(last){finishModuleVoice(lease,last);last.addEventListener('ended',()=>p.disconnect(),{once:true});}
    }catch{lease.release();}
  }
  function emit(type,value){eventState.type=type;eventState.sequence++;eventState.tripId=tripId;eventState.value=value;if(ctx.events?.dispatchEvent&&typeof CustomEvent!=='undefined')ctx.events.dispatchEvent(new CustomEvent('workshop',{detail:{type,value}}));}
  function contains(x,z,pad=0){const dx=x-carrier.x,dz=z-carrier.z,c=Math.cos(carrier.yaw),s=Math.sin(carrier.yaw);const lx=c*dx-s*dz,lz=s*dx+c*dz;return Math.abs(lx)<1.48-pad&&Math.abs(lz)<3.98-pad;}
  // The car keeps its own facing; on a leg that starts against it, it runs backward along the rails.
  function configureRoute(){route=LEG_TABLES[stationIndex];routeLength=route.length;trackAt(route,0,trackPoint);facing=Math.sin(carrier.yaw)*trackPoint.tx+Math.cos(carrier.yaw)*trackPoint.tz>=0?1:-1;}
  function depart(){
    if(phase!=='docked'||!camera)return false;
    readVisitorPosition();if(!contains(visitorPosition.x,visitorPosition.z)||Math.abs(visitorPosition.y-1.97)>1.6){ctx.ui?.toast?.('Entre pela porta aberta.');return false;}
    if(candidates)for(const n of candidates){if(passengers.indexOf(null)<0)break;if(!n.combatControlled&&!n.busy&&!n.S.seated)api.board(n);}
    nextStation=(stationIndex+1)%3;
    configureRoute();tripId++;phase='closing';phaseTime=0;travelTime=0;travelProgress=0;finalFrom=0;smallUntil=0;incident=climax=fightStarted=rideSurvived=false;visitorWasInside=true;score.arm();score.doorClose();tramMusic.mode='journey';announce(pick(DEPART[STOPS[nextStation].id],tripId));saidMid=0;passedCampus=false;lastDistance=0;speed=0;return true;
  }
  function pose(){
    car.position.set(carrier.x,0,carrier.z);car.rotation.y=carrier.yaw;
    const c=Math.cos(carrier.yaw),s=Math.sin(carrier.yaw),ax=Math.abs(c),az=Math.abs(s);
    dynamicRegion.minX=carrier.x-1.48*ax-4*az;dynamicRegion.maxX=carrier.x+1.48*ax+4*az;dynamicRegion.minZ=carrier.z-1.48*az-4*ax;dynamicRegion.maxZ=carrier.z+1.48*az+4*ax;
    for(let i=0;i<localColliders.length;i++){const a=localColliders[i],b=globalBoxes[i],lx=(a.minX+a.maxX)/2,lz=(a.minZ+a.maxZ)/2,hx=(a.maxX-a.minX)/2,hz=(a.maxZ-a.minZ)/2,x=carrier.x+c*lx+s*lz,z=carrier.z-s*lx+c*lz;b.minX=x-ax*hx-az*hz;b.maxX=x+ax*hx+az*hz;b.minZ=z-az*hx-ax*hz;b.maxZ=z+az*hx+ax*hz;b.minY=a.minY;b.maxY=a.maxY;}
    for(let i=0;i<seats.length;i++){const p=seatPositions[i],seat=seats[i];seat.x=carrier.x+c*p[0]+s*p[1];seat.z=carrier.z-s*p[0]+c*p[1];seat.facing[0]=p[0]<0?c:-c;seat.facing[1]=p[0]<0?-s:s;}
    const leftOpen=Math.cos(carrier.yaw)>0?doorOpen:0,rightOpen=Math.cos(carrier.yaw)>0?0:doorOpen;
    for(let i=0;i<2;i++){dummy.position.set(-1.59,1.55,(i?1:-1)*(.59+leftOpen*1.18));dummy.rotation.set(0,0,0);dummy.updateMatrix();doors.setMatrixAt(i,dummy.matrix);dummy.position.set((i?.55:-.55)+(ctx.reducedMotion?0:Math.max(0,smallUntil-lastTime)*.06),.59,i?3.5:-3.5);dummy.rotation.set(0,0,ctx.reducedMotion?0:Math.sin(Math.max(0,accelUntil-lastTime)*6)*.13);dummy.updateMatrix();bags.setMatrixAt(i,dummy.matrix);}for(let i=0;i<2;i++){dummy.position.set(1.59,1.55,(i?1:-1)*(.59+rightOpen*1.18));dummy.rotation.set(0,0,0);dummy.updateMatrix();doors.setMatrixAt(i+2,dummy.matrix);}doors.instanceMatrix.needsUpdate=bags.instanceMatrix.needsUpdate=true;
    for(let i=0;i<4;i++){const n=passengers[i];if(!n)continue;const p=passengerSeats[i];n.x=carrier.x+c*p[0]+s*p[1];n.z=carrier.z-s*p[0]+c*p[1];if(n.pts){n.pts[0]=n.x;n.pts[1]=n.z;}const root=n.root||n.group||n.mesh;const poseY=root?root.position.y-(n.baseY||0):0;n.baseY=.35;if(root){root.position.x=n.x;root.position.z=n.z;root.position.y=.35+poseY;}
      if(n.col){const w=n.colW||.3;n.col.minX=n.x-w;n.col.maxX=n.x+w;n.col.minZ=n.z-w;n.col.maxZ=n.z+w;n.col.minY=.35;n.col.maxY=.35+(n.colH||1.8);}
      if(n.blob){n.blob.position.x=n.x;n.blob.position.z=n.z;n.blob.position.y=.37;}
    }
  }
  function update(dt,frame){
    if(disposed)return;camera=frame?.camera||camera;if(!camera)return;lastTime=frame.time;readVisitorPosition();dt=Math.min(.1,Math.max(0,dt));
    carrier.fromX=carrier.x;carrier.fromZ=carrier.z;carrier.fromYaw=carrier.yaw;
    const dx=visitorPosition.x-carrier.x,dz=visitorPosition.z-carrier.z;
    sleep=!carrier.riding&&dx*dx+dz*dz>1600;if(sleep){score.hush();stopAnnouncement();return;}
    quiet=!!ctx.scene.userData.questQuiet||(ctx.scene.userData.bairroEffects?.silenceUntil||0)>frame.time;if(quiet||ctx.audio?.muted)stopAnnouncement();
    if(phase==='closing'){phaseTime+=dt;doorOpen=Math.max(0,1-phaseTime/1.2);if(phaseTime>=1.2){phaseTime=0;carrier.riding=contains(visitorPosition.x,visitorPosition.z);visitorWasInside=carrier.riding;if(carrier.riding){phase='travel';bell();}else{phase='opening';tramMusic.mode='home';score.hush();announce('Partida cancelada. Porta a abrir.');}}}
    else if(phase==='travel'){
      travelTime+=dt;const duration=LEG_SECONDS[stationIndex];travelProgress+=dt/duration*(accelUntil>frame.time?1.7:1);let u;if(travelTime<duration-2){u=Math.min(.96,travelProgress);finalFrom=u;}else u=Math.min(1,finalFrom+(1-finalFrom)*(travelTime-(duration-2))/2);
      const distance=costToDistance(route,route.cost*easeTrip(u));
      const yaw0=carrier.yaw;
      trackAt(route,distance,trackPoint);carrier.x=trackPoint.x;carrier.z=trackPoint.z;carrier.yaw=Math.atan2(facing*trackPoint.tx,facing*trackPoint.tz);
      if(dt>0){speed=Math.abs(distance-lastDistance)/dt;let dy=carrier.yaw-yaw0;dy-=TAU*Math.round(dy/TAU);
        // Passengers feel the curves: a small camera roll from the lateral acceleration (v · yaw rate).
        const target=Math.max(-.022,Math.min(.022,-speed*(dy/dt)*.0026*facing));curveRoll+=(target-curveRoll)*Math.min(1,dt*3);}
      lastDistance=distance;
      if(duration>=40&&saidMid<2&&travelTime>(saidMid?42:22)){announce(pick(MID,tripId*2+saidMid));saidMid++;}
      if(!passedCampus&&stationIndex===2&&travelTime>4&&u<.5&&Math.abs(carrier.x-86)<1&&Math.abs(carrier.z-29)<3){passedCampus=true;bell();announce('Não paramos aqui. Já cá estiveram.');}
      if(!incident&&travelTime>4){incident=true;smallUntil=frame.time+2;if(!quiet)ctx.ui?.toast?.('A mala pediu outro lugar.');}
      if(!climax&&travelTime>7){climax=true;let a=null,b=null;for(let i=0;i<4;i++)if(passengers[i]){if(!a)a=passengers[i];else if(!b)b=passengers[i];}
        if(a&&b){const combat=ctx.scene.userData.combatAPI;lastCombatResult=combat?.getScriptedResult?.()?.sequence||0;fightStarted=!!combat?.startScripted?.(a.S.name,b.S.name,{duration:4,climax:true,allowSeated:true,inPlace:true,venue:'tram',tripId});}
        if(fightStarted&&tripId%5!==0){accelUntil=frame.time+4;announce('Por motivos de porrada, vamos acelerar.');if(!ctx.reducedMotion&&carrier.riding){impulse.sequence++;impulse.x=-facing*Math.sin(carrier.yaw)*.75;impulse.z=-facing*Math.cos(carrier.yaw)*.75;}}
      }
      const combatResult=ctx.scene.userData.combatAPI?.getScriptedResult?.();if(fightStarted&&combatResult?.sequence>lastCombatResult&&combatResult.completed){lastCombatResult=combatResult.sequence;if(combatResult.visitorWon)emit('tram-climax-win',{tripId,winner:combatResult.winner});}
      if(accelUntil&&frame.time>=accelUntil&&!rideSurvived){rideSurvived=true;const status=ctx.scene.userData.combatAPI?.getVisitorStatus?.();if(carrier.riding&&status?.fell===false)emit('tram-acceleration-survived',{tripId,fight:true,fell:false});}
      if(u>=1){const s=STOPS[nextStation];carrier.x=s.x;carrier.z=s.z;carrier.yaw=facing*route.tz[route.n-1]>=0?0:PI;stationIndex=nextStation;phase='opening';phaseTime=0;announce(ARRIVE[STOPS[stationIndex].id]||('Paragem: '+NAME[STOPS[stationIndex].id]+'.'));speed=0;curveRoll=0;}
    } else if(phase==='opening'){phaseTime+=dt;doorOpen=Math.min(1,phaseTime/1.2);if(phaseTime>=2){phase='docked';carrier.riding=false;tramMusic.mode='home';score.hush();}}
    {const left=Math.cos(carrier.yaw)>0,open=doorOpen>.92;doorCol.minY=open&&left?10:.35;doorCol.maxY=open&&left?11:2.8;doorColR.minY=open&&!left?10:.35;doorColR.maxY=open&&!left?11:2.8;}
    const brutal=accelUntil-frame.time>3.55&&!ctx.reducedMotion&&carrier.riding;
    view.fov=brutal?-3:0;view.roll=brutal?Math.sin((accelUntil-frame.time)*7)*.012:(carrier.riding&&!ctx.reducedMotion&&phase==='travel'?curveRoll:0);
    warm.emissiveIntensity=.25+.5*(ctx.scene.userData.weather?.nightK||0);
    pose();score.update(frame.time,-1,phase==='travel'?Math.max(.06,Math.min(1.5,speed/10)):0,carrier.x,.35,carrier.z,carrier.riding,quiet,accelUntil>frame.time?1:0);
  }
  function beforeRender(){
    if(ctx.scene.userData.npcStatues)return;const ring=!ctx.reducedMotion&&!!ctx.scene.userData.combatAPI?.state?.active&&ctx.scene.userData.combatAPI.state.venue==='tram';const lean=!ctx.reducedMotion&&accelUntil>lastTime;if(!lean&&!ring)return;
    for(let i=0;i<4;i++){const n=passengers[i],root=n&&(n.root||n.group||n.mesh);if(!root)continue;renderRoots[i]=root;renderPose[i*3]=root.rotation.x;renderPose[i*3+1]=root.rotation.z;renderPose[i*3+2]=root.rotation.y;if(ring&&i>=2)root.rotation.y=carrier.yaw+(i===2?0:Math.PI);if(lean){const a=carrier.yaw-root.rotation.y;root.rotation.x-=.12*facing*Math.cos(a);root.rotation.z-=.12*facing*Math.sin(a);}}
  }
  function afterRender(){for(let i=0;i<4;i++){const root=renderRoots[i];if(root){root.rotation.x=renderPose[i*3];root.rotation.z=renderPose[i*3+1];root.rotation.y=renderPose[i*3+2];renderRoots[i]=null;}}}
  const assigned=[];let candidates=null;
  function initializePassengers(actors,beforeEntry){
    if(!Array.isArray(actors))return;candidates=actors;if(!beforeEntry||assigned.length)return;
    const ids=['tortoise','raccoon','cat','walrus'];
    for(const id of ids){const n=actors.find(n=>n.S.name===id);if(!n||n.combatControlled||n.S.seated)continue;
      assigned.push({n,x:n.x,z:n.z,baseY:n.baseY,zone:n.zone,fixed:n.fixed,pts:n.pts.slice(),rootY:n.root.position.y});
      n.x=STOPS[0].boardX;n.z=STOPS[0].boardZ;n.baseY=.35;n.zone=0;n.root.position.set(n.x,.35,n.z);api.board(n);
    }
  }
  function restoreAssignments(){for(const a of assigned){const n=a.n;n.x=a.x;n.z=a.z;n.baseY=a.baseY;n.zone=a.zone;n.fixed=a.fixed;for(let i=0;i<a.pts.length;i++)n.pts[i]=a.pts[i];n.root.position.set(a.x,a.rootY,a.z);}assigned.length=0;}
  const api={getVisitorPosition(out){readVisitorPosition();out.x=visitorPosition.x;out.y=visitorPosition.y;out.z=visitorPosition.z;return out;},bindControls(controls){readVisitor=controls?.readPosition?controls.readPosition.bind(controls):null;},isVisitorAboard(){return carrier.riding;},get travelProgress(){return travelTime/LEG_SECONDS[stationIndex];},get travelDuration(){return LEG_SECONDS[stationIndex];},carrierGroup:car,windowApertures:Object.freeze([{x:-1.55,y:1.96,z:-2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:-1.55,y:1.96,z:2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:-2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:0,w:2.38,h:1.43,yaw:Math.PI/2},{x:0,y:1.99,z:-4.065,w:1.55,h:1.55,yaw:0},{x:0,y:1.99,z:4.065,w:1.55,h:1.55,yaw:0}]),initializePassengers,beforeRender,afterRender,get station(){return STOPS[stationIndex].id;},get phase(){return phase;},get doorsOpen(){return doorOpen>.92&&phase==='docked';},get tripId(){return tripId;},get x(){return carrier.x;},get z(){return carrier.z;},get yaw(){return carrier.yaw;},carrier,
    getStation(id){for(let i=0;i<STOPS.length;i++)if(STOPS[i].id===id)return STOPS[i];return null;},hasPassenger(n){return passengers.includes(n);},
    // The car's own walls are world AABBs that grow off-axis on curves; a fight inside the car
    // uses the car's local frame instead (combat.js skips these).
    isCarCollider(c){return globalBoxes.includes(c);},depart,
    board(n,index=-1){if(phase!=='docked'||!n||passengers.includes(n))return false;const s=STOPS[stationIndex];if(Math.hypot(n.x-s.boardX,n.z-s.boardZ)>2)return false;if(index<0)index=passengers.indexOf(null);if(index<0||index>3||passengers[index])return false;passengers[index]=n;previousFixed[index]=!!n.fixed;if(n.pts){previousWaypoint[index*2]=n.pts[0];previousWaypoint[index*2+1]=n.pts[1];}previousTilt[index]=(n.root||n.group||n.mesh)?.rotation.x||0;n.fixed=true;pose();return true;},
    leave(n){if(phase!=='docked')return false;const i=passengers.indexOf(n);if(i<0)return false;passengers[i]=null;n.fixed=previousFixed[i];const s=STOPS[stationIndex],x=s.boardX-.7,z=s.boardZ+(i%2?.55:-.55),dx=x-n.x,dz=z-n.z;if(n.pts)for(let k=0;k<n.pts.length;k+=2){n.pts[k]+=dx;n.pts[k+1]+=dz;}n.x=x;n.z=z;n.baseY=s.y;const root=n.root||n.group||n.mesh;if(root)root.position.set(x,s.y,z);if(n.col){const w=n.colW||.3;Object.assign(n.col,{minX:x-w,maxX:x+w,minZ:z-w,maxZ:z+w,minY:s.y,maxY:s.y+(n.colH||1.8)});}if(n.blob)n.blob.position.set(x,s.y+.02,z);return true;},
    dispose(){disposed=true;restoreAssignments();score.dispose();stopAnnouncement();view.fov=view.roll=0;carrier.riding=false;}
  };
  ctx.scene.userData.tramRide=api;pose();
  return {group,regions,colliders,pickables,update,onPick(object){depart();},tram:api,dispose:api.dispose};
}
