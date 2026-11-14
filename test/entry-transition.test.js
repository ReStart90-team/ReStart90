import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('an older deferred route transition cannot rebuild the current upload page', async () => {
  const start=source.indexOf('function navigate() {');
  const end=source.indexOf('\n// ---------- actions ----------',start);
  const deferred=[]; const rendered=[];
  const context={location:{hash:'#/profiles'},S:{ui:{}},contextGeneration:0,patientGeneration:0,agentGeneration:0,
    document:{visibilityState:'visible',startViewTransition(go){deferred.push(go);return {ready:Promise.resolve(),finished:Promise.resolve(),updateCallbackDone:Promise.resolve(),skipTransition(){}};}},
    matchMedia:()=>({matches:false}),setTimeout(){},window:{scrollTo(){}},render:async()=>{rendered.push(context.location.hash);}};
  vm.runInNewContext(source.slice(start,end),context);
  context.navigate();context.location.hash='#/start';context.navigate();
  await deferred[0]();await deferred[1]();
  assert.deepEqual(rendered,['#/start']);
});

test('a late PDF read cannot import the previous account document into a new wizard', async () => {
  const start=source.indexOf("document.addEventListener('change', async (ev) => {");
  const end=source.indexOf('\n});',start)+4;
  assert.ok(start>0&&end>start);
  let handler;let resolve;
  const old={text:'old',pdf:null};const current={text:'new account text',pdf:null};
  const stale={stale:true};let generation=1,paints=0;
  const context={S:{wizard:old},document:{addEventListener(name,callback){handler=callback;}},
    requestContext:()=>generation,assertContext(value){if(value!==generation)throw stale;},STALE:stale,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),Uint8Array,
    viewStart(){paints++;},toast(){throw new Error('unexpected notification');}};
  vm.runInNewContext(source.slice(start,end),context);
  const file={name:'synthetic.pdf',type:'application/pdf',arrayBuffer:()=>new Promise(r=>{resolve=r;})};
  const pending=handler({target:{id:'wz-file',files:[file]}});
  context.S.wizard=current;generation++;
  resolve(new Uint8Array([1,2,3]).buffer);await pending;
  assert.equal(current.text,'new account text');assert.equal(current.pdf,null);assert.equal(paints,0);
});
