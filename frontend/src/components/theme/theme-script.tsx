export const THEME_STORAGE_KEY = 'efbazaar-theme';

const script = `
(function(){try{
var k='${THEME_STORAGE_KEY}';
var s;try{s=localStorage.getItem(k);}catch(e){}
var t=window.Telegram?.WebApp?.colorScheme;
var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
var n=s==='light'||s==='dark'?s:t==='light'||t==='dark'?t:m?'dark':'light';
document.documentElement.classList.toggle('dark',n==='dark');
document.documentElement.dataset.resolvedTheme=n;
}catch(e){}})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
