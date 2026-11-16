import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPasswordState } from '../password-logic.js';
import { createPasswordDialog } from '../password-dialog.js';

// Outward normals point from each room to its public approach.
export const PASSWORD_GATES = Object.freeze([
  { id: 'studio', x: -11, z: 44, y: 0, nx: 1, nz: 0, width: 1.6, gx: -10.35, gz: 45.55, bounds: [-23, -11, 38, 50] },
  { id: 'arcade', x: 11, z: 44, y: 0, nx: -1, nz: 0, width: 1.6, gx: 10.35, gz: 42.45, bounds: [11, 23, 38, 50] },
  { id: 'school', x: 0, z: 56, y: 0, nx: 0, nz: -1, width: 1.9, gx: 1.65, gz: 55.25, bounds: [-22, 22, 56, 72] },
  { id: 'cinema', x: 0, z: 4.96, y: 7.2, nx: 0, nz: 1, width: 1.8, gx: 1.65, gz: 5.65, bounds: [-6.5, 6.5, -17, 5] },
]);

export function build(ctx) {
  const { THREE, M } = ctx;
  const group = new THREE.Group(); group.name = 'passwords';
  const colliders = [], pickables = [], gates = [];
  const state = createPasswordState(PASSWORD_GATES.map(g => g.id));
  const material = M.get('plaster', { color: 0xffffff, roughness: .67 }).clone(); material.vertexColors = true;
  const panelMaterial = M.get('oak', { color: 0x66503c, roughness: .65 });
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const color = new THREE.Color();
  function guardGeometry() {
    const pieces = [];
    function add(geometry, hex, x, y, z, sx = 1, sy = 1, sz = 1) {
      geometry.scale(sx, sy, sz); geometry.translate(x, y, z); M.boxUV(geometry);
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      if (g !== geometry) geometry.dispose();
      color.setHex(hex); const array = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < array.length; i += 3) { array[i] = color.r; array[i + 1] = color.g; array[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(array, 3)); pieces.push(g);
    }
    const sphere = (hex,x,y,z,sx,sy,sz,segments=10,rings=6) => add(new THREE.SphereGeometry(1,segments,rings),hex,x,y,z,sx,sy,sz);
    const box = (hex,x,y,z,w,h,d) => add(new THREE.BoxGeometry(w,h,d),hex,x,y,z);
    // Tailored waistcoat, shoulders, cuffs, trouser hems and flat shoes.
    sphere(0x343e46,0,1.1,0,.29,.41,.18);
    box(0xdfd1b5,0,1.38,.1,.13,.22,.1);
    for (const side of [-1,1]) {
      sphere(0x343e46,side*.31,1.25,0,.12,.19,.13);
      sphere(0x343e46,side*.34,1.02,.035,.09,.21,.1);
      box(0xdfd1b5,side*.34,.86,.05,.17,.07,.18);
      sphere(0xbb8668,side*.34,.79,.06,.085,.1,.065);
      sphere(0x252c33,side*.13,.52,0,.12,.38,.13);
      sphere(0x252c33,side*.13,.23,.02,.095,.18,.11);
      sphere(0x282522,side*.13,.08,.07,.11,.08,.2);
    }
    sphere(0xbb8668,0,1.53,0,.085,.14,.085);
    sphere(0xc38e70,0,1.78,0,.19,.25,.17,20,14);
    sphere(0xb78064,0,1.64,.06,.14,.1,.12);
    sphere(0xb07c61,0,1.78,.17,.045,.075,.055);
    sphere(0x3c3029,0,1.96,-.025,.19,.075,.155);
    for (const side of [-1,1]) {
      sphere(0xefe6d2,side*.077,1.82,.144,.045,.026,.027);
      sphere(0x352e29,side*.077,1.82,.167,.014,.016,.01,8,6);
      box(0x4d3428,side*.074,1.873,.153,.095,.018,.022);
    }
    sphere(0x793f36,0,1.685,.158,.055,.012,.015);
    box(0x9d8b65,.13,1.27,.179,.055,.075,.015); // badge, no writing
    const merged = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    return merged;
  }
  const geometry = guardGeometry();
  for (const spec of PASSWORD_GATES) {
    const guard = new THREE.Mesh(geometry, material);
    guard.userData.passwordPorter = true; // visibility changes: exclude static batching
    guard.position.set(spec.gx,spec.y,spec.gz); guard.rotation.y = Math.atan2(spec.nx,spec.nz);
    guard.receiveShadow = true; group.add(guard);
    const pg = new THREE.BoxGeometry(spec.nx ? .16 : spec.width,2.6,spec.nx ? spec.width : .16); M.boxUV(pg);
    const panel = new THREE.Mesh(pg,panelMaterial); panel.position.set(spec.x,spec.y+1.3,spec.z); panel.receiveShadow = true; group.add(panel);
    const collider = { minX:spec.x-(spec.nx ? .08 : spec.width/2),maxX:spec.x+(spec.nx ? .08 : spec.width/2),minZ:spec.z-(spec.nx?spec.width/2:.08),maxZ:spec.z+(spec.nx?spec.width/2:.08),minY:spec.y,maxY:spec.y+2.6 };
    colliders.push(collider);
    colliders.push({minX:spec.gx-.25,maxX:spec.gx+.25,minZ:spec.gz-.22,maxZ:spec.gz+.22,minY:spec.y,maxY:spec.y+2.05});
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(.85,2.2,.85),proxyMaterial);
    proxy.position.set(spec.gx,spec.y+1.1,spec.gz); proxy.userData.action={type:'custom',label:'RESPONDER'}; proxy.userData.passwordGate=spec.id; group.add(proxy); pickables.push(proxy);
    // Panel is also clickable: no hunting for a small interaction target.
    panel.userData.action={type:'custom',label:'RESPONDER'}; panel.userData.passwordGate=spec.id; pickables.push(panel);
    gates.push({spec,guard,panel,collider,exitOpen:false,open:false});
  }
  const link = document.createElement('link'); link.rel='stylesheet'; link.href=new URL('../password.css',import.meta.url).href; document.head.append(link);
  function setOpen(gate,open) {
    if (gate.open===open) return;
    gate.open=open; gate.panel.visible=!open;
    gate.collider.minY=open?-1000:gate.spec.y; gate.collider.maxY=open?-999:gate.spec.y+2.6;
  }
  const dialog = createPasswordDialog(ctx,(id,text)=>{
    const result=state.answer(id,text);
    if (!result.accepted) return result;
    for (let i=0;i<gates.length;i++) if(gates[i].spec.id===id)setOpen(gates[i],true);
    ctx.ui.toast(result.achievement?'Descobriste a senha da casa':state.discovered?'Já sabes.':'Podes entrar.');
    ctx.events?.dispatchEvent?.(new CustomEvent('workshop',{detail:{type:'password-ok',value:{buildingId:id,firstTry:result.firstTry,eventId:result.eventId}}}));
    return result;
  });
  function onPick(object) {
    const id=object?.userData?.passwordGate, entry=state.buildings[id];
    if (!entry) return;
    if(entry.unlocked){ctx.ui.toast(state.discovered?'Já sabes.':'Podes entrar.');return;}
    const effects=ctx.scene.userData.bairroEffects;
    const wifi=effects?.wifiHint===true;
    if(dialog.show(id,state.prompt(id),entry.failures,wifi)&&wifi)effects.wifiHint=false;
  }
  function update(dt,frame) {
    const p=frame?.camera?.position;if(!p)return;
    for(let i=0;i<gates.length;i++) {
      const gate=gates[i],s=gate.spec,b=s.bounds;
      const correctLevel=p.y>=s.y-.3&&p.y<s.y+4;
      // Egress is independent of password and distance: loading inside never traps.
      if(correctLevel&&p.x>b[0]&&p.x<b[1]&&p.z>b[2]&&p.z<b[3])gate.exitOpen=true;
      if(gate.exitOpen&&correctLevel&&(p.x-s.x)*s.nx+(p.z-s.z)*s.nz>1.15)gate.exitOpen=false;
      setOpen(gate,state.buildings[s.id].unlocked||gate.exitOpen);
      const dx=p.x-s.gx,dz=p.z-s.gz;
      gate.guard.visible=dx*dx+dz*dz<=1600;
    }
  }
  const api={state,close:()=>dialog.close()}; ctx.scene.userData.passwords=api;
  return {group,regions:[],colliders,pickables,update,onPick,
    dispose(){dialog.dispose();link.remove();geometry.dispose();material.dispose();proxyMaterial.dispose();for(const gate of gates)gate.panel.geometry.dispose();if(ctx.scene.userData.passwords===api)delete ctx.scene.userData.passwords;},
  };
}
