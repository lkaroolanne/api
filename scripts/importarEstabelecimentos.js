import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import csv from "csv-parser";
import iconv from "iconv-lite";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PASTA_ESTABELECIMENTOS = path.resolve("data/receita/estabelecimentos");
const TAMANHO_LOTE = Number(process.env.IMPORT_BATCH_SIZE || 1000);

const CNAES_INTERESSE = {
  "4663000": "Revenda de maquinas, equipamentos e inversoras",
  "4669999": "Revenda de equipamentos industriais para solda",
  "4672900": "Atacado de ferragens e ferramentas",
  "4684299": "Distribuidor de gases e cilindros",
  "4689399": "Distribuidor tecnico de produtos para solda",
  "4744001": "Varejo de ferragens e ferramentas",
  "4759899": "Revenda tecnica de utilidades, maquinas e suprimentos"
};

const TERMOS_ADERENTES = [
  "solda",
  "soldagem",
  "mig",
  "mag",
  "tig",
  "eletrodo",
  "eletrodos",
  "tungstenio",
  "arame",
  "vareta",
  "cilindro",
  "cilindros",
  "regulador",
  "reguladores",
  "valvula",
  "valvulas",
  "macarico",
  "macaricos",
  "inversora",
  "inversoras",
  "retificador",
  "abrasivo",
  "abrasivos",
  "oxicorte",
  "plasma",
  "oxigenio",
  "argonio",
  "acetileno",
  "ferragem",
  "ferragens",
  "ferramenta",
  "ferramentas"
];

const CNAES_AMPLOS_COM_TERMO_OBRIGATORIO = new Set([
  "4663000",
  "4669999",
  "4689399",
  "4759899"
]);

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

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function montarCnpj(row) {
  return `${limpar(row.cnpjBasico)}${limpar(row.cnpjOrdem)}${limpar(row.cnpjDv)}`;
}

function montarTelefone(ddd, telefone) {
  const dddLimpo = limpar(ddd);
  const telefoneLimpo = limpar(telefone);
  return dddLimpo && telefoneLimpo ? `${dddLimpo}${telefoneLimpo}` : null;
}

function temTermoAderente(row) {
  const texto = normalizarTexto([
    row.nomeFantasia,
    row.cnaePrincipal,
    row.cnaeSecundarios,
    row.tipoLogradouro,
    row.logradouro,
    row.bairro,
    row.email
  ].filter(Boolean).join(" "));

  return TERMOS_ADERENTES.some((termo) => texto.includes(termo));
}

function montarProspect(row) {
  const cnae = limpar(row.cnaePrincipal);
  const situacao = limpar(row.situacao);

  if (situacao !== "02") return null;
  if (!CNAES_INTERESSE[cnae]) return null;
  if (CNAES_AMPLOS_COM_TERMO_OBRIGATORIO.has(cnae) && !temTermoAderente(row)) return null;

  return {
    cnpj: montarCnpj(row),
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
    telefone1: montarTelefone(row.ddd1, row.telefone1),
    telefone2: montarTelefone(row.ddd2, row.telefone2),
    email: limpar(row.email)?.toLowerCase() || null,
    segmento: CNAES_INTERESSE[cnae],
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

    await new Promise((resolve, reject) => {
      let parser;

      parser = file
        .stream()
        .pipe(iconv.decodeStream("latin1"))
        .pipe(
          csv({
            separator: ";",
            headers: HEADERS
          })
        )
        .on("data", async (row) => {
          parser.pause();
          lidos += 1;
          const prospect = montarProspect(row);

          if (!prospect) {
            parser.resume();
            return;
          }

          validos += 1;
          lote.push(prospect);

          if (lote.length >= TAMANHO_LOTE) {
            const paraSalvar = lote;
            lote = [];
            inseridos += await salvarLote(paraSalvar);
            console.log(`Lidos: ${lidos} | Aderentes: ${validos} | Inseridos: ${inseridos}`);
          }

          parser.resume();
        })
        .on("end", async () => {
          inseridos += await salvarLote(lote);
          resolve();
        })
        .on("error", reject);
    });
  }

  console.log(`Finalizado ${path.basename(caminhoZip)} | Lidos: ${lidos} | Aderentes: ${validos} | Inseridos: ${inseridos}`);
}

async function main() {
  const arquivos = fs
    .readdirSync(PASTA_ESTABELECIMENTOS)
    .filter((arquivo) => arquivo.toLowerCase().endsWith(".zip"))
    .sort();

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
