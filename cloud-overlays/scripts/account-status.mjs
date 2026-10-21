import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const config=readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
const token=/oauth_token\s*=\s*"([^"]+)"/.exec(config)?.[1];
if(!token) throw new Error('Login necessário');
for(const resource of ['subscriptions','workers/scripts']) {
  const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/27a4919449d5bd8197efa3755eb0c707/${resource}`,{headers:{Authorization:`Bearer ${token}`}});
  const data=await res.json();
  console.log(JSON.stringify({resource,status:res.status,success:data.success,result:data.result?.map(x=>resource==='subscriptions'?{rate_plan:x.rate_plan,state:x.state}:{id:x.id}),errors:data.errors}));
}
