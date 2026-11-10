CREATE TABLE "ReceitaProspectArquivo" (
    "cnpj" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "arquivadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceitaProspectArquivo_pkey" PRIMARY KEY ("cnpj")
);
