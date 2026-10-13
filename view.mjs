// Visible record IDs always refer to the original session, never filtered offsets.
export function visibleRecordIds(session,result,filter='all') {
  if(!['all','review','passed','excluded'].includes(filter))throw new Error('Unknown record view.');
  const problemRows=new Set(result.issues.map(issue=>issue.row));
  return session.rows.flatMap((_,row)=>{
    const excluded=session.excluded.has(row);
    const include=filter==='all'||filter==='excluded'&&excluded||filter==='review'&&!excluded&&problemRows.has(row)||filter==='passed'&&!excluded&&!problemRows.has(row)&&!result.mappingIssues.length;
    return include?[row]:[];
  });
}

// Keep original IDs and every source column, including drafts whose mapping changed.
export function draftRows(drafts){
  const rows=new Map();
  for(const key of drafts.keys()){const [row,source]=key.split(':').map(Number);if(!rows.has(row))rows.set(row,[]);rows.get(row).push(source);}
  return [...rows].sort(([a],[b])=>a-b).map(([row,sources])=>({row,sources:sources.sort((a,b)=>a-b)}));
}
