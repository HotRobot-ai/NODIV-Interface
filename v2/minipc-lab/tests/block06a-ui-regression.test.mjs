import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('../',import.meta.url);
const app=readFileSync(join(root.pathname,'client','app.js'),'utf8');
const css=readFileSync(join(root.pathname,'client','style.css'),'utf8');

test('BLOCK06A UI: passive refresh preserves active forms and NFC flows',()=>{
  assert.match(app,/function roleInteractionActive\(\)/);
  assert.match(app,/scanActive\|\|exchange\|\|\(cooldownNodeId&&nodeCooldownUntil>Date\.now\(\)\/1000\)\|\|catchPreview\|\|fopFlow\|\|missionFlow\|\|hqFlow\|\|hqPanelOpen\|\|evacFlow/);
  assert.match(app,/refreshRole\(\{quiet:true,passive:true\}\)/);
  assert.match(app,/if\(passive&&roleInteractionActive\(\)\)return/);
  assert.match(app,/dataset\.userEditing='1'/);
});

test('BLOCK06A UI: Founder registration is role-led, mobile sized and not fixed to two Pioneers',()=>{
  assert.doesNotMatch(app,/id="regId"/);
  assert.match(app,/AUTO:PIONEER/);
  assert.match(app,/zusätzliche Spieler-Karten sind nicht auf zwei Pioneer begrenzt/i);
  assert.match(app,/Catch braucht keinen zweiten Pioneer/);
  assert.match(app,/WIRD AUTOMATISCH VERGEBEN/);
  assert.match(css,/\.founder-scan\{[^}]*min-height:72px/);
  assert.match(css,/select,input,textarea\{[^}]*min-height:60px/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
});

test('BLOCK06A UI: NFC empty-serial feedback is explicit',()=>{
  assert.match(app,/NFC_KEINE_SERIENNUMMER:'NFC-Tag erkannt, aber keine UID übertragen/);
  assert.match(app,/UID wird geprüft/);
});
