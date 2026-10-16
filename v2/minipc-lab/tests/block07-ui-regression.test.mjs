import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('../',import.meta.url);
const app=readFileSync(join(root.pathname,'client','app.js'),'utf8');
const css=readFileSync(join(root.pathname,'client','style.css'),'utf8');
const html=readFileSync(join(root.pathname,'client','index.html'),'utf8');
const starter=readFileSync(join(root.pathname,'NODIV-V2-SPIELEN.ps1'),'utf8');

test('BLOCK07 UI: Founder gets explicit flexible TESTMODUS controls and no fixed desktop minimum',()=>{
  assert.match(app,/TESTMODUS \/\/ SCHREIBTISCHBETRIEB/);
  assert.match(app,/TESTSPIEL VORBEREITEN/);
  assert.match(app,/TESTSPIEL STARTEN/);
  assert.match(app,/TESTSPIEL BEENDEN/);
  assert.match(app,/keine Spieler, UIDs, Cores oder Energie/i);
  assert.match(app,/NODE-KENNUNG/);
  assert.match(app,/WIRD AUTOMATISCH VERGEBEN/);
  assert.match(app,/MIT DIESEM BESTAND SPIELBAR/);
  assert.doesNotMatch(app,/desktopTest[^\n]*\/12\+/);
});

test('BLOCK07 UI: inactive and ended roles are visibly blocked instead of exposing disappearing forms',()=>{
  assert.match(app,/function eventActionBlocked/);
  assert.match(app,/TESTSPIEL BEENDET/);
  assert.match(app,/v\.event\?\.state!==['"]FIELD_ACTIVE['"]/);
  assert.match(css,/\.capability-list/);
  assert.match(css,/\.test-ended/);
  assert.match(css,/min-height:70px/);
});

test('BLOCK07 package surface: one clearly named Windows launcher selects Founder setup or TESTMODUS',()=>{
  assert.match(starter,/NODIV V2 TESTMODUS starten/);
  assert.match(starter,/NODIV_LAB_MODE=desktop/);
  assert.match(starter,/wird NICHT geloescht/);
  assert.match(html,/TESTMODUS · LOKALER SPIELSTAND/);
});
