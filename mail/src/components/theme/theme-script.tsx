/**
 * Mirror of frontend/src/components/theme/theme-script.tsx. The storage key is
 * deliberately identical: localStorage is per-origin so mail.efbazaar.uz keeps
 * its own value, but the same key keeps the two apps interchangeable if the
 * preference ever moves to a shared cookie.
 */
export const THEME_STORAGE_KEY = 'efbazaar-theme';

const script = `
(function(){try{
var k='${THEME_STORAGE_KEY}';
var s=localStorage.getItem(k);
var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
var d=s==='dark'||(s!=='light'&&m);
document.documentElement.classList.toggle('dark',d);
}catch(e){}})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
