// One texture per work: a small local preview, sharpened in place on approach.
import * as THREE from 'three';
const ROOT=new URL('../../',import.meta.url),loader=new THREE.TextureLoader(),cache=new Map();
let manifestPromise=null,upgradeBusy=false;
export function prepareWorkTextures(){
  return manifestPromise ||= fetch(new URL('./previews/manifest.json',import.meta.url))
    .then(r=>r.ok?r.json():null).catch(()=>null);
}
function configure(tex,renderer){
  tex.colorSpace=THREE.SRGBColorSpace;tex.generateMipmaps=true;
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
  tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.needsUpdate=true;return tex;
}
export function loadWorkTexture(work,renderer){
  if(cache.has(work.src))return cache.get(work.src);
  const pending=prepareWorkTextures().then(async manifest=>{
    const preview=manifest?.bySrc?.[work.src]?.preview;
    let texture;
    try{texture=await loader.loadAsync(new URL(preview||work.src,ROOT).href);texture.userData.preview=!!preview;}
    catch(e){if(!preview)throw e;texture=await loader.loadAsync(new URL(work.src,ROOT).href);}
    return configure(texture,renderer);
  }).catch(e=>{cache.delete(work.src);throw e;});
  cache.set(work.src,pending);return pending;
}
const idle=()=>new Promise(resolve=>typeof requestIdleCallback==='function'?requestIdleCallback(resolve,{timeout:150}):setTimeout(resolve,16));
export async function sharpenWorkTexture(work,renderer,{maxEdge=1024}={}){
  if(upgradeBusy||!cache.has(work.src))return false;
  upgradeBusy=true;let full=null;
  try{
    const texture=await cache.get(work.src);
    if(!texture.userData.preview||texture.userData.sharpened)return false;
    await idle();
    full=await loader.loadAsync(new URL(work.src,ROOT).href);
    const image=full.image,k=Math.min(1,maxEdge/Math.max(image.width,image.height));
    let next=image;
    if(k<1){
      const width=Math.max(1,Math.round(image.width*k)),height=Math.max(1,Math.round(image.height*k));
      if(typeof createImageBitmap==='function')next=await createImageBitmap(image,{resizeWidth:width,resizeHeight:height,resizeQuality:'high',imageOrientation:'flipY'});
      else {await idle();next=document.createElement('canvas');next.width=width;next.height=height;next.getContext('2d').drawImage(image,0,0,width,height);}
    }
    await idle();
    texture.image=next;texture.needsUpdate=true;texture.userData.sharpened=true;
    renderer.initTexture(texture);return true;
  }catch{return false;}finally{full?.dispose();upgradeBusy=false;}
}
