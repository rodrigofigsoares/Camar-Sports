import { describe, it, expect } from 'vitest';
import { createMatch, matchSchema } from './model';
import { applyCommand } from './scoring';
describe('anúncios do handebol', () => {
  it('7m é visual, persiste por partida e permite novo disparo', () => {
    const m = createMatch('handball'); m.a.score = 10;
    const n = applyCommand(m, { type: 'sevenMeters', side: 'b' }, 1000);
    expect(n.handballCue).toMatchObject({ kind: 'seven', side: 'b', at: 1000 });
    expect(n.a).toEqual(m.a); expect(n.b).toEqual(m.b); expect(n.clock).toEqual(m.clock);
    expect(matchSchema.parse(JSON.parse(JSON.stringify(n))).handballCue).toEqual(n.handballCue);
    expect(applyCommand(n, { type: 'sevenMeters', side: 'b' }, 1100).handballCue?.id).not.toBe(n.handballCue?.id);
    expect(() => applyCommand(createMatch('football'), { type: 'sevenMeters', side: 'a' })).toThrow('handebol');
  });
  it.each(['a', 'b'] as const)('vitória de %s ao encerrar, sem repetir em atualizações e sem ressurgir ao reabrir', side => {
    const m = createMatch('handball'); m[side].score = 20;
    const n = applyCommand(m, { type: 'patch', patch: { status: 'done' } }, 2000);
    expect(n.handballCue).toMatchObject({ kind: 'victory', side, at: 2000 });
    expect(applyCommand(n, { type: 'patch', patch: { title: 'Final' } }, 8000).handballCue).toEqual(n.handballCue);
    expect(applyCommand(n, { type: 'patch', patch: { status: 'live' } }).handballCue).toBeNull();
    expect(applyCommand(n, { type: 'reset' }).handballCue).toBeNull();
  });
  it('empate não anuncia vencedor até confirmar o desempate', () => {
    let m = applyCommand(createMatch('handball'), { type: 'patch', patch: { status: 'done' } });
    expect(m.handballCue).toBeNull();
    m = applyCommand(m, { type: 'patch', patch: { tiebreakWinner: 'b' } }, 3000);
    expect(m.handballCue).toMatchObject({ kind: 'victory', side: 'b', at: 3000 });
    expect(matchSchema.parse({ ...m, handballCue: undefined }).handballCue).toBeNull();
  });
});
