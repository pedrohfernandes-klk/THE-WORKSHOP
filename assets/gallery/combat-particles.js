// One shared instanced draw for non-graphic sweat and shoe dust.
export function createCombatParticles(THREE,scene){
 const count=32,geometry=new THREE.SphereGeometry(1,6,3),material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,depthWrite:false});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name='combat-sweat-dust';mesh.frustumCulled=false;mesh.visible=false;
 const life=new Float32Array(count),positions=new Float32Array(count*3),velocity=new Float32Array(count*3);
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion(),color=new THREE.Color();let cursor=0,active=0;
 for(let i=0;i<count;i++){m.makeScale(0,0,0);mesh.setMatrixAt(i,m);mesh.setColorAt(i,color);}
 scene.add(mesh);
 function burst(x,y,z,dx,dz){
  for(let k=0;k<8;k++){
   const i=cursor++%count,j=i*3,dust=k<3,a=k*2.399963;
   if(life[i]<=0)active++;life[i]=dust?.4:.3;positions[j]=x;positions[j+1]=dust?y-.95:y;positions[j+2]=z;
   velocity[j]=Math.sin(a)*.65+dx*.35;velocity[j+1]=dust?.3:1.1+k*.05;velocity[j+2]=Math.cos(a)*.65+dz*.35;
   p.set(positions[j],positions[j+1],positions[j+2]);scale.set(.025,.045,.025);m.compose(p,q,scale);mesh.setMatrixAt(i,m);
   color.setHex(dust?0xb9aa91:0xb8dce9);mesh.setColorAt(i,color);
  }mesh.instanceColor.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;mesh.visible=true;
 }
 function update(dt,paused=false){
  if(paused||!active)return;dt=Math.min(.05,Math.max(0,dt));
  for(let i=0;i<count;i++){
   if(life[i]<=0)continue;life[i]-=dt;const j=i*3;
   if(life[i]<=0){active--;m.makeScale(0,0,0);}else{
    velocity[j+1]-=dt*3;positions[j]+=velocity[j]*dt;positions[j+1]+=velocity[j+1]*dt;positions[j+2]+=velocity[j+2]*dt;
    p.set(positions[j],positions[j+1],positions[j+2]);const r=Math.min(.025,life[i]*.1);scale.set(r,r*1.8,r);m.compose(p,q,scale);
   }mesh.setMatrixAt(i,m);
  }mesh.instanceMatrix.needsUpdate=true;mesh.visible=active>0;
 }
 function clear(){life.fill(0);active=0;mesh.visible=false;for(let i=0;i<count;i++){m.makeScale(0,0,0);mesh.setMatrixAt(i,m);}mesh.instanceMatrix.needsUpdate=true;}
 return {mesh,burst,update,clear,dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}};
}
