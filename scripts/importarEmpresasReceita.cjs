const fs = require("fs");
const path = require("path");
const readline = require("readline");
const unzipper = require("unzipper");
const iconv = require("iconv-lite");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PASTA_EMPRESAS = path.join(__dirname, "..", "data", "empresas");
const TAMANHO_LOTE = Number(process.env.IMPORT_EMPRESAS_BATCH_SIZE || 1000);

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
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
        continue;
      }
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
  if (!lote.length) return 0;
  // Um UPDATE por lote, com parâmetros vinculados, evita uma viagem de rede por CNPJ.
  const dados = JSON.stringify(lote.map(({ cnpjBasico, data }) => ({ cnpjBasico, ...data })));
  return prisma.$executeRaw`
    UPDATE "ReceitaProspect" AS destino SET
      "razaoSocial" = origem."razaoSocial",
      "naturezaJuridica" = origem."naturezaJuridica",
      "qualificacaoResponsavel" = origem."qualificacaoResponsavel",
      "capitalSocial" = origem."capitalSocial",
      "porteEmpresa" = origem."porteEmpresa",
      "enteFederativo" = origem."enteFederativo",
      "atualizadoEm" = CURRENT_TIMESTAMP
    FROM jsonb_to_recordset(${dados}::jsonb) AS origem(
      "cnpjBasico" text, "razaoSocial" text, "naturezaJuridica" text,
      "qualificacaoResponsavel" text, "capitalSocial" text,
      "porteEmpresa" text, "enteFederativo" text
    )
    WHERE destino."cnpjBasico" = origem."cnpjBasico"
  `;
}

async function importarArquivo(caminhoZip, cnpjsBasicosExistentes) {
  console.log(`\nLendo arquivo: ${path.basename(caminhoZip)}`);

  const compactado = caminhoZip.toLowerCase().endsWith(".zip");
  const arquivos = compactado
    ? (await unzipper.Open.file(caminhoZip)).files
    : [{ type: "File", path: caminhoZip, stream: () => fs.createReadStream(caminhoZip) }];

  for (const file of arquivos) {
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

      // A maioria das empresas não pertence à seleção comercial importada.
      const cnpjBasico = linha.match(/^"?(\d{8})"?;/)?.[1];
      if (!cnpjBasico || !cnpjsBasicosExistentes.has(cnpjBasico)) {
        continue;
      }
      const colunas = separarLinhaCSV(linha);

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

function listarArquivosEmpresas(pasta) {
  const entradas = fs.readdirSync(pasta, { withFileTypes: true });
  const arquivos = [];
  for (const entrada of entradas) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...listarArquivosEmpresas(caminho));
    else if (/\.(zip|EMPRECSV)$/i.test(entrada.name)) arquivos.push(caminho);
  }
  return arquivos.sort();
}

async function main() {
  if (!Number.isInteger(TAMANHO_LOTE) || TAMANHO_LOTE < 1) {
    throw new Error("IMPORT_EMPRESAS_BATCH_SIZE deve ser um inteiro positivo.");
  }
  console.log("Buscando CNPJs basicos ja importados em ReceitaProspect...");

  const registros = await prisma.receitaProspect.findMany({
    select: { cnpjBasico: true },
    distinct: ["cnpjBasico"],
  });

  const cnpjsBasicosExistentes = new Set(
    registros.map((r) => r.cnpjBasico).filter(Boolean)
  );

  console.log(`CNPJs basicos encontrados: ${cnpjsBasicosExistentes.size}`);

  if (!cnpjsBasicosExistentes.size) {
    throw new Error("Importe primeiro os Estabelecimentos: nao ha CNPJs para completar com os dados de Empresas.");
  }
  const arquivos = listarArquivosEmpresas(PASTA_EMPRESAS);
  if (!arquivos.length) throw new Error("Nenhum ZIP ou arquivo EMPRECSV encontrado em data/empresas.");

  console.log("Arquivos encontrados:");
  console.log(arquivos);

  for (const arquivo of arquivos) {
    await importarArquivo(arquivo, cnpjsBasicosExistentes);
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
