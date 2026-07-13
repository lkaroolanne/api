-- Align ReceitaProspect table with the current Prisma schema.
ALTER TABLE "ReceitaProspect"
ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT,
ADD COLUMN IF NOT EXISTS "naturezaJuridica" TEXT,
ADD COLUMN IF NOT EXISTS "qualificacaoResponsavel" TEXT,
ADD COLUMN IF NOT EXISTS "capitalSocial" TEXT,
ADD COLUMN IF NOT EXISTS "porteEmpresa" TEXT,
ADD COLUMN IF NOT EXISTS "enteFederativo" TEXT,
ADD COLUMN IF NOT EXISTS "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ReceitaProspect_cnpjBasico_idx" ON "ReceitaProspect"("cnpjBasico");
CREATE INDEX IF NOT EXISTS "ReceitaProspect_uf_idx" ON "ReceitaProspect"("uf");
CREATE INDEX IF NOT EXISTS "ReceitaProspect_cnaePrincipal_idx" ON "ReceitaProspect"("cnaePrincipal");
CREATE INDEX IF NOT EXISTS "ReceitaProspect_segmento_idx" ON "ReceitaProspect"("segmento");
