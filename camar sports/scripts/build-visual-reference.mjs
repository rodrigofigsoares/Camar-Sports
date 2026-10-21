import { readFileSync, writeFileSync } from 'node:fs';
const root = 'reference-v2.1/';
const ui = readFileSync(root + 'src/components/ui/index.tsx', 'utf8');
let source = `import React, { useEffect, useRef, useState } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport '@fontsource/space-grotesk/latin-700.css';\nimport '@fontsource/space-mono/latin-700.css';\ntype MatchData = any;\nconst useMatchStore = (selector:any) => selector({updateMatchState:()=>{}});\n`;
source += ui.slice(ui.indexOf('export const OverlayMainBar')) + '\n';
source += readFileSync(root + 'src/lib/useClock.ts', 'utf8').replace(/import[^\n]+\n/, '') + '\n';
for (const sport of ['Basketball', 'Futsal', 'Handball', 'Volleyball']) {
  const text = readFileSync(root + `src/pages/sports/${sport}.tsx`, 'utf8');
  source += text.slice(text.indexOf(`export const ${sport}Overlay`)) + '\n';
}
source += `
function Reference(){
 const [match,setMatch]=useState<any>(null);
 useEffect(()=>{fetch('/api/matches/'+new URLSearchParams(location.search).get('match')).then(r=>r.json()).then(m=>{
 const elapsed=m.clock.direction==='up'?m.clock.value:m.clock.limit-m.clock.value;
 const convert=(side:string)=>({...m[side],name:m[side].team.shortName,color:m[side].team.color,textColor:m[side].team.textColor,penalties:m[side].penalties.map((p:any)=>({...p,playerNum:p.player,addedAtElapsed:(elapsed-(m.playElapsed-(p.expiresAtPlay-120)))*1000}))});
 setMatch({id:m.id,sport:m.sport,is_active:m.visible,state:{teamA:convert('a'),teamB:convert('b'),period:m.period,clockSeconds:m.clock.limit,clockRunning:m.clock.startedAt!==null,startedAt:m.clock.startedAt,elapsedBeforeStart:elapsed*1000,shotClockSeconds:m.shotClock.value,shotClockRunning:false,shotClockElapsedBefore:0,possession:m.possession==='a'?'teamA':m.possession==='b'?'teamB':null,activeTimeout:m.activeTimeout?(m.activeTimeout.side==='a'?'teamA':'teamB')+'-'+m[m.activeTimeout.side].timeouts.filter(Boolean).length:null,serve:m.serve==='a'?'teamA':'teamB',bestOf:m.bestOf,pointsPerSet:m.pointsPerSet,pointsTiebreak:m.pointsTiebreak,autoSetPoint:m.autoSetPoint}});
 })},[]);
 if(!match)return null; const Component:any=({basketball:BasketballOverlay,futsal:FutsalOverlay,handball:HandballOverlay,volleyball:VolleyballOverlay} as any)[match.sport];return <Component match={match}/>;
}
createRoot(document.getElementById('root')!).render(<Reference/>);
`;
writeFileSync(root + 'visual.tsx', source);
writeFileSync(root + 'visual.html', '<!doctype html><html><head><meta charset="UTF-8"><title>Referência original v2.1</title><link rel="stylesheet" href="./compiled-reference.css"></head><body style="margin:0;background:transparent"><div id="root"></div><script type="module" src="./visual.tsx"></script></body></html>');
console.log('Referência isolada criada, sem módulos de acesso a Supabase.');
