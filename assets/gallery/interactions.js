// W4: short, local feedback. Existing actions always retain ownership.
// No external dependencies, textures, lights or allocations in update().
// For merged geometry the pixel contact bubble moves, never the whole building.
export const REACTIONS = Object.freeze({
  bench:   { duration: .55, hz: 110, end: 82.41, wave: 'triangle', gain: .11, bounce: .015, line: 'Reservado para quem chegou.' },
  bin:     { duration: .72, hz: 220, end: 110, wave: 'triangle', gain: .13, bounce: .012, line: 'Aceito lixo. Drama, não.' },
  lamp:    { duration: .42, hz: 659.25, end: 440, wave: 'sine', gain: .06, bounce: .005, line: 'Ideias luminosas. Pilhas não incluídas.' },
  door:    { duration: .66, hz: 146.83, end: 110, wave: 'triangle', gain: .12, bounce: .006, line: 'Bater não conta como visita.' },
  tree:    { duration: 1.1, hz: 196, end: 98, wave: 'triangle', gain: .07, bounce: .008, line: 'Estou a processar o outono.' },
  fountain:{ duration: .8, hz: 880, end: 220, wave: 'sine', gain: .08, bounce: .006, line: 'A tua moeda tem troco?' },
  sign:    { duration: .56, hz: 329.63, end: 220, wave: 'triangle', gain: .09, bounce: .008, line: 'Também me perco às vezes.' },
  plant:   { duration: .85, hz: 392, end: 196, wave: 'sine', gain: .05, bounce: .008, line: 'Hoje também estou a crescer.' },
  car:     { duration: 1.15, hz: 110, end: 55, wave: 'triangle', gain: .12, bounce: .012, line: 'Só estaciono pensamentos.' },
  bike:    { duration: .78, hz: 1760, end: 880, wave: 'sine', gain: .07, bounce: .01, line: 'A campainha tem prioridade.' },
  screen:  { duration: .38, hz: 659.25, end: 880, wave: 'sine', gain: .045, bounce: .002, line: 'Atualização: continua tudo igual.' },
  railing: { duration: .62, hz: 440, end: 220, wave: 'sine', gain: .07, bounce: .003, line: 'Apoio moral incluído.' },
  bollard: { duration: .48, hz: 293.66, end: 146.83, wave: 'triangle', gain: .11, bounce: .003, line: 'Estou firme. Por fora.' },
  phone:   { duration: .9, hz: 880, end: 659.25, wave: 'sine', gain: .07, bounce: .004, line: 'A chamada está em reflexão.' },
  window:  { duration: .5, hz: 1318.51, end: 659.25, wave: 'sine', gain: .05, bounce: .002, line: 'Tenho vista. Falta perspetiva.' },
  object:  { duration: .45, hz: 164.81, end: 110, wave: 'triangle', gain: .06, bounce: .003, line: null },
});

