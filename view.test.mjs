import test from 'node:test';import assert from 'node:assert/strict';import {visibleRecordIds} from './view.mjs';
test('filtered pages retain original record IDs beyond the first page',()=>{
 const session={rows:Array.from({length:250},()=>[]),excluded:new Map([[203,'deferred']])},result={issues:[{row:101},{row:249},{row:101}],mappingIssues:[]};
 assert.deepEqual(visibleRecordIds(session,result,'review'),[101,249]);assert.deepEqual(visibleRecordIds(session,result,'excluded'),[203]);assert.equal(visibleRecordIds(session,result,'all').length,250);assert(!visibleRecordIds(session,result,'passed').some(r=>[101,203,249].includes(r)));
});
test('incomplete mapping never labels unevaluated records as passing',()=>{
 const session={rows:[[],[]],excluded:new Map()},result={issues:[],mappingIssues:['choose source']};assert.deepEqual(visibleRecordIds(session,result,'passed'),[]);assert.deepEqual(visibleRecordIds(session,result),[0,1]);
});
test('filtering never mutates rows, exclusions or issue evidence',()=>{
 const session={rows:[['001'],['002']],excluded:new Map([[1,'deferred']])},result={issues:[{row:0}],mappingIssues:[]},before=JSON.stringify([session.rows,[...session.excluded],result]);visibleRecordIds(session,result,'review');assert.equal(JSON.stringify([session.rows,[...session.excluded],result]),before);assert.throws(()=>visibleRecordIds(session,result,'unknown'));
});
