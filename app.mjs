import {DEMO_SCHEMA,DEMO_CSV,LIMITS,validateSchema,parseCsv,createSession,inspect,editRow,trimPreview,applyTrim,excludeRow,restoreRow,undo,exportCsv,report} from './core.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quoted=v=>esc(JSON.stringify(v));
let schema=validateSchema(DEMO_SCHEMA),session=null,selected=0,page=0,queuePage=0,preview=null,filename='pasted.csv',omitAck=false;
const drafts=new Map();
let downloadUrl=null;
const types={text:'文本',email:'邮箱',date:'日期',enum:'枚举'};
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function guarded(fn){return async event=>{try{await fn(event);}catch(error){notify(error.message,true);}};}
function download(name,text,type){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([text],{type}));const link=$('download-link');link.href=downloadUrl;link.download=name;link.textContent=`保存 ${name}`;$('download-content').value=text;$('download-fallback').hidden=false;link.click();}
function invalidatePreview(){preview=null;$('trim-preview').hidden=true;}
function load(text,name){const parsed=parseCsv(text,window.Papa);session=createSession(parsed,schema);drafts.clear();filename=name;selected=inspect(session).issues[0]?.row??0;page=Math.floor(selected/100);queuePage=0;omitAck=false;invalidatePreview();$('source-text').value=text;$('file-name').textContent=`${name} · ${parsed.rows.length} 条记录 · ${parsed.headers.length} 列`;
  render();document.querySelector('.mapping').open=inspect(session).mappingIssues.length>0;notify(`已加载 ${parsed.rows.length} 条记录。原始值保留在工作副本中；修改前请核对规则。`);
}
async function readFile(file){if(!file)throw new Error('请选择文件。');if(file.size>LIMITS.bytes)throw new Error('原型支持最多 2 MB。');try{return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('文件不是有效 UTF-8，请从源系统导出 UTF-8 CSV 后再试。');}}
function setSchema(next){schema=validateSchema(next);if(session){session.schema=schema;session.mapping=schema.fields.map(f=>session.headers.indexOf(f.name));omitAck=false;}invalidatePreview();render();notify('目标规则已应用。请确认字段映射，尚未改动任何源数据。');}
function renderMapping(){
  $('template-name').textContent=schema.name;$('schema-text').value=JSON.stringify(schema,null,2);
  $('mapping-body').innerHTML=schema.fields.map((f,i)=>`<tr><td>${esc(f.name)}</td><td><select data-map="${i}" aria-label="${esc(f.name)} 对应源列" ${!session?'disabled':''}><option value="-1">请选择源列</option>${(session?.headers||[]).map((h,c)=>`<option value="${c}" ${session.mapping[i]===c?'selected':''}>${esc(h)}</option>`).join('')}</select></td><td><select class="type" data-rule="type" data-field="${i}" aria-label="${esc(f.name)} 校验类型">${Object.entries(types).map(([t,label])=>`<option value="${t}" ${f.type===t?'selected':''}>${label}</option>`).join('')}</select></td><td><input type="checkbox" data-rule="required" data-field="${i}" aria-label="${esc(f.name)} 必填" ${f.required?'checked':''}></td><td><input type="checkbox" data-rule="unique" data-field="${i}" aria-label="${esc(f.name)} 唯一" ${f.unique?'checked':''}></td><td><input type="text" data-rule="values" data-field="${i}" aria-label="${esc(f.name)} 枚举选项" value="${esc((f.values||[]).join(','))}" ${f.type!=='enum'?'disabled':''}></td></tr>`).join('');
  $('mapping-body').querySelectorAll('[data-map]').forEach(el=>el.addEventListener('change',()=>{session.mapping[Number(el.dataset.map)]=Number(el.value);omitAck=false;invalidatePreview();render();notify('映射已更新，所有记录已重新校验。');}));
  $('mapping-body').querySelectorAll('[data-rule]').forEach(el=>el.addEventListener('change',guarded(()=>{
    const next=structuredClone(schema),f=next.fields[Number(el.dataset.field)],key=el.dataset.rule;
    if(key==='values')f.values=el.value.split(',').map(v=>v.trim());else if(key==='type'){f.type=el.value;if(f.type==='enum'&&!f.values)f.values=['active','paused'];}else f[key]=el.checked;
    schema=validateSchema(next);if(session)session.schema=schema;invalidatePreview();render();notify('规则已更新，所有记录已重新校验。');
  })));
}
function renderTable(result){
  $('data-empty').hidden=!!session;
  if(!session){$('data-table').innerHTML='';$('table-count').textContent='';$('data-pager').innerHTML='';return;}
  const start=page*100,end=Math.min(start+100,session.rows.length),badRows=new Set(result.issues.map(i=>i.row));
  $('table-count').textContent=`显示数据行 ${start+1}–${end}`;
  const badCells=new Set(result.issues.filter(i=>i.field>=0).map(i=>`${i.row}:${session.mapping[i.field]}`));
  $('data-table').innerHTML=`<table aria-label="CSV 工作副本"><thead><tr><th>数据行</th><th>状态</th>${session.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${session.rows.slice(start,end).map((row,n)=>{const r=start+n,excluded=session.excluded.has(r),bad=badRows.has(r);return `<tr class="${selected===r?'selected':''} ${excluded?'excluded':''}"><td><button class="row-button" data-row="${r}" aria-label="审核数据行 ${r+1}">${r+1}</button></td><td><span class="status ${excluded?'off':bad?'bad':''}">${excluded?'已排除':bad?'需处理':result.mappingIssues.length?'待映射':'通过'}</span></td>${row.map((v,c)=>`<td class="cell-value ${badCells.has(`${r}:${c}`)?'cell-error':''}" title="${esc(v)}">${esc(v)||'—'}</td>`).join('')}</tr>`;}).join('')}</tbody></table>`;
  $('data-table').querySelectorAll('[data-row]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.row))));
  pager('data-pager',page,Math.ceil(session.rows.length/100),p=>{page=p;renderTable(inspect(session));});
}
function pager(id,current,total,onChange){$(id).innerHTML=total>1?`<button class="secondary prev" ${current===0?'disabled':''}>上一页</button><span>${current+1} / ${total}</span><button class="secondary next" ${current>=total-1?'disabled':''}>下一页</button>`:'';$(id).querySelector('.prev')?.addEventListener('click',()=>onChange(current-1));$(id).querySelector('.next')?.addEventListener('click',()=>onChange(current+1));}
function selectRow(row){selected=row;page=Math.floor(row/100);render();$('repair').scrollIntoView({block:'nearest'});}
function renderRepair(result){
  if(!session){$('repair').innerHTML='<p class="empty-small">选中一行后，可对照原值修改。</p>';$('queue-list').innerHTML='';$('queue-count').textContent='';return;}
  const rowIssues=result.issues.filter(i=>i.row===selected),excluded=session.excluded.has(selected),row=session.rows[selected];
  $('repair').innerHTML=`<div class="repair-heading"><h3>数据行 ${selected+1} <span class="status ${excluded?'off':rowIssues.length?'bad':''}">${excluded?'已排除':rowIssues.length?'需处理':result.mappingIssues.length?'待映射':'通过'}</span></h3><p>行号按 CSV 数据记录计数，不含表头；引号内换行仍属于同一条记录。</p></div>${rowIssues.filter(i=>i.field<0).map(i=>`<p class="error-text">${esc(i.message)}</p>`).join('')}${schema.fields.map((f,i)=>{const c=session.mapping[i];if(c<0)return `<p class="error-text">${esc(f.name)} 尚未映射。</p>`;const original=session.original[selected][c]??'',current=row[c]??'';return `<div class="editor-field"><label for="edit-${i}">${esc(f.name)}</label><p class="original">原值 <code>${quoted(original)}</code></p><textarea id="edit-${i}" rows="${current.includes('\n')?3:1}" ${excluded?'disabled':''} aria-describedby="problems-${i}">${esc(current)}</textarea><div id="problems-${i}">${rowIssues.filter(x=>x.field===i).map(x=>`<p class="issue-text">${esc(x.message)}</p>`).join('')}</div><button class="save-cell secondary" data-save="${i}" ${excluded?'disabled':''}>保存此值</button></div>`;}).join('')}<div class="exclude-box">${excluded?`<p class="file-meta">排除原因：${esc(session.excluded.get(selected))}</p><button id="restore-row" class="secondary">恢复此行并重新校验</button>`:`<label for="exclude-reason">无法修复时，明确排除此行</label><input id="exclude-reason" type="text" placeholder="填写排除原因，如等待客户补充邮箱"><button id="exclude-row" class="danger">确认排除此行</button>`}</div>`;
  $('repair').querySelectorAll('[data-save]').forEach(el=>el.remove());
  schema.fields.forEach((f,i)=>{const input=$(`edit-${i}`),source=session.mapping[i];if(!input)return;const key=`${selected}:${source}`;if(drafts.has(key))input.value=drafts.get(key);
    input.addEventListener('input',()=>{const value=input.value;if(value===(session.rows[selected][source]??''))drafts.delete(key);else drafts.set(key,value);
      $('export-csv').disabled=true;$('undo').disabled=drafts.size>0||!session.history.length;$('preview-trim').disabled=drafts.size>0;
      notify(drafts.size?`${drafts.size} 个单元格尚未保存。切换行会保留草稿；保存后才会重新校验与导出。`:'草稿已恢复为当前工作值。');
    });
  });
  if(!excluded){const save=document.createElement('button');save.id='save-row';save.textContent='保存此行修改';$('repair').insertBefore(save,$('repair').querySelector('.exclude-box'));save.addEventListener('click',guarded(()=>{
    const edits=[...drafts].flatMap(([key,value])=>{const [row,source]=key.split(':').map(Number);return row===selected&&session.mapping.includes(source)?[{source,value}]:[];});
    editRow(session,selected,edits);edits.forEach(e=>drafts.delete(`${selected}:${e.source}`));invalidatePreview();render();notify(`数据行 ${selected+1} 已保存并重新校验，可撤销整行修改。${drafts.size?'其他行仍有未保存草稿。':''}`);
  }));}
  if(drafts.size){const discard=document.createElement('button');discard.className='quiet';discard.textContent=`放弃全部 ${drafts.size} 处未保存编辑`;discard.addEventListener('click',()=>{drafts.clear();render();notify('已放弃未保存编辑，工作副本保持原来的值。');});$('repair').append(discard);}
  $('exclude-row')?.addEventListener('click',guarded(()=>{excludeRow(session,selected,$('exclude-reason').value);invalidatePreview();render();notify(`数据行 ${selected+1} 已排除。原值与原因保留在审核记录中。`);}));
  $('restore-row')?.addEventListener('click',()=>{restoreRow(session,selected);invalidatePreview();render();notify('此行已恢复，重新参与校验。');});
  const grouped=new Map();result.issues.forEach(i=>{const list=grouped.get(i.row)||[];list.push(i);grouped.set(i.row,list);});
  const rows=[...grouped];queuePage=Math.min(queuePage,Math.max(0,Math.ceil(rows.length/10)-1));
  $('queue-count').textContent=`${rows.length} 行`;
  $('queue-list').innerHTML=rows.slice(queuePage*10,queuePage*10+10).map(([r,issues])=>`<button class="queue-button ${selected===r?'active':''}" data-review="${r}"><span>数据行 ${r+1}</span><span>${issues.length} 个问题</span></button>`).join('')||`<p class="${result.mappingIssues.length?'empty-small':'success-text'}">${result.mappingIssues.length?'先完成字段映射，才能确认全部记录。':'没有待处理记录。'}</p>`;
  $('queue-list').querySelectorAll('[data-review]').forEach(el=>el.addEventListener('click',()=>selectRow(Number(el.dataset.review))));
  pager('queue-pager',queuePage,Math.ceil(rows.length/10),p=>{queuePage=p;renderRepair(inspect(session));});
}
function renderChanges(){
  $('change-count').textContent=`${session?.events.length||0} 项操作`;
  $('change-list').innerHTML=session?.events.length?session.events.slice().reverse().map(e=>`<div class="change-item"><strong>${esc(e.action)}</strong>${e.changes.map(c=>`<div>数据行 ${c.row+1}${c.kind==='cell'?` / ${esc(session.headers[c.source])}`:''}：<code>${quoted(c.before)} → ${quoted(c.after)}</code></div>`).join('')}</div>`).join(''):'尚未修改。';
}
function omittedSources(){return session?session.headers.filter((_,i)=>!session.mapping.includes(i)):[];}
function updateExport(result){
  const omitted=omittedSources();
  $('omitted').innerHTML=omitted.length?`<div class="omission">目标模板不包含这些源列：${omitted.map(esc).join('、')}。<label class="check-row"><input id="omit-ack" type="checkbox" ${omitAck?'checked':''}>我确认导出不包含这些列</label></div>`:'';
  $('omit-ack')?.addEventListener('change',e=>{omitAck=e.target.checked;$('export-csv').disabled=!result.canExport||!omitAck||drafts.size>0;});
  $('export-csv').disabled=!result.canExport||omitted.length>0&&!omitAck||drafts.size>0;
  $('export-report').disabled=!session;
  $('export-status').textContent=!session?'等待校验':drafts.size?'请先保存或放弃草稿':result.canExport?`${result.active} 行通过配置规则`:result.mappingIssues.length?'请完成映射':result.active===0?'所有记录已排除，无可导出记录':`${result.review} 行仍需处理`;
}
function render(){
  renderMapping();const result=session?inspect(session):{issues:[],mappingIssues:[],canExport:false};
  $('accounting').innerHTML=[['源记录',session?result.total:'—'],['通过规则',session?result.ready:'—'],['需处理',session?result.review:'—'],['明确排除',session?result.excluded:'—']].map(([name,count])=>`<p>${name}<strong>${count}</strong></p>`).join('');
  $('mapping-status').textContent=!session?'等待源文件':result.mappingIssues.length?`${result.mappingIssues.length} 项需确认`:'全部字段已映射';
  $('mapping-errors').innerHTML=result.mappingIssues.map(i=>`<p class="error-text">${esc(i)}</p>`).join('');
  $('undo').disabled=!session?.history.length||drafts.size>0;$('preview-trim').disabled=!session||drafts.size>0;
  renderTable(result);renderRepair(result);renderChanges();updateExport(result);
}
$('demo').addEventListener('click',()=>{schema=validateSchema(DEMO_SCHEMA);load(DEMO_CSV,'客户名单-问题样本.csv');});
$('load').addEventListener('click',guarded(()=>load($('source-text').value,'pasted.csv')));
$('source-file').addEventListener('change',guarded(async e=>{const f=e.target.files[0];if(f)load(await readFile(f),f.name);e.target.value='';}));
$('target-file').addEventListener('change',guarded(async e=>{
  const f=e.target.files[0];if(!f)return;const text=await readFile(f),parsed=window.Papa.parse(text,{dynamicTyping:false,skipEmptyLines:false,preview:1,delimitersToGuess:[',',';','\t']});
  if(parsed.errors.some(x=>x.code!=='UndetectableDelimiter'))throw new Error('目标 CSV 无法解析，请检查引号。');
  setSchema({version:1,name:f.name+' 表头规则',fields:(parsed.data[0]||[]).map(name=>({name,type:'text',required:false,unique:false}))});e.target.value='';
}));
$('apply-schema').addEventListener('click',guarded(()=>setSchema(JSON.parse($('schema-text').value))));
$('save-schema').addEventListener('click',()=>download('目标规则.json',JSON.stringify(schema,null,2),'application/json;charset=utf-8'));
$('undo').addEventListener('click',()=>{if(undo(session)){invalidatePreview();render();notify('已撤销上一项修改，校验结果已更新。');}});
$('preview-trim').addEventListener('click',()=>{
  preview=trimPreview(session);$('trim-preview').hidden=false;
  $('trim-preview').innerHTML=`<h3>将修改 ${preview.length} 个单元格</h3><p>引号内显示完整值，包含原来的空白。</p><div class="table-scroll"><table><thead><tr><th>数据行 / 源列</th><th>修改前</th><th>修改后</th></tr></thead><tbody>${preview.slice(0,100).map(c=>`<tr><td>${c.row+1} / ${esc(session.headers[c.source])}</td><td><code>${quoted(c.before)}</code></td><td><code>${quoted(c.after)}</code></td></tr>`).join('')}</tbody></table></div>${preview.length>100?'<p class="error-text">超过 100 处。此原型要求分批手动处理，不提供未完整展示的批量确认。</p>':''}<div class="actions"><button id="apply-trim" ${!preview.length||preview.length>100?'disabled':''}>确认这 ${preview.length} 处修改</button><button id="cancel-trim" class="quiet">关闭预览</button></div>`;
  $('apply-trim').addEventListener('click',guarded(()=>{applyTrim(session,preview);invalidatePreview();render();notify('空白处理已应用并重新校验，可撤销整批操作。');}));$('cancel-trim').addEventListener('click',invalidatePreview);
});
$('export-csv').addEventListener('click',guarded(()=>{
  if(drafts.size)throw new Error('请先保存或放弃未保存的编辑。');
  if(omittedSources().length&&!omitAck)throw new Error('请确认不导出的源列。');
  const safe=$('safe-export').checked,text=exportCsv(session,window.Papa,safe),base=filename.replace(/\.[^.]+$/,'');download(`${base}-${safe?'表格查看':'规则通过'}.csv`,text,'text/csv;charset=utf-8');notify(`已生成新 CSV：${inspect(session).active} 条记录。${safe?'已添加表格保护前缀，请勿直接用于目标系统导入。':'原文本保留；请在目标平台核对实际导入结果。'}`);
}));
$('export-report').addEventListener('click',()=>{download('CSV-审核记录.json',JSON.stringify({...report(session),unsavedDrafts:[...drafts].map(([key,value])=>({cell:key,value})),omittedSourceColumns:omittedSources(),omissionsAcknowledged:omitAck,spreadsheetProtectionSelected:$('safe-export').checked},null,2),'application/json;charset=utf-8');notify('审核记录已生成，包含排除记录、规则及修改前后值。');});
render();
