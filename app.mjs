import {DEMO_SCHEMA,DEMO_CSV,LIMITS,validateSchema,parseCsv,parseCsvHeaders,createSession,inspect,editRow,trimPreview,applyTrim,excludeRow,restoreRow,undo,exportCsv,report} from './core.mjs';
import {saveProject,restoreProject,reuseMapping,PROJECT_LIMIT} from './project.mjs';
import {visibleRecordIds,draftRows} from './view.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quoted=v=>esc(JSON.stringify(v));
let schema=validateSchema(DEMO_SCHEMA),session=null,selected=0,page=0,queuePage=0,preview=null,filename='pasted.csv',omitAck=false;
const drafts=new Map();
let downloadUrl=null,showAllFields=false,mappingSignature='',tableFilter='all',activeCell=null;
const selectedDelimiter=()=>$('source-delimiter').value==='tab'?'\t':$('source-delimiter').value;
const types={text:'Text',email:'Email',date:'Date',enum:'Enum'};
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function guarded(fn){return async event=>{try{await fn(event);}catch(error){notify(error.message,true);}};}
function download(name,text,type){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([text],{type}));const link=$('download-link');link.href=downloadUrl;link.download=name;link.textContent=`Save ${name}`;$('download-content').value=text;$('download-fallback').hidden=false;link.click();}
function invalidatePreview(){preview=null;$('trim-preview').hidden=true;invalidateDownload();}
function invalidateDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;$('download-fallback').hidden=true;$('download-link').removeAttribute('href');$('download-content').value='';}
function load(text,name){const parsed=parseCsv(text,window.Papa,selectedDelimiter()),mapping=reuseMapping(parsed.headers,schema,session);session=createSession(parsed,schema);session.mapping=mapping;drafts.clear();showAllFields=false;tableFilter='all';activeCell=null;filename=name;selected=inspect(session).issues[0]?.row??0;page=Math.floor(selected/100);queuePage=0;omitAck=false;invalidatePreview();$('source-text').value=text;$('file-name').textContent=`${name} · ${parsed.rows.length} records · ${parsed.headers.length} columns`;
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
  $('data-empty').hidden=!!session;$('table-tools').hidden=!session;
  if(!session){$('data-table').innerHTML='';$('table-count').textContent='';$('data-pager').innerHTML='';return;}
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===tableFilter)));
  const ids=visibleRecordIds(session,result,tableFilter),pages=Math.max(1,Math.ceil(ids.length/100));page=Math.min(page,pages-1);
  if(activeCell&&(!ids.includes(activeCell.row)||session.excluded.has(activeCell.row)||!session.mapping.includes(activeCell.source)))activeCell=null;
  const start=page*100,end=Math.min(start+100,ids.length),badRows=new Set(result.issues.map(i=>i.row));
  $('table-count').textContent=ids.length?`${start+1}–${end} of ${ids.length} shown`:`0 of ${session.rows.length} shown`;
  const badCells=new Set(result.issues.filter(i=>i.field>=0).map(i=>`${i.row}:${session.mapping[i.field]}`));
  $('data-table').innerHTML=`<table aria-label="CSV Working copy"><thead><tr><th>Row</th><th>Status</th>${session.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${ids.slice(start,end).map(r=>{
    const row=session.rows[r],excluded=session.excluded.has(r),bad=badRows.has(r);
    return `<tr class="${selected===r?'selected':''} ${excluded?'excluded':''}"><td><button class="row-button" data-row="${r}" aria-label="Review row ${r+1}">${r+1}</button></td><td><span class="status ${excluded?'off':bad?'bad':''}">${excluded?'Excluded':bad?'Needs review':result.mappingIssues.length?'Unmapped':'Pass'}</span></td>${row.map((v,c)=>{
      const key=`${r}:${c}`,draft=drafts.has(key),value=draft?drafts.get(key):v,editable=!excluded&&session.mapping.includes(c),open=activeCell?.row===r&&activeCell.source===c;
      const content=open?`<div class="inline-edit"><label class="sr-only" for="inline-value">Edit ${esc(session.headers[c])} in row ${r+1}</label><textarea id="inline-value" class="inline-editor" rows="${value.includes('\n')?3:1}" data-row="${r}" data-source="${c}">${esc(value)}</textarea><div class="inline-actions"><button id="inline-save" aria-label="Save row ${r+1} from table">Save row</button><button id="inline-cancel" class="quiet">Cancel cell edit</button></div></div>`:editable?`<button class="cell-button" data-cell-row="${r}" data-cell-source="${c}" aria-label="Edit ${esc(session.headers[c])} in row ${r+1}${draft?', unsaved draft':''}">${esc(value)||'—'}${draft?'<span class="draft-indicator">Draft</span>':''}</button>`:esc(value)||'—';
      return `<td class="cell-value ${badCells.has(key)?'cell-error':''} ${draft?'cell-draft':''}" title="${esc(v)}">${content}</td>`;
    }).join('')}</tr>`;
  }).join('')||`<tr><td colspan="${session.headers.length+2}" class="empty-view">No records match this view. All ${session.rows.length} source records are still retained. <button id="show-all-records" class="quiet">Show all records</button></td></tr>`}</tbody></table>`;
  $('data-table').querySelectorAll('[data-row]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.row))));
  $('data-table').querySelectorAll('[data-cell-row]').forEach(el=>el.addEventListener('click',()=>openCell(Number(el.dataset.cellRow),Number(el.dataset.cellSource))));
  $('show-all-records')?.addEventListener('click',()=>setTableFilter('all'));
  const input=$('inline-value');
  if(input){input.addEventListener('input',()=>{updateDraft(selected,activeCell.source,input.value);const field=session.mapping.indexOf(activeCell.source);if($(`edit-${field}`))$(`edit-${field}`).value=input.value;});input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancelCell();}else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();try{saveSelected(false);}catch(error){notify(error.message,true);}}});$('inline-save').addEventListener('click',guarded(()=>saveSelected(false)));$('inline-cancel').addEventListener('click',cancelCell);}
  pager('data-pager',page,pages,p=>{page=p;activeCell=null;renderTable(inspect(session));});
}
function pageForRow(row){return Math.max(0,Math.floor(visibleRecordIds(session,inspect(session),tableFilter).indexOf(row)/100));}
function setTableFilter(filter){
  if(!session)return;tableFilter=filter;activeCell=null;const ids=visibleRecordIds(session,inspect(session),filter);if(ids.length&&!ids.includes(selected))selected=ids[0];page=Math.max(0,Math.floor(ids.indexOf(selected)/100));render();
}
function openCell(row,source){selected=row;activeCell={row,source};showAllFields=false;page=pageForRow(row);render();$('inline-value')?.focus();}
function cancelCell(){if(!activeCell)return;const {row,source}=activeCell;drafts.delete(`${row}:${source}`);activeCell=null;render();document.querySelector(`[data-cell-row="${row}"][data-cell-source="${source}"]`)?.focus({preventScroll:true});notify('Cell draft cancelled. Other drafts and saved values are unchanged.');}
function renderDrafts(){
  const tray=$('draft-tray'),rows=draftRows(drafts);tray.hidden=!rows.length;
  if(!rows.length){tray.innerHTML='';return;}
  const current=rows.find(item=>item.row===selected),blocked=current?.sources.some(source=>!session.mapping.includes(source));
  tray.innerHTML=`<div class="draft-summary"><strong>${drafts.size} unsaved ${drafts.size===1?'cell':'cells'} · ${rows.length} ${rows.length===1?'row':'rows'}</strong><span>Checks use saved values. Drafts stay until you save or discard them.</span></div><div class="draft-controls"><label for="draft-row">Find a draft</label><select id="draft-row"><option value="">Choose a row…</option>${rows.map(item=>`<option value="${item.row}" ${item.row===selected?'selected':''}>Row ${item.row+1} · ${item.sources.length} ${item.sources.length===1?'cell':'cells'}${session.excluded.has(item.row)?' · excluded':item.sources.some(source=>!session.mapping.includes(source))?' · unmapped':''}</option>`).join('')}</select><button id="draft-save" ${!current?'hidden':''} ${!current||blocked||session.excluded.has(selected)?'disabled':''}>Save row ${selected+1} drafts</button><button id="draft-discard" class="quiet" ${!current?'hidden':''} ${!current?'disabled':''}>Discard row ${selected+1} drafts</button></div>${blocked?'<p class="error-text">This row has drafts in unmapped columns. Restore those source mappings to save, or discard this row’s drafts.</p>':current&&session.excluded.has(selected)?'<p class="error-text">Restore this excluded row before saving its drafts, or discard this row’s drafts.</p>':''}`;
  $('draft-row').addEventListener('change',event=>{if(event.target.value==='')return;selectRow(Number(event.target.value));$('repair').querySelector('.editor-field:not([hidden]) textarea')?.focus({preventScroll:true});});
  $('draft-save').addEventListener('click',guarded(()=>saveSelected(false)));
  $('draft-discard').addEventListener('click',()=>{for(const source of current.sources)drafts.delete(`${selected}:${source}`);activeCell=null;invalidatePreview();render();$('repair').querySelector('.editor-field:not([hidden]) textarea')?.focus({preventScroll:true});notify(`Row ${selected+1} drafts discarded. Saved values and other rows are unchanged.`);});
}
function updateDraft(row,source,value){
  const key=`${row}:${source}`;if(source<session.rows[row].length&&value===session.rows[row][source])drafts.delete(key);else drafts.set(key,value);
  invalidatePreview();renderDrafts();updateExport(inspect(session));$('undo').disabled=drafts.size>0||!session.history.length;$('preview-trim').disabled=drafts.size>0;
  notify(drafts.size?`${drafts.size} unsaved cell edits. Save before rechecking and exporting.`:'Drafts now match the saved working values.');
}
function pager(id,current,total,onChange){$(id).innerHTML=total>1?`<button class="secondary prev" ${current===0?'disabled':''}>Previous</button><span>${current+1} / ${total}</span><button class="secondary next" ${current>=total-1?'disabled':''}>Next</button>`:'';$(id).querySelector('.prev')?.addEventListener('click',()=>onChange(current-1));$(id).querySelector('.next')?.addEventListener('click',()=>onChange(current+1));}
function selectRow(row){if(!visibleRecordIds(session,inspect(session),tableFilter).includes(row))tableFilter='all';activeCell=null;showAllFields=false;selected=row;page=pageForRow(row);render();$('repair').scrollIntoView({block:'nearest'});}
function renderRepair(result){
  if(!session){$('repair').innerHTML='<p class="empty-small">Select a row to review and edit its original values.</p>';$('queue-list').innerHTML='';$('queue-count').textContent='';return;}
  const rowIssues=result.issues.filter(i=>i.row===selected),excluded=session.excluded.has(selected),row=session.rows[selected],problemFields=new Set(rowIssues.map(i=>i.field)),filterFields=!showAllFields&&problemFields.size>0&&!problemFields.has(-1);
  $('repair').innerHTML=`<div class="repair-heading"><h3>Row ${selected+1} <span class="status ${excluded?'off':rowIssues.length?'bad':''}">${excluded?'Excluded':rowIssues.length?'Needs review':result.mappingIssues.length?'Unmapped':'Pass'}</span></h3><p>Row numbers count records, not physical lines. A quoted line break stays in one record.</p></div>${rowIssues.filter(i=>i.field<0).map(i=>`<p class="error-text">${esc(i.message)}</p>`).join('')}${schema.fields.map((f,i)=>{const c=session.mapping[i];if(c<0)return `<p class="error-text">${esc(f.name)} is unmapped.</p>`;const original=session.original[selected][c]??'',current=row[c]??'';return `<div class="editor-field" ${filterFields&&!problemFields.has(i)&&!drafts.has(`${selected}:${c}`)&&!(activeCell?.row===selected&&activeCell.source===c)?'hidden':''}><label for="edit-${i}">${esc(f.name)}</label><p class="original">Original <code>${quoted(original)}</code></p>${c>=row.length&&!excluded?`<p class="file-meta">This cell is missing from the source record.</p><button class="secondary" data-empty-source="${c}">Confirm empty ${esc(f.name)} cell</button>`:''}<textarea id="edit-${i}" rows="${current.includes('\n')?3:1}" ${excluded?'disabled':''} aria-describedby="problems-${i}">${esc(current)}</textarea><div id="problems-${i}">${rowIssues.filter(x=>x.field===i).map(x=>`<p class="issue-text">${esc(x.message)}</p>`).join('')}</div><button class="save-cell secondary" data-save="${i}" ${excluded?'disabled':''}>Save value</button></div>`;}).join('')}<div class="exclude-box">${excluded?`<p class="file-meta">Exclusion reason: ${esc(session.excluded.get(selected))}</p><button id="restore-row" class="secondary">Restore and recheck row</button>`:`<label for="exclude-reason">Cannot resolve this row? Exclude it with a reason.</label><input id="exclude-reason" type="text" placeholder="Reason, e.g. waiting for a confirmed email"><button id="exclude-row" class="danger">Confirm exclusion</button>`}</div>`;
  $('repair').querySelectorAll('[data-save]').forEach(el=>el.remove());
  if(rowIssues.length&&!excluded){const toggle=document.createElement('button');toggle.className='quiet field-toggle';toggle.textContent=showAllFields?'Show problem fields only':`Show all ${schema.fields.length} fields`;toggle.addEventListener('click',()=>{showAllFields=!showAllFields;renderRepair(result);});$('repair').insertBefore(toggle,$('repair').querySelector('.editor-field'));}
  schema.fields.forEach((f,i)=>{const input=$(`edit-${i}`),source=session.mapping[i];if(!input)return;const key=`${selected}:${source}`;if(drafts.has(key))input.value=drafts.get(key);
    input.addEventListener('input',()=>{updateDraft(selected,source,input.value);if(activeCell?.row===selected&&activeCell.source===source&&$('inline-value'))$('inline-value').value=input.value;});
  });
  $('repair').querySelectorAll('[data-empty-source]').forEach(el=>el.addEventListener('click',()=>{drafts.set(`${selected}:${el.dataset.emptySource}`,'');invalidatePreview();render();notify('Empty cell explicitly confirmed. Save the row to apply it.');}));
  if(!excluded){const actions=document.createElement('div');actions.className='actions repair-actions';actions.innerHTML='<button id="save-next">Save and next issue</button><button id="save-row" class="secondary">Save row</button>';$('repair').insertBefore(actions,$('repair').querySelector('.editor-field'));$('save-row').addEventListener('click',guarded(()=>saveSelected(false)));$('save-next').addEventListener('click',guarded(()=>saveSelected(true)));}
  $('exclude-row')?.addEventListener('click',guarded(()=>{if(draftRows(drafts).some(item=>item.row===selected))throw new Error(`Save or discard row ${selected+1} drafts before excluding it.`);excludeRow(session,selected,$('exclude-reason').value);invalidatePreview();render();notify(`Row ${selected+1} excluded. Original values and the reason are retained in the audit.`);}));
  $('restore-row')?.addEventListener('click',()=>{restoreRow(session,selected);invalidatePreview();render();notify('Row restored and rechecked.');});
  const grouped=new Map();result.issues.forEach(i=>{const list=grouped.get(i.row)||[];list.push(i);grouped.set(i.row,list);});
  const rows=[...grouped];queuePage=Math.min(queuePage,Math.max(0,Math.ceil(rows.length/10)-1));
  $('queue-count').textContent=`${rows.length} rows`;
  $('queue-list').innerHTML=rows.slice(queuePage*10,queuePage*10+10).map(([r,issues])=>`<button class="queue-button ${selected===r?'active':''}" data-review="${r}"><span>Row ${r+1}</span><span>${issues.length} issues</span></button>`).join('')||`<p class="${result.mappingIssues.length?'empty-small':'success-text'}">${result.mappingIssues.length?'Complete the mappings to check all records.':'No records need review.'}</p>`;
  $('queue-list').querySelectorAll('[data-review]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.review))));
  pager('queue-pager',queuePage,Math.ceil(rows.length/10),p=>{queuePage=p;renderRepair(inspect(session));});
}
function saveSelected(advance){
  const savedCell=activeCell?{...activeCell}:null,savedRow=selected;
  if(draftRows(drafts).find(item=>item.row===selected)?.sources.some(source=>!session.mapping.includes(source)))throw new Error('Restore the source mappings for this row’s drafts before saving, or discard its drafts.');
  const edits=[...drafts].flatMap(([key,value])=>{const [row,source]=key.split(':').map(Number);return row===selected&&session.mapping.includes(source)?[{source,value}]:[];});
  editRow(session,selected,edits);activeCell=null;edits.forEach(e=>drafts.delete(`${selected}:${e.source}`));invalidatePreview();const result=inspect(session);
  const remaining=result.issues.some(i=>i.row===savedRow);
  if(advance&&!remaining){selected=result.issues.find(i=>i.row>savedRow)?.row??result.issues[0]?.row??savedRow;showAllFields=false;if(!visibleRecordIds(session,result,tableFilter).includes(selected))tableFilter='all';page=pageForRow(selected);}
  render();notify(remaining?`Row ${savedRow+1} saved; unresolved issues remain.`:`Row ${savedRow+1} saved and rechecked.${drafts.size?' Other rows still have drafts.':''}`);
  if(advance)$('repair').querySelector('.editor-field:not([hidden]) textarea')?.focus({preventScroll:true});
  else if(savedCell){const cell=document.querySelector(`[data-cell-row="${savedCell.row}"][data-cell-source="${savedCell.source}"]`);(cell||$('repair').querySelector('.editor-field:not([hidden]) textarea')||document.querySelector('[data-filter="all"]')).focus({preventScroll:true});}
  else $('save-row')?.focus({preventScroll:true});
}
function renderChanges(){
  $('change-count').textContent=`${session?.events.length||0} operations`;
  $('change-list').innerHTML=session?.events.length?session.events.slice().reverse().map(e=>`<div class="change-item"><strong>${esc(e.action)}</strong>${e.changes.map(c=>`<div>Row ${c.row+1}${c.kind==='cell'?` / ${esc(session.headers[c.source])}`:''}:<code>${quoted(c.before)} → ${quoted(c.after)}</code></div>`).join('')}</div>`).join(''):'No changes yet.';
}
function omittedSources(){return session?session.headers.filter((_,i)=>!session.mapping.includes(i)):[];}
function updateExport(result){
  document.querySelectorAll('[data-stage]').forEach(button=>{button.disabled=button.dataset.stage!=='open'&&!session;button.setAttribute('aria-current',button.dataset.stage===(session?(result.canExport&&!drafts.size?'export':'review'):'open')?'step':'false');});
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
  $('accounting').innerHTML=[['Source records',session?result.total:'—'],['Pass rules',session?result.ready:'—'],['Needs review',session?result.review:'—'],['Excluded',session?result.excluded:'—']].map(([name,count],i)=>`<button class="account-filter" data-count-filter="${['all','passed','review','excluded'][i]}" ${!session?'disabled':''} aria-pressed="${tableFilter===['all','passed','review','excluded'][i]}">${name}<strong>${count}</strong></button>`).join('');
  $('accounting').querySelectorAll('[data-count-filter]').forEach(button=>button.addEventListener('click',()=>setTableFilter(button.dataset.countFilter)));
  $('mapping-status').textContent=!session?'Waiting for a source file':result.mappingIssues.length?`${result.mappingIssues.length} mapping issues`:'All fields mapped';
  $('rule-strength').textContent=schema.fields.every(f=>f.type==='text'&&!f.required&&!f.unique)?'Only text/whitespace checks are enabled. Configure required, unique or type checks for stronger validation.':'';
  $('mapping-errors').innerHTML=result.mappingIssues.map(i=>`<p class="error-text">${esc(i)}</p>`).join('');
  $('undo').disabled=!session?.history.length||drafts.size>0;$('preview-trim').disabled=!session||drafts.size>0;
  renderTable(result);renderRepair(result);renderDrafts();renderChanges();updateExport(result);
}
async function openDemo(row,source){if(!await confirmReplacement())return;$('source-delimiter').value='';schema=validateSchema(DEMO_SCHEMA);load(DEMO_CSV,'contacts-demo.csv');if(row!==undefined)openCell(row,source);}
$('demo').addEventListener('click',guarded(()=>openDemo()));
$('preview-demo').addEventListener('click',guarded(()=>openDemo()));
document.querySelectorAll('[data-preview-row]').forEach(button=>button.addEventListener('click',guarded(()=>openDemo(Number(button.dataset.previewRow),Number(button.dataset.previewSource)))));
$('load').addEventListener('click',guarded(async()=>{const text=$('source-text').value;parseCsv(text,window.Papa,selectedDelimiter());if(await confirmReplacement())load(text,'pasted.csv');}));
$('source-file').addEventListener('change',guarded(async e=>{const f=e.target.files[0];try{if(f){const text=await readFile(f);parseCsv(text,window.Papa,selectedDelimiter());if(await confirmReplacement())load(text,f.name);}}finally{e.target.value='';}}));
$('target-file').addEventListener('change',guarded(async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const headers=parseCsvHeaders(await readFile(f),window.Papa,selectedDelimiter());
    setSchema({version:1,name:f.name+' header rules',fields:headers.map(name=>({name,type:'text',required:false,unique:false}))});
  }finally{e.target.value='';}
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
$('project-file').addEventListener('change',guarded(async e=>{const file=e.target.files[0];if(!file)return;try{const restored=restoreProject(await readFile(file,PROJECT_LIMIT));if(!await confirmReplacement())return;session=restored.session;tableFilter='all';activeCell=null;schema=session.schema;drafts.clear();restored.drafts.forEach((v,k)=>drafts.set(k,v));filename=restored.filename;selected=inspect(session).issues[0]?.row??0;page=Math.floor(selected/100);queuePage=0;showAllFields=false;omitAck=false;invalidatePreview();$('source-text').value=window.Papa.unparse([session.headers,...session.original]);$('file-name').textContent=`${filename} · ${session.rows.length} records · resumed`;render();$('setup-panel').open=false;document.querySelector('.mapping').open=inspect(session).mappingIssues.length>0;notify('Project resumed. Original data, edits, rules, exclusions and drafts restored.');}finally{e.target.value='';}}));
$('safe-export').addEventListener('change',invalidateDownload);
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&session&&document.activeElement?.closest('#repair')){e.preventDefault();try{saveSelected(true);}catch(error){notify(error.message,true);}}});
window.addEventListener('beforeunload',e=>{if(session&&(session.events.length||drafts.size)){e.preventDefault();e.returnValue='';}});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>setTableFilter(button.dataset.filter)));
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{
  const stage=button.dataset.stage;
  if(stage==='open'){$('setup-panel').open=true;$('setup-panel').scrollIntoView({block:'start'});$('source-file').focus({preventScroll:true});}
  else if(stage==='review'&&session){document.querySelector('.data-panel').scrollIntoView({block:'start'});document.querySelector('[data-filter="review"]').focus({preventScroll:true});}
  else if(stage==='export'&&session){document.querySelector('.export').scrollIntoView({block:'start'});$('safe-export').focus({preventScroll:true});}
}));
render();
