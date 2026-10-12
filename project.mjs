import {LIMITS,validateSchema,createSession} from './core.mjs';
export const PROJECT_LIMIT=16*1024*1024;
export function reuseMapping(headers,schema,previous){
  return schema.fields.map(field=>{
    const old=previous?.schema.fields.findIndex(f=>f.name===field.name)??-1;
    const source=old>=0?previous.headers[previous.mapping[old]]:null;
    const found=typeof source==='string'?headers.indexOf(source):-1;
    return found>=0?found:headers.indexOf(field.name);
  });
}
export function saveProject(session,drafts,filename){
  const value={format:'csv-review-desk',version:1,filename,data:{headers:session.headers,original:session.original,rows:session.rows,delimiter:session.delimiter,schema:session.schema,mapping:session.mapping,excluded:[...session.excluded],history:session.history,events:session.events},drafts:[...drafts]};
  const text=JSON.stringify(value,null,2);
  if(new TextEncoder().encode(text).length>PROJECT_LIMIT)throw new Error('Project exceeds 16 MB. Export your CSV and audit instead.');
  restoreProject(text);
  return text;
}
export function restoreProject(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>PROJECT_LIMIT)throw new Error('Project must be a JSON file under 16 MB.');
  let raw;try{raw=JSON.parse(text);}catch{throw new Error('Invalid project JSON. Your current work is unchanged.');}
  const fail=()=>{throw new Error('Invalid or unsupported project. Your current work is unchanged.');};
  if(raw?.format!=='csv-review-desk'||raw.version!==1||typeof raw.filename!=='string'||raw.filename.length>300)fail();
  const d=raw.data;if(!d||!Array.isArray(d.headers)||!d.headers.length||d.headers.length>LIMITS.columns||d.headers.some(h=>typeof h!=='string'||!h.trim())||new Set(d.headers.map(h=>h.trim())).size!==d.headers.length)fail();
  const matrix=a=>Array.isArray(a)&&a.length>0&&a.length<=LIMITS.rows&&a.every(row=>Array.isArray(row)&&row.length<=LIMITS.columns&&row.every(v=>typeof v==='string'));
  if(!matrix(d.original)||!matrix(d.rows)||d.rows.length!==d.original.length||![',',';','\t'].includes(d.delimiter))fail();
  const schema=validateSchema(d.schema),rowOK=r=>Number.isInteger(r)&&r>=0&&r<d.rows.length,columnOK=c=>Number.isInteger(c)&&c>=0&&c<d.headers.length;
  if(!Array.isArray(d.mapping)||d.mapping.length!==schema.fields.length||d.mapping.some(c=>c!==-1&&!columnOK(c)))fail();
  if(!Array.isArray(d.excluded)||d.excluded.length>d.rows.length)fail();
  const excluded=new Map();for(const entry of d.excluded){if(!Array.isArray(entry)||entry.length!==2||!rowOK(entry[0])||typeof entry[1]!=='string'||!entry[1].trim()||excluded.has(entry[0]))fail();excluded.set(...entry);}
  function operations(list,isHistory){
    if(!Array.isArray(list)||list.length>10000)fail();
    return list.map(op=>{
      const label=op?.[isHistory?'label':'action'];if(typeof label!=='string'||label.length>200||!Array.isArray(op.changes)||op.changes.length>LIMITS.rows*LIMITS.columns)fail();
      const changes=op.changes.map(c=>{
        if(!c||!rowOK(c.row)||!['cell','exclude'].includes(c.kind))fail();
        if(c.kind==='cell'){if(!columnOK(c.source)||typeof c.before!=='string'||typeof c.after!=='string')fail();if(c.beforeLength!==undefined&&(!Number.isInteger(c.beforeLength)||c.beforeLength<0||c.beforeLength>c.source))fail();return {kind:'cell',row:c.row,source:c.source,before:c.before,after:c.after,...(c.beforeLength!==undefined?{beforeLength:c.beforeLength}:{})};}
        if(![c.before,c.after].every(v=>v===null||typeof v==='string'))fail();return {kind:'exclude',row:c.row,before:c.before,after:c.after};
      });return {[isHistory?'label':'action']:label,changes};
    });
  }
  const history=operations(d.history,true),events=operations(d.events,false),drafts=new Map();
  if(!Array.isArray(raw.drafts)||raw.drafts.length>LIMITS.rows*LIMITS.columns)fail();
  for(const entry of raw.drafts){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!/^\d+:\d+$/.test(entry[0])||typeof entry[1]!=='string'||drafts.has(entry[0]))fail();const [r,c]=entry[0].split(':').map(Number);if(!rowOK(r)||!columnOK(c)||entry[0]!==`${r}:${c}`)fail();drafts.set(...entry);}
  const session=createSession({headers:d.headers,rows:d.original,delimiter:d.delimiter},schema);
  Object.assign(session,{rows:d.rows.map(r=>[...r]),mapping:[...d.mapping],excluded,history,events});
  return {session,drafts,filename:raw.filename};
}
