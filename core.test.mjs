import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DEMO_SCHEMA,DEMO_CSV,parseCsv,parseCsvHeaders,validateSchema,createSession,inspect,isIsoDate,editCell,editRow,trimPreview,applyTrim,excludeRow,restoreRow,undo,exportCsv,report,LIMITS} from './core.mjs';
const papa=createRequire(import.meta.url)('./vendor/papaparse.min.js');
const fresh=()=>createSession(parseCsv(DEMO_CSV,papa),DEMO_SCHEMA);
test('demo exposes all duplicate participants and both problem rows',()=>{
  const s=fresh(),r=inspect(s);assert.equal(r.total,4);assert.equal(r.review,2);assert.equal(r.ready,2);
  assert.deepEqual(r.issues.filter(i=>i.code==='unique').map(i=>i.row),[1,2]);assert.equal(r.canExport,false);assert.throws(()=>exportCsv(s,papa));
});
test('corrected demo exports all rows without changing identifiers, phones or quoted names',()=>{
  const s=fresh();editCell(s,1,0,'005');editCell(s,1,1,'Maya');editCell(s,1,2,'maya@example.com');editCell(s,1,3,'2026-04-03');editCell(s,1,4,'active');editCell(s,2,3,'2026-02-28');
  assert.equal(inspect(s).canExport,true);const csv=exportCsv(s,papa),r=parseCsv(csv,papa);assert.equal(r.rows.length,4);assert.equal(r.rows[0][0],'001');assert.equal(r.rows[0][1],'Lin, An');assert.equal(r.rows[0][5],'+60123456789');assert.equal(r.rows[1][5],'0123456789');assert.equal(s.original[1][0],'002');
});
test('CSV round trip preserves multiline fields, quotes, empty cells and large number strings',()=>{
  const schema={version:1,name:'strings',fields:[{name:'id',type:'text'},{name:'note',type:'text'},{name:'phone',type:'text'}]};
  const source='\uFEFFid,note,phone\r\n0001,"one\nline, with ""quote""",12345678901234567890\r\n0002,,+60123\r\n';
  const parsed=parseCsv(source,papa),s=createSession(parsed,schema);assert.deepEqual(parseCsv(exportCsv(s,papa),papa).rows,parsed.rows);
});
test('semicolon and tab delimiters are detected with original strings retained',()=>{
  for(const d of [';','\t']){const p=parseCsv(`id${d}name\n001${d}Maya\n002${d}Noah`,papa);assert.equal(p.delimiter,d);assert.equal(p.rows[0][0],'001');}
});
test('calendar validation rejects impossible and ambiguous dates',()=>{
  for(const v of ['03/04/2026','2026-02-30','2025-02-29','1900-02-29','0000-01-01','2026-13-01','2026-01-00'])assert.equal(isIsoDate(v),false,v);
  for(const v of ['2024-02-29','2000-02-29','2026-12-31','0001-01-01'])assert.equal(isIsoDate(v),true,v);
});
test('malformed quotes and ambiguous headers fail without guessing',()=>{
  for(const text of ['id,id\n1,2','id, id\n1,2',',name\n1,A','id,name\n1,"unclosed'])assert.throws(()=>parseCsv(text,papa));
});
test('ragged and interior blank records are kept, reported and block export',()=>{
  const schema={version:1,name:'rows',fields:[{name:'id',type:'text',required:true},{name:'name',type:'text'}]};
  const s=createSession(parseCsv('id,name\n1,A\n\n2,B,extra\n',papa),schema);assert.equal(s.rows.length,3);assert.equal(inspect(s).review,2);assert.equal(inspect(s).canExport,false);assert.equal(s.rows[2][2],'extra');
  excludeRow(s,1,'blank record');excludeRow(s,2,'extra column needs source correction');assert.equal(inspect(s).canExport,true);assert.equal(report(s).counts.source,report(s).counts.active+report(s).counts.excluded);
});
test('exclusions require a reason; restore and undo reinstate validation and all values',()=>{
  const s=fresh();assert.throws(()=>excludeRow(s,1,'  '));excludeRow(s,1,'needs customer confirmation');excludeRow(s,2,'invalid date');assert.equal(inspect(s).canExport,true);assert.equal(parseCsv(exportCsv(s,papa),papa).rows.length,2);
  restoreRow(s,1);assert.equal(inspect(s).canExport,false);undo(s);assert.equal(inspect(s).canExport,true);undo(s);assert.equal(s.excluded.has(2),false);assert.equal(s.rows[2][3],'2026-02-30');
});
test('excluding every row never produces a success export',()=>{const s=fresh();s.rows.forEach((_,r)=>excludeRow(s,r,'test'));assert.equal(inspect(s).canExport,false);assert.throws(()=>exportCsv(s,papa));});
test('batch whitespace repair previews precisely, changes no internal spaces and is undoable',()=>{
  const s=fresh(),p=trimPreview(s);assert.equal(p.length,1);assert.equal(p[0].before,'  Maya  ');applyTrim(s,p);assert.equal(s.rows[1][1],'Maya');undo(s);assert.equal(s.rows[1][1],'  Maya  ');assert.equal(s.original[1][1],'  Maya  ');
});
test('stale batch preview cannot overwrite later edits',()=>{const s=fresh(),p=trimPreview(s);editCell(s,1,1,' New name ');assert.throws(()=>applyTrim(s,p));assert.equal(s.rows[1][1],' New name ');});
test('missing and repeated mappings block export',()=>{const s=fresh();s.mapping[0]=-1;assert(inspect(s).mappingIssues.length);s.mapping[0]=1;assert(inspect(s).mappingIssues.length);});
test('target field order determines export, not source order',()=>{
  const schema={version:1,name:'order',fields:[{name:'id',type:'text'},{name:'name',type:'text'}]},s=createSession(parseCsv('name,id\nMaya,001',papa),schema);assert.equal(exportCsv(s,papa),'id,name\r\n001,Maya');
});
test('spreadsheet export protection is explicit; import export preserves phone and formula strings',()=>{
  const schema={version:1,name:'fidelity',fields:[{name:'value',type:'text'}]},s=createSession(parseCsv('value\n+60123\n=1+1\n@user\n-12\n',papa),schema);
  assert.equal(parseCsv(exportCsv(s,papa),papa).rows[0][0],'+60123');assert.equal(parseCsv(exportCsv(s,papa,true),papa).rows[0][0],"'+60123");
});
test('schema rejects arbitrary types, duplicate fields, nonboolean flags and bad enums',()=>{
  for(const fields of [[{name:'id',type:'code'}],[{name:'id',type:'text'},{name:'id',type:'text'}],[{name:'id',type:'text',required:'yes'}],[{name:'status',type:'enum',values:[]}],[{name:'status',type:'enum',values:['a','a']}]])assert.throws(()=>validateSchema({version:1,name:'bad',fields}));
});
test('size and row limits fail explicitly',()=>{assert.throws(()=>parseCsv('x'.repeat(LIMITS.bytes+1),papa));assert.throws(()=>parseCsv('id\n'+'1\n'.repeat(LIMITS.rows+1),papa));});
test('audit records original excluded values and edits with reversals',()=>{const s=fresh();editCell(s,0,0,'009');undo(s);excludeRow(s,1,'review later');const r=report(s);assert.equal(r.changes.length,3);assert.equal(r.excluded[0].original[0],'002');assert.equal(r.excluded[0].reason,'review later');assert.equal(r.changes[1].changes[0].after,'001');});
test('row repair commits all cells together and undo restores the whole operation',()=>{const s=fresh();editRow(s,1,[{source:0,value:'005'},{source:2,value:'maya@example.com'}]);assert.equal(s.history.length,1);assert.equal(s.rows[1][0],'005');undo(s);assert.equal(s.rows[1][0],'002');assert.equal(s.rows[1][2],'maya.example.com');});
test('invalid later row edit leaves every cell untouched',()=>{const s=fresh();assert.throws(()=>editRow(s,1,[{source:0,value:'005'},{source:100,value:'bad'}]));assert.equal(s.rows[1][0],'002');});
test('a 5000-row duplicate group flags every row with bounded explanation size',()=>{const schema={version:1,name:'large',fields:[{name:'id',type:'text',unique:true}]},s=createSession(parseCsv('id\n'+'001\n'.repeat(5000),papa),schema),r=inspect(s);assert.equal(r.review,5000);assert.equal(r.issues.length,5000);assert(r.issues.every(i=>i.message.length<200));assert.equal(r.canExport,false);});
test('undo restores missing source columns rather than inventing empty cells',()=>{
  const schema={version:1,name:'ragged undo',fields:[{name:'a',type:'text'},{name:'b',type:'text'},{name:'c',type:'text'}]};
  for(const edit of [(s)=>editCell(s,0,1,'filled'),(s)=>editRow(s,0,[{source:1,value:'b'},{source:2,value:'c'}])]){
    const s=createSession(parseCsv('a,b,c\n1\n2,3,4',papa),schema);edit(s);undo(s);assert.deepEqual(s.rows[0],['1']);assert.equal(inspect(s).canExport,false);
  }
});