export function createInteractions(ctx) {
  const { THREE } = ctx;
  const MAX = 12, bindings = new WeakMap(), active = new Array(MAX);
  const records = [], byModule = new Map(), proxies = [], attached = [], voices = new Array(MAX).fill(null);
  const proxyGeometry = new THREE.BoxGeometry(.65,3,.65).translate(0,1.5,0);
  const proxyMaterial = new THREE.MeshBasicMaterial({visible:false});
  let count = 0, camera = null, disposed = false, lastSound = -1e9, lastLine = -1e9;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const point = new THREE.Vector3(), right = new THREE.Vector3();
  const normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  const box = new THREE.Box3(), size = new THREE.Vector3();
  // Square contact bubble: four strips, 8 triangles; 12 simultaneous = 96.
  const geometry = new THREE.BufferGeometry();
  const vertices = [], indices = [];
  for (const r of [[-.5,.5,.38,.5],[-.5,.5,-.5,-.38],[-.5,-.38,-.38,.38],[.38,.5,-.38,.38]]) {
    const i = vertices.length / 3;
    vertices.push(r[0],r[2],0,r[1],r[2],0,r[1],r[3],0,r[0],r[3],0);
    indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ color: 0xffcd75, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const feedback = new THREE.InstancedMesh(geometry, material, MAX);
  feedback.name = 'interaction-contact-bubbles'; feedback.count = 0;
  feedback.frustumCulled = false; feedback.visible = false;
  feedback.raycast = () => {}; feedback.layers.set(1);
  ctx.scene.add(feedback);
  for (let i = 0; i < MAX; i++) active[i] = {
    binding: null, object: null, instance: -1, t: 0, x: 0, y: 0, z: 0,
    duration: 0, amount: 0, offset: 0, motion: false, matrixAuto: true, started: 0,
  };

  function attach(object, kind = 'object', options = {}) {
    if (!object || !REACTIONS[kind]) return null;
    const existing = bindings.get(object);
    if (existing) return existing;
    const binding = { object, kind, reaction: REACTIONS[kind], picks: 0,
      motion: options.motion === true, silent: options.silent === true,
      last: -1e9, module: options.module || '', regions: options.regions || null,
      fallback: options.fallback === true, previousKind: object.userData.kind,
      previousInteraction: object.userData.interaction };
    bindings.set(object, binding);
    attached.push(binding);
    // No action replacement. Also excludes independently movable objects from batching.
    object.userData.kind = kind;
    object.userData.interaction = true;
    return binding;
  }
  function find(object) {
    for (let o = object; o; o = o.parent) {
      const b = bindings.get(o); if (b) return b;
    }
    return null;
  }
  function protectedAction(object) {
    for (let o = object; o; o = o.parent) {
      const a = o.userData?.action;
      if (a && (a.type === 'sit' || /^npc-/.test(a.id || ''))) return true;
    }
    return false;
  }
  function label(object, hit) {
    if(disposed||ctx.scene.userData.questQuiet||protectedAction(object)||!hit||hit.distance>4.5)return null;
    const b=find(object);if(!b||walkSurface(b,object,hit))return null;
    if(!b.regions)return 'TOCAR';
    const p=hit.point;
    for(const r of b.regions){const v=r.bounds;if(p.x>=v[0]&&p.x<=v[1]&&p.y>=v[2]&&p.y<=v[3]&&p.z>=v[4]&&p.z<=v[5])return 'TOCAR';}
    return b.fallback ? 'TOCAR' : null;
  }
  function walkSurface(b,object,hit) {
    if(!b.fallback||!hit?.face||!camera||hit.point.y>camera.position.y-1.25)return false;
    normalMatrix.getNormalMatrix(object.matrixWorld);
    normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
    return normal.y>.6;
  }
  function visible(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  function tone(reaction, x, y, z, now) {
    const audio = ctx.audio;
    if (!audio || audio.muted || ctx.scene.userData.questQuiet || now - lastSound < .12) return;
    let ac, bus;
    try { ac = audio.context; bus = audio.bus; } catch { return; }
    if (!ac || !bus || ac.state !== 'running') return;
    lastSound = now;
    let oscillator, gain, filter, pan;
    try {
      const p = camera.position;
      const dx=x-p.x, dy=y-p.y, dz=z-p.z, distance=Math.sqrt(dx*dx+dy*dy+dz*dz);
      const attenuation = Math.max(0,1-distance/20);
      oscillator=ac.createOscillator(); gain=ac.createGain(); filter=ac.createBiquadFilter();
      pan=ac.createStereoPanner ? ac.createStereoPanner() : null;
      const t=ac.currentTime, duration=Math.min(.35,reaction.duration*.45);
      oscillator.type=reaction.wave;
      oscillator.frequency.setValueAtTime(reaction.hz,t);
      oscillator.frequency.exponentialRampToValueAtTime(reaction.end,t+duration);
      filter.type='lowpass'; filter.frequency.value=Math.max(500,5000-distance*220);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.00011,reaction.gain*attenuation*attenuation),t+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      oscillator.connect(filter); filter.connect(gain);
      if (pan) {
        right.setFromMatrixColumn(camera.matrixWorld,0);
        pan.pan.value=Math.max(-.8,Math.min(.8,(dx*right.x+dy*right.y+dz*right.z)/Math.max(1,distance)));
        gain.connect(pan); pan.connect(bus);
      } else gain.connect(bus);
      let voiceSlot=-1;
      for(let i=0;i<MAX;i++)if(!voices[i]){voiceSlot=i;break;}
      if(voiceSlot<0){oscillator.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();return;}
      voices[voiceSlot]=oscillator;
      oscillator.onended=()=>{ oscillator.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();if(voices[voiceSlot]===oscillator)voices[voiceSlot]=null; };
      oscillator.start(t); oscillator.stop(t+duration+.02);
    } catch {
      try { oscillator?.stop(); } catch { /* not started */ }
      oscillator?.disconnect();gain?.disconnect();filter?.disconnect();pan?.disconnect();
      for(let i=0;i<MAX;i++)if(voices[i]===oscillator)voices[i]=null;
    }
  }
  function restore(a) {
    if (!a.motion || !a.offset) return;
    if (a.instance >= 0) {
      a.object.getMatrixAt(a.instance,matrix); matrix.elements[13]-=a.offset;
      a.object.setMatrixAt(a.instance,matrix); a.object.instanceMatrix.needsUpdate=true;
    } else {
      a.object.position.y-=a.offset; a.object.updateMatrix();
    }
    a.offset=0;
  }
  function beforeUpdate() {
    for (let i=0;i<count;i++) restore(active[i]);
  }
  function silence() {
    for(let i=0;i<MAX;i++)if(voices[i]){try{voices[i].stop();}catch{/* already ended */}voices[i]=null;}
  }
  function react(object, hit) {
    if (disposed || ctx.scene.userData.questQuiet || !camera || !object || protectedAction(object) || !visible(object)) return false;
    const b=find(object); if (!b||walkSurface(b,object,hit)) return false;
    if (hit?.point) point.copy(hit.point); else object.getWorldPosition(point);
    const dx=point.x-camera.position.x,dy=point.y-camera.position.y,dz=point.z-camera.position.z;
    if (dx*dx+dy*dy+dz*dz>4.5*4.5) return false;
    let kind=b.kind;
    if (b.regions) {
      kind=null;
      for (let i=0;i<b.regions.length;i++) {
        const r=b.regions[i],v=r.bounds;
        if(point.x>=v[0]&&point.x<=v[1]&&point.y>=v[2]&&point.y<=v[3]&&point.z>=v[4]&&point.z<=v[5]) { kind=r.tipo; break; }
      }
      if (!kind) { if(b.fallback)kind='object';else return false; }
    }
    const now=performance.now()/1000;
    const instance=object===b.object&&Number.isInteger(hit?.instanceId)?hit.instanceId:-1;
    for(let i=0;i<count;i++)if(active[i].object===b.object&&active[i].instance===instance)return true;
    if (now-b.last<.25) return true;
    b.last=now;
    // Capacity is deliberately bounded; repeated taps cannot create unbounded work.
    if(count===MAX)return true;
    const a=active[count++],r=REACTIONS[kind];
    a.binding=b; a.object=b.object; a.instance=instance;
    a.t=0; a.started=now; a.duration=r.duration; a.amount=r.bounce;
    a.x=point.x-dx*.015;a.y=point.y-dy*.015;a.z=point.z-dz*.015;
    a.motion=b.motion&&!ctx.reducedMotion&&(!a.object.isInstancedMesh||a.instance>=0);
    a.offset=0;a.matrixAuto=a.object.matrixAutoUpdate;
    if(a.motion&&!a.object.isInstancedMesh)a.object.matrixAutoUpdate=true;
    feedback.visible=true;
    if (!b.silent) tone(r,a.x,a.y,a.z,now);
    b.picks++;
    // A rare aside, never every tap; school rows set silent and suppress text.
    if(!b.silent&&r.line&&b.picks%4===0&&now-lastLine>12) {
      lastLine=now;ctx.ui?.toast?.(r.line);
    }
    return true;
  }
  function update(dt, frame) {
    camera=frame?.camera||camera;
    if(!count||!camera)return;
    if(ctx.scene.userData.questQuiet||ctx.audio?.muted)silence();
    if(!(dt>0))return;
    const now=performance.now()/1000;
    rotation.copy(camera.quaternion);
    for(let i=0;i<count;) {
      const a=active[i];restore(a);a.t=now-a.started;
      const dx=a.x-camera.position.x,dz=a.z-camera.position.z;
      if(a.t>=a.duration||ctx.scene.userData.questQuiet||dx*dx+dz*dz>1600||!visible(a.object)) {
        if(a.motion&&!a.object.isInstancedMesh)a.object.matrixAutoUpdate=a.matrixAuto;
        a.binding=null;a.object=null;
        const last=active[--count];active[count]=a;active[i]=last;continue;
      }
      const u=a.t/a.duration, envelope=Math.sin(Math.PI*u)*(1-u);
      if(a.motion) {
        a.offset=Math.sin(u*Math.PI*4)*envelope*a.amount;
        if(a.instance>=0) {
          a.object.getMatrixAt(a.instance,matrix);matrix.elements[13]+=a.offset;
          a.object.setMatrixAt(a.instance,matrix);a.object.instanceMatrix.needsUpdate=true;
        } else { a.object.position.y+=a.offset;a.object.updateMatrix(); }
      }
      const s=ctx.reducedMotion ? .07 : .06+.12*envelope;
      position.set(a.x,a.y+(ctx.reducedMotion?0:.06*envelope),a.z);
      scale.set(s,s,s);matrix.compose(position,rotation,scale);feedback.setMatrixAt(i,matrix);i++;
    }
    feedback.count=count;feedback.visible=count>0;feedback.instanceMatrix.needsUpdate=true;
  }
  function installMap(world, data) {
    if(disposed)return;
    records.length=0;byModule.clear();
    for(const row of data.objects||[]) {
      const group=world.groups[row.modulo];
      const record={id:row.id,modulo:row.modulo,expected:row.count??null,resolved:0,status:row.status||'mapped'};
      records.push(record);
      if(!group){record.status='module-absent';continue;}
      if(row.status==='unresolved'){continue;}
      group.updateWorldMatrix(true,true);
      if(row.root) {
        const root=group.getObjectByName(row.root);
        if(root){record.resolved=1;if(row.status!=='native')attach(root,row.tipo,{motion:row.motion===true,silent:row.modulo==='school',module:row.modulo});}
        else record.status='not-found';
        continue;
      }
      const regions=row.bounds?[row]:null;
      if(regions) {
        record.status='volume-requires-physical-verification';
        let entries=byModule.get(row.modulo);if(!entries){entries=[];byModule.set(row.modulo,entries);}entries.push(row);continue;
      }
      const targets=[];
      group.traverse(o=>{
        if(!o.isMesh)return;
        const match=row.nome==='*'||o.name===row.nome||(row.prefix&&o.name.startsWith(row.prefix))
          ||(row.kindTag&&o.userData.kind===row.kindTag)||(row.action&&o.userData.action?.type===row.action);
        if(!match)return;
        targets.push(o);
        record.resolved+=o.isInstancedMesh?o.count:1;
      });
      for(const o of targets) {
        if(row.status==='native')continue;
        if(row.proxy && o.isInstancedMesh) {
          const proxy=new THREE.InstancedMesh(proxyGeometry,proxyMaterial,o.count);
          proxy.name='interaction-trunk-proxy';proxy.matrix.copy(o.matrix);
          proxy.matrixAutoUpdate=false;
          for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);proxy.setMatrixAt(i,matrix);}
          proxy.instanceMatrix.needsUpdate=true;proxy.computeBoundingSphere();proxy.layers.set(0);
          o.parent.add(proxy);proxies.push(proxy);
          attach(proxy,row.tipo,{module:row.modulo});
        } else attach(o,row.tipo,{motion:row.motion===true,silent:row.modulo==='school',module:row.modulo});
      }
      if(!record.resolved)record.status='not-found';
    }
    for(const [name,regions] of byModule) {
      const group=world.groups[name];
      // Exact point-in-volume at click time: a merged batch does not become
      // an enormous interactive building, nor is it displaced.
      group.traverse(o=>{
        if(!o.isMesh||bindings.has(o))return;
        box.setFromObject(o);box.getSize(size);
        for(const r of regions) {
          const v=r.bounds;
          if(box.max.x<v[0]||box.min.x>v[1]||box.max.y<v[2]||box.min.y>v[3]||box.max.z<v[4]||box.min.z>v[5])continue;
          attach(o,r.tipo,{regions,silent:name==='school',module:name});break;
        }
      });
    }
    // Explicit module-wide fallback is contact-only, never a displacement.
    // It keeps unnamed props and architectural details responsive while
    // preserving native actions and walkable horizontal surfaces.
    for(const row of data.fallbacks||[]) {
      const group=world.groups[row.modulo];if(!group)continue;
      const record={id:row.id,modulo:row.modulo,expected:null,resolved:0,status:'fallback-contact'};
      records.push(record);
      group.traverse(o=>{
        if(!o.isMesh||o.isSkinnedMesh)return;
        const existing=find(o);
        if(existing){if(existing.regions)existing.fallback=true;return;}
        let owned=false;
        for(let p=o;p&&p!==group.parent;p=p.parent)if(p.userData?.action){owned=true;break;}
        if(owned)return;
        const mat=o.material;
        if(!mat||Array.isArray(mat)||mat.visible===false||mat.blending===THREE.AdditiveBlending||mat.depthTest===false)return;
        if(/shadow|mist|foam|ripple|light-pool|lightshaft|contact|glow|burst/i.test(o.name))return;
        if(mat.isShaderMaterial&&mat.transparent)return;
        const kind=REACTIONS[o.userData.kind]?o.userData.kind:'object';
        attach(o,kind,{fallback:kind==='object',module:row.modulo,silent:row.modulo==='school'});
        record.resolved+=o.isInstancedMesh?o.count:1;
      });
    }
  }
  function audit() {
    return {
      units:'source-listed physical objects; resolved counts are mesh/instance handles, NOT objects',
      target:.8, measuredPhysicalCoverage:null,
      reason:'Claude must verify object identities, merged batches, hit volumes and unlisted objects.',
      rows:records.map(r=>({...r})),
    };
  }
  function dispose() {
    silence();
    beforeUpdate();
    for(let i=0;i<count;i++)if(active[i].motion&&!active[i].object.isInstancedMesh)active[i].object.matrixAutoUpdate=active[i].matrixAuto;
    count=0;disposed=true;feedback.removeFromParent();geometry.dispose();material.dispose();
    for(const proxy of proxies)proxy.removeFromParent();
    proxyGeometry.dispose();proxyMaterial.dispose();
    for(const b of attached) {
      if(b.previousKind===undefined)delete b.object.userData.kind;else b.object.userData.kind=b.previousKind;
      if(b.previousInteraction===undefined)delete b.object.userData.interaction;else b.object.userData.interaction=b.previousInteraction;
      bindings.delete(b.object);
    }
    attached.length=0;
  }
  return {attach,react,find,label,installMap,audit,beforeUpdate,update,dispose,get active(){return count;}};
}
