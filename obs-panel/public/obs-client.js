const hash = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))));
export class OBS {
  constructor(Socket = WebSocket) { this.Socket = Socket; this.pending = new Map(); this.ready = false; }
  close() { this.ready = false; for(const p of this.pending.values())p.reject(new Error('Conexão com OBS encerrada.'));this.pending.clear();this.socket?.close(); }
  async connect(port, password) {
    port=Number(port);
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta inválida.');
    this.close();
    const socket = new this.Socket(`ws://127.0.0.1:${port}`);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('OBS não respondeu. Confira o WebSocket.')); }, 8000);
      const fail = () => {
        clearTimeout(timer);
        if (this.socket === socket) {
          this.ready = false;
          for (const p of this.pending.values()) p.reject(new Error('Conexão com OBS encerrada.'));
          this.pending.clear();
        }
        password='';
        reject(new Error('Não foi possível conectar ao OBS. Confira porta e senha e permita o acesso à rede local se o navegador solicitar.'));
      };
      socket.addEventListener('error', fail);
      socket.addEventListener('close', fail);
      socket.addEventListener('message', async event => {
        if (this.socket !== socket) return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const {op,d} = message;
        if (op === 0) {
          try {
            const authentication = d.authentication ? await hash(await hash(password + d.authentication.salt) + d.authentication.challenge) : undefined;
            password='';
            if(this.socket!==socket || socket.readyState>1)return;
            socket.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,authentication}}));
          } catch {fail();socket.close();}
        }
        if (op === 2) { clearTimeout(timer); this.ready = true; resolve(); }
        if (op === 7) {
          const p = this.pending.get(d.requestId);
          if (!p) return;
          this.pending.delete(d.requestId);
          d.requestStatus.result ? p.resolve(d.responseData ?? {}) : p.reject(new Error(d.requestStatus.comment || 'OBS recusou a operação.'));
        }
      });
    });
  }
  call(requestType, requestData = {}) {
    if (!this.ready) return Promise.reject(new Error('Conecte ao OBS primeiro.'));
    return new Promise((resolve,reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('OBS não confirmou a operação. Atualize as fontes antes de tentar novamente.')); },8000);
      this.pending.set(requestId,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
      try { this.socket.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}})); }
      catch (e) {clearTimeout(timer);this.pending.delete(requestId);reject(e);}
    });
  }
}
export async function switchMatch(obs, inputName, url) {
  const before = await obs.call('GetInputSettings',{inputName});
  if (before.inputKind !== 'browser_source') throw new Error('Selecione uma fonte de navegador.');
  if (before.inputSettings.is_local_file) throw new Error('A fonte usa arquivo local. Desative essa opção nas propriedades do OBS.');
  await obs.call('SetInputSettings',{inputName,inputSettings:{url},overlay:true});
  const after = await obs.call('GetInputSettings',{inputName});
  if (after.inputSettings.url !== url) throw new Error('A URL mudou durante a operação. Atualize as fontes e tente novamente.');
  return {url};
}
