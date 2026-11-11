# Base de prospects Vortech

## Experiência de prospecção

A tela principal prioriza busca e empresas. Segmentos aparecem como atalhos, com correspondência por palavras no nome; isso não confirma venda de produtos de solda. Opções da busca permite alternar entre cadastros ativos e pendentes. A tabela reúne CNPJ, fantasia, CNAE e origem em **Ver cadastro**, com cinco colunas visíveis. **Registrar resultado** salva o acompanhamento apenas no navegador. **Mais opções** contém cópia e a consulta Google individual. Importação e base de clientes ficam em **Gerenciar bases**. Os botões de download gerais permanecem retirados da tela.

A busca por nome ignora acentos, exige todos os termos relevantes e admite início de palavra. Solda/soldagem e alguns termos comerciais tratam flexões explícitas, evitando confundir solda com soldado. CNPJ e CNAE exigem, respectivamente, 14 e 7 dígitos e usam igualdade. Uma nova busca cancela a requisição anterior; respostas atrasadas não substituem a consulta atual. Indicadores de contato usam os mesmos critérios de formato da busca, sem confirmar titularidade, entrega de e-mail ou WhatsApp.

`public/premium.css` contém o acabamento visual e as adaptações para celular. Para testar os filtros diretamente no PostgreSQL sem ler ou alterar empresas, configure `RUN_DB_TESTS=1` ao executar `node --test scripts/buscaPrecisao.test.js`. O teste usa registros fictícios com `jsonb_to_recordset` e requer conexão ao banco.

A migração `20261111190000_index_busca_nome` habilita `pg_trgm` e cria um índice GIN na expressão normalizada de nomes. A expressão do serviço e a do índice devem permanecer iguais. A criação inicial requer permissão para a extensão; nenhuma linha de empresa é alterada. O plano de execução foi conferido com uso de `receita_prospect_nome_busca_trgm`.

## Configuração

Execute `npm ci`, configure `DATABASE_URL` em `.env`, aplique `npx prisma migrate deploy` e gere o cliente com `npm run prisma:generate`. Inicie com `npm start`. A execução local usa a URL externa do PostgreSQL; serviços Render na mesma região podem usar a interna. Credenciais e arquivos da base ficam fora do Git.

## Importação da Receita

1. Coloque os ZIPs `Estabelecimentos0.zip` até `Estabelecimentos9.zip`, da mesma competência, em `data/receita/estabelecimentos/`.
2. Execute `npm run importar:receita`.
3. Coloque os ZIPs de Empresas ou os arquivos extraídos `*.EMPRECSV` em `data/empresas/`.
4. Execute `node --env-file=.env scripts/importarEmpresasReceita.cjs` para completar razão social, porte e capital social.

São importados estabelecimentos ativos. CNAEs diretos de ferragens/ferramentas são aceitos; atividades amplas e secundárias exigem palavras relacionadas no nome fantasia. O arquivo de Estabelecimentos não contém razão social, então cadastros sem fantasia podem ficar fora dessa seleção inicial. Empresas completa apenas os CNPJs já importados, em lotes.

A importação insere novos CNPJs e ignora duplicados; não atualiza os existentes nem consome APIs comerciais. Telefones são validados por DDD, comprimento e prefixo, sem adicionar dígitos por suposição. Duplicados do mesmo estabelecimento são removidos e o segundo número válido é aproveitado quando necessário. E-mails malformados são descartados. Formato válido não confirma atendimento, titularidade ou WhatsApp.

## Seleção comercial

Depois das duas etapas, execute `npm run limpar:foco` para simular e `npm run limpar:foco -- --aplicar` para aplicar a seleção por palavras em nome fantasia ou razão social: solda, gases, ferragens, ferramentas, máquinas, químicos e reguladores. CNAE amplo, endereço, segmento gerado ou e-mail não substituem evidência no nome.

O critério anterior, restrito a solda e gases industriais, continua disponível com `--estrito`. Para reincluir registros compatíveis já arquivados, use `npm run ampliar:foco` (simulação) e `npm run ampliar:foco -- --aplicar`.

As movimentações entre a tabela principal e `ReceitaProspectArquivo` são transacionais. O arquivo preserva o cadastro completo como JSON, com motivo e data. Divergências de quantidade revertem a operação. Relatórios ficam em `data/limpeza/` e cópias locais em `data/backups/`. Empresas sem evidência no nome podem ser arquivadas para revisão; isso não significa falta de potencial comercial. Reaplique a seleção após reimportar a base completa.

## Contatos na tela

A lista prioriza contatos confirmados, celulares e fixos dentro da página carregada. Clientes identificados na Base Vortech e situações bloqueadas ficam no fim. Cada telefone pode ser marcado como não verificado, telefone confirmado, WhatsApp confirmado, sem resposta ou errado/desativado.

Números errados deixam de ser sugeridos para ligação/WhatsApp e um telefone alternativo válido é priorizado. Sem resposta não invalida o número. A confirmação é por CNPJ e telefone e fica somente no navegador: não é compartilhada entre vendedores e se perde ao limpar os dados locais. A nova exportação comercial considera essas confirmações, retira os números marcados como errados e preserva o cadastro original no banco.

