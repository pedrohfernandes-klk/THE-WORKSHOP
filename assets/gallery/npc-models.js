// One PBR SkinnedMesh; joint blends deform sleeves, skin and trouser knees.
// +z is forward, metres, soles y=0. Call setExpression only while awake.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// jaw opening, brow L/R tilt, brow L/R rise, eyelid L/R, gaze x/y, jaw roll.
// Shared numeric poses: blending is allocation-free and combines with speech.
export const EXPRESSION_PRESETS = Object.freeze({
  incredulidade: Object.freeze([.12,-.22,.34,.012,.002,.3,.06,-.22,.08,.035]),
  orgulho_fragil: Object.freeze([.04,-.12,.16,.004,.009,.12,.22,.1,.2,-.025]),
  susto_contido: Object.freeze([.28,-.2,.2,.018,.015,-.14,-.1,0,.05,.012]),
});
export function buildCharacter(THREE, M, spec = {}) {
  const shape = spec.shape || [1, 1, 1];
  const leg = clamp(shape[1] || 1, 0.55, 1.5), hs = clamp(shape[2] || 1, 0.65, 1.65);
  const colors = spec.colors || {};
  const tint = (v, fallback) => v?.isColor ? v : new THREE.Color(v ?? fallback);
  const skin = tint(colors.skin ?? spec.fur, 0xe4ac8c), hair = tint(colors.hair, 0x302720);
  const cloth = tint(colors.jacket ?? spec.suit?.color, 0x3a465a);
  const trousers = tint(colors.trousers ?? spec.pants?.color, 0x333441);
  const shoe = tint(colors.shoes ?? spec.shoe, 0x241d1a);
  const shirt = tint(colors.shirt ?? spec.shirt, 0xfff3d6);
  const robeFabric = tint(colors.robe,0x6a788b);
  const white = tint(null, 0xfff3e8), ink = tint(null, 0x16151a);
  const kind = spec.head || spec.kind || 'human';
  const human=['human','velho','mano','chubby','forcado'].includes(kind);
  const wardrobe=spec.clothing, tank=wardrobe==='tank_onlooker', swim=wardrobe==='swim_onlooker';
  const fabinhe=wardrobe==='fabinhe_tracksuit';
  const robe=wardrobe==='robe_onlooker', tracksuit=wardrobe==='bear_tracksuit'||wardrobe==='tracksuit'||fabinhe;
  const bareArms=tank||swim, shorts=tank||swim||wardrobe==='tourist'||kind==='forcado';
  const tailored=!wardrobe||wardrobe==='business_pig'||wardrobe==='critic'||kind==='forcado';
  const bodyWidth=clamp(spec.bodyWidth||1,.65,1.4);
  const armRadius=clamp(spec.armRadius??(tank?.052:.067),.045,.085);
  const seam=cloth.clone().multiplyScalar(.78), sole=shoe.clone().multiplyScalar(.62);
  const seg = spec.quality === 'low' ? 10 : 14;
  const bones = {}, ordered = [], parts = [];let skinClothBoxes=0;
  function bone(name, parent, x=0, y=0, z=0) {
    const b = new THREE.Bone(); b.name = name; b.position.set(x,y,z);
    bones[name] = b; ordered.push(b); if (parent) parent.add(b); return b;
  }
  const pelvis = bone('pelvis', null);
  const body = bone('spine', pelvis, 0, .82*(leg-1));
  const headY=1.74+.17*(hs-1);
  const neck=bone('neck',body,0,1.49);
  const head = bone('head', neck, 0, headY-1.49); head.scale.setScalar(hs);
  const hat = bone('hat', head);
  const snoutBone=bone('snout',head);
  bones.arms = [bone('armL', body, -.3*bodyWidth,1.38), bone('armR',body,.3*bodyWidth,1.38)];
  for(const b of bones.arms)b.scale.y=clamp(spec.armLength||1,.85,1.2);
  bones.legs = [bone('legL',pelvis,-.1*bodyWidth,.82*leg),bone('legR',pelvis,.1*bodyWidth,.82*leg)];
  for (const b of bones.legs) b.scale.y=leg;
  bones.shoulders=[];bones.elbows=[];bones.wrists=[];bones.knees=[];bones.ankles=[];
  for(let i=0;i<2;i++){
    const a=bones.arms[i],l=bones.legs[i];
    const shoulder=bone(i?'shoulderR':'shoulderL',body,a.position.x,a.position.y,0);
    shoulder.add(a);a.position.set(0,0,0);bones.shoulders.push(shoulder);
    const elbow=bone(i?'elbowR':'elbowL',a,0,-.32,0);
    const wrist=bone(i?'wristR':'wristL',elbow,0,-.27,0);
    const knee=bone(i?'kneeR':'kneeL',l,0,-.40,0);
    const ankle=bone(i?'ankleR':'ankleL',knee,0,-.34,0);
    bones.elbows.push(elbow);bones.wrists.push(wrist);bones.knees.push(knee);bones.ankles.push(ankle);
  }
  bones.hair=bone('hair',head);bones.belly=bone('belly',body,0,1.03,.1);
  const cheeks=[bone('cheekL',head,-.10,-.025,.12),bone('cheekR',head,.10,-.025,.12)];bones.cheeks=cheeks;

  const jaw = bone('mouth',head,0,-.075,.15);
  const brows = [bone('browL',head,-.078,.106,.172),bone('browR',head,.078,.106,.172)];
  const pupils = [bone('eyeL',head,-.078,.04,.205),bone('eyeR',head,.078,.04,.205)];
  const lids = [bone('lidUpperL',head,-.078,.04,.151),bone('lidLowerL',head,-.078,.04,.151),
    bone('lidUpperR',head,.078,.04,.151),bone('lidLowerR',head,.078,.04,.151)];
  bones.lids=lids;
  bones.body=body; bones.brows=brows;
  function part(g,b,c,rough=.8,x=0,y=0,z=0,sx=1,sy=1,sz=1,rz=0,rx=0) {
    if((tracksuit||wardrobe==='influencer')&&(c===cloth||c===trousers))rough=wardrobe==='tracksuit'?.82:.43;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,0,rz)),new THREE.Vector3(sx*(b===body?bodyWidth:1),sy,sz));
    pelvis.updateMatrixWorld(true); g.applyMatrix4(m); M?.boxUV?.(g);
    const local=g.attributes.position.array.slice();g.applyMatrix4(b.matrixWorld);
    const n=g.attributes.position.count;
    if(!g.index)g.setIndex(new THREE.BufferAttribute(Uint16Array.from({length:n},(_,i)=>i),1));
    if(!g.attributes.irisUV)g.setAttribute('irisUV',new THREE.BufferAttribute(new Float32Array(n*2),2));
    const col=new Float32Array(n*3), r=new Float32Array(n), ids=new Uint16Array(n*4), weights=new Float32Array(n*4);
    const bi=ordered.indexOf(b);
    for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;r[i]=rough;ids[i*4]=bi;weights[i*4]=1;}
    // Bind-space weights keep every vertex in place, but soften joint folds.
    const arm=bones.arms.indexOf(b),legIndex=bones.legs.indexOf(b);
    for(let i=0;i<n;i++){
      const y=local[i*3+1];let second=null,w=0;
      if(arm>=0){
        if(y<-.52){ids[i*4]=ordered.indexOf(bones.elbows[arm]);second=bones.wrists[arm];w=clamp((-.52-y)/.10,0,1);}
        else {second=bones.elbows[arm];w=clamp((-.24-y)/.16,0,1);}
      }else if(legIndex>=0){
        if(y<-.67){ids[i*4]=ordered.indexOf(bones.knees[legIndex]);second=bones.ankles[legIndex];w=clamp((-.67-y)/.12,0,1);}
        else {second=bones.knees[legIndex];w=clamp((-.31-y)/.18,0,1);}
      }else if(b===head&&c===hair){second=bones.hair;w=.85;}else if(b===body&&(c===cloth||c===skin)&&y>.85&&y<1.30){second=bones.belly;w=.28*Math.exp(-(((y-1.06)/.18)**2));}else if(b===body&&c===skin&&y>1.42){second=neck;w=clamp((y-1.42)/.13,0,.8);}
      else if(b===head&&g.userData?.organicFace){
        const x=local[i*3],z=local[i*3+2];second=cheeks[x>0?1:0];
        w=.28*Math.exp(-(((Math.abs(x)-.10)/.05)**2)-(((y+.025)/.055)**2))*clamp(z/.12,0,1);
      }
      if(second){ids[i*4+1]=ordered.indexOf(second);weights[i*4]=1-w;weights[i*4+1]=w;}
    }
    // 0 cloth, 1 human skin, 2 leather, 3 hair/fur, 4 other hard surfaces.
    const surface=(b===pupils[0]||b===pupils[1]||(c===white&&rough<.25)) ? 5 : c===skin ? (human?1:3) : c===hair ? 3 : (c===shoe||c===sole) ? 2 :
      (c===cloth||c===seam||c===shirt||c===trousers||c===robeFabric||b===hat) ? 0 : 4;
    if(g.type==='BoxGeometry'&&(surface===0||surface===1)&&(b===body||bones.arms.includes(b)||bones.legs.includes(b)))skinClothBoxes++;
    g.setAttribute('surfaceKind',new THREE.BufferAttribute(new Float32Array(n).fill(surface),1));
    const pattern=c===cloth ? (kind==='forcado'?1:wardrobe==='fan'?2:wardrobe==='neighbor'?3:robe?4:0) : 0;
    g.setAttribute('fabricPattern',new THREE.BufferAttribute(new Float32Array(n).fill(pattern),1));
    g.setAttribute('hatPart',new THREE.BufferAttribute(new Float32Array(n).fill(b===hat?1:0),1));
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('surfaceRoughness',new THREE.BufferAttribute(r,1));
    g.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
    parts.push(g);
  }
  const sph=(b,c,x,y,z,sx,sy,sz,rough=.65)=>part(new THREE.SphereGeometry(1,b===body||bones.arms.includes(b)||bones.legs.includes(b)?10:seg,8),b,c,rough,x,y,z,sx,sy,sz);
  const box=(b,c,x,y,z,w,h,d,rough=.8,rz=0)=>{
    const soft=(b===body||bones.arms.includes(b)||bones.legs.includes(b)) && (rough>=.6||[cloth,seam,shirt,trousers,skin,robeFabric,shoe,sole,white].includes(c));
    if(soft)part(new THREE.SphereGeometry(1,6,4),b,c,rough,x,y,z,w*.5,h*.5,d*.5,rz);
    else part(new THREE.BoxGeometry(w,h,d),b,c,rough,x,y,z,1,1,1,rz);
  };
  const cap=(b,c,x,y,z,r,len,rough=.85)=>{
    const half=len/2;
    // Shaped elbow/knee silhouette: cuffs and joints, not uninterrupted tubes.
    const profile=[[0,-half-r],[r*.7,-half-r*.7],[r,-half],[r*.86,-half*.5],
      [r*1.035,0],[r*.88,half*.5],[r,half],[r*.7,half+r*.7],[0,half+r]];
    part(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),spec.quality==='low'?8:12),b,c,rough,x,y,z);
  };
  const hem=kind==='forcado'?.99:.72;
  const torsoProfile=fabinhe ? [[0,hem],[.185,hem],[.24,hem+.06],[.23,1.08],[.255,1.29],[.275,1.38],[.24,1.45],[.12,1.52],[.10,1.55],[0,1.55]] : [[0,hem],[.18,hem],[.21,hem+.06],[.195,1.08],[.23,1.29],[.255,1.38],[.23,1.45],[.12,1.52],[.10,1.55],[0,1.55]];
  part(new THREE.LatheGeometry(torsoProfile.map(p=>new THREE.Vector2(...p)),spec.quality==='low'?10:14),body,(swim||tank)?skin:cloth,(swim||tank)?.63:.85,0,0,0,1,1,.78);
  if(tank) {
    // The garment actually ends below the exposed chest and shoulders.
    const tankProfile=[[0,.72],[.183,.72],[.213,.79],[.198,1.08],[.233,1.29],[.242,1.32]];
    part(new THREE.LatheGeometry(tankProfile.map(p=>new THREE.Vector2(...p)),spec.quality==='low'?10:14),body,cloth,.87,0,0,0,1,1,.79);
  }
  sph(body,trousers,0,.84,0,.2,.13,.16,.88);
  if(tailored)box(body,shirt,0,1.19,.195,.19,.42,.022,.65);
  for(const s of tailored?[-1,1]:[]) {
    box(body,cloth,s*.115,1.22,.205,.075,.35,.025,.86,s*.18);
    box(body,trousers,s*.15,1.06,.199,.08,.008,.015,.88);
    sph(body,white,s*.035,1.35,.22,.008,.008,.006,.25);
  }
  // Actual folded collar, shirt placket, pocket welts and jacket back seam.
  // These thin solids stay readable at grazing angles, without extra materials.
  if(!spec.hoodie && kind!=='mano'&&tailored) for(const sign of [-1,1]) {
    box(body,shirt,sign*.062,1.455,.18,.085,.095,.025,.72,sign*.42);
    box(body,seam,sign*.15,1.055,.215,.09,.012,.018,.89);
  }
  if(tailored){box(body,shirt,0,1.19,.212,.023,.37,.013,.74);box(body,seam,0,1.17,-.184,.006,kind==='forcado' ? .2 : .36,.005,.9);}
  if(spec.quality!=='low'&&tailored) for(const y of [1.05,1.17,1.29])
    part(new THREE.CylinderGeometry(.007,.007,.005,8),body,white,.35,0,y,.225,1,1,1,0,Math.PI/2);
  if(spec.tie) box(body,tint(spec.tie,0xb63838),0,1.17,.224,.04,.27,.012,.65);
  if(spec.hoodie || kind==='mano') {part(new THREE.TorusGeometry(.15,.045,6,seg),body,cloth,.9,0,1.5,-.025,1,1,1,0,Math.PI/2);box(body,cloth,0,1,.21,.27,.13,.025);}
  for(let i=0;i<2;i++) {
    const a=bones.arms[i], l=bones.legs[i];
    cap(a,bareArms?skin:cloth,0,-.28,0,armRadius,.43,bareArms?.64:.85);
    if(!bareArms)cap(a,shirt,0,-.545,0,armRadius+.001,.025,.65);
    sph(a,skin,0,-.65,.008,.075,.09,.06);
    const sign=i?1:-1;
    part(new THREE.SphereGeometry(1,8,6),a,skin,.62,-sign*.061,-.637,.035,.022,.04,.024,sign*.35);
    for(let f=0;f<4;f++)part(new THREE.SphereGeometry(1,6,6),a,skin,.63,(f-1.5)*.028,-.713+Math.abs(f-1.5)*.005,.019,.016,.036,.021);
    cap(l,trousers,0,shorts?-.19:-.39,0,fabinhe?.112:.087,shorts?.2:.55);
    if(fabinhe){cap(l,seam,0,-.70,0,.089,.045,.85);box(a,seam,0,-.48,.077,.13,.018,.014,.9);}
    if(shorts)cap(l,skin,0,-.54,0,.071,.28,.65);
    const sockFoot=tank||wardrobe==='tourist';
    sph(l,sockFoot?white:(bareArms||robe)?skin:shoe,0,-.775,.06,.105,.065,.175,sockFoot?.9:(bareArms||robe)?.64:.36);
    // A separate welt and sole give shoes thickness, instead of floating ovals.
    // Rounded rectangular footprint, 48 triangles, shared with the same skin.
    const soleShape=new THREE.Shape();
    soleShape.moveTo(-.085,-.09);soleShape.lineTo(.085,-.09);
    soleShape.quadraticCurveTo(.108,-.09,.108,-.045);soleShape.lineTo(.108,.155);
    soleShape.quadraticCurveTo(.108,.195,.068,.2);soleShape.lineTo(-.068,.2);
    soleShape.quadraticCurveTo(-.108,.195,-.108,.155);soleShape.lineTo(-.108,-.045);
    soleShape.quadraticCurveTo(-.108,-.09,-.085,-.09);
    const soleGeometry=new THREE.ExtrudeGeometry(soleShape,{depth:.025,steps:1,bevelEnabled:false,curveSegments:2});
    // Shape xy becomes shoe xz; depth points down into the tread.
    part(soleGeometry,l,sole,.78,0,-.818,.01,1,1,1,0,Math.PI/2);
    // Cuff seam, pressed trouser crease and small sleeve buttons.
    if(!bareArms)box(a,seam,0,-.51,.061,.095,.009,.006,.9);
    if(!shorts)box(l,trousers,0,-.38,.087,.005,.43,.004,.88);
    if(spec.quality!=='low'&&!bareArms&&!fabinhe) {
      box(l,sole,0,-.798,.145,.17,.01,.005,.8);
      for(const y of [-.49,-.465])part(new THREE.CylinderGeometry(.008,.008,.005,8),a,ink,.45,.05,y,.047,1,1,1,0,Math.PI/2);
    }
    if(spec.stock || kind==='forcado' || spec.clothing==='tourist'||tank) part(new THREE.CylinderGeometry(.092,.088,kind==='forcado'?.35:.29,seg),l,white,.88,0,-.61,0);
    if(spec.clothing==='tourist'||bareArms||robe)box(l,shoe,0,-.755,.09,.2,robe?.075:.035,.14,.48);
    if(spec.braces)box(body,tint(null,0x8c3436),(i?1:-1)*.11,1.18,.224,.035,.55,.012);
  }
  // Continuous cranium: denser local anatomy, still an absurd silhouette.
  const face=new THREE.SphereGeometry(1,spec.quality==='low'?24:48,spec.quality==='low'?16:32);
  const fp=face.attributes.position;
  const bump=(x,y,cx,cy,wx,wy)=>Math.exp(-(((x-cx)/wx)**2)-(((y-cy)/wy)**2));
  for(let i=0;i<fp.count;i++) {
    const ux=fp.getX(i),uy=fp.getY(i),uz=fp.getZ(i);
    let x=ux*.185,y=uy*.225,z=uz*.16;
    const front=Math.max(0,uz)**2,jawK=clamp((-y-.045)/.17,0,1);
    x*=1-(human?.16:.06)*jawK;
    // Cheekbones, orbital recesses, brow ridge and chin are one skin.
    z+=front*(.027*bump(x,y,-.102,-.025,.065,.065)+.03*bump(x,y,.104,-.02,.06,.065)
      -.023*bump(x,y,-.076,.042,.054,.038)-.021*bump(x,y,.078,.04,.054,.038)
      +.014*bump(x,y,0,.112,.14,.035));
    if(human)z+=front*(.025*bump(x,y,0,.025,.028,.095)+.067*bump(x,y,.003,-.035,.034,.035)
      +.019*bump(x,y,0,-.103,.065,.028)+.038*bump(x,y,.004,-.175,.075,.045));
    y+=front*.003*Math.sin(x*23);
    if(kind==='bear'){x*=1+.015*Math.sin(y*61)*Math.sin(z*37);y+=.002*Math.sin(x*71+z*51);}
    fp.setXYZ(i,x,y,z);
  }
  face.userData={organicFace:true};face.computeVertexNormals();part(face,head,skin,human?.59:.8);
  if(human)for(const sign of [-1,1])sph(head,ink,sign*.022,-.057,.219,.009,.005,.008,.66);
  for(const sign of [-1,1]) {
    if(kind==='bear')sph(head,skin,sign*.151,.19,-.014,.058,.06,.032,.87);
    else sph(head,skin,sign*.18,0,-.005,.032,.06,.028);
    sph(head,white,sign*.078,.04,.151,.061,.047,.043,.12);
    // Skin ribbons wrap the eyeball and blend into the sculpted orbit.
    for(const upper of [1,-1]) {
      const count=spec.quality==='low'?12:24,positions=[],indices=[];
      for(let row=0;row<3;row++)for(let i=0;i<=count;i++) {
        const t=i/count*Math.PI,k=row/2,arc=Math.sin(t),a=Math.cos(t);
        positions.push(sign*.078+a*(.06+.011*k),.04+upper*arc*(.032+.026*k),.174+arc*.018-k*.025);
      }
      for(let row=0;row<2;row++)for(let i=0;i<count;i++){
        const a=row*(count+1)+i,b=a+count+1;
        if(upper>0)indices.push(a,b,a+1,b,b+1,a+1);else indices.push(a,a+1,b,b,a+1,b+1);
      }
      const lid=new THREE.BufferGeometry();lid.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));lid.setIndex(indices);lid.computeVertexNormals();
      lid.translate(-sign*.078,-.04,-.151);
      part(lid,lids[(sign>0?2:0)+(upper>0?0:1)],skin,human?.58:.8);
    }
  }
  const iris=tint(colors.iris,kind==='cat'?0x819145:0x706242);
  for(const eye of pupils) {
    // Convex iris/corneal cap, inset pupil; highlights come from the scene.
    const irisGeo=new THREE.SphereGeometry(1,spec.quality==='low'?16:24,10);
    // Keep radial eye coordinates before boxUV projects the metre-scaled skin.
    const ip=irisGeo.attributes.position,radial=new Float32Array(ip.count*2);
    for(let i=0;i<ip.count;i++){radial[i*2]=ip.getX(i);radial[i*2+1]=ip.getY(i);}
    irisGeo.setAttribute('irisUV',new THREE.BufferAttribute(radial,2));
    part(irisGeo,eye,iris,.18,0,0,-.008,.026,.031,.011);
    const pupilGeo=new THREE.SphereGeometry(1,12,8);
    part(pupilGeo,eye,ink,.08,0,0,.002,.011,.016,.006);
  }
  for(let i=0;i<2;i++)box(brows[i],hair,0,0,0,.092,.02,.025,.85,(i?1:-1)*.08);
  const tube=(owner,color,points,radius,rough)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    part(new THREE.TubeGeometry(curve,spec.quality==='low'?10:18,radius,5,false),owner,color,rough);
  };
  const lip=tint(colors.lips,0xa76761),gum=tint(null,0x9f5c59);
  if(human) {
    sph(head,ink,0,-.112,.169,.068,.036,.022,.7);
    tube(head,lip,[[-.064,-.102,.177],[-.032,-.083,.188],[0,-.087,.193],[.033,-.084,.189],[.065,-.101,.177]],.008,.48);
    tube(jaw,lip,[[-.064,-.028,.028],[-.034,-.06,.04],[0,-.066,.045],[.034,-.06,.04],[.065,-.028,.028]],.009,.46);
    tube(head,gum,[[-.048,-.101,.184],[0,-.096,.193],[.048,-.102,.184]],.01,.55);
    if(fabinhe) {
      // Two separate enamel incisors, with a small natural gap; face anatomy is unchanged.
      for(const sign of [-1,1])part(new THREE.SphereGeometry(1,8,6),head,white,.29,sign*.018,-.116,.205,.014,.024,.009,sign*.025);
    }
    for(let i=0;i<(fabinhe?0:6);i++){
      const x=(i-2.5)*.017,z=.198-.012*Math.abs(i-2.5)/2.5;
      part(new THREE.SphereGeometry(1,8,6),head,white,.29,x,-.11-(i===2?.003:0),z,.009,.014,.006,0,(i-2.5)*.025);
    }
    if(!fabinhe&&spec.quality!=='low')for(let i=0;i<4;i++)
      part(new THREE.SphereGeometry(1,8,6),jaw,white,.32,(i-1.5)*.019,-.052,.042,.009,.01,.006);
  }
  if(human) {
    const coiffure=new THREE.SphereGeometry(1,spec.quality==='low'?16:28,12,spec.hairStyle==='receding'?Math.PI:0,spec.hairStyle==='receding'?Math.PI:Math.PI*2,0,1.88);
    const hp=coiffure.attributes.position;
    for(let i=0;i<hp.count;i++){
      const x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);
      hp.setXYZ(i,x*(1+.025*Math.sin(y*8+z*3)),y+.055*Math.sin(x*3+.4)*Math.max(0,z),z);
    }
    coiffure.computeVertexNormals();part(coiffure,head,hair,.86,0,.105,-.035,.187,.16,.167);
    if(kind==='forcado'||kind==='velho'||kind==='mano'||spec.moustache)for(const s of [-1,1])sph(head,hair,s*.046,-.061,.191,.062,.018,.026,.94);
  } else {
    const snout = ['bull','pig','walrus','horse','goat','bear'].includes(kind);
    if(snout) {
      const muzzle=new THREE.SphereGeometry(1,spec.quality==='low'?16:24,12);
      const mp=muzzle.attributes.position;
      for(let i=0;i<mp.count;i++) {
        const x=mp.getX(i),y=mp.getY(i),z=mp.getZ(i);
        // Two pads, a philtrum and a flatter lower jaw instead of a round ball.
        mp.setXYZ(i,x*(1+.07*Math.max(0,z)),y*(y<0?.84:1),z+.06*Math.abs(x)*Math.max(0,z));
      }
      muzzle.computeVertexNormals();
      part(muzzle,kind==='pig'?snoutBone:head,skin,kind==='pig'?.62:.82,0,-.07,.18,kind==='horse'?.105:.13,kind==='horse'?.16:.085,.12);
      for(const sign of [-1,1])sph(kind==='pig'?snoutBone:head,ink,sign*.045,kind==='horse'?-.15:-.075,.292,.013,.008,.008,.66);
      if(kind==='bear') {
        sph(head,ink,0,-.04,.292,.044,.027,.025,.4);
        for(let i=0;i<3;i++)part(new THREE.ConeGeometry(.026,.09,8),head,skin,.88,(i-1)*.052,.24,-.015,1,1,1,(i-1)*-.32);
      }
      const lipY=kind==='horse'?-.205:-.125;
      tube(kind==='pig'?snoutBone:head,skin,[[-.082,lipY,.255],[0,lipY-.008,.286],[.082,lipY,.255]],.008,.63);
      // A pair of irregular incisors is the comic trait; no human grin on a beak.
      if(kind!=='walrus')for(const sign of [-1,1])
        part(new THREE.SphereGeometry(1,8,6),jaw,white,.3,sign*.018,lipY+.06,.136,.013,.024,.009);
    }
    if(kind==='bull'||kind==='goat') for(const s of [-1,1])part(new THREE.ConeGeometry(.045,.25,10),head,white,.5,s*.23,.16,-.01,1,1,1,-s*.85);
    if(kind==='cat'||kind==='pig'||kind==='horse')for(const s of [-1,1])part(new THREE.ConeGeometry(.07,.17,4),head,skin,.8,s*.13,.2,0,1,1,1,-s*.2);
    if(kind==='pigeon'||kind==='rooster'||kind==='tortoise') {
      const beak=tint(null,0xd5a34f);
      part(new THREE.ConeGeometry(.045,.16,12),head,beak,.48,0,-.015,.23,1,.9,1,0,Math.PI/2);
      part(new THREE.ConeGeometry(.034,.12,12),jaw,beak,.5,0,.032,.082,1,.55,1,0,Math.PI/2);
      for(const sign of [-1,1])sph(head,ink,sign*.016,-.001,.245,.003,.002,.004,.65);
    }
    if(kind==='walrus')for(const s of [-1,1])part(new THREE.ConeGeometry(.025,.17,8),jaw,white,.4,s*.06,-.12,.1,1,1,1,Math.PI);
    if(kind==='rooster')for(let i=0;i<3;i++)sph(head,tint(null,0xc43a38),0,.22,.08-i*.065,.03,.055,.04,.7);
    if(kind==='raccoon')for(const s of [-1,1])sph(head,hair,s*.13,.03,.13,.045,.065,.028,.9);
    if(kind==='cat') {
      for(const sign of [-1,1])sph(head,skin,sign*.036,-.065,.173,.045,.033,.038,.83);
      part(new THREE.OctahedronGeometry(.02),head,lip,.55,0,-.047,.213,1,.7,.65);
      tube(jaw,ink,[[-.043,-.001,.054],[0,-.023,.068],[.043,-.001,.054]],.003,.85);
      if(spec.quality!=='low')for(const sign of [-1,1])for(let j=0;j<2;j++)
        tube(head,white,[[sign*.04,-.069,.2],[sign*.115,-.066+j*.014,.208],[sign*.18,-.06+j*.022,.19]],.0012,.85);
    }
  }
  const hasHat=spec.hat!==false && (spec.hat || ['forcado','mano','chubby','raccoon','tortoise','walrus'].includes(kind));
  {
    const hc=tint(colors.hat,kind==='forcado'?0x287848:0x3d4f6c);
    if(swim||wardrobe==='tourist') {
      part(new THREE.CylinderGeometry(.255,.255,.018,18),hat,hc,.9,0,.2,0);
      part(new THREE.CylinderGeometry(.125,.16,.14,14),hat,hc,.9,0,.28,0);
      part(new THREE.CylinderGeometry(.161,.161,.027,14),hat,seam,.85,0,.225,0);
    } else {
      part(new THREE.CylinderGeometry(.19,.19,.07,seg),hat,hc,.9,0,.21,0);
      if(kind==='forcado') {
        // Soft red crown bent sideways above a green band, not a rigid party cone.
        const crown=new THREE.CylinderGeometry(.04,.145,.32,14,5);
        const cp=crown.attributes.position;
        for(let i=0;i<cp.count;i++){const y=cp.getY(i),t=(y+.16)/.32;cp.setX(i,cp.getX(i)+.19*t*t);cp.setY(i,y-.11*t*t);}
        crown.computeVertexNormals();part(crown,hat,tint(null,0xbb353b),.87,0,.395,0);
        part(new THREE.CylinderGeometry(.21,.21,.1,16),body,tint(null,0xbb353b),.86,0,.965,0,1,1,.78);
      } else if(wardrobe==='critic')part(new THREE.SphereGeometry(1,seg,8),hat,hc,.88,.018,.25,-.025,.22,.035,.19,.16);
      else sph(hat,hc,0,.25,-.025,.195,.08,.18,.9);
      if(wardrobe==='influencer')box(hat,hc,0,.2,.19,.23,.018,.16,.65);
      if(fabinhe)part(new THREE.BoxGeometry(.23,.018,.16).rotateY(.95),hat,hc,.65,Math.sin(.95)*.19,.2,Math.cos(.95)*.19);
    }
  }
  const glasses=(y,z,round=false)=>{
    for(const sign of [-1,1]) {
      part(new THREE.TorusGeometry(round?.049:.052,.005,5,14),head,ink,.38,sign*.065,y,z,1,round?1:.68,1);
      box(head,ink,sign*.12,y,z-.035,.006,.008,.09,.42);
    }
    box(head,ink,0,y,z,.028,.007,.008,.4);
  };
  const accessory=tint(colors.accent,0xffcd75);
  if(spec.phone&&wardrobe!=='influencer') {box(bones.arms[1],ink,0,-.68,.09,.085,.16,.018,.35);box(bones.arms[1],tint(null,0x68b4c5),0,-.68,.102,.07,.13,.004,.3);}
  if(wardrobe==='influencer') {
    part(new THREE.CylinderGeometry(.008,.008,.65,8),bones.arms[1],ink,.33,0,-.30,.08);
    box(bones.arms[1],ink,0,.08,.08,.085,.16,.018,.3);
    box(bones.arms[1],tint(null,0x68b4c5),0,.08,.092,.07,.13,.004,.25);
    box(body,seam,0,1.22,.19,.012,.45,.012,.4);
  }
  if(spec.clothing==='usher') {box(body,tint(null,0xbad36d),0,1.2,.218,.4,.42,.02);box(body,white,0,1.16,.232,.4,.04,.012,.45);}
  if(wardrobe==='neighbor') {
    part(new THREE.CylinderGeometry(.2,.28,.58,16),body,cloth,.85,0,.88,0,1,1,.8);
    box(body,cloth,.12,1.01,.218,.13,.13,.022);
    for(let i=0;i<5;i++){const x=(i-2)*.065;part(new THREE.CylinderGeometry(.027,.027,.075,8),head,accessory,.7,x,.205,.075,1,1,1,Math.PI/2);}
  }
  if(wardrobe==='uncle') {
    for(const sign of [-1,1])box(body,cloth,sign*.06,1.47,.15,.09,.07,.02,.75,sign*.4);
    box(body,trousers,0,.94,.175,.4,.16,.04,.88);
    part(new THREE.CylinderGeometry(.212,.212,.045,14),body,shoe,.45,0,1.025,0,1,1,.78);
    box(body,accessory,0,1.025,.177,.04,.035,.012,.35);
    for(const y of [1.37,1.41])part(new THREE.CylinderGeometry(.007,.007,.004,6),body,ink,.4,0,y,.182,1,1,1,0,Math.PI/2);
  }
  if(wardrobe==='critic') {
    part(new THREE.TorusGeometry(.12,.035,6,seg),body,accessory,.43,0,1.55,0,1,1,1,0,Math.PI/2);
    box(body,accessory,.09,1.26,.22,.09,.4,.018,.43,-.1);glasses(.055,.209,true);
  }
  if(wardrobe==='fan') {
    sph(body,cloth,0,1.04,.075,.23,.22,.18,.82);
    part(new THREE.TorusGeometry(.12,.03,6,seg),body,accessory,.88,0,1.54,0,1,1,1,0,Math.PI/2);
    for(const sign of [-1,1])box(body,accessory,sign*.11,1.27,.23,.08,.43,.02,.88,sign*.05);
  }
  if(wardrobe==='tourist') {
    tube(body,shoe,[[-.11,1.48,.13],[-.15,1.25,.21],[0,1.12,.25],[.15,1.25,.21],[.11,1.48,.13]],.008,.62);
    box(body,ink,0,1.1,.24,.18,.12,.08,.43);
    part(new THREE.CylinderGeometry(.043,.043,.045,12),body,ink,.22,0,1.1,.3,1,1,1,0,Math.PI/2);
  }
  if(tank) {
    glasses(.15,.14);
    const towel=new THREE.BufferGeometry(),pos=[],idx=[];
    for(let side=0;side<2;side++)for(let i=0;i<=12;i++){
      const t=i/12;pos.push(-.21+(side-.5)*.13,1.44-Math.abs(t-.5)*1.05,.02+Math.cos(t*Math.PI)*.18);
    }
    pos.push(...pos); // separate back vertices preserve opposite cloth normals
    for(let i=0;i<12;i++){idx.push(i,i+13,i+1,i+13,i+14,i+1,i+26,i+27,i+39,i+39,i+27,i+40);}
    towel.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));towel.setIndex(idx);towel.computeVertexNormals();part(towel,body,accessory,.96);
    const strapPath=[[1.30,.17],[1.43,.17],[1.50,.11],[1.53,0],[1.50,-.11],[1.43,-.17],[1.30,-.17]];
    for(const sign of [-1,1])for(let i=1;i<strapPath.length;i++) {
      const a=strapPath[i-1],b=strapPath[i],dy=b[0]-a[0],dz=b[1]-a[1];
      part(new THREE.SphereGeometry(1,6,4).scale(.0275,Math.hypot(dy,dz)*.5,.008),body,cloth,.87,
        sign*.12,(a[0]+b[0])/2,(a[1]+b[1])/2,1,1,1,0,Math.atan2(dz,dy));
    }
  }
  if(swim) {
    const hand=bones.arms[0];box(hand,white,0,-.69,.09,.22,.14,.018,.82,.15);
    for(let i=0;i<5;i++)box(hand,ink,-.025,-.65-i*.018,.102,.14,.002,.002,.88,.15);
    box(body,white,0,.87,.174,.018,.07,.012,.85); // swim-short drawstring
  }
  if(robe) {
    const robecolor=robeFabric;
    part(new THREE.CylinderGeometry(.25,.29,.88,18,3,true,.65,Math.PI*2-1.3),body,robecolor,.94,0,.95,0,1,1,.8);
    for(const sign of [-1,1])box(body,robecolor,sign*.16,1.13,.18,.095,.7,.035,.94,sign*.08);
    box(body,robecolor,0,.93,.21,.39,.04,.025,.94);
    const hand=bones.arms[1];
    for(const sign of [-1,1]){
      part(new THREE.CylinderGeometry(.035,.04,.11,10),hand,ink,.52,sign*.04,-.67,.1,1,1,1,0,Math.PI/2);
      part(new THREE.CircleGeometry(.028,10),hand,tint(null,0x426c79),.3,sign*.04,-.67,.157);
    }
    box(hand,ink,0,-.67,.1,.05,.025,.035,.5);
  }
  if(tracksuit) {
    for(let i=0;i<2;i++){
      box(bones.arms[i],white,(i?1:-1)*.061,-.28,.025,.012,.43,.06,.75);
      box(bones.legs[i],white,(i?1:-1)*.084,-.39,.01,.012,.54,.08,.75);
    }
    if(fabinhe) {
      // Stitched zipper, dropped pockets and elastic hem; no borrowed gold-chain costume.
      box(body,seam,0,1.12,.193,.013,.55,.013,.65);
      for(const sign of [-1,1])box(body,seam,sign*.15,.94,.177,.12,.014,.014,.86,sign*.15);
      box(body,seam,0,.76,.15,.37,.035,.014,.85);
    }
    if(!fabinhe) {
    const gold=tint(null,0xd3aa4b);
    tube(body,gold,[[-.13,1.47,.12],[-.11,1.33,.21],[0,1.27,.23],[.11,1.33,.21],[.13,1.47,.12]],.009,.3);
    part(new THREE.CylinderGeometry(.027,.027,.007,10),body,gold,.3,0,1.25,.235,1,1,1,0,Math.PI/2);
    }
  }
  if(kind==='tortoise')sph(body,tint(null,0x72623c),0,1.15,-.27,.29,.31,.23,.8);
  if(kind==='raccoon')for(let i=0;i<6;i++)sph(body,i%2?ink:white,0,.85-i*.04,-.3-i*.09,.07,.065,.075,.9);
  if(kind==='pig')part(new THREE.TorusGeometry(.04,.012,6,12,Math.PI*1.6),body,skin,.7,0,.95,-.21);
  hat.visible=!!hasHat;
  const hatUniform={value:hasHat?1:0};
  const geometry=mergeGeometries(parts,false);for(const p of parts)p.dispose();geometry.clearGroups();geometry.userData.skinClothBoxes=skinClothBoxes;
  // Clone the library PBR base, replace photographed fabric maps with sub-pixel
  // procedural weave; a single material uses per-vertex roughness for skin/eyes.
  const base=M?.get ? M.get('fabric',{color:0xffffff,roughness:.85}) : null;
  const material=new THREE.MeshPhysicalMaterial();
  if(base)THREE.MeshStandardMaterial.prototype.copy.call(material,base);
  material.defines={STANDARD:'',PHYSICAL:''};
  material.clearcoat=spec.quality==='low'?0:.75;material.clearcoatRoughness=.075;
  for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap'])material[key]=null;
  material.color.set(0xffffff);material.vertexColors=true;material.metalness=0;material.roughness=1;
  material.onBeforeCompile=(s)=>{
    s.uniforms.uHatVisible=hatUniform;
    s.vertexShader=s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float hatPart; uniform float uHatVisible; attribute float surfaceRoughness; attribute float surfaceKind; attribute float fabricPattern; attribute vec2 irisUV; varying vec2 vIris; varying float vSurface; varying float vKind; varying float vPattern; varying vec2 vWeave; varying vec3 vDetailPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface=surfaceRoughness; vKind=surfaceKind; vPattern=fabricPattern; vWeave=uv; vIris=irisUV; vDetailPosition=position;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nif(hatPart>0.5 && uHatVisible<0.5) transformed=vec3(0.0);');
    s.fragmentShader=s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurface; varying float vKind; varying float vPattern; varying vec2 vWeave; varying vec2 vIris; varying vec3 vDetailPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float detailRoughness=0.0;
        float footprint=max(length(dFdx(vDetailPosition)),length(dFdy(vDetailPosition)));
        if(vKind<0.5) {
          // Metre-scaled warp and weft fade before they can alias at distance.
          float weave=sin(vWeave.x*1800.0)*sin(vWeave.y*1800.0);
          float fade=1.0-smoothstep(0.0004,0.0017,max(length(dFdx(vWeave)),length(dFdy(vWeave))));
          diffuseColor.rgb*=1.0+0.024*weave*fade;
          detailRoughness=0.025*weave*fade;
          if(vPattern>0.5) {
            float visibility=1.0-smoothstep(0.008,0.025,max(length(dFdx(vWeave)),length(dFdy(vWeave))));
            vec2 cell=fract(vWeave*18.0)-0.5;
            if(vPattern<1.5) {
              // Woven leafy sprigs: smooth material detail, never pixel signage.
              float stem=1.0-smoothstep(0.018,0.045,abs(cell.x-0.12*sin(cell.y*5.0)));
              float leaves=min(length((cell-vec2(0.14,0.12))*vec2(5.0,9.0)),length((cell+vec2(0.13,0.14))*vec2(5.0,9.0)));
              float leaf=1.0-smoothstep(0.75,1.0,leaves);
              diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.44,0.49,0.22),max(stem*.7,leaf)*visibility*.75);
            } else if(vPattern<2.5 || vPattern>3.5) {
              float axis=vPattern>3.5?vWeave.x:vWeave.y;
              float stripe=smoothstep(0.42,0.48,fract(axis*14.0))*(1.0-smoothstep(0.9,0.96,fract(axis*14.0)));
              diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.83,0.8,0.68),stripe*visibility*.75);
            } else {
              float a=atan(cell.y,cell.x+0.000001),r=length(cell);
              float petal=1.0-smoothstep(0.12+0.05*cos(a*5.0),0.16+0.05*cos(a*5.0),r);
              diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.72,0.4,0.4),petal*visibility*.8);
            }
          }
        } else if(vKind<1.5) {
          // Skin has soft uneven colour and pores, never the fabric lattice.
          float tone=sin(dot(vDetailPosition,vec3(37.0,27.0,49.0)))*sin(dot(vDetailPosition,vec3(-19.0,41.0,13.0)));
          float pores=sin(dot(vDetailPosition,vec3(823.0,251.0,167.0)))*sin(dot(vDetailPosition,vec3(-317.0,743.0,431.0)));
          float fade=1.0-smoothstep(0.0008,0.003,footprint);
          diffuseColor.rgb*=vec3(1.0)+tone*vec3(0.012,0.004,0.002)+pores*fade*0.009;
          detailRoughness=pores*fade*0.025;
        } else if(vKind<2.5) {
          float grain=sin(dot(vDetailPosition,vec3(511.0,719.0,313.0)))*sin(dot(vDetailPosition,vec3(337.0,-557.0,829.0)));
          float fade=1.0-smoothstep(0.001,0.0035,footprint);
          diffuseColor.rgb*=1.0+grain*fade*0.012;
          detailRoughness=grain*fade*0.035;
        } else if(vKind<3.5) {
          float strands=sin(vDetailPosition.y*1200.0+sin(vDetailPosition.x*38.0)*9.0+vDetailPosition.z*180.0);
          float fade=1.0-smoothstep(0.0007,0.0025,footprint);
          diffuseColor.rgb*=1.0+strands*fade*0.025;
          detailRoughness=strands*fade*0.035;
        } else if(vKind>4.5 && vSurface>0.14) {
          float angle=atan(vIris.y,vIris.x+0.000001),radius=length(vIris)*0.026;
          float fibres=sin(angle*47.0+sin(radius*900.0)*0.4);
          float fade=1.0-smoothstep(0.008,0.04,fwidth(angle));
          diffuseColor.rgb*=1.0+fibres*fade*0.13;
        }
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(vSurface+detailRoughness,0.075,0.98);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= step(4.5,vKind);\n#endif');
  };
  material.customProgramCacheKey=()=> 'workshop-character-v4';
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='character-'+(spec.id||spec.name||kind);mesh.add(pelvis);
  mesh.onBeforeRender=()=>{hatUniform.value=hat.visible?1:0;};
  mesh.bind(new THREE.Skeleton(ordered));mesh.castShadow=false;mesh.receiveShadow=true;
  // Detached hats and squash poses can exceed the bind-pose bounds. The module
  // culls whole characters at 40m; avoid Three's stale bound rejecting a hat.
  mesh.frustumCulled=false;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const height=geometry.boundingBox.max.y;
  const mouth={bone:jaw,setOpen(v){const k=clamp(v,0,1);jaw.scale.y=1+k*1.2;jaw.position.y=-.075-k*.025;
    if(kind==='pig'){snoutBone.scale.z=1+k*.08;snoutBone.position.y=-k*.005;}}};
  let pose=null,poseWeight=0,lastOpen=0,lastBrow=0,gazeX=0,gazeY=0;
  function updateEyes() {
    const x=clamp(gazeX+(pose?pose[7]*poseWeight:0),-1,1),y=clamp(gazeY+(pose?pose[8]*poseWeight:0),-1,1);
    for(let i=0;i<2;i++){pupils[i].position.x=(i ? .078 : -.078)+x*.018;pupils[i].position.y=.04+y*.015;}
  }
  const eyes={left:pupils[0],right:pupils[1],brows,lids,setLook(x,y){gazeX=clamp(x,-1,1);gazeY=clamp(y,-1,1);updateEyes();}};
  function setExpression(open=0,brow=0) {
    lastOpen=open;lastBrow=brow;
    mouth.setOpen(open+(pose?pose[0]*poseWeight:0));
    for(let i=0;i<2;i++){
      brows[i].rotation.z=(i?1:-1)*clamp(brow,-1,1)*.3+(pose?pose[1+i]*poseWeight:0);
      brows[i].position.y=.106+(pose?pose[3+i]*poseWeight:0);
      const lid=pose?pose[5+i]*poseWeight:0;
      lids[i*2].rotation.x=lid;lids[i*2+1].rotation.x=-lid*.55;
    }
    jaw.rotation.z=pose?pose[9]*poseWeight:0;
    updateEyes();
  }
  return {mesh,bones,height,mouth,eyes,hasHat,shape:[shape[0]||1,leg,hs],bodyY0:body.position.y,headY,
    triangles:geometry.index.count/3,
    setExpression,
    setPreset(name,weight=1){pose=EXPRESSION_PRESETS[name]||null;poseWeight=clamp(weight,0,1);setExpression(lastOpen,lastBrow);},
    dispose(){geometry.dispose();material.dispose();mesh.skeleton.dispose();}};
}

