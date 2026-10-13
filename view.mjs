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
