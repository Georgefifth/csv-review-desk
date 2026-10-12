import {DEMO_SCHEMA,DEMO_CSV,LIMITS,validateSchema,parseCsv,createSession,inspect,editRow,trimPreview,applyTrim,excludeRow,restoreRow,undo,exportCsv,report} from './core.mjs';
import {saveProject,restoreProject,reuseMapping,PROJECT_LIMIT} from './project.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quoted=v=>esc(JSON.stringify(v));
let schema=validateSchema(DEMO_SCHEMA),session=null,selected=0,page=0,queuePage=0,preview=null,filename='pasted.csv',omitAck=false;
const drafts=new Map();
let downloadUrl=null,showAllFields=false,mappingSignature='';
const selectedDelimiter=()=>$('source-delimiter').value==='tab'?'\t':$('source-delimiter').value;
const types={text:'Text',email:'Email',date:'Date',enum:'Enum'};
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function guarded(fn){return async event=>{try{await fn(event);}catch(error){notify(error.message,true);}};}
function download(name,text,type){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([text],{type}));const link=$('download-link');link.href=downloadUrl;link.download=name;link.textContent=`Save ${name}`;$('download-content').value=text;$('download-fallback').hidden=false;link.click();}
function invalidatePreview(){preview=null;$('trim-preview').hidden=true;invalidateDownload();}
function invalidateDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;$('download-fallback').hidden=true;$('download-link').removeAttribute('href');$('download-content').value='';}
function load(text,name){const parsed=parseCsv(text,window.Papa,selectedDelimiter()),mapping=reuseMapping(parsed.headers,schema,session);session=createSession(parsed,schema);session.mapping=mapping;drafts.clear();showAllFields=false;filename=name;selected=inspect(session).issues[0]?.row??0;page=Math.floor(selected/100);queuePage=0;omitAck=false;invalidatePreview();$('source-text').value=text;$('file-name').textContent=`${name} · ${parsed.rows.length} records · ${parsed.headers.length} columns`;
  render();$('setup-panel').open=false;document.querySelector('.mapping').open=inspect(session).mappingIssues.length>0;notify(`Loaded ${parsed.rows.length} records. Delimiter: ${parsed.delimiter==='\t'?'tab':parsed.delimiter===';'?'semicolon':'comma'}. Original values are preserved. Review the rules before editing.`);
}
async function readFile(file,limit=LIMITS.bytes){if(!file)throw new Error('Choose a file.');if(file.size>limit)throw new Error(`Maximum file size is ${limit/1024/1024} MB.`);try{return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('The file is not valid UTF-8. Export a UTF-8 CSV from the source system and retry.');}}
function setSchema(next){schema=validateSchema(next);if(session){session.schema=schema;session.mapping=schema.fields.map(f=>session.headers.indexOf(f.name));omitAck=false;}invalidatePreview();render();notify('Target rules applied. Review mappings; source values are unchanged.');}
function renderMapping(){
  const signature=JSON.stringify([schema,session?.headers,session?.mapping]);if(signature===mappingSignature)return;mappingSignature=signature;
  $('template-name').textContent=schema.name;$('schema-text').value=JSON.stringify(schema,null,2);
  $('mapping-body').innerHTML=schema.fields.map((f,i)=>`<tr><td>${esc(f.name)}</td><td><select data-map="${i}" aria-label="${esc(f.name)} Source column" ${!session?'disabled':''}><option value="-1">Choose source</option>${(session?.headers||[]).map((h,c)=>`<option value="${c}" ${session.mapping[i]===c?'selected':''}>${esc(h)}</option>`).join('')}</select></td><td><select class="type" data-rule="type" data-field="${i}" aria-label="${esc(f.name)} Check type">${Object.entries(types).map(([t,label])=>`<option value="${t}" ${f.type===t?'selected':''}>${label}</option>`).join('')}</select></td><td><input type="checkbox" data-rule="required" data-field="${i}" aria-label="${esc(f.name)} Required" ${f.required?'checked':''}></td><td><input type="checkbox" data-rule="unique" data-field="${i}" aria-label="${esc(f.name)} Unique" ${f.unique?'checked':''}></td><td><input type="text" data-rule="values" data-field="${i}" aria-label="${esc(f.name)} Enum options" value="${esc((f.values||[]).join(','))}" ${f.type!=='enum'?'disabled':''}></td></tr>`).join('');
  $('mapping-body').querySelectorAll('[data-map]').forEach(el=>el.addEventListener('change',()=>{session.mapping[Number(el.dataset.map)]=Number(el.value);omitAck=false;invalidatePreview();render();notify('Mapping updated. All records rechecked.');}));
  $('mapping-body').querySelectorAll('[data-rule]').forEach(el=>el.addEventListener('change',guarded(()=>{
    const next=structuredClone(schema),f=next.fields[Number(el.dataset.field)],key=el.dataset.rule;
    if(key==='values')f.values=el.value.split(',').map(v=>v.trim());else if(key==='type'){f.type=el.value;if(f.type==='enum'&&!f.values)f.values=['active','paused'];}else f[key]=el.checked;
    schema=validateSchema(next);if(session)session.schema=schema;invalidatePreview();render();notify('Rules updated. All records rechecked.');
  })));
}
function renderTable(result){
  $('data-empty').hidden=!!session;
  if(!session){$('data-table').innerHTML='';$('table-count').textContent='';$('data-pager').innerHTML='';return;}
  const start=page*100,end=Math.min(start+100,session.rows.length),badRows=new Set(result.issues.map(i=>i.row));
  $('table-count').textContent=`Rows ${start+1}–${end}`;
  const badCells=new Set(result.issues.filter(i=>i.field>=0).map(i=>`${i.row}:${session.mapping[i.field]}`));
  $('data-table').innerHTML=`<table aria-label="CSV Working copy"><thead><tr><th>Row</th><th>Status</th>${session.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${session.rows.slice(start,end).map((row,n)=>{const r=start+n,excluded=session.excluded.has(r),bad=badRows.has(r);return `<tr class="${selected===r?'selected':''} ${excluded?'excluded':''}"><td><button class="row-button" data-row="${r}" aria-label="Review row ${r+1}">${r+1}</button></td><td><span class="status ${excluded?'off':bad?'bad':''}">${excluded?'Excluded':bad?'Needs review':result.mappingIssues.length?'Unmapped':'Pass'}</span></td>${row.map((v,c)=>`<td class="cell-value ${badCells.has(`${r}:${c}`)?'cell-error':''}" title="${esc(v)}">${esc(v)||'—'}</td>`).join('')}</tr>`;}).join('')}</tbody></table>`;
  $('data-table').querySelectorAll('[data-row]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.row))));
  pager('data-pager',page,Math.ceil(session.rows.length/100),p=>{page=p;renderTable(inspect(session));});
}
function pager(id,current,total,onChange){$(id).innerHTML=total>1?`<button class="secondary prev" ${current===0?'disabled':''}>Previous</button><span>${current+1} / ${total}</span><button class="secondary next" ${current>=total-1?'disabled':''}>Next</button>`:'';$(id).querySelector('.prev')?.addEventListener('click',()=>onChange(current-1));$(id).querySelector('.next')?.addEventListener('click',()=>onChange(current+1));}
function selectRow(row){showAllFields=false;selected=row;page=Math.floor(row/100);render();$('repair').scrollIntoView({block:'nearest'});}
function renderRepair(result){
  if(!session){$('repair').innerHTML='<p class="empty-small">Select a row to review and edit its original values.</p>';$('queue-list').innerHTML='';$('queue-count').textContent='';return;}
  const rowIssues=result.issues.filter(i=>i.row===selected),excluded=session.excluded.has(selected),row=session.rows[selected],problemFields=new Set(rowIssues.map(i=>i.field)),filterFields=!showAllFields&&problemFields.size>0&&!problemFields.has(-1);
  $('repair').innerHTML=`<div class="repair-heading"><h3>Row ${selected+1} <span class="status ${excluded?'off':rowIssues.length?'bad':''}">${excluded?'Excluded':rowIssues.length?'Needs review':result.mappingIssues.length?'Unmapped':'Pass'}</span></h3><p>Row numbers count records, not physical lines. A quoted line break stays in one record.</p></div>${rowIssues.filter(i=>i.field<0).map(i=>`<p class="error-text">${esc(i.message)}</p>`).join('')}${schema.fields.map((f,i)=>{const c=session.mapping[i];if(c<0)return `<p class="error-text">${esc(f.name)} is unmapped.</p>`;const original=session.original[selected][c]??'',current=row[c]??'';return `<div class="editor-field" ${filterFields&&!problemFields.has(i)&&!drafts.has(`${selected}:${c}`)?'hidden':''}><label for="edit-${i}">${esc(f.name)}</label><p class="original">Original <code>${quoted(original)}</code></p>${c>=row.length&&!excluded?`<p class="file-meta">This cell is missing from the source record.</p><button class="secondary" data-empty-source="${c}">Confirm empty ${esc(f.name)} cell</button>`:''}<textarea id="edit-${i}" rows="${current.includes('\n')?3:1}" ${excluded?'disabled':''} aria-describedby="problems-${i}">${esc(current)}</textarea><div id="problems-${i}">${rowIssues.filter(x=>x.field===i).map(x=>`<p class="issue-text">${esc(x.message)}</p>`).join('')}</div><button class="save-cell secondary" data-save="${i}" ${excluded?'disabled':''}>Save value</button></div>`;}).join('')}<div class="exclude-box">${excluded?`<p class="file-meta">Exclusion reason: ${esc(session.excluded.get(selected))}</p><button id="restore-row" class="secondary">Restore and recheck row</button>`:`<label for="exclude-reason">Cannot resolve this row? Exclude it with a reason.</label><input id="exclude-reason" type="text" placeholder="Reason, e.g. waiting for a confirmed email"><button id="exclude-row" class="danger">Confirm exclusion</button>`}</div>`;
  $('repair').querySelectorAll('[data-save]').forEach(el=>el.remove());
  if(rowIssues.length&&!excluded){const toggle=document.createElement('button');toggle.className='quiet field-toggle';toggle.textContent=showAllFields?'Show problem fields only':`Show all ${schema.fields.length} fields`;toggle.addEventListener('click',()=>{showAllFields=!showAllFields;renderRepair(result);});$('repair').insertBefore(toggle,$('repair').querySelector('.editor-field'));}
  schema.fields.forEach((f,i)=>{const input=$(`edit-${i}`),source=session.mapping[i];if(!input)return;const key=`${selected}:${source}`;if(drafts.has(key))input.value=drafts.get(key);
    input.addEventListener('input',()=>{const value=input.value;if(source<session.rows[selected].length&&value===session.rows[selected][source])drafts.delete(key);else drafts.set(key,value);
      invalidatePreview();updateExport(result);$('undo').disabled=drafts.size>0||!session.history.length;$('preview-trim').disabled=drafts.size>0;
      notify(drafts.size?`${drafts.size} unsaved cell edits. Drafts survive row navigation; save before rechecking and exporting.`:'Drafts now match the saved working values.');
    });
  });
  $('repair').querySelectorAll('[data-empty-source]').forEach(el=>el.addEventListener('click',()=>{drafts.set(`${selected}:${el.dataset.emptySource}`,'');invalidatePreview();render();notify('Empty cell explicitly confirmed. Save the row to apply it.');}));
  if(!excluded){const actions=document.createElement('div');actions.className='actions repair-actions';actions.innerHTML='<button id="save-next">Save and next issue</button><button id="save-row" class="secondary">Save row</button>';$('repair').insertBefore(actions,$('repair').querySelector('.exclude-box'));$('save-row').addEventListener('click',guarded(()=>saveSelected(false)));$('save-next').addEventListener('click',guarded(()=>saveSelected(true)));}
  if(drafts.size){const discard=document.createElement('button');discard.className='quiet';discard.textContent=`Discard all ${drafts.size} unsaved edits`;discard.addEventListener('click',()=>{drafts.clear();render();notify('Unsaved edits discarded. Working values are unchanged.');});$('repair').append(discard);}
  $('exclude-row')?.addEventListener('click',guarded(()=>{excludeRow(session,selected,$('exclude-reason').value);invalidatePreview();render();notify(`Row ${selected+1} excluded. Original values and the reason are retained in the audit.`);}));
  $('restore-row')?.addEventListener('click',()=>{restoreRow(session,selected);invalidatePreview();render();notify('Row restored and rechecked.');});
  const grouped=new Map();result.issues.forEach(i=>{const list=grouped.get(i.row)||[];list.push(i);grouped.set(i.row,list);});
  const rows=[...grouped];queuePage=Math.min(queuePage,Math.max(0,Math.ceil(rows.length/10)-1));
  $('queue-count').textContent=`${rows.length} rows`;
  $('queue-list').innerHTML=rows.slice(queuePage*10,queuePage*10+10).map(([r,issues])=>`<button class="queue-button ${selected===r?'active':''}" data-review="${r}"><span>Row ${r+1}</span><span>${issues.length} issues</span></button>`).join('')||`<p class="${result.mappingIssues.length?'empty-small':'success-text'}">${result.mappingIssues.length?'Complete the mappings to check all records.':'No records need review.'}</p>`;
  $('queue-list').querySelectorAll('[data-review]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.review))));
  pager('queue-pager',queuePage,Math.ceil(rows.length/10),p=>{queuePage=p;renderRepair(inspect(session));});
}
function saveSelected(advance){
  const savedRow=selected,edits=[...drafts].flatMap(([key,value])=>{const [row,source]=key.split(':').map(Number);return row===selected&&session.mapping.includes(source)?[{source,value}]:[];});
  editRow(session,selected,edits);edits.forEach(e=>drafts.delete(`${selected}:${e.source}`));invalidatePreview();const result=inspect(session);
  const remaining=result.issues.some(i=>i.row===savedRow);
  if(advance&&!remaining){selected=result.issues.find(i=>i.row>savedRow)?.row??result.issues[0]?.row??savedRow;showAllFields=false;page=Math.floor(selected/100);}
  render();notify(remaining?`Row ${savedRow+1} saved; unresolved issues remain.`:`Row ${savedRow+1} saved and rechecked.${drafts.size?' Other rows still have drafts.':''}`);
  if(advance)$('repair').querySelector('.editor-field:not([hidden]) textarea')?.focus({preventScroll:true});
}
function renderChanges(){
  $('change-count').textContent=`${session?.events.length||0} operations`;
  $('change-list').innerHTML=session?.events.length?session.events.slice().reverse().map(e=>`<div class="change-item"><strong>${esc(e.action)}</strong>${e.changes.map(c=>`<div>Row ${c.row+1}${c.kind==='cell'?` / ${esc(session.headers[c.source])}`:''}:<code>${quoted(c.before)} → ${quoted(c.after)}</code></div>`).join('')}</div>`).join(''):'No changes yet.';
}
function omittedSources(){return session?session.headers.filter((_,i)=>!session.mapping.includes(i)):[];}
function updateExport(result){
  document.body.classList.toggle('ready-for-export',!!session&&!!result.canExport&&!drafts.size);
  const omitted=omittedSources();
  $('omitted').innerHTML=omitted.length?`<div class="omission">These source columns are not in the target: ${omitted.map(esc).join(', ')}.<label class="check-row"><input id="omit-ack" type="checkbox" ${omitAck?'checked':''}>I confirm these columns can be omitted</label></div>`:'';
  $('omit-ack')?.addEventListener('change',e=>{omitAck=e.target.checked;invalidateDownload();$('export-csv').disabled=!result.canExport||!omitAck||drafts.size>0;});
  $('export-csv').disabled=!result.canExport||omitted.length>0&&!omitAck||drafts.size>0;
  $('export-report').disabled=!session;$('save-project').disabled=!session;
  $('export-status').textContent=!session?'Waiting for checks':drafts.size?'Save or discard drafts first':result.canExport?`${result.active} rows pass configured rules`:result.mappingIssues.length?'Complete mappings first':result.active===0?'All records are excluded; nothing to export':`${result.review} rows need review`;
}
function render(){
  document.body.classList.toggle('has-session',!!session);
  $('setup-hint').textContent=session?filename:'Open a CSV or resume saved work';
  renderMapping();const result=session?inspect(session):{issues:[],mappingIssues:[],canExport:false};
  $('accounting').innerHTML=[['Source records',session?result.total:'—'],['Pass rules',session?result.ready:'—'],['Needs review',session?result.review:'—'],['Excluded',session?result.excluded:'—']].map(([name,count])=>`<p>${name}<strong>${count}</strong></p>`).join('');
  $('mapping-status').textContent=!session?'Waiting for a source file':result.mappingIssues.length?`${result.mappingIssues.length} mapping issues`:'All fields mapped';
  $('rule-strength').textContent=schema.fields.every(f=>f.type==='text'&&!f.required&&!f.unique)?'Only text/whitespace checks are enabled. Configure required, unique or type checks for stronger validation.':'';
  $('mapping-errors').innerHTML=result.mappingIssues.map(i=>`<p class="error-text">${esc(i)}</p>`).join('');
  $('undo').disabled=!session?.history.length||drafts.size>0;$('preview-trim').disabled=!session||drafts.size>0;
  renderTable(result);renderRepair(result);renderChanges();updateExport(result);
}
$('demo').addEventListener('click',guarded(async()=>{if(!await confirmReplacement())return;$('source-delimiter').value='';schema=validateSchema(DEMO_SCHEMA);load(DEMO_CSV,'contacts-demo.csv');}));
$('load').addEventListener('click',guarded(async()=>{const text=$('source-text').value;parseCsv(text,window.Papa,selectedDelimiter());if(await confirmReplacement())load(text,'pasted.csv');}));
$('source-file').addEventListener('change',guarded(async e=>{const f=e.target.files[0];try{if(f){const text=await readFile(f);parseCsv(text,window.Papa,selectedDelimiter());if(await confirmReplacement())load(text,f.name);}}finally{e.target.value='';}}));
$('target-file').addEventListener('change',guarded(async e=>{
  const f=e.target.files[0];if(!f)return;const text=await readFile(f),parsed=window.Papa.parse(text,{dynamicTyping:false,skipEmptyLines:false,preview:1,delimiter:selectedDelimiter(),delimitersToGuess:[',',';','\t']});
  if(parsed.errors.some(x=>x.code!=='UndetectableDelimiter'))throw new Error('Cannot parse the target CSV. Check its quotes.');
  setSchema({version:1,name:f.name+' header rules',fields:(parsed.data[0]||[]).map(name=>({name,type:'text',required:false,unique:false}))});e.target.value='';
}));
$('apply-schema').addEventListener('click',guarded(()=>setSchema(JSON.parse($('schema-text').value))));
$('save-schema').addEventListener('click',()=>download('target-rules.json',JSON.stringify(schema,null,2),'application/json;charset=utf-8'));
$('undo').addEventListener('click',()=>{if(undo(session)){invalidatePreview();render();notify('Last operation undone. Checks updated.');}});
$('preview-trim').addEventListener('click',()=>{
  const pending=trimPreview(session);preview=pending.slice(0,100);$('trim-preview').hidden=false;
  $('trim-preview').innerHTML=`<h3>${preview.length} cells will change</h3><p>Quoted values show the original whitespace.</p><div class="table-scroll"><table><thead><tr><th>Row / Source column</th><th>Before</th><th>After</th></tr></thead><tbody>${preview.slice(0,100).map(c=>`<tr><td>${c.row+1} / ${esc(session.headers[c.source])}</td><td><code>${quoted(c.before)}</code></td><td><code>${quoted(c.after)}</code></td></tr>`).join('')}</tbody></table></div>${pending.length>100?`<p>Showing the first 100 of ${pending.length} changes. Apply this batch, then preview the next batch.</p>`:''}<div class="actions"><button id="apply-trim" ${!preview.length?'disabled':''}>Apply these ${preview.length} changes</button><button id="cancel-trim" class="quiet">Close preview</button></div>`;
  $('apply-trim').addEventListener('click',guarded(()=>{applyTrim(session,preview);invalidatePreview();render();notify('Whitespace changes applied and rechecked. Undo restores the entire batch.');}));$('cancel-trim').addEventListener('click',()=>{preview=null;$('trim-preview').hidden=true;});
});
$('export-csv').addEventListener('click',guarded(()=>{
  if(drafts.size)throw new Error('Save or discard unsaved edits first.');
  if(omittedSources().length&&!omitAck)throw new Error('Confirm which source columns may be omitted.');
  const safe=$('safe-export').checked,text=exportCsv(session,window.Papa,safe),base=filename.replace(/\.[^.]+$/,'');download(`${base}-${safe?'spreadsheet-review':'rules-passed'}.csv`,text,'text/csv;charset=utf-8');notify(`CSV generated: ${inspect(session).active} records. ${safe?'Spreadsheet protection prefixes added. Use the unprotected version for destination imports.':'Original text retained. Check the actual import in your destination.'}`);
}));
$('export-report').addEventListener('click',()=>{download('csv-audit.json',JSON.stringify({...report(session),unsavedDrafts:[...drafts].map(([key,value])=>({cell:key,value})),omittedSourceColumns:omittedSources(),omissionsAcknowledged:omitAck,spreadsheetProtectionSelected:$('safe-export').checked},null,2),'application/json;charset=utf-8');notify('Audit generated with exclusions, rules, and before/after values.');});
async function confirmReplacement(){
  if(!session||!session.events.length&&!drafts.size)return true;
  const dialog=$('replace-dialog');dialog.showModal();
  return new Promise(resolve=>{const close=value=>{dialog.close();$('keep-work').onclick=null;$('replace-work').onclick=null;dialog.oncancel=null;resolve(value);};$('keep-work').onclick=()=>close(false);$('replace-work').onclick=()=>close(true);dialog.oncancel=e=>{e.preventDefault();close(false);};});
}
$('save-project').addEventListener('click',guarded(()=>{download('csv-review-project.csvreview',saveProject(session,drafts,filename),'application/json;charset=utf-8');notify('Project generated, including drafts and history. It contains your data; keep it secure.');}));
$('project-file').addEventListener('change',guarded(async e=>{const file=e.target.files[0];if(!file)return;const restored=restoreProject(await readFile(file,PROJECT_LIMIT));if(!await confirmReplacement()){e.target.value='';return;}session=restored.session;schema=session.schema;drafts.clear();restored.drafts.forEach((v,k)=>drafts.set(k,v));filename=restored.filename;selected=inspect(session).issues[0]?.row??0;page=Math.floor(selected/100);queuePage=0;showAllFields=false;omitAck=false;invalidatePreview();$('source-text').value=window.Papa.unparse([session.headers,...session.original]);$('file-name').textContent=`${filename} · ${session.rows.length} records · resumed`;render();$('setup-panel').open=false;document.querySelector('.mapping').open=inspect(session).mappingIssues.length>0;e.target.value='';notify('Project resumed. Original data, edits, rules, exclusions and drafts restored.');}));
$('safe-export').addEventListener('change',invalidateDownload);
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&session&&document.activeElement?.closest('#repair')){e.preventDefault();try{saveSelected(true);}catch(error){notify(error.message,true);}}});
window.addEventListener('beforeunload',e=>{if(session&&(session.events.length||drafts.size)){e.preventDefault();e.returnValue='';}});
render();
