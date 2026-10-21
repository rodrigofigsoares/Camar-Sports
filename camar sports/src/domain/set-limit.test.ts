import { describe, expect, it } from 'vitest';
import { createMatch } from './model';
import { applyCommand } from './scoring';
describe.each(['tennis', 'beachtennis', 'volleyball', 'beachhandball'] as const)('limite de sets: %s', sport => {
  it.each([1, 3, 5] as const)('encerra melhor de %i e impede sets e pontos extras', bestOf => {
    let m = createMatch(sport); m.bestOf = bestOf;
    const target = Math.floor(bestOf / 2) + 1;
    for (let i = 0; i < target; i++) {
      m = applyCommand(m, { type: 'finishSet', side: 'b' });
      expect(m.status === 'done').toBe(i === target - 1);
    }
    expect(m.b.sets).toBe(target);
    expect(m.period).toBe('Fim de jogo');
    expect(m.clock.startedAt).toBeNull();
    expect(() => applyCommand(m, { type: 'finishSet', side: 'a' })).toThrow('encerrada');
    expect(() => applyCommand(m, { type: 'counter', side: 'b', field: 'sets', amount: 1 })).toThrow('encerrada');
    expect(() => applyCommand(m, { type: 'score', side: 'a', amount: 1 })).toThrow('encerrada');
    expect(() => applyCommand(m, { type: 'clock', action: 'start' })).toThrow('encerrada');
    m = applyCommand(m, { type: 'counter', side: 'b', field: 'sets', amount: -1 });
    m = applyCommand(m, { type: 'patch', patch: { status: 'live' } });
    expect(applyCommand(m, { type: 'finishSet', side: 'b' }).status).toBe('done');
  });
  it('aplica o limite nos botões de sets e ao mudar o formato', () => {
    let m = createMatch(sport);
    m = applyCommand(m, { type: 'counter', field: 'sets', side: 'a', amount: 1 });
    expect(m.status).not.toBe('done');
    expect(applyCommand(m, { type: 'counter', field: 'sets', side: 'a', amount: 1 }).status).toBe('done');
    expect(applyCommand(m, { type: 'patch', patch: { bestOf: 1 } }).status).toBe('done');
  });
});
