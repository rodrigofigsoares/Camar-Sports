import { expect,it } from 'vitest';
import { createMatch } from './model';
import { applyCommand,clockValue,penaltyRemaining } from './scoring';

it.each(['up','down'] as const)('adjusts a running %s clock without losing fractional elapsed time',direction=>{
  let m=createMatch('handball');m.clock={direction,value:100,limit:1800,startedAt:null};
  m=applyCommand(m,{type:'clock',action:'start'},1000);
  const before=clockValue(m.clock,2250);
  const adjusted=applyCommand(m,{type:'clock',action:'adjust',seconds:1},2250);
  expect(adjusted.clock.startedAt).toBe(2250);
  expect(clockValue(adjusted.clock,2250)).toBe(before+1);
  expect(clockValue(adjusted.clock,3250)).toBe(before+1+(direction==='up'?1:-1));
  const set=applyCommand(adjusted,{type:'clock',action:'set',seconds:300},3250);
  expect(set.clock.startedAt).toBe(3250);
  expect(clockValue(set.clock,4250)).toBe(direction==='up'?301:299);
});
it('does not start a paused clock and still pauses on reset',()=>{
  let m=createMatch('handball');
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:1},1000);
  expect(m.clock.startedAt).toBeNull();expect(m.clock.value).toBe(1);
  m=applyCommand(m,{type:'clock',action:'start'},2000);
  m=applyCommand(m,{type:'clock',action:'reset'},3000);
  expect(m.clock.startedAt).toBeNull();expect(m.clock.value).toBe(0);
});
it('preserves a basketball possession clock when correcting game time',()=>{
  let m=createMatch('basketball');
  m=applyCommand(m,{type:'clock',action:'start'},1000);
  const shotBefore=clockValue(m.shotClock,4500);
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:1},4500);
  expect(m.shotClock.startedAt).toBe(4500);
  expect(clockValue(m.shotClock,5500)).toBe(shotBefore-1);
  m.shotClock.startedAt=null;
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:1},6000);
  expect(m.shotClock.startedAt).toBeNull();
});
it('keeps handball penalties synchronized and running after correction',()=>{
  let m=createMatch('handball');
  m=applyCommand(m,{type:'clock',action:'start'},1000);
  m=applyCommand(m,{type:'penalty',side:'a',player:'7'},1000);
  const expires=m.a.penalties[0].expiresAtPlay;
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:1},11000);
  expect(penaltyRemaining(m,expires,11000)).toBe(109);
  expect(penaltyRemaining(m,expires,12000)).toBe(108);
});
it.each(['up','down'] as const)('stops at the %s clock boundary without restarting expired clocks',direction=>{
  let m=createMatch('handball');m.clock={direction,value:direction==='up'?1798:2,limit:1800,startedAt:null};
  m=applyCommand(m,{type:'clock',action:'start'},1000);
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:direction==='up'?5:-5},2000);
  expect(m.clock.startedAt).toBeNull();
  expect(m.clock.value).toBe(direction==='up'?1800:0);
  m=applyCommand(m,{type:'clock',action:'adjust',seconds:direction==='up'?-5:5},3000);
  expect(m.clock.startedAt).toBeNull();
});