test('sparse semicolon and TSV files retain empty fields instead of guessing comma',()=>{
  assert.deepEqual(parseCsv('"id";"value"\n"1";""\n',papa).rows,[['1','']]);
  assert.deepEqual(parseCsv('id\tvalue\n1\t\n2\t\n',papa).rows,[['1',''],['2','']]);
  assert.deepEqual(parseCsv('id;value\n1;2',papa,';').headers,['id','value']);
  assert.throws(()=>parseCsv('a,b\n1,2',papa,'|'));
});
test('missing cell edits require explicit contiguous strings and preserve empty-cell undo',()=>{
  const schema={version:1,name:'missing cells',fields:[{name:'a',type:'text'},{name:'b',type:'text'},{name:'c',type:'text'}]},s=createSession(parseCsv('a,b,c\n1\n2,3,4',papa),schema);
  assert.throws(()=>editRow(s,0,[{source:0,value:'changed'},{source:2,value:'last'}]));assert.deepEqual(s.rows[0],['1']);assert.equal(s.history.length,0);
  editRow(s,0,[{source:1,value:''},{source:2,value:'last'}]);assert.deepEqual(s.rows[0],['1','','last']);undo(s);assert.deepEqual(s.rows[0],['1']);
});
test('record-width bounds apply to extra data cells, not only headers',()=>{assert.throws(()=>parseCsv('a,b\n'+Array(51).fill('x').join(','),papa));});

test('target headers share sparse-dialect parsing and support header-only templates',()=>{
  assert.deepEqual(parseCsvHeaders('"CHANELID";"ADDRESS"\n"27";""\n',papa),['CHANELID','ADDRESS']);
  assert.deepEqual(parseCsvHeaders('id\tvalue\n1\t\n',papa),['id','value']);
  assert.deepEqual(parseCsvHeaders('id;value\n',papa),['id','value']);
  assert.throws(()=>parseCsvHeaders('a,a\n',papa));
});
