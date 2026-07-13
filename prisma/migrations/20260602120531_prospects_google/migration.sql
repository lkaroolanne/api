-- CreateTable
CREATE TABLE "ProspectGoogle" (
    "id" SERIAL NOT NULL,
    "placeId" TEXT NOT NULL,
    "nome" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "site" TEXT,
    "googleMapsUri" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "cidade" TEXT,
    "estado" TEXT,
    "palavraChave" TEXT,
    "segmento" TEXT,
    "origem" TEXT DEFAULT 'Google Places',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectGoogle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectGoogle_placeId_key" ON "ProspectGoogle"("placeId");
