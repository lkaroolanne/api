-- CreateTable
CREATE TABLE "ReceitaProspect" (
    "id" SERIAL NOT NULL,
    "cnpj" TEXT NOT NULL,
    "cnpjBasico" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "situacao" TEXT,
    "cnaePrincipal" TEXT,
    "cnaeSecundarios" TEXT,
    "tipoLogradouro" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cep" TEXT,
    "uf" TEXT,
    "municipioCodigo" TEXT,
    "telefone1" TEXT,
    "telefone2" TEXT,
    "email" TEXT,
    "segmento" TEXT,
    "origem" TEXT DEFAULT 'Receita Federal',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceitaProspect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaProspect_cnpj_key" ON "ReceitaProspect"("cnpj");
