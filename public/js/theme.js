import { setMapTheme } from './map.js';

// Hell/Dunkel folgt dem System – keine Einstellung nötig.
const mq = window.matchMedia('(prefers-color-scheme: dark)');
export const isDark = () => mq.matches;
export function applyTheme() { try { setMapTheme(isDark()); } catch { /* Karte noch nicht da */ } }
mq.addEventListener?.('change', applyTheme);
