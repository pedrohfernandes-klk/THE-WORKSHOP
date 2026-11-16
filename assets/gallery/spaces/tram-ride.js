// Walkable carriage. Campus actors remain owned by npcs; no actors are spawned.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTramScore } from '../commuter-score.js';
const STOPS=[
  {id:'campus',x:86,z:29,y:.35,boardX:83.8,boardZ:29},
  {id:'mercado',x:115,z:37,y:.35,boardX:112.8,boardZ:37},
  {id:'marginal',x:32,z:81,y:.35,boardX:29.8,boardZ:81}
];
const ROUTES=[[[86,29],[86,48],[119,48],[119,37],[115,37]],[[115,37],[124,48],[126,116],[32,116],[32,81]],[[32,81],[32,98],[86,110],[86,48],[86,29]]];
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
  const localColliders=[localBox(-1.63,-1.48,-4,-1.2),localBox(-1.63,-1.48,1.2,4),localBox(1.48,1.63,-4,4),localBox(-1.6,1.6,-4.12,-4),localBox(-1.6,1.6,4,4.12)];
  const doorCol=localBox(-1.64,-1.46,-1.2,1.2);localColliders.push(doorCol);
  box(0,3.2,.2,8.3,0,.25,0,0x7f7770);box(0,3.2,.12,8.3,0,2.95,0);
  box(0,3.2,.52,.12,0,.61,-4.1);box(0,3.2,.52,.12,0,.61,4.1);
  for(const x of [-1.56,1.56]){
    for(const z of [-2.65,2.65]){box(0,.12,.72,2.9,x,.81,z,0xd6c5a9);box(0,.12,.22,2.9,x,2.78,z);}
    if(x>0)box(0,.12,.72,2.4,x,.81,0,0xd6c5a9);
    for(const z of [-4.04,-1.18,1.18,4.04])box(0,.12,1.86,.12,x,1.94,z,0x73655b);
  }
  for(const z of [-4.06,4.06]){box(0,.8,1.85,.1,-1.2,1.92,z);box(0,.8,1.85,.1,1.2,1.92,z);box(0,1.6,.25,.1,0,2.78,z);}
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
  for(let i=0;i<3;i++){const merged=mergeGeometries(parts[i],false);const mesh=new THREE.Mesh(merged,materials[i]);mesh.castShadow=i!==2;mesh.receiveShadow=true;car.add(mesh);for(const g of parts[i])g.dispose();if(i===1){mesh.userData.action={type:'sit',seats};pickables.push(mesh);}}
  // One batch for every station's connected concrete platform, all new ground.
  const platformGeos=[];
  for(const s of STOPS){const minX=s.id==='marginal'?26.8:s.id==='mercado'?109.8:81.8;const maxX=s.x-1.05;const r={minX,maxX,minZ:s.z-1.2,maxZ:s.z+1.2,y:.35};regions.push(r);const g=new THREE.BoxGeometry(maxX-minX,.35,2.4);M.boxUV(g);g.translate((minX+maxX)/2,.175,s.z);platformGeos.push(g);}
  const platform=new THREE.Mesh(mergeGeometries(platformGeos,false),M.get('concreteWall',{color:0xb9ad97,roughness:.85}));platform.receiveShadow=true;group.add(platform);for(const g of platformGeos)g.dispose();
  // Open windows show the real campus; no worlds or media loaded.
  const doors=new THREE.InstancedMesh(new THREE.BoxGeometry(.075,2.3,1.15),materials[2],2);M.boxUV(doors.geometry);car.add(doors);doors.userData.action={type:'custom',label:'PARTIR'};pickables.push(doors);
  const bags=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.46,.22),M.get('leather',{color:0x6a4633,roughness:.7}),2);M.boxUV(bags.geometry);car.add(bags);
  const warm=M.get('plaster',{color:0xffe6bb,roughness:.55}).clone();warm.emissive.setHex(0xffc785);warm.emissiveIntensity=.45;
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,6.5),warm);M.boxUV(lamp.geometry);lamp.position.set(0,2.86,0);car.add(lamp);lamp.userData.action={type:'custom',label:'PARTIR'};pickables.push(lamp);
  const dynamicRegion={minX:84.5,maxX:87.5,minZ:25,maxZ:33,y:.35};regions.push(dynamicRegion);
  const globalBoxes=localColliders.map(()=>localBox(0,0,0,0));colliders.push(...globalBoxes);
  const passengers=new Array(4).fill(null),previousFixed=new Array(4).fill(false),previousTilt=new Float32Array(4),previousWaypoint=new Float32Array(8),renderPose=new Float32Array(12),renderRoots=new Array(4).fill(null),passengerSeats=[[-.4,-2.6],[.4,-2.6],[0,-3.55],[0,-1.45]],seatPositions=[[-1.08,-2.75],[-1.08,2.75],[1.08,-2.75],[1.08,2.75]];
  const tramMusic=ctx.scene.userData.tramMusic||(ctx.scene.userData.tramMusic={mode:'home'});
  const score=createTramScore(ctx),view=ctx.scene.userData.tramView={fov:0,roll:0};
  const eventState=ctx.scene.userData.lastTramEvent={type:'',sequence:0,tripId:0,value:null};
  const impulse=ctx.scene.userData.tramImpulse={sequence:0,x:0,z:0,duration:.3};
  const carrier={x:86,z:29,yaw:0,fromX:86,fromZ:29,fromYaw:0,riding:false,localWorld:{regions:localRegions,colliders:localColliders}};
  let stationIndex=0,nextStation=1,phase='docked',phaseTime=0,tripId=0,travelTime=0,travelProgress=0,smallUntil=0,route=ROUTES[0],routeLength=0,routeLengths=new Float32Array(12);
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
  function emit(type,value){eventState.type=type;eventState.sequence++;eventState.tripId=tripId;eventState.value=value;if(ctx.events?.dispatchEvent&&typeof CustomEvent!=='undefined')ctx.events.dispatchEvent(new CustomEvent('workshop',{detail:{type,value}}));}
  function contains(x,z,pad=0){const dx=x-carrier.x,dz=z-carrier.z,c=Math.cos(carrier.yaw),s=Math.sin(carrier.yaw);const lx=c*dx-s*dz,lz=s*dx+c*dz;return Math.abs(lx)<1.48-pad&&Math.abs(lz)<3.98-pad;}
  function configureRoute(){route=ROUTES[stationIndex];routeLength=0;routeLengths[0]=0;for(let i=1;i<route.length;i++){routeLength+=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]);routeLengths[i]=routeLength;}}
  function depart(){
    if(phase!=='docked'||!camera)return false;
    readVisitorPosition();if(!contains(visitorPosition.x,visitorPosition.z)||Math.abs(visitorPosition.y-1.97)>1.6){ctx.ui?.toast?.('Entre pela porta aberta.');return false;}
    if(candidates)for(const n of candidates){if(passengers.indexOf(null)<0)break;if(!n.combatControlled&&!n.busy&&!n.S.seated)api.board(n);}
    nextStation=(stationIndex+1)%3;
    configureRoute();tripId++;phase='closing';phaseTime=0;travelTime=0;travelProgress=0;smallUntil=0;incident=climax=fightStarted=rideSurvived=false;visitorWasInside=true;score.arm();score.doorClose();tramMusic.mode='journey';announce('Próxima paragem: '+STOPS[nextStation].id+'.');return true;
  }
  function pose(){
    car.position.set(carrier.x,0,carrier.z);car.rotation.y=carrier.yaw;
    const c=Math.cos(carrier.yaw),s=Math.sin(carrier.yaw),ax=Math.abs(c),az=Math.abs(s);
    dynamicRegion.minX=carrier.x-1.48*ax-4*az;dynamicRegion.maxX=carrier.x+1.48*ax+4*az;dynamicRegion.minZ=carrier.z-1.48*az-4*ax;dynamicRegion.maxZ=carrier.z+1.48*az+4*ax;
    for(let i=0;i<localColliders.length;i++){const a=localColliders[i],b=globalBoxes[i],lx=(a.minX+a.maxX)/2,lz=(a.minZ+a.maxZ)/2,hx=(a.maxX-a.minX)/2,hz=(a.maxZ-a.minZ)/2,x=carrier.x+c*lx+s*lz,z=carrier.z-s*lx+c*lz;b.minX=x-ax*hx-az*hz;b.maxX=x+ax*hx+az*hz;b.minZ=z-az*hx-ax*hz;b.maxZ=z+az*hx+ax*hz;b.minY=a.minY;b.maxY=a.maxY;}
    for(let i=0;i<seats.length;i++){const p=seatPositions[i],seat=seats[i];seat.x=carrier.x+c*p[0]+s*p[1];seat.z=carrier.z-s*p[0]+c*p[1];seat.facing[0]=p[0]<0?c:-c;seat.facing[1]=p[0]<0?-s:s;}
    for(let i=0;i<2;i++){dummy.position.set(-1.59,1.55,(i?1:-1)*(.59+doorOpen*1.18));dummy.rotation.set(0,0,0);dummy.updateMatrix();doors.setMatrixAt(i,dummy.matrix);dummy.position.set((i?.55:-.55)+(ctx.reducedMotion?0:Math.max(0,smallUntil-lastTime)*.06),.59,i?3.5:-3.5);dummy.rotation.set(0,0,ctx.reducedMotion?0:Math.sin(Math.max(0,accelUntil-lastTime)*6)*.13);dummy.updateMatrix();bags.setMatrixAt(i,dummy.matrix);}doors.instanceMatrix.needsUpdate=bags.instanceMatrix.needsUpdate=true;
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
    if(phase==='closing'){phaseTime+=dt;doorOpen=Math.max(0,1-phaseTime/1.2);if(phaseTime>=1.2){phaseTime=0;carrier.riding=contains(visitorPosition.x,visitorPosition.z);visitorWasInside=carrier.riding;if(carrier.riding)phase='travel';else{phase='opening';tramMusic.mode='home';score.hush();announce('Partida cancelada. Porta a abrir.');}}}
    else if(phase==='travel'){
      travelTime+=dt;const duration=18;travelProgress+=dt/duration*(accelUntil>frame.time?1.7:1);const u=travelTime<duration-2?Math.min(.96,travelProgress):Math.min(1,.96+.04*(travelTime-(duration-2))/2),ease=u*u*(3-2*u),distance=routeLength*ease;
      let k=1;while(k<route.length-1&&routeLengths[k]<distance)k++;const a=route[k-1],b=route[k],len=routeLengths[k]-routeLengths[k-1],v=len?Math.min(1,(distance-routeLengths[k-1])/len):1;
      carrier.x=a[0]+(b[0]-a[0])*v;carrier.z=a[1]+(b[1]-a[1])*v;
      const heading=Math.atan2(b[0]-a[0],b[1]-a[1]);carrier.yaw+=wrap((u>.94?0:heading)-carrier.yaw)*(1-Math.exp(-dt*2.5));
      if(!incident&&travelTime>4){incident=true;smallUntil=frame.time+2;if(!quiet)ctx.ui?.toast?.('A mala pediu outro lugar.');}
      if(!climax&&travelTime>7){climax=true;let a=null,b=null;for(let i=0;i<4;i++)if(passengers[i]){if(!a)a=passengers[i];else if(!b)b=passengers[i];}
        if(a&&b){const combat=ctx.scene.userData.combatAPI;lastCombatResult=combat?.getScriptedResult?.()?.sequence||0;fightStarted=!!combat?.startScripted?.(a.S.name,b.S.name,{duration:4,climax:true,allowSeated:true,inPlace:true,venue:'tram',tripId});}
        if(fightStarted&&tripId%5!==0){accelUntil=frame.time+4;announce('Por motivos de porrada, vamos acelerar.');if(!ctx.reducedMotion&&carrier.riding){impulse.sequence++;impulse.x=-Math.sin(carrier.yaw)*.75;impulse.z=-Math.cos(carrier.yaw)*.75;}}
      }
      const combatResult=ctx.scene.userData.combatAPI?.getScriptedResult?.();if(fightStarted&&combatResult?.sequence>lastCombatResult&&combatResult.completed){lastCombatResult=combatResult.sequence;if(combatResult.visitorWon)emit('tram-climax-win',{tripId,winner:combatResult.winner});}
      if(accelUntil&&frame.time>=accelUntil&&!rideSurvived){rideSurvived=true;const status=ctx.scene.userData.combatAPI?.getVisitorStatus?.();if(carrier.riding&&status?.fell===false)emit('tram-acceleration-survived',{tripId,fight:true,fell:false});}
      if(u>=1){const s=STOPS[nextStation];carrier.x=s.x;carrier.z=s.z;carrier.yaw=0;stationIndex=nextStation;phase='opening';phaseTime=0;announce('Paragem: '+STOPS[stationIndex].id+'.');}
    } else if(phase==='opening'){phaseTime+=dt;doorOpen=Math.min(1,phaseTime/1.2);if(phaseTime>=2){phase='docked';carrier.riding=false;tramMusic.mode='home';score.hush();}}
    doorCol.minY=doorOpen>.92?10:.35;doorCol.maxY=doorOpen>.92?11:2.8;
    const brutal=accelUntil-frame.time>3.55&&!ctx.reducedMotion&&carrier.riding;
    view.fov=brutal?-3:0;view.roll=brutal?Math.sin((accelUntil-frame.time)*7)*.012:0;
    warm.emissiveIntensity=.25+.5*(ctx.scene.userData.weather?.nightK||0);
    pose();score.update(frame.time,-1,phase==='travel'?1:0,carrier.x,.35,carrier.z,carrier.riding,quiet,accelUntil>frame.time?1:0);
  }
  function beforeRender(){
    if(ctx.scene.userData.npcStatues)return;const ring=!ctx.reducedMotion&&!!ctx.scene.userData.combatAPI?.state?.active&&ctx.scene.userData.combatAPI.state.venue==='tram';const lean=!ctx.reducedMotion&&accelUntil>lastTime;if(!lean&&!ring)return;
    for(let i=0;i<4;i++){const n=passengers[i],root=n&&(n.root||n.group||n.mesh);if(!root)continue;renderRoots[i]=root;renderPose[i*3]=root.rotation.x;renderPose[i*3+1]=root.rotation.z;renderPose[i*3+2]=root.rotation.y;if(ring&&i>=2)root.rotation.y=carrier.yaw+(i===2?0:Math.PI);if(lean){const a=carrier.yaw-root.rotation.y;root.rotation.x-=.12*Math.cos(a);root.rotation.z-=.12*Math.sin(a);}}
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
  const api={getVisitorPosition(out){readVisitorPosition();out.x=visitorPosition.x;out.y=visitorPosition.y;out.z=visitorPosition.z;return out;},bindControls(controls){readVisitor=controls?.readPosition?controls.readPosition.bind(controls):null;},isVisitorAboard(){return carrier.riding;},get travelProgress(){return travelTime/18;},get travelDuration(){return 18;},carrierGroup:car,windowApertures:Object.freeze([{x:-1.55,y:1.96,z:-2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:-1.55,y:1.96,z:2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:-2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:2.6,w:2.7,h:1.43,yaw:Math.PI/2},{x:1.55,y:1.96,z:0,w:2.38,h:1.43,yaw:Math.PI/2},{x:0,y:1.99,z:-4.065,w:1.55,h:1.55,yaw:0},{x:0,y:1.99,z:4.065,w:1.55,h:1.55,yaw:0}]),initializePassengers,beforeRender,afterRender,get station(){return STOPS[stationIndex].id;},get phase(){return phase;},get doorsOpen(){return doorOpen>.92&&phase==='docked';},get tripId(){return tripId;},get x(){return carrier.x;},get z(){return carrier.z;},get yaw(){return carrier.yaw;},carrier,
    getStation(id){for(let i=0;i<STOPS.length;i++)if(STOPS[i].id===id)return STOPS[i];return null;},hasPassenger(n){return passengers.includes(n);},depart,
    board(n,index=-1){if(phase!=='docked'||!n||passengers.includes(n))return false;const s=STOPS[stationIndex];if(Math.hypot(n.x-s.boardX,n.z-s.boardZ)>2)return false;if(index<0)index=passengers.indexOf(null);if(index<0||index>3||passengers[index])return false;passengers[index]=n;previousFixed[index]=!!n.fixed;if(n.pts){previousWaypoint[index*2]=n.pts[0];previousWaypoint[index*2+1]=n.pts[1];}previousTilt[index]=(n.root||n.group||n.mesh)?.rotation.x||0;n.fixed=true;pose();return true;},
    leave(n){if(phase!=='docked')return false;const i=passengers.indexOf(n);if(i<0)return false;passengers[i]=null;n.fixed=previousFixed[i];const s=STOPS[stationIndex],x=s.boardX-.7,z=s.boardZ+(i%2?.55:-.55),dx=x-n.x,dz=z-n.z;if(n.pts)for(let k=0;k<n.pts.length;k+=2){n.pts[k]+=dx;n.pts[k+1]+=dz;}n.x=x;n.z=z;n.baseY=s.y;const root=n.root||n.group||n.mesh;if(root)root.position.set(x,s.y,z);if(n.col){const w=n.colW||.3;Object.assign(n.col,{minX:x-w,maxX:x+w,minZ:z-w,maxZ:z+w,minY:s.y,maxY:s.y+(n.colH||1.8)});}if(n.blob)n.blob.position.set(x,s.y+.02,z);return true;},
    dispose(){disposed=true;restoreAssignments();score.dispose();stopAnnouncement();view.fov=view.roll=0;carrier.riding=false;}
  };
  ctx.scene.userData.tramRide=api;pose();
  return {group,regions,colliders,pickables,update,onPick(object){depart();},tram:api,dispose:api.dispose};
}
