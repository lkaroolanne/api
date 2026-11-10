# Base de prospects Vortech

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

Números errados deixam de ser sugeridos para ligação/WhatsApp e um telefone alternativo válido é priorizado. Sem resposta não invalida o número. A confirmação é por CNPJ e telefone e fica somente no navegador: não é compartilhada entre vendedores, não altera o Excel e se perde ao limpar os dados locais. Os filtros da tela não alteram as regras existentes de exportação.

Os botões apenas abrem uma ligação ou conversa; o contato é feito pelo vendedor. Não há disparos automáticos nem confirmação automática de WhatsApp.

## Consulta Google Maps

Configure `GOOGLE_PLACES_API_KEY` no backend, com Places API (New) e faturamento habilitados. A chave não vai para o navegador. O botão **Consultar contato Google** faz uma consulta individual e pode gerar cobrança na conta Google Cloud; não há varredura automática.

A comparação exige nome distintivo, CEP, rua, número, UF e país compatíveis, estabelecimento informado como operacional e telefone em formato válido. Ambiguidade, cadastro incompleto ou divergências impedem a associação. O critério conservador pode deixar de apresentar estabelecimentos legítimos.

A rota `POST /empresas/contato-google/:cnpj` responde com `Cache-Control: no-store`. O limite padrão é 20 tentativas em uma janela móvel de 24 horas compartilhada entre usuários; ajuste `GOOGLE_CONTATOS_LIMITE_24H`. Há intervalo de uma hora para repetir o mesmo CNPJ. Tentativas com erro também contam no limite interno.

O histórico `ConsultaContatoGoogle` guarda CNPJ, data, status e identificador permitido do local. Nome, endereço e telefone do Google são exibidos ao vivo e não são incorporados à base, ao Excel ou ao armazenamento local. Atendimento e WhatsApp continuam não confirmados. A tela apresenta atribuição Google Maps e termos em `public/termos-google.html`.

Política: https://developers.google.com/maps/documentation/places/web-service/policies

O build do Render deve gerar o cliente Prisma e aplicar migrações antes de iniciar a aplicação. Para teste real local, configure também a chave em `.env`. `node scripts/auditarTelefones.js` faz três consultas de amostra na CNPJÁ pública, respeitando o limite, sem alterar o banco nem consumir créditos comerciais.

## Testes

Execute `node --test scripts/*.test.js`. Os testes de Google usam respostas simuladas e não fazem chamadas pagas.
