# Camar Sports 2

Estúdio local de operação esportiva refeito em **Vite + React + TypeScript**, com API Node e SQLite. Interface escura com destaques verde-claro. O sistema de highlights não faz parte da nova aplicação.

## Executar

Use **Node.js 24.2 ou superior** (validado com Node 26.1; o servidor usa `node:sqlite` e execução nativa de TypeScript).

Instale as dependências **na raiz do repositório** (uma vez) e rode os comandos abaixo nesta pasta:

```powershell
npm install          # na raiz do repositório
cd "camar sports"
npm run dev
```

Abra http://127.0.0.1:5173. No primeiro acesso, crie o administrador. Nenhuma senha padrão é criada na base principal.

Para executar a versão compilada:

```powershell
npm run build
npm start
```

Abra http://127.0.0.1:4173. `npm run preview` também inicia a versão compilada **com a API**. Mantenha o processo aberto durante a transmissão.

Para acesso de outros computadores na mesma rede:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Use o IP da máquina, por exemplo `http://192.168.1.10:4173`. Substitua `127.0.0.1` nas URLs dos overlays pelo mesmo endereço. A configuração padrão atende apenas a máquina local.

## Uso

- **Partida avulsa:** Visão geral → Nova partida → modalidade e equipes.
- **Campeonato:** crie o campeonato, cadastre equipes, ajuste categorias nas configurações e use Nova fase. Gere uma competição ou crie fases individuais com vagas a definir.
- **Conexões:** arraste uma saída à direita da fase para uma vaga à esquerda de outra. Grupos e ligas têm saídas por posição; eliminatórias têm vencedor e perdedor. Selecione uma conexão e pressione Delete para removê-la.
- **Corrigir conexões:** arraste a ponta de uma ligação para reconectá-la, ou abra a fase → Configurar fase → Conexões de entrada e saída → Desconectar. Participantes dependentes são recalculados; mudanças de participante reiniciam os resultados afetados.
- **Desempates:** nas configurações do campeonato, adicione, remova e ordene os critérios pelas setas. Cada fase pode substituir essa ordem em Configurar fase, desmarcando Usar critérios do campeonato. O botão Priorizar confronto direto entre empatados usa pontos, saldo e gols entre os empatados antes dos critérios gerais. A minitabela considera todas as equipes empatadas em pontos na fase; não compara pares isolados. Pontos da classificação sempre vêm primeiro e nome é o último recurso. Regras específicas do regulamento devem ser configuradas; alterar critérios não corrige placares ou vitórias divergentes de um boletim.
- **Resultados:** abra uma fase para lançar resultados ou entre em Operar. Uma eliminatória empatada exige vencedor no desempate antes do encerramento.
- **Correções:** mudanças de participantes limpam os placares das partidas afetadas e propagam essa mudança às fases dependentes. A API faz a operação em uma transação.
- **Suíço:** finalize os jogos da rodada e use Gerar próxima rodada suíça na fase. O pareamento segue a classificação e evita reencontros quando há uma alternativa na busca sequencial. Não implementa o algoritmo suíço FIDE.
- **Conjuntos:** na aba Conjuntos, crie uma etapa (por exemplo, Quartas de Final) e use Selecionar fases para reunir suas fases personalizadas. Uma fase pertence a um conjunto; selecionar uma fase de outro conjunto a transfere. Também é possível associar cada fase pelas configurações dela. Em Transmissão, selecione conjuntos para incluir suas fases e subconjuntos automaticamente. O bracket agrupa os jogos em colunas por conjunto e nível de progressão, separados por categoria, com até quatro colunas e cinco jogos por coluna em cada página, seguindo a organização da v1.
- **CSV:** aba Partidas → Modelo CSV baixa os cabeçalhos da modalidade, mesmo sem jogos cadastrados. Preencha uma partida por linha; apenas Time A Oficial e Time B Oficial são obrigatórios. Sem placares, a partida fica agendada. Para resultados, preencha ambos os placares; em esportes com sets, Placar A/B representa sets vencidos e Set N A/B é o histórico opcional. Handebol, futebol, futsal e basquete não exportam campos de sets. São aceitos ponto e vírgula, vírgula, tabulação, BOM e a diretiva `sep=;` do Excel. Importar CSV mostra uma prévia antes da gravação; linhas incompletas são apontadas com o número da linha. Exportar CSV preserva os cabeçalhos mesmo sem partidas e pode ser reimportado.
- **Backup completo:** Configurações → Exportar backup. Importar acrescenta registros; IDs existentes são recusados, sem sobrescrita silenciosa. O backup JSON inclui estrutura, conexões e configurações; CSV é para intercâmbio de jogos e não conserva toda a topologia do campeonato.

## Transmissão

Cada partida recebe UUID e URL exclusiva:

```text
/#/matches/<matchId>
/#/overlay/match/<matchId>
/#/tournaments/<tournamentId>
/#/overlay/tournament/<tournamentId>
```

No OBS, adicione uma **fonte de navegador de 1920 × 1080** com a URL exibida em Transmissão. As páginas de overlay têm fundo transparente e leitura pública; não precisam de login. O overlay de campeonato pagina classificações, confrontos, resultados e próximos jogos em uma sequência configurável. Alterações da configuração são recebidas pela mesma URL.

Os placares de handebol, basquete, futsal e vôlei reproduzem os quatro modelos presentes no backup **v2.1**, com as mesmas fontes locais (Space Grotesk e Space Mono), geometria, cores, indicadores e tempos de animação. As outras cinco modalidades seguem essa identidade visual adaptada aos seus dados. A interface de operação mantém o novo tema preto e verde-claro. A comparação visual foi feita renderizando os componentes originais e os novos com os mesmos dados de teste.

Em **Operar → Configurar partida**, escolha a cor do uniforme de cada equipe no placar e texto branco ou preto. A escolha vale apenas para aquela partida, inclusive dentro de campeonatos, e é preservada nas atualizações dos resultados. Cores de texto antigas ou importadas são convertidas para preto ou branco.

Painel e overlay leem os mesmos registros SQLite pela API. Eventos SSE avisam sobre alterações; uma leitura periódica funciona como recuperação de conexão. Os cronômetros usam timestamps do servidor em vez de gravar a cada segundo. Recarregar ou fechar o painel não interrompe o relógio de uma partida.

Atalhos fora de campos e modais: **Espaço** inicia/pausa; **A/L** adicionam ponto às equipes A/B; **Ctrl+Z** desfaz. Até 100 ações são mantidas por partida. O desfazer restaura o estado anterior e pausa os relógios para revisão do operador.

## Modalidades

| Modalidade     | Operação                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Handebol       | Gols, relógio progressivo, períodos personalizados, três tempos técnicos, exclusões de dois minutos por atleta, desempate e cobranças |
| Futebol        | Gols, relógio progressivo, períodos e disputa de pênaltis                                                                             |
| Futsal         | Gols, relógio regressivo, faltas e disputa de pênaltis                                                                                |
| Basquetebol    | Pontos de 1/2/3, períodos, relógio de jogo, posse e relógio de posse configurável                                                     |
| Basquete 3×3   | Pontos de 1/2, tempo único, posse de 12 segundos configurável                                                                         |
| Beach handball | Pontos de 1/2, sets, relógio regressivo e shoot-out                                                                                   |
| Voleibol       | Pontos, saque, sets, histórico, melhor de 1/3/5, alvos de pontos, set point e match point                                             |
| Tênis          | Pontos 0/15/30/40/AD, deuce, games, sets, tie-break e saque                                                                           |
| Beach tennis   | Mesma estrutura do tênis, com ponto decisivo sem vantagem por padrão                                                                  |

O operador confirma o encerramento de sets de vôlei/beach handball e o encerramento da partida. As contagens podem ser corrigidas manualmente. Eliminação dupla usa 4/8/16/32 participantes e **grande final única**; não gera reset de final. Grupos Round-Robin e grupos de chave da versão anterior são representados pelo mesmo tipo de fase, como já ocorria na geração do original.

## Persistência e arquitetura

- `../shared/domain/model.ts`: entidades e validação Zod.
- `../shared/domain/scoring.ts`: comandos puros, relógios e regras esportivas.
- `../shared/domain/tournament.ts`: geração, classificação, validação e resolução do grafo.
- `../shared/domain/csv.ts`: intercâmbio CSV legado.
- `server/repository.ts`: armazenamento SQLite, transações, histórico e sessões.
- `server/api.ts`: autenticação, permissões, revisões, comandos e sincronização de participantes.
- `src/lib/api.ts`: acesso HTTP e assinaturas da UI; `platform` define o que difere da versão de nuvem.
- `../shared/pages`: operação, campeonatos e overlays (compartilhados com a versão de nuvem).

A base principal é `data/camar.sqlite`, com WAL. **Não apague a pasta `data`.** Para copiar diretamente o banco, pare o servidor antes; para backup durante a operação, use a exportação JSON. A variável `CAMAR_DB` permite escolher outro arquivo. Os dados não dependem de localStorage, da aba aberta ou de um estado único por esporte.

Senhas são armazenadas com scrypt e salt; sessões usam cookies HttpOnly. Administradores gerenciam usuários e backup; operadores podem ser limitados por modalidade; visualizadores não alteram dados. A instalação é destinada a operação local/rede confiável; publicação na internet deve acompanhar a migração do backend.

## Migração futura para Supabase

O frontend já usa IDs e uma API de persistência. A migração deverá manter as URLs e contratos de domínio, substituir a implementação de armazenamento por chamadas assíncronas ao Supabase e transferir as transações críticas para funções Postgres/RPC. O projeto **ainda não se conecta ao Supabase**.

Requisitos a preservar:

1. Registros de partidas e campeonatos separados, identificados por UUID; `tournamentId` e `stageId` ligam partidas à competição.
2. Atualização com comparação de `revision`, retornando conflito HTTP 409 em gravação obsoleta.
3. Comando + histórico + recálculo dos dependentes na mesma transação.
4. Supabase Auth substituindo senhas/sessões locais, com RLS para administradores, operadores e visualizadores.
5. Realtime substituindo SSE; leitura pública de overlay deve usar uma política restrita ou token de transmissão.
6. Importação validada dos backups e preservação dos IDs existentes.

## Validação

```powershell
npm test
npm run build
```

Os testes incluem pontuação das modalidades, cronômetros, exclusões, desempates, geração de formatos, CSV, autenticação, conflitos de revisão, isolamento entre partidas, avanço de classificados, invalidação de placares dependentes e rollback de transações.

`scripts/qa-fixture.ts` cria **somente** `artifacts/qa.sqlite`, para inspeção visual com dados fictícios. Essa base não deve ser usada em operação. Os arquivos de referência permanecem em `reference/` e não são servidos na versão compilada.
