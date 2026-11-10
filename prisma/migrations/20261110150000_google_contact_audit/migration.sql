CREATE TABLE "ConsultaContatoGoogle" (
    "id" SERIAL NOT NULL,
    "cnpj" TEXT NOT NULL,
    "placeId" TEXT,
    "status" TEXT NOT NULL,
    "consultadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsultaContatoGoogle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsultaContatoGoogle_cnpj_consultadoEm_idx" ON "ConsultaContatoGoogle"("cnpj", "consultadoEm");
CREATE INDEX "ConsultaContatoGoogle_consultadoEm_idx" ON "ConsultaContatoGoogle"("consultadoEm");
