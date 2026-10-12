import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DEMO_CSV,DEMO_SCHEMA,parseCsv,createSession,editRow,excludeRow,undo,inspect,trimPreview,applyTrim} from './core.mjs';
import {saveProject,restoreProject,reuseMapping,PROJECT_LIMIT} from './project.mjs';
const papa=createRequire(import.meta.url)('./vendor/papaparse.min.js');
const fresh=()=>createSession(parseCsv(DEMO_CSV,papa),DEMO_SCHEMA);
test('project preserves originals, edits, rules, mapping, exclusions, drafts and undo',()=>{
  const s=fresh();editRow(s,1,[{source:0,value:'005'},{source:2,value:'maya@example.com'}]);excludeRow(s,2,'waiting for date');
  const drafts=new Map([['1:3','2026-04-03']]),r=restoreProject(saveProject(s,drafts,'test.csv'));
  assert.equal(r.filename,'test.csv');assert.deepEqual(r.session.rows,s.rows);assert.deepEqual(r.session.original,s.original);assert.deepEqual(r.session.schema,s.schema);assert.deepEqual(r.session.mapping,s.mapping);assert.deepEqual(r.session.excluded,s.excluded);assert.deepEqual(r.drafts,drafts);assert.deepEqual(inspect(r.session),inspect(s));
  undo(r.session);assert.equal(r.session.excluded.size,0);undo(r.session);assert.equal(r.session.rows[1][0],'002');
});
test('project matrices are independent, and original rows remain frozen',()=>{const s=fresh(),r=restoreProject(saveProject(s,new Map(),'test.csv'));r.session.rows[0][0]='999';assert.equal(s.rows[0][0],'001');assert.throws(()=>r.session.original[0][0]='999');});
test('truncated, oversized and foreign project files are rejected',()=>{for(const text of ['{','{}',JSON.stringify({format:'other',version:1}),' '.repeat(PROJECT_LIMIT+1)])assert.throws(()=>restoreProject(text));});
test('out-of-range mappings, exclusion rows, drafts and undo edits are rejected',()=>{
  const base=JSON.parse(saveProject(fresh(),new Map(),'test.csv'));
  for(const change of [r=>r.data.mapping[0]=99,r=>r.data.excluded=[[99,'bad']],r=>r.drafts=[['99:0','bad']],r=>r.data.history=[{label:'bad',changes:[{kind:'cell',row:0,source:99,before:'',after:''}]}],r=>r.data.rows[0][0]=123]){const r=structuredClone(base);change(r);assert.throws(()=>restoreProject(JSON.stringify(r)));}
});
test('duplicate exclusions and draft keys are rejected',()=>{const base=JSON.parse(saveProject(fresh(),new Map(),'test.csv'));base.data.excluded=[[1,'first'],[1,'second']];assert.throws(()=>restoreProject(JSON.stringify(base)));base.data.excluded=[];base.drafts=[['1:0','005'],['1:0','006']];assert.throws(()=>restoreProject(JSON.stringify(base)));});
test('100-cell visible batches repair larger sets without modifying unseen cells',()=>{
  const schema={version:1,name:'batch',fields:[{name:'id',type:'text'}]},s=createSession(parseCsv('id\n'+' 001 \n'.repeat(150),papa),schema),preview=trimPreview(s).slice(0,100);
  applyTrim(s,preview);assert.equal(trimPreview(s).length,50);assert.equal(s.rows[99][0],'001');assert.equal(s.rows[100][0],' 001 ');undo(s);assert.equal(trimPreview(s).length,150);
});
test('duplicate or stale batch edits fail atomically',()=>{const s=fresh(),p=trimPreview(s);assert.throws(()=>applyTrim(s,[p[0],p[0]]));assert.equal(s.rows[1][1],'  Maya  ');const changed=structuredClone(p);changed[0].after='wrong';assert.throws(()=>applyTrim(s,changed));assert.equal(s.rows[1][1],'  Maya  ');});
test('mapping reuse follows source names across column reorder and never stale positions',()=>{const s=fresh();s.headers[2]='Primary Email';assert.deepEqual(reuseMapping(['Primary Email','customer_id','name','start_date','status','phone'],s.schema,s),[1,2,0,3,4,5]);assert.equal(reuseMapping(['customer_id','name','Other','start_date','status','phone'],s.schema,s)[2],-1);});
