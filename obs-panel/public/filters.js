export const sports={handball:'Handebol',football:'Futebol / Fut 7',futsal:'Futsal',basketball:'Basquetebol',basketball3x3:'Basquete 3×3',volleyball:'Voleibol',beachhandball:'Beach handball',tennis:'Tênis',beachtennis:'Beach tennis'};
export const statuses={scheduled:'Agendada',live:'Em andamento',done:'Encerrada'};
export const fields=[['origin','Origem'],['tournament','Campeonato'],['sport','Modalidade'],['team','Equipe'],['category','Categoria'],['phase','Rodada / fase'],['title','Partida / título'],['venue','Local'],['date','Data'],['time','Hora'],['status','Status'],['result','Resultado']];
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[×✕]/g,'x').replace(/\s+/g,' ').trim();
export function enrichMatches(matches,tournaments){
  const indexed=new Map(tournaments.map(t=>[t.id,t]));
  return matches.map(m=>{
    const t=indexed.get(m.tournamentId);
    const stage=t?.stages?.find(s=>s.id===m.stageId||s.matchIds?.includes(m.id));
    const group=t?.groups?.find(g=>g.id===stage?.groupId);
    const schedule=String(m.scheduledAt||'');
    const dateParts=/^(\d{4})-(\d{2})-(\d{2})/.exec(schedule);
    const date=dateParts?`${dateParts[3]}/${dateParts[2]}/${dateParts[1]}`:'Sem data';
    const time=/(?:T|\s)(\d{2}:\d{2})/.exec(schedule)?.[1]||(/^\d{2}:\d{2}$/.test(schedule)?schedule:'Sem horário');
    const a=m.a||{},b=m.b||{};
    // Scores start at zero in Camar. Live/done 0–0 is still a valid score.
    const hasScore=m.status==='live'||m.status==='done'||[a,b].some(s=>['score','sets','games','points'].some(k=>Number(s[k])>0))||!!m.setHistory?.length;
    const bySets=['volleyball','tennis','beachtennis','beachhandball'].includes(m.sport);
    const score=hasScore?`${bySets?(a.sets??0):(a.score??0)} × ${bySets?(b.sets??0):(b.score??0)}${bySets?' sets':''}`:'Sem placar';
    const values={
      origin:[m.tournamentId?'Partidas de campeonato':'Partidas avulsas'],
      tournament:[m.tournamentId?(t?.name||'Campeonato '+m.tournamentId):'Partidas avulsas'],
      sport:[sports[m.sport]||m.sport||'Não informada'],
      team:[a.team?.name||'A definir',b.team?.name||'A definir'],
      category:[m.category||'Sem categoria'],
      phase:[stage?.name||m.title||'Sem fase'],
      title:[m.title||'Sem título'],venue:[m.venue||'Sem local'],date:[date],time:[time],
      status:[statuses[m.status]||m.status||'Não informado'],result:[hasScore?'Com placar':'Sem placar'],
    };
    return {...m,values,score,searchText:[...Object.values(values).flat(),m.id,m.tournamentId,m.stageId,m.sport,m.status,schedule,t?.organizer,group?.name,a.team?.shortName,b.team?.shortName,score,hasScore?`${a.score??0} x ${b.score??0}`:'',hasScore?`${a.games??0} x ${b.games??0} games`:''].filter(Boolean).join(' ')};
  });
}
export function filterMatches(matches,{query='',field='',selected={}}={}){
  const terms=normalize(query).split(' ').filter(Boolean);
  return matches.filter(m=>Object.entries(selected).every(([key,value])=>!value||m.values[key]?.includes(value))&&terms.every(term=>normalize(field==='score'?m.score:field?(m.values[field]||[]).join(' '):m.searchText).includes(term)));
}
export function choices(matches,key){return [...new Set(matches.flatMap(m=>m.values[key]||[]))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));}
