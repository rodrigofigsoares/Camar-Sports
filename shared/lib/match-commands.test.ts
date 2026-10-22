import { expect,it,vi } from 'vitest';
import { MatchCommands } from './match-commands';
import { createMatch,type Match } from '../domain/model';
import { applyCommand,clockValue,type Command } from '../domain/scoring';

function setup() {
  let visible=applyCommand(createMatch('handball'),{type:'clock',action:'start'},1000);
  visible.clock.value=100;
  const confirmed=structuredClone(visible);
  const requests:{revision:number;command:Command|undefined;resolve:(m:Match)=>void;reject:(e:Error)=>void}[]=[];
  const render=vi.fn((m:Match)=>{visible=m;});
  const pending=vi.fn(),notice=vi.fn();
  const recover=vi.fn(async()=>confirmed);
  const queue=new MatchCommands({current:()=>visible,send:(revision,command)=>new Promise((resolve,reject)=>requests.push({revision,command,resolve,reject})),recover,render,pending,notice,now:()=>2000});
  return {queue,requests,render,pending,notice,recover,confirmed,visible:()=>visible};
}
it('previews +1 immediately and preserves rapid clicks while requests are pending',async()=>{
  const h=setup();
  const first=h.queue.command({type:'clock',action:'adjust',seconds:1});
  expect(clockValue(h.visible().clock,2000)).toBe(102);
  expect(h.visible().clock.startedAt).not.toBeNull();
  const second=h.queue.command({type:'clock',action:'adjust',seconds:1});
  expect(clockValue(h.visible().clock,2000)).toBe(103);
  expect(h.requests).toHaveLength(1);
  const saved={...applyCommand(h.confirmed,h.requests[0].command!,2000),revision:1};
  h.requests[0].resolve(saved);await first;
  expect(h.requests).toHaveLength(2);expect(h.requests[1].revision).toBe(1);
  expect(clockValue(h.visible().clock,2000)).toBe(103);
  h.requests[1].resolve({...applyCommand(saved,h.requests[1].command!,2000),revision:2});await second;
  expect(h.visible().revision).toBe(2);expect(clockValue(h.visible().clock,3000)).toBe(104);
  expect(h.pending).toHaveBeenLastCalledWith(false);
});
it('discards unsaved previews and queued corrections after conflict',async()=>{
  const h=setup();
  const a=h.queue.command({type:'clock',action:'adjust',seconds:1});
  const b=h.queue.command({type:'clock',action:'adjust',seconds:1});
  h.requests[0].reject(new Error('Conflito de revisão'));
  await Promise.all([a,b]);
  expect(h.requests).toHaveLength(1);expect(h.recover).toHaveBeenCalledOnce();
  expect(h.visible()).toEqual(h.confirmed);expect(h.notice).toHaveBeenLastCalledWith('Conflito de revisão');
  expect(h.pending).toHaveBeenLastCalledWith(false);
});
it('does not update another screen if unmounted during a request',async()=>{
  const h=setup();const pending=h.queue.command({type:'clock',action:'adjust',seconds:1});
  h.queue.dispose();await pending;
  const renders=h.render.mock.calls.length;
  h.requests[0].resolve({...h.confirmed,revision:1});await Promise.resolve();
  expect(h.render).toHaveBeenCalledTimes(renders);
});

it('accepts rapid alternating points and corrections without rolling the preview back', async () => {
  const h=setup();
  const actions:Command[]=[{type:'score',side:'a',amount:1},{type:'score',side:'b',amount:2},{type:'score',side:'a',amount:3},{type:'score',side:'a',amount:-1}];
  const tasks=actions.map(c=>h.queue.command(c));
  expect([h.visible().a.score,h.visible().b.score]).toEqual([3,2]);
  expect(h.requests).toHaveLength(1);
  let saved=h.confirmed;
  for(let i=0;i<actions.length;i++) {
    expect(h.requests[i].revision).toBe(saved.revision);
    saved={...applyCommand(saved,actions[i],2000),revision:saved.revision+1};
    h.requests[i].resolve(saved);await tasks[i];
    expect([h.visible().a.score,h.visible().b.score]).toEqual([3,2]);
  }
  expect(h.pending).toHaveBeenLastCalledWith(false);
});
it('sets the current score in one write, then preserves a queued point', async () => {
  const h=setup();
  const a=h.queue.command({type:'setScore',a:32,b:29});
  const b=h.queue.command({type:'score',side:'b',amount:1});
  expect([h.visible().a.score,h.visible().b.score]).toEqual([32,30]);
  const saved={...applyCommand(h.confirmed,h.requests[0].command!,2000),revision:1};
  h.requests[0].resolve(saved);await a;
  expect(h.visible().b.score).toBe(30);
  h.requests[1].resolve({...applyCommand(saved,h.requests[1].command!,2000),revision:2});await b;
  expect(h.visible().b.score).toBe(30);
});
it('restores authoritative points and reports failure instead of keeping unsaved points', async () => {
  const h=setup();
  const tasks=[h.queue.command({type:'score',side:'a',amount:1}),h.queue.command({type:'score',side:'a',amount:1})];
  expect(h.visible().a.score).toBe(2);
  h.requests[0].reject(new Error('Falha ao salvar'));
  await Promise.all(tasks);
  expect(h.visible().a.score).toBe(0);
  expect(h.requests).toHaveLength(1);
  expect(h.notice).toHaveBeenLastCalledWith('Falha ao salvar');
});
it('does not throw in the UI when an optimistic point violates the domain rules', async () => {
  const h=setup(); h.visible().sport='volleyball';h.visible().status='done';
  let pending:Promise<void>;
  expect(()=>{pending=h.queue.command({type:'score',side:'a',amount:1});}).not.toThrow();
  h.requests[0].reject(new Error('Partida encerrada'));
  await pending!;
  expect(h.pending).toHaveBeenLastCalledWith(false);
});
