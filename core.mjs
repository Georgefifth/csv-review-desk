export const LIMITS = {bytes: 2 * 1024 * 1024, rows: 5000, columns: 50};
export const DEMO_SCHEMA = {version: 1, name: '客户名单演示规则', fields: [
  {name:'customer_id', type:'text', required:true, unique:true},
  {name:'name', type:'text', required:true},
  {name:'email', type:'email', required:true, unique:true},
  {name:'start_date', type:'date', required:true},
  {name:'status', type:'enum', required:true, values:['active','paused']},
  {name:'phone', type:'text'}
]};
export const DEMO_CSV = 'customer_id,name,email,start_date,status,phone\r\n001,"林, An",an@example.com,2026-10-12,active,+60123456789\r\n002,  Maya  ,maya.example.com,03/04/2026,Active,0123456789\r\n002,Noah,noah@example.com,2026-02-30,paused,00112233\r\n004,Iris,iris@example.com,2026-10-14,active,00998877\r\n';
export function validateSchema(raw) {
  if (!raw || raw.version !== 1 || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > LIMITS.columns) throw new Error('规则需要 version: 1、名称和 1–50 个字段。');
  const names = new Set();
  const fields = raw.fields.map(f => {
    if (!f || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 100 || names.has(f.name)) throw new Error('目标字段不能为空、重复或超过 100 字符。');
    names.add(f.name);
    if (!['text','email','date','enum'].includes(f.type)) throw new Error('字段类型仅支持 text、email、date、enum。');
    if (f.required !== undefined && typeof f.required !== 'boolean' || f.unique !== undefined && typeof f.unique !== 'boolean') throw new Error('required 和 unique 必须为布尔值。');
    if (f.type === 'enum' && (!Array.isArray(f.values) || !f.values.length || f.values.some(v => typeof v !== 'string' || !v.length) || new Set(f.values).size !== f.values.length)) throw new Error('枚举需要至少一个非空且不重复的文本选项。');
    return {name:f.name, type:f.type, required:!!f.required, unique:!!f.unique, ...(f.type==='enum'?{values:[...f.values]}:{})};
  });
  return {version:1, name:raw.name.slice(0,100), fields};
}
export function parseCsv(text, papa) {
  if (new TextEncoder().encode(text).length > LIMITS.bytes) throw new Error('原型支持最多 2 MB，请分批处理。');
  if (!text.trim()) throw new Error('文件为空，请加载含表头和数据行的 CSV。');
  const parsed = papa.parse(text.replace(/^\uFEFF/,''), {header:false, dynamicTyping:false, skipEmptyLines:false, delimitersToGuess:[',',';','\t']});
  const serious = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (serious.length) throw new Error(`CSV 结构无法可靠解析：${serious[0].message}。请检查引号后重新加载。`);
  const matrix = parsed.data;
  if (/[\r\n]$/.test(text) && matrix.at(-1)?.length === 1 && matrix.at(-1)[0] === '') matrix.pop();
  const headers = matrix.shift();
  if (!headers?.length || headers.length > LIMITS.columns) throw new Error('原型支持 1–50 列。');
  if (headers.some(h=>!h.trim()) || new Set(headers.map(h=>h.trim())).size !== headers.length) throw new Error('表头为空或重复，无法唯一映射。请修改表头后重新加载。');
  if (!matrix.length) throw new Error('只有表头，没有数据行。');
  if (matrix.length > LIMITS.rows) throw new Error('原型支持最多 5,000 行，请分批处理。');
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
    if (!Number.isInteger(source) || source<0 || source>=s.headers.length) mappingIssues.push(`${s.schema.fields[i].name}：请选择源列。`);
    else if (s.mapping.filter(x=>x===source).length>1) mappingIssues.push(`${s.headers[source]} 被映射到多个目标字段，请确认并改成一对一映射。`);
  });
  s.rows.forEach((row,r)=>{
    if (s.excluded.has(r)) return;
    if (row.length !== s.headers.length) issues.push({row:r,field:-1,code:'structure',message:`此记录有 ${row.length} 列，表头有 ${s.headers.length} 列。请明确排除，或在源文件中修复后重新加载。`});
    s.schema.fields.forEach((field,f)=>{
      if (s.mapping[f]<0) return;
      const value=valueAt(s,r,f);
      const add=(code,message)=>issues.push({row:r,field:f,code,message});
      if (field.required && !value.trim()) {add('required','必填值为空，需要补充原始信息或明确排除此行。');return;}
      if (!value.length) return;
      if (value !== value.trim()) add('space','首尾存在空白。请查看前后对比，再决定是否去除。');
      if (field.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) add('email','邮箱格式不符合此规则。不会猜测正确地址，也不验证邮箱是否存在。');
      if (field.type==='date' && !isIsoDate(value)) add('date','需要真实的 YYYY-MM-DD 日期。03/04 等歧义日期必须由你确认。');
      if (field.type==='enum' && !field.values.includes(value)) add('enum',`仅接受：${field.values.join('、')}。大小写必须一致。`);
    });
  });
  s.schema.fields.forEach((field,f)=>{
    if (!field.unique || s.mapping[f]<0) return;
    const groups=new Map();
    s.rows.forEach((_,r)=>{if(s.excluded.has(r)) return; const v=valueAt(s,r,f); if(v.length) {const ids=groups.get(v)||[];ids.push(r);groups.set(v,ids);}});
    groups.forEach(ids=>{if(ids.length>1){const list=ids.slice(0,10).map(x=>x+1).join('、'),message=`值重复，涉及数据行 ${list}${ids.length>10?` 等 ${ids.length} 行`:''}。不会替你合并或删除。`;ids.forEach(r=>issues.push({row:r,field:f,code:'unique',message}));}});
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
  if (typeof value!=='string' || source<0 || source>=s.headers.length || row<0 || row>=s.rows.length) throw new Error('无效的单元格编辑。');
  const before=s.rows[row][source]??'';
  if(before===value)return;
  s.rows[row][source]=value;
  commit(s,[{kind:'cell',row,source,before,after:value}],'编辑单元格');
}
export function editRow(s,row,edits) {
  if(!Number.isInteger(row)||row<0||row>=s.rows.length||s.excluded.has(row))throw new Error('此行无法编辑。');
  const seen=new Set(),changes=edits.flatMap(({source,value})=>{
    if(!Number.isInteger(source)||source<0||source>=s.headers.length||typeof value!=='string'||seen.has(source))throw new Error('无效或重复的单元格编辑。');
    seen.add(source);const before=s.rows[row][source]??'';
    return before===value?[]:[{kind:'cell',row,source,before,after:value}];
  });
  changes.forEach(c=>s.rows[c.row][c.source]=c.after);commit(s,changes,'保存整行修改');
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
  if(JSON.stringify(fresh)!==JSON.stringify(preview)) throw new Error('预览已过期，请重新预览。');
  fresh.forEach(c=>s.rows[c.row][c.source]=c.after);
  commit(s,fresh,'确认批量去除首尾空白');
}
export function excludeRow(s,row,reason) {
  if(!Number.isInteger(row)||row<0||row>=s.rows.length||typeof reason!=='string'||!reason.trim()) throw new Error('排除行需要有效行号和原因。');
  const before=s.excluded.get(row)??null,after=reason.trim();
  s.excluded.set(row,after);commit(s,[{kind:'exclude',row,before,after}],'排除行');
}
export function restoreRow(s,row) {
  if(!s.excluded.has(row))return;
  const before=s.excluded.get(row);s.excluded.delete(row);commit(s,[{kind:'exclude',row,before,after:null}],'恢复行');
}
export function undo(s) {
  const last=s.history.pop();if(!last)return false;
  [...last.changes].reverse().forEach(c=>{
    if(c.kind==='cell')s.rows[c.row][c.source]=c.before;
    else if(c.before===null)s.excluded.delete(c.row);else s.excluded.set(c.row,c.before);
  });
  s.events.push({action:`撤销：${last.label}`,changes:last.changes.map(c=>({...c,before:c.after,after:c.before}))});return true;
}
export function exportCsv(s,papa,spreadsheetSafe=false) {
  if(!inspect(s).canExport)throw new Error('还有未解决的问题，或没有可导出记录。');
  const matrix=[s.schema.fields.map(f=>f.name),...s.rows.flatMap((_,r)=>s.excluded.has(r)?[]:[s.schema.fields.map((f,i)=>valueAt(s,r,i))])];
  return papa.unparse(matrix,{newline:'\r\n',quotes:false,escapeFormulae:spreadsheetSafe});
}
export function report(s) {
  const result=inspect(s);
  return {version:1,target:s.schema,sourceHeaders:s.headers,counts:{source:result.total,export:result.canExport?result.active:0,active:result.active,excluded:result.excluded,ready:result.ready,review:result.review},mapping:s.schema.fields.map((f,i)=>({target:f.name,source:s.headers[s.mapping[i]]??null})),issues:result.issues.map(i=>({...i,row:i.row+1})),mappingIssues:result.mappingIssues,excluded:[...s.excluded].map(([r,reason])=>({row:r+1,reason,original:[...s.original[r]],current:[...s.rows[r]]})),changes:s.events.map(e=>({...e,changes:e.changes.map(c=>({...c,row:c.row+1,...(c.kind==='cell'?{source:s.headers[c.source]}:{})}))})),limits:LIMITS,note:'数据行从 1 开始计数，不含表头。仅通过本地配置规则，不保证目标平台接受；未验证真实采用或付费。'};
}
