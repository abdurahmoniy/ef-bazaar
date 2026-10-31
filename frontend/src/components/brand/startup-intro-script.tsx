import { createStartupSoundBinding } from './startup-sound';

// Opt in before first paint so returning visits never flash the splash screen.
// Default CSS is hidden: blocked storage, disabled JS, or script errors fail open.
const script = `
(function(){try{
var root=document.documentElement;
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var key='efbazaar-startup-seen';
if(sessionStorage.getItem(key)==='1')return;
sessionStorage.setItem(key,'1');
root.dataset.startupIntro='playing';
// CSS starts before hydration. Attach sound to that same first animation frame.
var bindSound=(${createStartupSoundBinding.toString()})();
var onStart=function(event){
  var overlay=event.target;
  if(!overlay || overlay.id!=='startup-intro')return;
  document.removeEventListener('animationstart',onStart,true);
  var audio=overlay.querySelector('audio');
  if(audio)bindSound(overlay,audio);
};
document.addEventListener('animationstart',onStart,true);
// Independent of hydration and animation events; never strand the visitor.
window.setTimeout(function(){
  document.removeEventListener('animationstart',onStart,true);
  delete root.dataset.startupIntro;
},6400);
}catch(e){}})();
`;

export function StartupIntroScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
