import assert from 'node:assert/strict';
import { build } from 'esbuild';
const records = new Map(); let version = 0; let pushCalls = 0; let acceptedSubscriptions = 0;
globalThis.__reminderStore = {
  list: async () => ({blobs: [...records.keys()].map(key=>({key}))}),
  getWithMetadata: async key => records.get(key) ?? null,
  setJSON: async (key,data,options) => {
    const existing = records.get(key);
    if(options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return {modified:false};
    const etag=String(++version);records.set(key,{data:structuredClone(data),etag});return {modified:true,etag};
  },
};
globalThis.__reminderPush = async payload => {pushCalls++;assert.equal(payload.body,'Hai un promemoria da consultare.');assert(!JSON.stringify(payload).includes('Synthetic private'));return {sent:acceptedSubscriptions,removed:0};};
async function moduleFrom(path) {
  const {outputFiles}=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'isolated-reminders',setup(builder){
    builder.onResolve({filter:/^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/},()=>({path:'store',namespace:'fixture'}));
    builder.onResolve({filter:/\/pushDelivery$|^\.\/pushDelivery$/},()=>({path:'push',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='store'?'export const getStore = () => globalThis.__reminderStore;':'export const sendPushNotification = payload => globalThis.__reminderPush(payload);',loader:'js'}));
  }}]});
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
const {default:handler}=await moduleFrom('netlify/functions/calendar.ts');
const {processCalendarReminders}=await moduleFrom('netlify/functions/_shared/calendarReminders.ts');
process.env.VINZMON_TOKEN='synthetic-reminder-test-token-123456';
const request=(method,body)=>new Request('https://test.invalid/api/calendar',{method,headers:{Authorization:`Bearer ${process.env.VINZMON_TOKEN}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const input={title:'Synthetic private reminder',start:'2026-09-06T10:00:00Z',reminderAt:'2026-09-06T10:00:00Z',timezone:'Europe/Rome',category:'task',status:'planned',notes:''};
const create=await handler(request('POST',{id:'fixture-reminder-1',event:{...input,reminderDelivery:{status:'accepted',attemptedAt:'forged'}}}));
assert.equal(create.status,200);assert.equal((await create.json()).event.reminderDelivery,undefined);
assert.equal((await processCalendarReminders(new Date('2026-09-06T09:59:00Z'))).due,0);
const due=await processCalendarReminders(new Date('2026-09-06T10:01:00Z'));
assert.equal(due.due,1);assert.equal(due.notSent,1);assert.equal(pushCalls,1);
let current=records.get('event:fixture-reminder-1');assert.equal(current.data.reminderDelivery.status,'not-sent');assert.equal(current.data.status,'planned');
assert.equal((await processCalendarReminders(new Date('2026-09-06T11:01:00Z'))).due,0);assert.equal(pushCalls,1);
const omitted={...input,title:'Edited by calendar'};delete omitted.reminderAt;
let response=await handler(request('PUT',{id:'fixture-reminder-1',version:current.etag,event:omitted}));
assert.equal(response.status,200);current=records.get('event:fixture-reminder-1');assert.equal(current.data.reminderAt,new Date(input.reminderAt).toISOString());assert.equal(current.data.reminderDelivery.status,'not-sent');
response=await handler(request('PUT',{id:'fixture-reminder-1',version:current.etag,event:{...input,reminderAt:'2026-09-07T10:00:00Z'}}));
assert.equal(response.status,200);current=records.get('event:fixture-reminder-1');assert.equal(current.data.reminderDelivery,undefined);
acceptedSubscriptions=2;
await Promise.all([processCalendarReminders(new Date('2026-09-07T10:01:00Z')),processCalendarReminders(new Date('2026-09-07T10:01:00Z'))]);
assert.equal(pushCalls,2);current=records.get('event:fixture-reminder-1');assert.equal(current.data.reminderDelivery.status,'accepted');assert.equal(current.data.reminderDelivery.acceptedSubscriptions,2);
response=await handler(request('PUT',{id:'fixture-reminder-1',version:current.etag,event:{...input,reminderAt:null}}));
assert.equal(response.status,200);current=records.get('event:fixture-reminder-1');assert.equal(current.data.reminderAt,undefined);assert.equal(current.data.status,'planned');assert.equal(records.size,1);
assert.equal((await handler(request('POST',{id:'fixture-reminder-2',event:{...input,status:'cancelled'}}))).status,200);
assert.equal((await processCalendarReminders(new Date('2026-09-09T10:01:00Z'))).due,0);
assert.equal((await handler(request('POST',{id:'fixture-reminder-3',event:{...input,reminderAt:'tomorrow'}}))).status,400);
console.log('PASS reminders: same calendar owner; client cannot forge delivery; due boundary; no-push visible state; at-most-one attempt under concurrent ticks; calendar edits preserve reminder; reschedule resets attempt; disable preserves event; cancelled event never triggers; private push payload; date validation. Synthetic stores/push only.');
