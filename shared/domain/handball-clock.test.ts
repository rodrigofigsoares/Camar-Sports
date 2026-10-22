import { describe, expect, it } from 'vitest';
import { createMatch } from './model';
import { applyCommand, finishExpiredMatch, penaltyRemaining } from './scoring';

describe('cronômetro e punições do handebol', () => {
  it.each(['up', 'down'] as const)('encerra o segundo tempo no instante exato, com relógio %s', direction => {
    let m = createMatch('handball');
    m.period = '2º tempo'; m.a.score = 21;
    m.clock = { direction, limit: 1800, value: direction === 'up' ? 1790 : 10, startedAt: null };
    m = applyCommand(m, { type: 'clock', action: 'start' }, 1000);
    expect(finishExpiredMatch(m, 10999)).toBeNull();
    const ended = finishExpiredMatch(m, 12000)!;
    expect(ended.status).toBe('done');
    expect(ended.clock.startedAt).toBeNull();
    expect(ended.handballCue).toMatchObject({ kind: 'victory', side: 'a', at: 11000 });
    expect(finishExpiredMatch(ended, 15000)).toBeNull();
  });
  it.each(['1º tempo', 'Prorrogação', '2º tempo'])('pausa sem vitória indevida em %s', period => {
    let m = createMatch('handball'); m.period = period;
    m.a.score = period === '2º tempo' ? 0 : 1;
    m.clock.value = 1799; m.clock.direction = 'up';
    m = applyCommand(m, { type: 'clock', action: 'start' }, 1000);
    const ended = finishExpiredMatch(m, 2500)!;
    expect(ended.status).toBe('live');
    expect(ended.clock.startedAt).toBeNull();
    expect(ended.handballCue).toBeNull();
  });
  it.each(['up', 'down'] as const)('carrega punições para o segundo tempo, em %s', direction => {
    let m = createMatch('handball');
    m.clock = { direction, limit: 1800, value: direction === 'up' ? 1770 : 30, startedAt: null };
    m = applyCommand(m, { type: 'penalty', side: 'a', player: '18' }, 1000);
    const expires = m.a.penalties[0].expiresAtPlay;
    m = applyCommand(m, { type: 'clock', action: 'start' }, 1000);
    m = finishExpiredMatch(m, 32000)!;
    expect(penaltyRemaining(m, expires, 32000)).toBe(90);
    m = applyCommand(m, { type: 'patch', patch: { period: '2º tempo' } }, 60000);
    expect(m.clock.value).toBe(direction === 'up' ? 0 : 1800);
    expect(penaltyRemaining(m, expires, 90000)).toBe(90);
    m = applyCommand(m, { type: 'clock', action: 'start' }, 100000);
    expect(penaltyRemaining(m, expires, 120000)).toBe(70);
    m = applyCommand(m, { type: 'clock', action: 'pause' }, 120000);
    expect(penaltyRemaining(m, expires, 150000)).toBe(70);
  });
  it('sincroniza correções do relógio sem exibir mais de dois minutos', () => {
    let m = createMatch('handball'); m.clock.direction = 'up'; m.clock.value = 300; m.playElapsed = 300;
    m = applyCommand(m, { type: 'penalty', side: 'a', player: '9' }, 1000);
    const expires = m.a.penalties[0].expiresAtPlay;
    m = applyCommand(m, { type: 'clock', action: 'adjust', seconds: 30 }, 1000);
    expect(penaltyRemaining(m, expires, 1000)).toBe(90);
    m = applyCommand(m, { type: 'clock', action: 'adjust', seconds: -60 }, 1000);
    expect(penaltyRemaining(m, expires, 1000)).toBe(120);
  });
});
