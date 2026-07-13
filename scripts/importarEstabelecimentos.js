import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import csv from "csv-parser";
import iconv from "iconv-lite";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PASTA_ESTABELECIMENTOS = path.resolve("data/receita/estabelecimentos");

const CNAES_INTERESSE = {
  "2539001": "Soldagem / serviços industriais",
  "2539002": "Tratamento e revestimento em metais",
  "4663000": "Máquinas e equipamentos industriais",
  "4669999": "Equipamentos industriais diversos",
  "4672900": "Ferragens e ferramentas atacado",
  "4744001": "Ferragens e ferramentas varejo",
  "4684299": "Produtos químicos / gases industriais",
  "2014200": "Gases industriais",
  "4789099": "Produtos técnicos diversos"
};

const HEADERS = [
  "cnpjBasico",
  "cnpjOrdem",
  "cnpjDv",
  "identificadorMatrizFilial",
  "nomeFantasia",
  "situacao",
  "dataSituacao",
  "motivoSituacao",
  "nomeCidadeExterior",
  "pais",
  "dataInicioAtividade",
  "cnaePrincipal",
  "cnaeSecundarios",
  "tipoLogradouro",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "uf",
  "municipioCodigo",
  "ddd1",
  "telefone1",
  "ddd2",
  "telefone2",
  "dddFax",
  "fax",
  "email",
  "situacaoEspecial",
  "dataSituacaoEspecial"
];

function limpar(valor) {
  if (!valor) return null;
  return String(valor).trim().replace(/^"|"$/g, "") || null;
}

function montarCnpj(row) {
  return `${limpar(row.cnpjBasico)}${limpar(row.cnpjOrdem)}${limpar(row.cnpjDv)}`;
}

async function salvarLote(lote) {
  if (!lote.length) return;

  await prisma.receitaProspect.createMany({
    data: lote,
    skipDuplicates: true
  });

  console.log(`✅ Salvos: ${lote.length}`);
}

async function processarZip(caminhoZip) {
  console.log(`📦 Processando: ${caminhoZip}`);

  const directory = await unzipper.Open.file(caminhoZip);

  for (const file of directory.files) {
    if (file.type !== "File") continue;

    let lote = [];

    await new Promise((resolve, reject) => {
      file
        .stream()
        .pipe(iconv.decodeStream("latin1"))
        .pipe(
          csv({
            separator: ";",
            headers: HEADERS
          })
        )
        .on("data", (row) => {
          const cnae = limpar(row.cnaePrincipal);
          const situacao = limpar(row.situacao);

          if (situacao !== "02") return;
          if (!CNAES_INTERESSE[cnae]) return;

          const cnpj = montarCnpj(row);

          lote.push({
            cnpj,
            cnpjBasico: limpar(row.cnpjBasico),
            nomeFantasia: limpar(row.nomeFantasia),
            situacao,
            cnaePrincipal: cnae,
            cnaeSecundarios: limpar(row.cnaeSecundarios),
            tipoLogradouro: limpar(row.tipoLogradouro),
            logradouro: limpar(row.logradouro),
            numero: limpar(row.numero),
            complemento: limpar(row.complemento),
            bairro: limpar(row.bairro),
            cep: limpar(row.cep),
            uf: limpar(row.uf),
            municipioCodigo: limpar(row.municipioCodigo),
            telefone1:
              limpar(row.ddd1) && limpar(row.telefone1)
                ? `${limpar(row.ddd1)}${limpar(row.telefone1)}`
                : null,
            telefone2:
              limpar(row.ddd2) && limpar(row.telefone2)
                ? `${limpar(row.ddd2)}${limpar(row.telefone2)}`
                : null,
            email: limpar(row.email),
            segmento: CNAES_INTERESSE[cnae],
            origem: "Receita Federal"
          });

          if (lote.length >= 1000) {
            const paraSalvar = lote;
            lote = [];
            salvarLote(paraSalvar).catch(console.error);
          }
        })
        .on("end", async () => {
          await salvarLote(lote);
          resolve();
        })
        .on("error", reject);
    });
  }
}

async function main() {
  const arquivos = fs
    .readdirSync(PASTA_ESTABELECIMENTOS)
    .filter((arquivo) => arquivo.toLowerCase().endsWith(".zip"));

  console.log(`🔎 Arquivos encontrados: ${arquivos.length}`);

  for (const arquivo of arquivos) {
    await processarZip(path.join(PASTA_ESTABELECIMENTOS, arquivo));
  }

  console.log("🎉 Importação finalizada.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });