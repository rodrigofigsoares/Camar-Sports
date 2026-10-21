import { afterEach, expect, it, vi } from 'vitest';
import { liveResource, nextClockEnd, subscribeLive } from './live';

class Socket {
  static OPEN=1;
  static instances:Socket[]=[];
  readyState=0;
  onopen?:()=>void;
  onclose?:()=>void;
  onerror?:()=>void;
  onmessage?:(event:{data:string})=>void;
  sent:string[]=[];
  constructor(public url:URL) {Socket.instances.push(this);}
  send(data:string) {this.sent.push(data);}
  close() {this.readyState=3;this.onclose?.();}
  open() {this.readyState=1;this.onopen?.();}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();Socket.instances=[];});
it('subscribes, handles notifications and reconnects without leaking after cleanup',()=>{
  vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('location',{href:'https://test.local/'});
  const changed=vi.fn(), live=subscribeLive('matches/abc',changed);
  const first=Socket.instances[0];
  expect(first.url.protocol).toBe('wss:');expect(first.url.searchParams.get('resource')).toBe('matches/abc');
  first.open();expect(changed).toHaveBeenCalledTimes(1);
  first.onmessage?.({data:'{"type":"changed"}'});expect(changed).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(20000);expect(first.sent).toEqual(['ping']);
  first.onmessage?.({data:'pong'});expect(changed).toHaveBeenCalledTimes(2);
  first.close();expect(live.isOpen()).toBe(false);
  vi.advanceTimersByTime(1000);expect(Socket.instances).toHaveLength(2);
  Socket.instances[1].open();expect(changed).toHaveBeenCalledTimes(3);
  live.close();vi.advanceTimersByTime(60000);expect(Socket.instances).toHaveLength(2);
});
it('recovers a half-open socket when heartbeat responses stop',()=>{
  vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('location',{href:'https://test.local/'});
  const live=subscribeLive('matches/abc',vi.fn());Socket.instances[0].open();
  vi.advanceTimersByTime(61000);expect(Socket.instances).toHaveLength(2);
  live.close();
});
it('retains fallback when WebSocket construction fails',()=>{
  vi.useFakeTimers();vi.stubGlobal('location',{href:'https://test.local/'});
  vi.stubGlobal('WebSocket',class {constructor(){throw new Error('unavailable');}});
  const live=subscribeLive('matches/abc',vi.fn());expect(live.isOpen()).toBe(false);
  live.close();expect(vi.getTimerCount()).toBe(0);
});
it('limits live subscriptions to individual records and schedules clock expiration',()=>{
  expect(liveResource('matches')).toBeNull();expect(liveResource('users')).toBeNull();
  expect(liveResource('tournaments/abc/state')).toBe('tournaments/abc/state');
  expect(nextClockEnd({matches:[{clock:{startedAt:1000,direction:'down',value:5,limit:0}},{clock:{startedAt:null}}]},2000)).toBe(6000);
  expect(nextClockEnd({clock:{startedAt:null}},2000)).toBeNull();
});
