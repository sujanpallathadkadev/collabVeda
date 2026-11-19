import { monaco } from './monacoSetup.js';

export const colorFor = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 55%)`;
};
export const b64ToU8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

let extMap = null;
export function languageFor(path) {
  if (!extMap) {
    extMap = new Map();
    for (const l of monaco.languages.getLanguages()) for (const e of l.extensions || []) extMap.set(e, l.aliases?.[0] || l.id);
  }
  const i = path.lastIndexOf('.');
  return (i >= 0 && extMap.get(path.slice(i).toLowerCase())) || 'Plain Text';
}
export const extOf = (path) => (path.includes('.') ? path.slice(path.lastIndexOf('.')).toLowerCase() : '');
