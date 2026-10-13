import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { invitationCardContent } from '../dist/challenge-test/invitation-world.js';

test('independent card keeps the whole target but does not automatically reveal a corrective key',()=>{
 const state={version:4,lessonStageIndex:2,targetText:'picnic',lockedPrefix:'pic',buffer:'picnix',target:'Backspace'};
 const view=invitationCardContent(state);
 assert.equal(view.target,'picnic');assert.equal(view.buffer,'picnix');
 assert.doesNotMatch(view.instruction,/Backspace/);
 assert.match(invitationCardContent({...state,hintRequested:true}).instruction,/Backspace/);
 assert.match(invitationCardContent({...state,version:3}).instruction,/Backspace/);
});
test('independent stone route retains printed letters but removes automatic next-stone pointer and glow',async()=>{
 const source=await readFile(new URL('../dist/challenge-test/river-world.js',import.meta.url),'utf8');
 assert.match(source,/independent = state.version >= 4 && state.lessonStageIndex > 0 && !state.hintRequested/);
 assert.match(source,/const current = !independent/);
 assert.match(source,/pointer.visible = !independent/);
 assert.match(source,/p.textMap\(key, 'stone'\)/);
});

test('correction cards never claim their prefilled erroneous text is blank',()=>{
 const view=invitationCardContent({version:4,level:10,lessonStageIndex:0,targetText:'cat',lockedPrefix:'',buffer:'cx',target:'Backspace'});
 assert.doesNotMatch(view.protectedText,/空白/);
 assert.match(view.protectedText,/检查卡片末尾/);
 assert.match(invitationCardContent({version:4,level:9,lockedPrefix:'',buffer:''}).protectedText,/空白/);
});
