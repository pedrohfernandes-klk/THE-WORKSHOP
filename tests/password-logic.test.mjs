import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_PHRASES, PASSWORD_HINT, isPassword, createPasswordState } from '../assets/gallery/password-logic.js';

test('22 distinct phrases; first two prompts are the owner signatures',()=>{
  assert.equal(PASSWORD_PHRASES.length,22);assert.equal(new Set(PASSWORD_PHRASES).size,22);
  const state=createPasswordState(['studio','arcade']);
  assert.equal(state.prompt('studio'),'Levaste na ___.');
  assert.equal(state.prompt('studio'),'Levaste na ___.');
  assert.equal(state.prompt('arcade'),'Tens ganda ___.');
});
test('answer accepts case and whitespace but not another word or pasted markup',()=>{
  for(const text of ['boca','a boca',' BOCA ',' A \n BOCA\t'])assert.equal(isPassword(text),true);
  for(const text of ['','bocas','boca!','a minha boca','<b>boca</b>'])assert.equal(isPassword(text),false);
});
test('three mistakes reveal exact hint; reopening does not reset attempts',()=>{
  const state=createPasswordState(['school']);
  state.prompt('school');state.answer('school','não');state.prompt('school');state.answer('school','talvez');
  assert.equal(state.answer('school','porta').hint,PASSWORD_HINT);
  assert.equal(PASSWORD_HINT,'É sempre a mesma coisa. Abre-a para responder.');
  const result=state.answer('school','a boca');assert.equal(result.accepted,true);assert.equal(result.firstTry,false);
});
test('three distinct consecutive first attempts award discovery exactly once',()=>{
  const state=createPasswordState(['studio','arcade','school','cinema']);
  const a=state.answer('studio','boca');assert.equal(a.achievement,false);
  assert.equal(state.answer('studio','boca').duplicate,true);
  assert.equal(state.answer('arcade','boca').achievement,false);
  const c=state.answer('school','boca');assert.equal(c.achievement,true);
  assert.notEqual(a.eventId,c.eventId);assert.equal(state.prompt('cinema'),'Já sabes.');
  assert.equal(state.answer('cinema','boca').achievement,false);
});
test('failure interrupts discovery streak even before the failed building is solved',()=>{
  const state=createPasswordState(['studio','arcade','school','cinema']);
  state.answer('studio','boca');state.answer('arcade','porta');
  state.answer('school','boca');state.answer('cinema','boca');
  assert.equal(state.discovered,false);assert.equal(state.answer('arcade','boca').achievement,false);
});
