import { expect, it } from 'vitest';
import { createMatch } from './model';
import { applyCommand, commandSchema } from './scoring';

it.each(['handball', 'basketball', 'futsal', 'volleyball'] as const)('sets both %s scores without replaying historical points', sport => {
  const before = createMatch(sport);
  before.period = '2';
  before.clock = {value: 123, limit: 1800, direction: 'up', startedAt: 1000};
  before.a.sets = 1;
  before.handballCue = {id: 'old-goal', side: 'a', kind: 'goal', at: 1000};
  const after = applyCommand(before, commandSchema.parse({type: 'setScore', a: 32, b: 29}), 2000);
  expect([after.a.score, after.b.score]).toEqual([32, 29]);
  expect(after.clock).toEqual(before.clock);
  expect(after.period).toBe('2');
  expect(after.a.sets).toBe(1);
  expect(after.status).toBe(before.status);
  expect(after.handballCue).toBeNull();
  expect(after.victoryCue).toBeNull();
  expect(before.a.score).toBe(0);
});
it.each([-1, 1.5, 1000, Infinity])('rejects invalid score %s', a => {
  expect(commandSchema.safeParse({type:'setScore',a,b:0}).success).toBe(false);
});
it('requires reopening a completed match and uses dedicated tennis controls', () => {
  const done = createMatch('handball'); done.status='done';
  expect(()=>applyCommand(done,{type:'setScore',a:10,b:8})).toThrow('Reabra');
  expect(()=>applyCommand(createMatch('tennis'),{type:'setScore',a:10,b:8})).toThrow('tênis');
});
