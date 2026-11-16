export function youtubeId(input){
 let url;try{url=new URL(input);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase();let id=null;
 if(host==='youtu.be')id=url.pathname.split('/')[1];
 else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host)){
  if(url.pathname==='/watch')id=url.searchParams.get('v');
  else if(/^\/(embed|shorts|live)\//.test(url.pathname))id=url.pathname.split('/')[2];
 }
 return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
}
export function validVideoId(id){return /^[A-Za-z0-9_-]{11}$/.test(id||'');}

