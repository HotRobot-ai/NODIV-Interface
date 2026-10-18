import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const file=resolve(process.cwd(),'.env');
if(!existsSync(file)){console.error('FEHLER: .env fehlt. Bestehende Konfiguration nicht loeschen.');process.exit(1)}
const values=new Map();
for(const raw of readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();
  if(!line||line.startsWith('#'))continue;
  const match=line.match(/^([^=]+)=(.*)$/);
  if(match)values.set(match[1].trim(),match[2].trim().replace(/^['"]|['"]$/g,''));
}
const mode=values.get('NODIV_LAB_MODE');
if(mode!=='desktop'){
  console.error('FEHLER: .env hat NODIV_LAB_MODE='+String(mode??'(fehlt)')+'; erwartet desktop.');
  console.error('Die bestehende .env wurde NICHT veraendert. Bitte Konfiguration pruefen; Spielstand bleibt erhalten.');
  process.exit(1);
}
const uid=values.get('NODIV_UID_FOUNDER_CARD')||'';
if(!/^[0-9a-f]{8,32}$/i.test(uid)){
  console.error('FEHLER: Founder Access Card UID fehlt oder ist ungueltig. Vorhandene .env und Daten behalten.');
  process.exit(1);
}
console.log('Desktop-Konfiguration und Founder Access Card vorhanden.');
