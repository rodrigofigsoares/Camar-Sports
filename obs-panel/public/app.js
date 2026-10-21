import {OBS,switchMatch} from './obs-client.js';
import {fields,enrichMatches,filterMatches,choices} from './filters.js';
const connection=new OBS();
const $=id=>document.getElementById(id);
let matches=[], tournaments=[], obs=false, user=null, activeURL='', cloud='', busy=false, timer;
let checkedAt=0;
const api=async(path,body={})=>{
  if(path==='connect'){await connection.connect(body.port,body.password);return {ok:true};}
  if(path==='sources')return connection.call('GetInputList',{inputKind:'browser_source'});
  if(path==='source')return connection.call('GetInputSettings',{inputName:body.inputName});
  if(path==='switch'){
    if(!user||!matches.some(m=>m.id===body.matchId))throw new Error('Atualize a lista e selecione uma partida válida.');
    return switchMatch(connection,body.inputName,cloud+'/#/overlay/match/'+encodeURIComponent(body.matchId));
  }
  if(path==='status'&&Date.now()-checkedAt<60000)return {user,cloud,obs:connection.ready};
  const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  if(path==='login'||path==='logout'||r.status===401)checkedAt=0;
  if(r.status===401)user=null;
  if(!r.ok)throw new Error(data.error||'Falha na conexão com o Camar.');
  if(path==='status'){checkedAt=Date.now();data.obs=connection.ready;}
  return data;
};
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':'';$('notice').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('notice').hidden=true,10000);}
async function action(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;await status();render();}}
async function status(){try{const s=await api('status');obs=s.obs;user=s.user;cloud=s.cloud;$('cloud-state').textContent=user?'● Camar · '+user.name:'● Camar desconectado';$('cloud-state').className=user?'online':'';}catch{$('cloud-state').textContent='● Camar indisponível · lista anterior';$('cloud-state').className='';}obs=connection.ready;$('obs-state').textContent=obs?'● OBS conectado':'● OBS desconectado';$('obs-state').className=obs?'online':'';if(!obs)activeURL='';render();}
function options(id,items,label){const selected=$(id).value;$(id).replaceChildren(new Option(label,''),...items.map(([value,text])=>new Option(text,value)));if(items.some(([v])=>v===selected))$(id).value=selected;}
async function refresh(){const data=await api('matches');tournaments=data.tournaments;matches=enrichMatches(data.matches,tournaments);for(const [key]of fields)options(key,choices(matches,key).map(value=>[value,value]),'Todos');$('updated').textContent='Atualizada às '+new Date().toLocaleTimeString('pt-BR');render();}
async function current(){activeURL='';if($('source').value){const data=await api('source',{inputName:$('source').value});activeURL=data.inputSettings.url||'';}$('current').textContent=activeURL?'URL atual: '+activeURL:'Nenhuma fonte selecionada.';$('current').style.overflowWrap='anywhere';render();}
async function sources(){const data=await api('sources');options('source',data.inputs.map(i=>[i.inputName,i.inputName]),'Selecione uma fonte');const saved=localStorage.getItem('camar-obs-source');if(!$('source').value&&data.inputs.some(i=>i.inputName===saved))$('source').value=saved;await current();if(!data.inputs.length)notice('Crie uma fonte de navegador no OBS e atualize as fontes.');}
function node(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;}
function render(){
  const selected=Object.fromEntries(fields.map(([key])=>[key,$(key).value]));
  const list=filterMatches(matches,{query:$('search').value,field:$('search-field').value,selected});
  const avulsas=matches.filter(m=>!m.tournamentId).length;
  $('filter-summary').textContent=user?`Encontradas: ${list.length} de ${matches.length} partidas · ${avulsas} avulsas na lista completa.`:'Entre no Camar para carregar suas partidas.';
  $('clear-filters').disabled=!$('search').value&&!$('search-field').value&&!Object.values(selected).some(Boolean);
  $('count').textContent=list.length;$('matches').replaceChildren();
  if(!list.length)$('matches').append(node('div',user?'Nenhuma partida encontrada.':'Entre no Camar para carregar suas partidas.','empty'));
  for(const m of list){const active=obs&&activeURL===cloud+'/#/overlay/match/'+encodeURIComponent(m.id);const card=node('article','','match'+(active?' active':''));const top=node('div','','match-top');top.append(node('span',m.values.tournament[0]),node('span',m.values.status[0]));card.append(top,node('div',m.values.team.join(' × '),'teams'));
    const metadata=node('div','','match-meta');for(const key of ['sport','category','phase','venue','date','time'])metadata.append(node('span',m.values[key][0]));card.append(metadata);
    if(m.title&&m.title!==m.values.phase[0])card.append(node('p',m.title,'match-title'));
    const bottom=node('div','','match-bottom');bottom.append(node('strong',m.score,'score'));const button=node('button',active?'✓ Configurada na fonte':'Exibir no placar');button.disabled=busy||!obs||!user||!$('source').value||active;button.onclick=()=>action(async()=>{const result=await api('switch',{inputName:$('source').value,matchId:m.id});activeURL=result.url;$('current').textContent='URL atual: '+activeURL;notice('Link confirmado pelo OBS.');});bottom.append(button);card.append(bottom);$('matches').append(card);}
  $('refresh').disabled=busy||!user;$('sources').disabled=busy||!obs;$('source').disabled=busy||!obs;$('logout').disabled=busy||!user;
}
$('login').onsubmit=e=>{e.preventDefault();action(async()=>{try{await api('login',{username:$('username').value,password:$('password').value});}finally{$('password').value='';}await status();await refresh();notice('Partidas carregadas.');});};
$('connect').onsubmit=e=>{e.preventDefault();action(async()=>{try{await api('connect',{port:$('port').value,password:$('obs-password').value});}finally{$('obs-password').value='';}localStorage.setItem('camar-obs-port',$('port').value);await status();await sources();notice('OBS conectado. Selecione a fonte do placar.');});};
$('logout').onclick=()=>action(async()=>{await api('logout');matches=[];tournaments=[];});
$('refresh').onclick=()=>action(refresh);$('sources').onclick=()=>action(sources);$('source').onchange=()=>action(async()=>{localStorage.setItem('camar-obs-source',$('source').value);await current();});
for(const [key,label]of fields){const wrapper=node('label',label);const select=document.createElement('select');select.id=key;select.setAttribute('aria-label',label);select.append(new Option('Todos',''));select.addEventListener('input',render);wrapper.append(select);$('filter-fields').append(wrapper);$('search-field').append(new Option(label,key));}
$('search-field').append(new Option('Placar','score'));
for(const id of ['search','search-field'])$(id).addEventListener('input',render);
$('clear-filters').onclick=()=>{$('search').value='';$('search-field').value='';for(const [key]of fields)$(key).value='';render();};
$('port').value=localStorage.getItem('camar-obs-port')||'4455';
await status();if(user)await action(refresh);if(obs)await action(sources);
setInterval(async()=>{if(busy)return;await status();if(obs&&$('source').value)try{await current();}catch{activeURL='';$('current').textContent='Fonte indisponível. Atualize as fontes.';render();}},5000);
