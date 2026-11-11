-- Índice de expressão para nomes sem acentos, inclusive buscas por palavras.
-- A expressão deve permanecer igual à usada por montarConsultaProspects.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS receita_prospect_nome_busca_trgm
ON "ReceitaProspect" USING gin (
  (translate(lower(coalesce("nomeFantasia", '') || ' ' || coalesce("razaoSocial", '')),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')) gin_trgm_ops
);
