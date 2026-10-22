# Camar-Sports

Overlay interativo para transmissão ao vivo de esportes.

## Estrutura

| Pasta | O que é |
|---|---|
| `camar sports/` | Versão **offline**: roda no seu computador (Node + SQLite). Não depende de internet. |
| `cloud-overlays/` | Versão de **nuvem**: Cloudflare Workers + D1, operável de qualquer lugar. |
| `shared/` | Código usado pelas duas: regras esportivas (`domain/`), componentes dos placares (`components/`), fila de comandos (`lib/`) e as páginas de operação e overlay (`pages/`). |
| `obs-panel/` | Painel independente para controlar o OBS (tem o próprio `package.json`). |

As duas versões são npm workspaces: as dependências são instaladas **uma vez, na raiz**.
O que é próprio de cada versão (servidor ou Worker, `src/lib/api.ts`, login) fica na pasta dela.
As diferenças de comportamento que as páginas de `shared/pages` precisam conhecer ficam em
`platform`, no `src/lib/api.ts` de cada versão.

## Começando

Requer **Node.js 24.2 ou superior**.

```powershell
npm install        # na raiz, uma vez
npm test           # roda os testes de shared, offline e nuvem
npm run build      # compila as duas versões
```

Depois, entre na pasta da versão que quer usar e siga o README dela
(`camar sports/README.md` ou `cloud-overlays/README.md`).

> Uma regra esportiva corrigida em `shared/domain/` vale para as duas versões de uma vez.
