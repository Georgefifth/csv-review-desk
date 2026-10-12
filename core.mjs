export const LIMITS = {bytes: 2 * 1024 * 1024, rows: 5000, columns: 50};
export const DEMO_SCHEMA = {version: 1, name: 'Contact list demo rules', fields: [
  {name:'customer_id', type:'text', required:true, unique:true},
  {name:'name', type:'text', required:true},
  {name:'email', type:'email', required:true, unique:true},
  {name:'start_date', type:'date', required:true},
  {name:'status', type:'enum', required:true, values:['active','paused']},
  {name:'phone', type:'text'}
]};
export const DEMO_CSV = 'customer_id,name,email,start_date,status,phone\r\n001,"Lin, An",an@example.com,2026-10-12,active,+60123456789\r\n002,  Maya  ,maya.example.com,03/04/2026,Active,0123456789\r\n002,Noah,noah@example.com,2026-02-30,paused,00112233\r\n004,Iris,iris@example.com,2026-10-14,active,00998877\r\n';
export function validateSchema(raw) {
  if (!raw || raw.version !== 1 || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > LIMITS.columns) throw new Error('Rules need version: 1, a name, and 1–50 fields.');
  const names = new Set();
  const fields = raw.fields.map(f => {
    if (!f || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 100 || names.has(f.name)) throw new Error('Target fields must be nonempty, unique, and at most 100 characters.');
    names.add(f.name);
    if (!['text','email','date','enum'].includes(f.type)) throw new Error('Supported types: text, email, date, enum.');
    if (f.required !== undefined && typeof f.required !== 'boolean' || f.unique !== undefined && typeof f.unique !== 'boolean') throw new Error('required and unique must be booleans.');
    if (f.type === 'enum' && (!Array.isArray(f.values) || !f.values.length || f.values.some(v => typeof v !== 'string' || !v.length) || new Set(f.values).size !== f.values.length)) throw new Error('An enum needs nonempty, distinct text options.');
    return {name:f.name, type:f.type, required:!!f.required, unique:!!f.unique, ...(f.type==='enum'?{values:[...f.values]}:{})};
  });
  return {version:1, name:raw.name.slice(0,100), fields};
}
export function parseCsv(text, papa) {
  if (new TextEncoder().encode(text).length > LIMITS.bytes) throw new Error('Maximum file size is 2 MB. Split larger files.');
  if (!text.trim()) throw new Error('The file is empty. Load a CSV with headers and records.');
  const parsed = papa.parse(text.replace(/^\uFEFF/,''), {header:false, dynamicTyping:false, skipEmptyLines:false, delimitersToGuess:[',',';','\t']});
  const serious = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (serious.length) throw new Error(`Cannot reliably parse the CSV: ${serious[0].message}. Check the quotes, then reload.`);
  const matrix = parsed.data;
  if (/[\r\n]$/.test(text) && matrix.at(-1)?.length === 1 && matrix.at(-1)[0] === '') matrix.pop();
  const headers = matrix.shift();
  if (!headers?.length || headers.length > LIMITS.columns) throw new Error('Supported column count: 1–50.');
  if (headers.some(h=>!h.trim()) || new Set(headers.map(h=>h.trim())).size !== headers.length) throw new Error('Headers are empty or repeated. Fix the headers, then reload.');
  if (!matrix.length) throw new Error('The file contains headers but no records.');
  if (matrix.length > LIMITS.rows) throw new Error('Maximum record count is 5,000. Split larger files.');
  return {headers, rows:matrix, delimiter:parsed.meta.delimiter || ','};
}
export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
export function createSession(parsed, schema) {
  const original = parsed.rows.map(row=>Object.freeze([...row]));
  const mapping = schema.fields.map(f=>parsed.headers.indexOf(f.name));
  return {headers:[...parsed.headers], original:Object.freeze(original), rows:parsed.rows.map(r=>[...r]), delimiter:parsed.delimiter, schema:validateSchema(schema), mapping, excluded:new Map(), history:[], events:[]};
}
export function valueAt(s,row,field) { return s.rows[row][s.mapping[field]] ?? ''; }
export function inspect(s) {
  const issues = [], mappingIssues = [];
  s.mapping.forEach((source,i)=>{
    if (!Number.isInteger(source) || source<0 || source>=s.headers.length) mappingIssues.push(`${s.schema.fields[i].name}: choose a source column.`);
    else if (s.mapping.filter(x=>x===source).length>1) mappingIssues.push(`${s.headers[source]} maps to multiple target fields. Use a one-to-one mapping.`);
  });
  s.rows.forEach((row,r)=>{
    if (s.excluded.has(r)) return;
    if (row.length !== s.headers.length) issues.push({row:r,field:-1,code:'structure',message:`This record has ${row.length} columns; the header has ${s.headers.length}. Exclude it explicitly or fix the source and reload.`});
    s.schema.fields.forEach((field,f)=>{
      if (s.mapping[f]<0) return;
      const value=valueAt(s,r,f);
      const add=(code,message)=>issues.push({row:r,field:f,code,message});
      if (field.required && !value.trim()) {add('required','A required value is missing. Supply the source information or explicitly exclude this row.');return;}
      if (!value.length) return;
      if (value !== value.trim()) add('space','Leading or trailing whitespace. Review the change before trimming.');
      if (field.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) add('email','Invalid email format. We do not guess addresses or verify that a mailbox exists.');
      if (field.type==='date' && !isIsoDate(value)) add('date','Enter a real YYYY-MM-DD date. You must resolve ambiguous dates such as 03/04.');
      if (field.type==='enum' && !field.values.includes(value)) add('enum',`Allowed values: ${field.values.join('、')}. Case-sensitive.`);
    });
  });
  s.schema.fields.forEach((field,f)=>{
    if (!field.unique || s.mapping[f]<0) return;
    const groups=new Map();
    s.rows.forEach((_,r)=>{if(s.excluded.has(r)) return; const v=valueAt(s,r,f); if(v.length) {const ids=groups.get(v)||[];ids.push(r);groups.set(v,ids);}});
    groups.forEach(ids=>{if(ids.length>1){const list=ids.slice(0,10).map(x=>x+1).join('、'),message=`Duplicate value in rows ${list}${ids.length>10?` and others (${ids.length} rows)`:''}. No rows are merged or deleted automatically.`;ids.forEach(r=>issues.push({row:r,field:f,code:'unique',message}));}});
  });
  issues.sort((a,b)=>a.row-b.row||a.field-b.field);
  const badRows=new Set(issues.map(i=>i.row));
  const active=s.rows.length-s.excluded.size;
  return {issues,mappingIssues,total:s.rows.length,active,excluded:s.excluded.size,review:badRows.size,ready:mappingIssues.length?0:active-badRows.size,canExport:active>0&&!mappingIssues.length&&!issues.length};
}
function commit(s,changes,label) {
  if (!changes.length) return;
  s.history.push({changes,label});
  s.events.push({action:label,changes:structuredClone(changes)});
}
export function editCell(s,row,source,value) {
  if (typeof value!=='string' || source<0 || source>=s.headers.length || row<0 || row>=s.rows.length) throw new Error('Invalid cell edit.');
  const before=s.rows[row][source]??'',beforeLength=s.rows[row].length;
  if(before===value)return;
  s.rows[row][source]=value;
  commit(s,[{kind:'cell',row,source,before,after:value,...(source>=beforeLength?{beforeLength}:{})}],'Edit cell');
}
export function editRow(s,row,edits) {
  if(!Number.isInteger(row)||row<0||row>=s.rows.length||s.excluded.has(row))throw new Error('This row cannot be edited.');
  const seen=new Set(),changes=edits.flatMap(({source,value})=>{
    if(!Number.isInteger(source)||source<0||source>=s.headers.length||typeof value!=='string'||seen.has(source))throw new Error('Invalid or repeated cell edits.');
    seen.add(source);const before=s.rows[row][source]??'';
    return before===value?[]:[{kind:'cell',row,source,before,after:value,...(source>=s.rows[row].length?{beforeLength:s.rows[row].length}:{})}];
  });
  changes.forEach(c=>s.rows[c.row][c.source]=c.after);commit(s,changes,'Save row edits');
}
export function trimPreview(s) {
  const sources=[...new Set(s.mapping.filter(x=>x>=0))];
  return s.rows.flatMap((row,r)=>s.excluded.has(r)?[]:sources.flatMap(source=>{
    const before=row[source]??'',after=before.trim();
    return before===after?[]:[{kind:'cell',row:r,source,before,after}];
  }));
}
export function applyTrim(s,preview) {
  const fresh=trimPreview(s);
  const byCell=new Map(fresh.map(c=>[`${c.row}:${c.source}`,c])),seen=new Set();
  for(const c of preview){const key=`${c.row}:${c.source}`;if(seen.has(key)||JSON.stringify(byCell.get(key))!==JSON.stringify(c))throw new Error('The preview is stale. Generate a new preview.');seen.add(key);}
  preview.forEach(c=>s.rows[c.row][c.source]=c.after);
  commit(s,preview,'Trim confirmed whitespace');
}
export function excludeRow(s,row,reason) {
  if(!Number.isInteger(row)||row<0||row>=s.rows.length||typeof reason!=='string'||!reason.trim()) throw new Error('Excluding a row requires a valid row number and a reason.');
  const before=s.excluded.get(row)??null,after=reason.trim();
  s.excluded.set(row,after);commit(s,[{kind:'exclude',row,before,after}],'Exclude row');
}
export function restoreRow(s,row) {
  if(!s.excluded.has(row))return;
  const before=s.excluded.get(row);s.excluded.delete(row);commit(s,[{kind:'exclude',row,before,after:null}],'Restore row');
}
export function undo(s) {
  const last=s.history.pop();if(!last)return false;
  [...last.changes].reverse().forEach(c=>{
    if(c.kind==='cell'){s.rows[c.row][c.source]=c.before;if(c.beforeLength!==undefined)s.rows[c.row].length=c.beforeLength;}
    else if(c.before===null)s.excluded.delete(c.row);else s.excluded.set(c.row,c.before);
  });
  s.events.push({action:`Undo: ${last.label}`,changes:last.changes.map(c=>({...c,before:c.after,after:c.before}))});return true;
}
export function exportCsv(s,papa,spreadsheetSafe=false) {
  if(!inspect(s).canExport)throw new Error('Resolve remaining issues and keep at least one active record before exporting.');
  const matrix=[s.schema.fields.map(f=>f.name),...s.rows.flatMap((_,r)=>s.excluded.has(r)?[]:[s.schema.fields.map((f,i)=>valueAt(s,r,i))])];
  return papa.unparse(matrix,{newline:'\r\n',quotes:false,escapeFormulae:spreadsheetSafe});
}
export function report(s) {
  const result=inspect(s);
  return {version:1,target:s.schema,sourceHeaders:s.headers,counts:{source:result.total,export:result.canExport?result.active:0,active:result.active,excluded:result.excluded,ready:result.ready,review:result.review},mapping:s.schema.fields.map((f,i)=>({target:f.name,source:s.headers[s.mapping[i]]??null})),issues:result.issues.map(i=>({...i,row:i.row+1})),mappingIssues:result.mappingIssues,excluded:[...s.excluded].map(([r,reason])=>({row:r+1,reason,original:[...s.original[r]],current:[...s.rows[r]]})),changes:s.events.map(e=>({...e,changes:e.changes.map(c=>({...c,row:c.row+1,...(c.kind==='cell'?{source:s.headers[c.source]}:{})}))})),limits:LIMITS,note:'Rows are numbered from 1, excluding the header. Passing configured rules does not guarantee acceptance by your destination.'};
}
