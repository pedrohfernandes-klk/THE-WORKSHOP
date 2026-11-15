import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildCharacter, createLinePicker } from '../assets/gallery/npc-models.js';
import { boxUV } from '../assets/gallery/materials.js';
const cast=JSON.parse(fs.readFileSync(new URL('../assets/data/npc-cast.json',import.meta.url),'utf8'));
const M={get:()=>new THREE.MeshStandardMaterial(),boxUV};

test('W3 preserves fourteen legacy slots and offers twelve opt-in archetypes',()=>{
  assert.equal(cast.characters.length,26);
  assert.equal(cast.characters.filter(c=>c.enabledByDefault).length,14);
  assert.equal(cast.maxActive,14);
  const situations='talk ignored slap1 slap2 slap3 bystander_laugh run_past jump sit_beside gesture_rude golden sunny storm rainbow night'.split(' ');
  for(const c of cast.characters){for(const key of situations)assert.ok(c.lines[key]?.length>=2,c.id+':'+key);assert.ok(new Set(Object.values(c.lines).flat()).size>=15);assert.ok(c.humanMoment);}
  for(const line of cast.protectedLines)assert.ok(cast.characters.some(c=>Object.values(c.lines).flat().includes(line)),line);
});

test('W3 every model has one mesh, valid normalized skin weights and bounded geometry',()=>{
  for(const c of cast.characters)for(const quality of ['low','medium','high']){
    const rig=buildCharacter(THREE,M,{...c.model,quality});
    let meshes=0;rig.mesh.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,1,c.id);
    assert.ok(rig.mesh.isSkinnedMesh);assert.ok(!Array.isArray(rig.mesh.material));assert.equal(rig.mesh.geometry.groups.length,0);
    assert.ok(rig.triangles<=15000,c.id+':'+rig.triangles);assert.ok(rig.height>1&&rig.height<3.5);
    const a=rig.mesh.geometry.attributes;
    for(let i=0;i<a.position.count;i++){
      assert.ok(Number.isFinite(a.position.getX(i))&&Number.isFinite(a.position.getY(i))&&Number.isFinite(a.position.getZ(i)));
      assert.equal(a.skinWeight.getX(i)+a.skinWeight.getY(i)+a.skinWeight.getZ(i)+a.skinWeight.getW(i),1);
      assert.ok(a.skinIndex.getX(i)<rig.mesh.skeleton.bones.length);
    }
    rig.setExpression(1,1);rig.eyes.setLook(1,-1);assert.ok(rig.mouth.bone.scale.y>1);
    assert.equal(rig.bones.body,rig.bones.spine);assert.equal(rig.bones.arms.length,2);assert.equal(rig.bones.legs.length,2);
    rig.dispose();
  }
});

test('W3 a detached hat still skins without another mesh',()=>{
  const rig=buildCharacter(THREE,M,{id:'forcado',head:'forcado',hat:true});
  const group=new THREE.Group();group.add(rig.mesh);group.attach(rig.bones.hat);
  rig.bones.hat.position.set(2,3,4);group.updateMatrixWorld(true);rig.mesh.skeleton.update();
  const a=rig.mesh.geometry.attributes;let index=-1;
  for(let i=0;i<a.hatPart.count;i++)if(a.hatPart.getX(i)){index=i;break;}
  assert.ok(index>=0);const p=new THREE.Vector3().fromBufferAttribute(a.position,index);rig.mesh.applyBoneTransform(index,p);
  assert.ok(p.x>1&&p.y>2&&p.z>3);rig.dispose();
});

test('W3 dialogue does not repeat consecutive strings across situations',()=>{
  const pick=createLinePicker(()=>0);
  const c={id:'test',lines:{talk:['A','B'],storm:['A','B'],night:['B']}};
  assert.equal(pick(c),'A');assert.equal(pick(c,'storm'),'B');assert.equal(pick(c,'night'),'');assert.equal(pick(c),'A');
});

test('W3 asymmetric presets combine with speech and reset without changing rig anchors',()=>{
  const rig=buildCharacter(THREE,M,{head:'human',quality:'medium'});
  rig.setPreset('incredulidade',.8);rig.setExpression(.4,.2);
  assert.notEqual(rig.bones.brows[0].position.y,rig.bones.brows[1].position.y);
  assert.notEqual(rig.eyes.lids[0].rotation.x,rig.eyes.lids[2].rotation.x);
  assert.ok(rig.mesh.material.isMeshPhysicalMaterial);
  const kinds=new Set(rig.mesh.geometry.attributes.surfaceKind.array);
  for(const kind of [0,1,2,3,5])assert.ok(kinds.has(kind));
  rig.setPreset(null);rig.setExpression(0,0);
  assert.equal(rig.bones.brows[0].position.y,.106);
  assert.equal(rig.eyes.lids[0].rotation.x,0);
  assert.equal(rig.mouth.bone.rotation.z,0);
  rig.dispose();
});

test('W3 protected appearance jokes require an explicit fictional target',()=>{
  const pick=createLinePicker(()=>0),text='Reservado ao elenco.';
  const entry={id:'speaker',lines:{bystander_laugh:[text,'Isso foi inesperado.']},
    lineContext:{[text]:{event:'bystander_laugh',allowedTargetIds:['forcado']}}};
  assert.equal(pick(entry,'bystander_laugh'),'Isso foi inesperado.');
  assert.equal(pick(entry,'bystander_laugh',{target:'fictional_npc',targetId:'forcado',event:'bystander_laugh'}),text);
});

test('W3 pig snout follows speech and effective rig anchors are explicit',()=>{
  const rig=buildCharacter(THREE,M,{head:'pig',shape:[.9,.72,1.25],bodyWidth:1.28,clothing:'business_pig'});
  const initial=rig.bones.snout.scale.z;rig.mouth.setOpen(.8);
  assert.ok(rig.bones.snout.scale.z>initial);
  assert.equal(rig.bodyY0,.82*(.72-1));assert.equal(rig.headY,1.74+.17*(1.25-1));
  assert.deepEqual(rig.shape,[.9,.72,1.25]);rig.dispose();
});
