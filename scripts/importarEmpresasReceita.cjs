const fs = require("fs");
const path = require("path");
const readline = require("readline");
const unzipper = require("unzipper");
const iconv = require("iconv-lite");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PASTA_EMPRESAS = path.join(__dirname, "..", "data", "empresas");

function limpar(valor) {
  if (!valor) return null;
  return valor.replace(/^"|"$/g, "").trim() || null;
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
    let atualizados = 0;
    let promessas = [];

    for await (const linha of rl) {
      total++;

      const colunas = separarLinhaCSV(linha);

      const cnpjBasico = limpar(colunas[0]);
      const razaoSocial = limpar(colunas[1]);
      const naturezaJuridica = limpar(colunas[2]);
      const qualificacaoResponsavel = limpar(colunas[3]);
      const capitalSocial = limpar(colunas[4]);
      const porteEmpresa = limpar(colunas[5]);
      const enteFederativo = limpar(colunas[6]);

      if (!cnpjBasico) continue;
      if (!cnpjsBasicosExistentes.has(cnpjBasico)) continue;

      promessas.push(
        prisma.receitaProspect.updateMany({
          where: { cnpjBasico },
          data: {
            razaoSocial,
            naturezaJuridica,
            qualificacaoResponsavel,
            capitalSocial,
            porteEmpresa,
            enteFederativo,
          },
        })
      );

      atualizados++;

      if (promessas.length >= 500) {
        await Promise.all(promessas);
        promessas = [];
        console.log(`Processados: ${total} | Atualizados: ${atualizados}`);
      }
    }

    if (promessas.length > 0) {
      await Promise.all(promessas);
    }

    console.log(`Finalizado ${file.path}`);
    console.log(`Total lido: ${total}`);
    console.log(`Total atualizado: ${atualizados}`);
  }
}

async function main() {
  console.log("Buscando CNPJs básicos já importados em ReceitaProspect...");

  const registros = await prisma.receitaProspect.findMany({
    select: { cnpjBasico: true },
    distinct: ["cnpjBasico"],
  });

  const cnpjsBasicosExistentes = new Set(
    registros.map((r) => r.cnpjBasico).filter(Boolean)
  );

  console.log(`CNPJs básicos encontrados: ${cnpjsBasicosExistentes.size}`);

  const arquivos = fs
    .readdirSync(PASTA_EMPRESAS)
    .filter((arquivo) => arquivo.toLowerCase().endsWith(".zip"))
    .sort();

  console.log("Arquivos encontrados:");
  console.log(arquivos);

  for (const arquivo of arquivos) {
    const caminhoZip = path.join(PASTA_EMPRESAS, arquivo);
    await importarArquivoZip(caminhoZip, cnpjsBasicosExistentes);
  }

  console.log("\nImportação das Empresas finalizada com sucesso!");
}

main()
  .catch((erro) => {
    console.error("Erro ao importar Empresas:", erro);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });