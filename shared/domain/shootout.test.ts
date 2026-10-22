import { describe, expect, it } from "vitest";
import { createMatch, matchSchema } from "./model";
import { applyCommand, result, shootoutPoints } from "./scoring";

describe("pontuação das cobranças", () => {
  it("registra erro diretamente e permite corrigir pela bolinha", () => {
    let m = applyCommand(createMatch("handball"), { type: "shootout", side: "a", index: 0, result: "miss" });
    expect(m.a.shootout[0]).toBe("miss");
    expect(shootoutPoints(m, "a")).toBe(0);
    m = applyCommand(m, { type: "shootout", side: "a", index: 0 });
    expect(m.a.shootout[0]).toBe("pending");
  });
  it("configura a série, mantém resultados e usa a quantidade como limite das alternadas", () => {
    let m = createMatch("beachhandball");
    m.a.shootout[0] = "goal2";
    m = applyCommand(m, { type: "configureShootout", attempts: 3 });
    expect(m.a.shootout).toEqual(["goal2", "pending", "pending"]);
    expect(m.b.shootout).toHaveLength(3);
    m = applyCommand(m, { type: "extraShootout" });
    expect(m.a.shootout).toHaveLength(4);
    m = applyCommand(m, { type: "removeExtraShootout" });
    expect(applyCommand(m, { type: "removeExtraShootout" }).a.shootout).toHaveLength(3);
    m = applyCommand(m, { type: "configureShootout", attempts: 7 });
    expect(m.a.shootout).toHaveLength(7);
    expect(m.a.shootout[0]).toBe("goal2");
    const reset = applyCommand(m, { type: "reset" });
    expect(reset.shootoutAttempts).toBe(7);
    expect(reset.a.shootout).toEqual(Array(7).fill("pending"));
  });
  it("não descarta resultados ao reduzir a série e lê partidas antigas com cinco cobranças", () => {
    const m = createMatch("handball");
    m.b.shootout[4] = "miss";
    expect(() => applyCommand(m, { type: "configureShootout", attempts: 3 })).toThrow("resultad");
    expect(m.a.shootout).toHaveLength(5);
    expect(matchSchema.parse({ ...m, shootoutAttempts: undefined }).shootoutAttempts).toBe(5);
  });
  it("beach hand alterna pendente, um ponto, dois pontos e erro sem alterar o jogo", () => {
    let m = createMatch("beachhandball"); m.a.score=23; m.a.sets=1;
    for (const [shot,total] of [["goal",1],["goal2",2],["miss",0],["pending",0]] as const) {
      m=applyCommand(m,{type:"shootout",side:"a",index:0});
      expect(m.a.shootout[0]).toBe(shot);expect(shootoutPoints(m,"a")).toBe(total);
      expect(m.a.score).toBe(23);expect(result(m,"a")).toBe(1);
    }
  });
  it("soma pontos de cobranças de valores diferentes e preserva no schema", () => {
    let m=createMatch("beachhandball");
    m=applyCommand(m,{type:"shootout",side:"a",index:0,result:"goal2"});
    m=applyCommand(m,{type:"shootout",side:"a",index:1,result:"goal"});
    m=applyCommand(m,{type:"shootout",side:"a",index:2,result:"miss"});
    const saved=matchSchema.parse(JSON.parse(JSON.stringify(m)));
    expect(shootoutPoints(saved,"a")).toBe(3);
    expect(shootoutPoints(saved,"b")).toBe(0);
  });
  it.each(["football","futsal","handball"] as const)("%s conta somente gols das cobranças", sport => {
    let m=createMatch(sport);m.a.score=19;
    m=applyCommand(m,{type:"shootout",side:"a",index:0});
    expect(shootoutPoints(m,"a")).toBe(1); expect(m.a.score).toBe(19);
    m=applyCommand(m,{type:"shootout",side:"a",index:0});
    expect(m.a.shootout[0]).toBe("miss");
    expect(()=>applyCommand(m,{type:"shootout",side:"a",index:0,result:"goal2"})).toThrow("dois pontos");
  });
  it("adiciona e remove alternadas sem apagar as cinco cobranças iniciais", () => {
    let m=createMatch("beachhandball");m.a.shootout[0]="goal2";
    m=applyCommand(m,{type:"extraShootout"});
    m=applyCommand(m,{type:"shootout",side:"a",index:5,result:"goal2"});
    expect(shootoutPoints(m,"a")).toBe(4);
    m=applyCommand(m,{type:"removeExtraShootout"});
    expect(m.a.shootout).toHaveLength(5);expect(m.b.shootout).toHaveLength(5);
    expect(shootoutPoints(m,"a")).toBe(2);
    expect(applyCommand(m,{type:"removeExtraShootout"}).a.shootout).toHaveLength(5);
  });
});
