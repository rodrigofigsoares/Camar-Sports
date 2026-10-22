import { describe, expect, it } from 'vitest';
import { createMatch, matchSchema, sports, type Sport } from './model';
import { applyCommand, matchWinner, usesSets } from './scoring';

describe('vitória compartilhada entre modalidades', () => {
  it.each(Object.keys(sports) as Sport[])('%s anuncia o vencedor uma vez e limpa ao reabrir', sport => {
    const m = createMatch(sport);
    if (usesSets(m)) { m.b.sets = 2; m.a.score = 30; }
    else m.b.score = 10;
    const ended = applyCommand(m, { type: 'patch', patch: { status: 'done' } }, 1000);
    expect(matchWinner(ended)).toBe('b');
    expect(ended.victoryCue).toMatchObject({ side: 'b', at: 1000 });
    expect(matchSchema.parse(ended).victoryCue).toEqual(ended.victoryCue);
    expect(applyCommand(ended, { type: 'patch', patch: { title: 'Final' } }, 2000).victoryCue).toEqual(ended.victoryCue);
    expect(applyCommand(ended, { type: 'patch', patch: { status: 'live' } }, 3000).victoryCue).toBeNull();
    expect(applyCommand(ended, { type: 'reset' }, 3000).victoryCue).toBeNull();
  });
  it.each(['tennis', 'beachtennis', 'volleyball', 'beachhandball'] as const)('%s dispara ao ganhar o último set', sport => {
    const m = createMatch(sport); m.bestOf = 3; m.a.sets = 1;
    const ended = applyCommand(m, { type: 'finishSet', side: 'a' }, 5000);
    expect(ended.status).toBe('done');
    expect(ended.victoryCue).toMatchObject({ side: 'a', at: 5000 });
  });
  it('empate aguarda confirmação do desempate e correção troca o vencedor', () => {
    const m = createMatch('futsal'); m.penaltyMode = true;
    const tied = applyCommand(m, { type: 'patch', patch: { status: 'done' } }, 1000);
    expect(tied.victoryCue).toBeNull();
    const ended = applyCommand(tied, { type: 'patch', patch: { tiebreakWinner: 'b' } }, 2000);
    expect(ended.victoryCue).toMatchObject({ side: 'b', at: 2000 });
    const corrected = applyCommand(ended, { type: 'patch', patch: { tiebreakWinner: 'a' } }, 3000);
    expect(corrected.victoryCue).toMatchObject({ side: 'a', at: 3000 });
    expect(corrected.victoryCue?.id).not.toBe(ended.victoryCue?.id);
  });
  it('carrega partidas antigas sem inventar uma nova animação', () => {
    expect(matchSchema.parse({ ...createMatch('football'), victoryCue: undefined }).victoryCue).toBeNull();
  });
});
