# Cloud Overlays — Camar Sports 2.0

Versão de nuvem independente: https://cloud-overlays.camarlabsports.workers.dev

A versão offline original continua em `../camar sports`, com seus arquivos, usuários e banco intactos. Inicie-a como antes. Não há sincronização automática entre offline e nuvem: alterações futuras pertencem à base em que forem feitas.

## Recursos criados

- Worker: `cloud-overlays`. O worker anterior `overlays` não foi modificado.
- D1: `cloud-overlays-db` (`758cb611-967e-4290-97c7-18b4efea811a`).
- Migração inicial: 1 campeonato e 63 partidas, preservando os IDs, configurações e resultados. Relógios foram pausados na cópia de nuvem.
- Banco inicial: aproximadamente 0,22 MB.
- Os dois usuários locais, senhas e sessões não foram enviados. Crie o administrador da nuvem e depois os demais usuários.
- `artifacts/offline-backup.json`: exportação do estado de origem; `artifacts/migration-manifest.json`: contagens e hash de integridade; `artifacts/production-verification.json`: verificação da publicação.

## Primeiro acesso

O formulário inicial exige um código de instalação, além de nome, usuário e nova senha. O código está no arquivo local privado `.dev.vars`, no valor de `SETUP_TOKEN`. Esse mesmo segredo precisa estar configurado no worker antes de criar o administrador. Não publique esse arquivo nem compartilhe o código com espectadores.

Depois da criação do administrador, o endpoint de instalação recusa outras criações. Use a gestão de usuários para adicionar operadores e visualizadores. As URLs de overlay permitem leitura pública por UUID; não coloque conteúdo confidencial em partidas e campeonatos compartilhados por esses links.

## Plano gratuito e capacidade

Conta confirmada pelo proprietário como Workers Free. Nenhum plano pago foi ativado. Workers Static Assets servem a interface, D1 armazena os dados e Durable Objects com hibernação distribuem notificações WebSocket. Não há R2, KV ou serviço externo contratado.

Cotas consultadas em 23/09/2026:

| Recurso | Workers Free |
| --- | --- |
| Requisições dinâmicas | 100.000 por dia, compartilhadas pelos workers da conta |
| CPU | 10 ms por requisição; operações grandes precisam ser avaliadas em produção |
| Arquivos estáticos | Requisições gratuitas, sem invocar o worker fora de `/api/*` |
| D1: linhas lidas | 5.000.000 por dia na conta |
| D1: linhas escritas | 100.000 por dia na conta, incluindo manutenção de índices |
| D1: armazenamento | 500 MB por banco; 5 GB no total da conta |
| D1: egress | Sem cobrança |
| Durable Objects: requisições | 100.000 por dia; conexão e chamadas de notificação contam |
| Durable Objects: duração | 13.000 GB-s por dia; conexões ociosas elegíveis à hibernação não consomem duração |

No Free, atingir cotas causa indisponibilidade até o reset; não aumenta automaticamente para um plano pago. A ausência de egress não elimina as demais cotas. Não é possível garantir capacidade ilimitada nem dimensionar o uso real sem a quantidade e duração das telas abertas.

Atualizações de partida, campeonato e overlays: notificações WebSocket imediatamente após o commit no D1. Uma sala por campeonato ou partida avulsa, usando `LiveRoom` e SQLite para compatibilidade com o Free. Não há gravação de placares ou timers nessas salas. Clientes só recebem avisos; não podem alterar placares pelo socket.

Com WebSocket conectado, cada tela faz aproximadamente 60 consultas de recuperação por hora, mais uma leitura por mudança recebida. Dez telas ociosas durante oito horas usam cerca de 4.800 consultas de recuperação, além das conexões, comandos e leituras provocadas por alterações. A conexão verifica a saúde com ping/pong automático sem acordar a sala; mensagens enviadas pelo servidor não são cobradas como requisições DO. A carga real depende da frequência de comandos e quantidade de telas do mesmo campeonato.

Se WebSocket falhar, a consulta de recuperação retorna a 5 segundos e a conexão tenta restabelecer-se com espera progressiva. Painéis de listagem usam 30 segundos. Abas de operação ocultas pausam leituras; overlays continuam para o OBS. Reabrir a aba ou reconectar força uma atualização. O overlay de campeonato e o editor usam uma resposta conjunta. ETags evitam reler partidas sem mudanças, mas não reduzem a contagem de requisições ao Worker. Importações envolvendo mais de 20 salas usam a consulta de recuperação nas salas excedentes para respeitar o limite de subrequisições por execução.

Consultas por ID/campeonato e histórico possuem índices. Cronômetros usam timestamps e animam no cliente; não geram gravações a cada segundo. A tela agenda uma leitura no término do relógio. O encerramento automático é persistido na próxima leitura, com o horário de término correto. Sem telas abertas, não existe processo permanente de encerramento.

Acompanhe Workers & Pages → cloud-overlays → Metrics e D1 → cloud-overlays-db → Metrics. Reserve margem para os demais workers `overlays` e `portfoliomiguel`. Cotas reiniciam à meia-noite UTC (21h em Brasília).

Fontes oficiais:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

## Desenvolvimento e publicação

Node 24.2 ou superior. As dependências são instaladas **na raiz do repositório** (npm workspaces); os demais comandos rodam nesta pasta.

```powershell
npm ci               # na raiz do repositório
cd cloud-overlays
npm run db:local
npm run build
npm start
```

Abra http://127.0.0.1:8787. O banco local de teste fica em `.wrangler`, separado do D1 remoto e da versão offline. Para desenvolvimento da interface, mantenha `npm start` em um terminal e execute `npm run dev` em outro (porta 5174).

```powershell
npm test
npm run build
npx wrangler d1 migrations apply cloud-overlays-db --remote
npm run deploy
```

Os testes recompilam o worker antes de executar. Incluem as regras esportivas e integração com o D1 real do runtime local: sessões, permissões, transações, conflitos, undo, progressão, importação e respostas condicionais. Quando a exportação privada existe, validam também a importação das 63 partidas. Os testes locais não simulam a imposição das cotas de CPU da conta Free.

## Persistência e limites operacionais

`worker/repository.ts` prepara alterações em memória por requisição e grava em um único `D1.batch`. Uma geração global com CHECK aborta toda a transação se outra gravação ocorrer antes. Isso preserva placar, histórico e participantes dependentes juntos. Alterações simultâneas até em partidas diferentes podem receber 409 e precisar de nova tentativa.

Histórico limitado a 100 ações por partida. Importações HTTP limitadas a 1,5 MB e rejeitadas inteiras se excederem o limite do lote; divida arquivos grandes por campeonato. A importação inicial usou arquivo SQL validado e não sobrescreve IDs existentes. O botão Exportar backup preserva campeonatos e partidas; usuários e sessões não fazem parte desse backup.

Os arquivos `server/` e scripts antigos foram copiados como referência da versão local; não são o backend publicado. A entrada de nuvem é `worker/index.ts`, e somente `dist/` é publicado como conteúdo estático. Não publique `data`, `artifacts`, `.dev.vars` ou o diretório inteiro como site estático.
