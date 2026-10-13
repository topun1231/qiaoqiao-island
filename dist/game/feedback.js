export const SOUND_KEY='qiaoqiao-island-sound-v1';
export function createFeedback(button){
 const buttons=[button].flat().filter(Boolean);
 let enabled=true,context=null,lastNote=-Infinity,activated=false;
 const voices=new Set();
 try{enabled=globalThis.localStorage.getItem(SOUND_KEY)!=='off';}catch{}
 function label(){for(const button of buttons){button.textContent=enabled?'声音 开':'声音 关';button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'关闭游戏音效':'开启游戏音效');}}
 function stop(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
 function unlock(){
  activated=true;
  if(!enabled)return;
  try{
   const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Audio)return;
   context??=new Audio();if(context.state==='suspended')context.resume().catch(()=>{});
  }catch{}
 }
 function play(kind='hit'){
  if(!enabled||!activated)return;unlock();
  if(!context||context.state!=='running')return;
  const now=context.currentTime;
  if(now-lastNote<.065&&kind!=='complete'&&kind!=='milestone')return;
  lastNote=now;
  const notes=kind==='complete'?[523.25,659.25,783.99]:kind==='milestone'?[659.25,880]:kind==='wrong'?[220]:[523.25];
  if(kind==='complete'||kind==='milestone')stop();
  try{notes.forEach((frequency,i)=>{
   const oscillator=context.createOscillator(),gain=context.createGain(),start=now+i*.10,duration=kind==='wrong'?.09:.18;
   oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(kind==='wrong'?.022:.045,start+.012);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
   oscillator.connect(gain);gain.connect(context.destination);voices.add(oscillator);
   oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+duration+.02);
  });}catch{stop();}
 }
 function pulse(node,kind='hit'){
  if(!node?.animate||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  node.getAnimations?.().forEach(animation=>animation.cancel());
  node.animate(kind==='wrong'?[{opacity:.65},{opacity:1}]:[{transform:'scale(1)'},{transform:'scale(1.06)',offset:.35},{transform:'scale(1)'}],{duration:kind==='milestone'?450:230,easing:'ease-out'});
 }
 for(const button of buttons)button.onclick=()=>{
  enabled=!enabled;try{globalThis.localStorage.setItem(SOUND_KEY,enabled?'on':'off');}catch{}if(!enabled)stop();label();if(enabled){unlock();play();}
  // Return typing focus so Space is gameplay, not another sound toggle.
  if(!button.closest?.('dialog'))globalThis.document?.getElementById?.('world')?.focus?.({preventScroll:true});
 };
 globalThis.window?.addEventListener('blur',stop);
 globalThis.document?.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 globalThis.window?.addEventListener('storage',event=>{if(event.key===SOUND_KEY||event.key===null){try{enabled=globalThis.localStorage.getItem(SOUND_KEY)!=='off';}catch{}if(!enabled)stop();label();}});
 label();return{play,pulse,unlock,stop};
}