## Busca e exportação comercial

Escolha categoria, estado e contato; nome, CNPJ ou CNAE são opcionais. A busca por nome desconsidera acentos. CNPJ completo e CNAE de sete dígitos, com ou sem formatação, são identificados separadamente. A página carrega 100 empresas; há navegação anterior/próxima e atalhos por categoria. No celular, os atalhos ficam recolhidos inicialmente para priorizar a busca.

`GET /empresas/consulta` recebe `grupo`, `uf`, `contato`, `situacao`, `termo`, `pagina` e `limite`. Situação aceita `ativas` (padrão da API), `pendentes` e `ativas-pendentes` (padrão da tela). Empresas inativas não entram nesses resultados. Pendentes recebem identificação na tela; a exportação comercial continua incluindo somente ativas. Cadastros da planilha sem UF ficam fora das buscas por estado. As categorias podem se sobrepor: uma empresa com ferramentas e máquinas pode aparecer nas duas.

`POST /empresas/consulta/exportar` recebe `consulta`, `escopo` (`pagina` ou `todos`), `cnpjs` (obrigatórios para página), `baseVortech` e `contatos` locais. Exportação de página vazia retorna erro, nunca exporta toda a base por engano. O backend relê os registros e aplica os mesmos filtros; não confia em telefones enviados pelo navegador. Os CNPJs selecionados mantêm a ordem da tela.

Os botões **Baixar lista desta página** e **Baixar toda a busca** geram arquivos com categoria, UF, contato, escopo e data no nome. Clientes da Base Vortech, inativos e números marcados como errados são excluídos conforme o contexto da busca. A planilha usa colunas comerciais, larguras ajustadas, autofiltro e link WhatsApp a verificar quando houver número compatível. Nenhuma exportação consulta APIs comerciais ou incorpora dados do Google.

Confirmações e números errados são filtros locais da página. Enquanto um deles estiver selecionado, o download da busca inteira fica desabilitado para não sugerir que a confirmação é compartilhada globalmente. Para categorias/estados grandes, exportações completas são limitadas a 50 mil registros: refine o filtro caso ultrapasse esse total.

Os botões apenas abrem uma ligação ou conversa; o contato é feito pelo vendedor. Não há disparos automáticos nem confirmação automática de WhatsApp.

## Consulta Google Maps

Configure `GOOGLE_PLACES_API_KEY` no backend, com Places API (New) e faturamento habilitados. A chave não vai para o navegador. O botão **Consultar contato Google** faz uma consulta individual e pode gerar cobrança na conta Google Cloud; não há varredura automática.

A comparação exige nome distintivo, CEP, rua, número, UF e país compatíveis, estabelecimento informado como operacional e telefone em formato válido. Ambiguidade, cadastro incompleto ou divergências impedem a associação. O critério conservador pode deixar de apresentar estabelecimentos legítimos.

A rota `POST /empresas/contato-google/:cnpj` responde com `Cache-Control: no-store`. O limite padrão é 20 tentativas em uma janela móvel de 24 horas compartilhada entre usuários; ajuste `GOOGLE_CONTATOS_LIMITE_24H`. Há intervalo de uma hora para repetir o mesmo CNPJ. Tentativas com erro também contam no limite interno.

O histórico `ConsultaContatoGoogle` guarda CNPJ, data, status e identificador permitido do local. Nome, endereço e telefone do Google são exibidos ao vivo e não são incorporados à base, ao Excel ou ao armazenamento local. Atendimento e WhatsApp continuam não confirmados. A tela apresenta atribuição Google Maps e termos em `public/termos-google.html`.

Política: https://developers.google.com/maps/documentation/places/web-service/policies

O build do Render deve gerar o cliente Prisma e aplicar migrações antes de iniciar a aplicação. Para teste real local, configure também a chave em `.env`. `node scripts/auditarTelefones.js` faz três consultas de amostra na CNPJÁ pública, respeitando o limite, sem alterar o banco nem consumir créditos comerciais.

## Atualizar com Prospects.xlsx

Na tela, abra **Adicionar ou atualizar prospects por planilha**, selecione o arquivo, clique em **Conferir planilha** e depois em **Salvar atualização**. Essa importação é diferente da Base Vortech de clientes. Aceita até 10 MB e 100 mil CNPJs únicos.

No terminal, execute `npm run importar:prospects -- "caminho/Prospects.xlsx"` para conferir e acrescente `--aplicar` para gravar. O arquivo não precisa ficar dentro do projeto. A planilha deve conter CNPJ e Razao Social; CNAE, Segmento e Email são opcionais.

A atualização usa CNPJ como chave, consolida repetidos e salva todos os lotes em uma transação. Valores preenchidos atualizam os campos correspondentes; campos vazios ou e-mails malformados não apagam valores existentes. Telefones, endereço, situação cadastral e origem dos cadastros existentes são preservados. Novos registros têm origem Planilha Prospects e situação desconhecida: não aparecem na busca de empresas ativas até que a situação seja validada. A importação não confirma e-mails nem consulta serviços pagos.

## Testes

Execute `node --test scripts/*.test.js`. Os testes de Google usam respostas simuladas e não fazem chamadas pagas.