// Event-time choice: never repeats the last spoken string, even across situations.
export function createLinePicker(random=Math.random) {
  const previous=new Map();
  return function pick(character,situation='talk',context=null) {
    const list=character.lines?.[situation] || character.lines?.talk || [];
    if(!list.length)return '';
    const old=previous.get(character.id), start=Math.floor(clamp(random(),0,.999999)*list.length);
    for(let i=0;i<list.length;i++){
      const value=list[(start+i)%list.length],rule=character.lineContext?.[value];
      if(rule&&(!context||context.target!=='fictional_npc'||context.event!==rule.event||!rule.allowedTargetIds?.includes(context.targetId)))continue;
      if(value!==old){previous.set(character.id,value);return value;}
    }
    return ''; // a one-line situation cannot repeat; silence is intentional.
  };
}

// Existing NPC behaviour writes Object3D transforms. Keep those objects as
// proxies, drawing their ground shadows and daze stars in two instanced calls.
export function createNpcEffects(THREE, group, npcs, blobGeometry, blobMaterial, starMaterial) {
  const shadow = blobMaterial ? new THREE.InstancedMesh(blobGeometry,blobMaterial,14) : null;
  const starGeometry=new THREE.PlaneGeometry(1,1);
  const starSurface=new THREE.MeshBasicMaterial({map:starMaterial.map,transparent:true,depthWrite:false});
  const stars=new THREE.InstancedMesh(starGeometry,starSurface,14);
  const dummy=new THREE.Object3D(), invisible=new THREE.Matrix4().makeScale(0,0,0);
  stars.frustumCulled=false;stars.renderOrder=9;stars.raycast=()=>{};group.add(stars);
  if(shadow){shadow.frustumCulled=false;shadow.renderOrder=1;shadow.raycast=()=>{};group.add(shadow);}
  const selected=new Int16Array(3), distances=new Float64Array(3);
  const shadowBlack=new THREE.Color(0), puddleTint=new THREE.Color('#a58b43');
  if(shadow)shadow.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(14*3),3);
  stars.count=0;if(shadow)shadow.count=0;
  return {
    update(camera,rotation=0) {
      stars.count=npcs.length;if(shadow)shadow.count=npcs.length;
      selected.fill(-1);distances.fill(Infinity);
      for(let i=0;i<npcs.length;i++){
        const n=npcs[i];
        if(shadow){
          const owner=n.combatShadowProxy||n;
          const puddle=owner.comedyPuddle||0;
          if(puddle>0&&owner.root.visible){
            dummy.position.set(owner.x,(owner.shadowY??Math.max(0,owner.baseY||0))+.025,owner.z);dummy.rotation.set(0,0,0);
            dummy.scale.set((owner.colW*2+.45)*puddle,1,(owner.colW*2+.2)*puddle);dummy.updateMatrix();
            shadow.setMatrixAt(i,dummy.matrix);shadow.setColorAt(i,puddleTint);
          }else{
            shadow.setColorAt(i,shadowBlack);
            if(n.combatShadowProxy&&owner.root.visible){dummy.position.set(owner.x,(owner.shadowY??Math.max(0,owner.baseY||0))+.018,owner.z);dummy.rotation.set(0,0,0);dummy.scale.set(.8,1,.6);dummy.updateMatrix();shadow.setMatrixAt(i,dummy.matrix);}
            else if(n.blob?.visible){n.blob.updateMatrix();shadow.setMatrixAt(i,n.blob.matrix);}else shadow.setMatrixAt(i,invisible);
          }
        }
        if(n.stars.visible && n.root.visible){dummy.position.copy(n.stars.position);dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(rotation);dummy.scale.copy(n.stars.scale);dummy.updateMatrix();stars.setMatrixAt(i,dummy.matrix);}else stars.setMatrixAt(i,invisible);
        if(n.sprite?.visible){for(let j=0;j<3;j++)if(n.d2<distances[j]){for(let k=2;k>j;k--){distances[k]=distances[k-1];selected[k]=selected[k-1];}distances[j]=n.d2;selected[j]=i;break;}}
      }
      // Deterministic nearest-three presentation; speech state/queues unchanged.
      for(let i=0;i<npcs.length;i++)if(npcs[i].sprite)npcs[i].sprite.visible=npcs[i].sprite.visible && (i===selected[0]||i===selected[1]||i===selected[2]);
      stars.instanceMatrix.needsUpdate=true;if(shadow){shadow.instanceMatrix.needsUpdate=true;shadow.instanceColor.needsUpdate=true;}
    }
  };
}

// Props are stationary, opaque and untextured in the current legacy roster.
// Combine them once; reject unsupported materials instead of silently flattening.
export function mergeNpcProps(THREE, source) {
  const geometries=[];
  source.updateMatrixWorld(true);
  source.traverse(o=>{
    if(!o.isMesh)return;
    const m=o.material;
    if(Array.isArray(m)||m.transparent||m.map)throw new Error('NPC prop requires explicit batching support: '+o.name);
    let g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
    if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}
    const n=g.attributes.position.count,c=new Float32Array(n*3);
    for(let i=0;i<n;i++){c[i*3]=m.color.r;c[i*3+1]=m.color.g;c[i*3+2]=m.color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(c,3));
    for(const key of Object.keys(g.attributes))if(!['position','normal','color'].includes(key))g.deleteAttribute(key);
    geometries.push(g);
  });
  if(!geometries.length)return null;
  const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}));mesh.name='npc-props-batch';mesh.receiveShadow=true;
  return mesh;
}
