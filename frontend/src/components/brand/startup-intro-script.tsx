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
// Independent of hydration and animation events; never strand the visitor.
window.setTimeout(function(){delete root.dataset.startupIntro;},3400);
}catch(e){}})();
`;

export function StartupIntroScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
