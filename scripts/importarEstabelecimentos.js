import "dotenv/config";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import csv from "csv-parser";
import iconv from "iconv-lite";
import { PrismaClient } from "@prisma/client";
import { normalizarTelefone, normalizarEmail, selecionarSegmento } from "../src/services/qualidadeProspect.js";

const prisma = new PrismaClient();

const PASTA_ESTABELECIMENTOS = path.resolve("data/receita/estabelecimentos");
const TAMANHO_LOTE = Number(process.env.IMPORT_BATCH_SIZE || 1000);

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
  const partes = [limpar(row.cnpjBasico), limpar(row.cnpjOrdem), limpar(row.cnpjDv)];
  if (!/^\d{8}$/.test(partes[0] || "") || !/^\d{4}$/.test(partes[1] || "") || !/^\d{2}$/.test(partes[2] || "")) return null;
  const cnpj = partes.join("");
  return /^(\d)\1+$/.test(cnpj) ? null : cnpj;
}

function montarTelefone(ddd, telefone) {
  return normalizarTelefone(`${limpar(ddd) || ""}${limpar(telefone) || ""}`);
}

function montarProspect(row) {
  const cnae = limpar(row.cnaePrincipal);
  const situacao = limpar(row.situacao);

  if (situacao !== "02") return null;
  const segmento = selecionarSegmento(row);
  const cnpj = montarCnpj(row);
  if (!segmento || !cnpj) return null;
  const primeiro = montarTelefone(row.ddd1, row.telefone1);
  const segundo = montarTelefone(row.ddd2, row.telefone2);
  const telefones = [...new Set([primeiro, segundo].filter(Boolean))];

  return {
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
    telefone1: telefones[0] || null,
    telefone2: telefones[1] || null,
    email: normalizarEmail(row.email),
    segmento,
    origem: "Receita Federal"
  };
}

async function salvarLote(lote) {
  if (!lote.length) return 0;

  const resultado = await prisma.receitaProspect.createMany({
    data: lote,
    skipDuplicates: true
  });

  return resultado.count;
}

async function processarZip(caminhoZip) {
  console.log(`Processando: ${path.basename(caminhoZip)}`);

  const directory = await unzipper.Open.file(caminhoZip);
  let lidos = 0;
  let validos = 0;
  let inseridos = 0;

  for (const file of directory.files) {
    if (file.type !== "File") continue;

    let lote = [];

    const origem = file.stream();
    const decoder = iconv.decodeStream("latin1");
    const parser = csv({ separator: ";", headers: HEADERS, strict: true });
    origem.on("error", (error) => parser.destroy(error));
    decoder.on("error", (error) => parser.destroy(error));
    parser.on("close", () => { origem.destroy(); decoder.destroy(); });
    origem.pipe(decoder).pipe(parser);
    for await (const row of parser) {
      lidos += 1;
      const prospect = montarProspect(row);
      if (!prospect) continue;
      validos += 1;
      lote.push(prospect);
      if (lote.length >= TAMANHO_LOTE) {
        inseridos += await salvarLote(lote);
        lote = [];
        console.log(`Lidos: ${lidos} | Aderentes: ${validos} | Inseridos: ${inseridos}`);
      }
    }
    inseridos += await salvarLote(lote);
  }

  console.log(`Finalizado ${path.basename(caminhoZip)} | Lidos: ${lidos} | Aderentes: ${validos} | Inseridos: ${inseridos}`);
}

async function main() {
  if (!Number.isInteger(TAMANHO_LOTE) || TAMANHO_LOTE < 1) throw new Error("IMPORT_BATCH_SIZE deve ser um inteiro positivo.");
  if (!fs.existsSync(PASTA_ESTABELECIMENTOS)) throw new Error(`Coloque os ZIPs de Estabelecimentos da Receita Federal em ${PASTA_ESTABELECIMENTOS}`);
  const arquivos = fs
    .readdirSync(PASTA_ESTABELECIMENTOS)
    .filter((arquivo) => /^Estabelecimentos\d+\.zip$/i.test(arquivo))
    .sort();

  if (!arquivos.length) throw new Error("Nenhum ZIP de Estabelecimentos encontrado.");
  console.log(`Arquivos de estabelecimentos encontrados: ${arquivos.length}`);

  for (const arquivo of arquivos) {
    await processarZip(path.join(PASTA_ESTABELECIMENTOS, arquivo));
  }

  console.log("Importacao de estabelecimentos finalizada.");
}

main()
  .catch((error) => {
    console.error("Erro ao importar estabelecimentos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
