# Painel Camar para OBS — Cloudflare

Endereço: https://obs-panel.camarlabsports.workers.dev

O Worker `obs-panel` hospeda a interface e consulta a API existente do `cloud-overlays` por service binding. Nenhum arquivo ou configuração do Camar foi alterado. Não é necessário iniciar o auxiliar, instalar Node ou manter terminal aberto para usar a versão publicada.

## Usar dentro do OBS

1. Em Painéis → Painéis de navegador personalizados, adicione **Camar Sports** com o endereço acima (ou substitua o endereço local antigo).
2. Entre com sua conta do Camar. A sessão é individual por navegador e fica em cookie HttpOnly, Secure e SameSite=Strict, por até sete dias.
3. Em Ferramentas → Configurações do servidor WebSocket, ative o servidor, mantenha autenticação habilitada e consulte a porta e senha.
4. Preencha porta e senha no painel e clique em Conectar ao OBS. Se houver solicitação de acesso à rede local, permita para esse painel.
5. Selecione a fonte de navegador do placar e clique em Exibir no placar na partida desejada.

A senha do OBS é usada diretamente no navegador para conectar a 127.0.0.1. Nunca é enviada à Cloudflare, salva em disco ou incluída na URL. Ao recarregar o painel, conecte ao OBS novamente. O OBS precisa estar no mesmo computador. Navegadores que impedem WebSocket local podem exigir permissão; valide o painel no dock da sua versão do OBS antes de uma transmissão.

## Partidas e filtros

A lista inclui todas as partidas retornadas pela API, inclusive as avulsas. **Origem → Partidas avulsas** ou **Campeonato → Partidas avulsas** mostra apenas as independentes.

A busca por texto ignora acentos e pode pesquisar todas as informações ou um campo específico. Listas suspensas filtram origem, campeonato, modalidade, equipe, categoria, rodada/fase, título, local, data, hora, status e resultado. Os filtros se combinam. Limpar filtros restaura a lista inteira.

Os cartões exibem os dados usados nos filtros e o placar. Nos esportes por sets, o placar geral mostra sets. Como o Camar inicia os valores em zero, partidas agendadas sem pontuação contam como Sem placar; partidas em andamento ou encerradas contam como Com placar, inclusive 0 × 0. A fase usa a etapa do campeonato; quando não há etapa, usa o título disponível.

A lista é atualizada ao entrar ou por solicitação. O estado da fonte é consultado localmente a cada cinco segundos e a sessão do Camar no máximo uma vez por minuto. A lista anterior é preservada quando uma atualização falha.

## Limites da integração

Só a URL é alterada, com SetInputSettings, overlay=true, e confirmação por leitura. A fonte não pode estar configurada como arquivo local. Uma fonte reutilizada em várias cenas muda em todas elas. O destaque indica o link configurado, não que a fonte esteja visível no programa. O painel não altera cenas, posições, dimensões ou placares.

O Worker expõe apenas login, logout, estado de sessão e consulta de partidas/campeonatos. Não acessa o D1 diretamente e não oferece comandos OBS pela API. O próprio Camar já pode encerrar relógios vencidos durante consultas; esse comportamento existente continua.

## Desenvolvimento

`npm ci`, `npm test`, `npm run check:deploy`, `npm run deploy`.

`node check-runtime.mjs` valida no runtime local com a API simulada. `node check-cloud-ui.mjs` usa Playwright/Edge e um servidor OBS simulado, verificando a conexão de uma página HTTPS com o WebSocket local e os filtros. Esse teste visual usa o Playwright já instalado em ../cloud-overlays. `PANEL_URL` permite testar os arquivos publicados com dados de conta simulados. A permissão de rede local é concedida somente ao contexto descartável do teste, representando a escolha Permitir do usuário.

`server.mjs` e `Iniciar-painel.cmd` permanecem como alternativa local para desenvolvimento. Não são necessários na versão hospedada.

Fontes: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/ e https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
