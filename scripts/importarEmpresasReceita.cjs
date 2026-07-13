const fs = require("fs");
const path = require("path");
const readline = require("readline");
const unzipper = require("unzipper");
const iconv = require("iconv-lite");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PASTA_EMPRESAS = path.join(__dirname, "..", "data", "empresas");
const TAMANHO_LOTE = Number(process.env.IMPORT_EMPRESAS_BATCH_SIZE || 100);
const CONCORRENCIA = Number(process.env.IMPORT_EMPRESAS_CONCURRENCY || 4);

function limpar(valor) {
  if (!valor) return null;
  return String(valor).replace(/^"|"$/g, "").trim() || null;
}

function separarLinhaCSV(linha) {
  const resultado = [];
  let atual = "";
  let dentroAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i];

    if (char === '"') {
      dentroAspas = !dentroAspas;
    } else if (char === ";" && !dentroAspas) {
      resultado.push(atual);
      atual = "";
    } else {
      atual += char;
    }
  }

  resultado.push(atual);
  return resultado;
}

async function executarAtualizacoes(lote) {
  let proximo = 0;
  let registrosAfetados = 0;

  async function trabalhador() {
    while (proximo < lote.length) {
      const item = lote[proximo];
      proximo += 1;

      const resultado = await prisma.receitaProspect.updateMany({
        where: { cnpjBasico: item.cnpjBasico },
        data: item.data,
      });

      registrosAfetados += resultado.count;
    }
  }

  const trabalhadores = Array.from(
    { length: Math.min(CONCORRENCIA, lote.length) },
    () => trabalhador()
  );

  await Promise.all(trabalhadores);
  return registrosAfetados;
}

async function importarArquivoZip(caminhoZip, cnpjsBasicosExistentes) {
  console.log(`\nLendo arquivo: ${path.basename(caminhoZip)}`);

  const directory = await unzipper.Open.file(caminhoZip);

  for (const file of directory.files) {
    if (file.type !== "File") continue;

    const stream = file.stream().pipe(iconv.decodeStream("latin1"));
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let total = 0;
    let cnpjsBasicosAtualizados = 0;
    let registrosAfetados = 0;
    let lote = [];

    for await (const linha of rl) {
      total += 1;

      const colunas = separarLinhaCSV(linha);
      const cnpjBasico = limpar(colunas[0]);

      if (!cnpjBasico || !cnpjsBasicosExistentes.has(cnpjBasico)) {
        continue;
      }

      lote.push({
        cnpjBasico,
        data: {
          razaoSocial: limpar(colunas[1]),
          naturezaJuridica: limpar(colunas[2]),
          qualificacaoResponsavel: limpar(colunas[3]),
          capitalSocial: limpar(colunas[4]),
          porteEmpresa: limpar(colunas[5]),
          enteFederativo: limpar(colunas[6]),
        },
      });

      cnpjsBasicosAtualizados += 1;

      if (lote.length >= TAMANHO_LOTE) {
        registrosAfetados += await executarAtualizacoes(lote);
        lote = [];
        console.log(
          `Processados: ${total} | CNPJs basicos: ${cnpjsBasicosAtualizados} | Registros afetados: ${registrosAfetados}`
        );
      }
    }

    if (lote.length > 0) {
      registrosAfetados += await executarAtualizacoes(lote);
    }

    console.log(`Finalizado ${file.path}`);
    console.log(`Total lido: ${total}`);
    console.log(`CNPJs basicos atualizados: ${cnpjsBasicosAtualizados}`);
    console.log(`Registros afetados: ${registrosAfetados}`);
  }
}

async function main() {
  console.log("Buscando CNPJs basicos ja importados em ReceitaProspect...");

  const registros = await prisma.receitaProspect.findMany({
    select: { cnpjBasico: true },
    distinct: ["cnpjBasico"],
  });

  const cnpjsBasicosExistentes = new Set(
    registros.map((r) => r.cnpjBasico).filter(Boolean)
  );

  console.log(`CNPJs basicos encontrados: ${cnpjsBasicosExistentes.size}`);

  const arquivos = fs
    .readdirSync(PASTA_EMPRESAS)
    .filter((arquivo) => arquivo.toLowerCase().endsWith(".zip"))
    .sort();

  console.log("Arquivos encontrados:");
  console.log(arquivos);

  for (const arquivo of arquivos) {
    await importarArquivoZip(path.join(PASTA_EMPRESAS, arquivo), cnpjsBasicosExistentes);
  }

  console.log("\nImportacao das Empresas finalizada com sucesso!");
}

main()
  .catch((error) => {
    console.error("Erro ao importar Empresas:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
