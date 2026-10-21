import { describe, it, expect } from "vitest";
import { createMatch } from "./model";
import { applyCommand, timeoutRemaining } from "./scoring";
describe("tempo técnico", () => {
  it("expira aos 60 segundos sem depender de outro comando do operador", () => {
    const m = applyCommand(createMatch("handball"), { type: "timeout", side: "a" }, 1000);
    expect(timeoutRemaining(m, 1000)).toBe(60);
    expect(timeoutRemaining(m, 60900)).toBeCloseTo(.1);
    expect(timeoutRemaining(m, 61000)).toBe(0);
    expect(timeoutRemaining(m, 80000)).toBe(0);
    expect(m.a.timeouts.filter(Boolean)).toHaveLength(1);
  });
  it("recolhe ao encerrar e permite iniciar o próximo tempo", () => {
    let m = applyCommand(createMatch("handball"), { type: "timeout", side: "b" }, 1000);
    m = applyCommand(m, { type: "endTimeout" }, 5000);
    expect(timeoutRemaining(m, 5000)).toBe(0);
    m = applyCommand(m, { type: "timeout", side: "b" }, 80000);
    expect(timeoutRemaining(m, 80000)).toBe(60);
    expect(m.b.timeouts.filter(Boolean)).toHaveLength(2);
  });
});
