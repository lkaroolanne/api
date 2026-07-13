const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ARQUIVO_PADRAO = path.join(__dirname, "..", "Base_Vortech_Solda.xlsx");
const TAMANHO_LOTE = Number(process.env.IMPORT_BATCH_SIZE || 1000);

function texto(valor) {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).trim();
  return limpo || null;
}

function numeros(valor) {
  return texto(valor)?.replace(/\D/g, "") || null;
}

function cnpjBasico(cnpj) {
  const limpo = numeros(cnpj);
  return limpo?.slice(0, 8) || null;
}

function mapearLinha(linha) {
  const cnpj = numeros(linha.CNPJ);

  if (!cnpj || cnpj.length !== 14) {
    return null;
  }

  return {
    cnpj,
    cnpjBasico: cnpjBasico(cnpj),
    razaoSocial: texto(linha["Razão Social"] || linha["Razao Social"]),
    nomeFantasia: texto(linha["Nome Fantasia"]),
    situacao: texto(linha["Situação"] || linha.Situacao),
    porteEmpresa: texto(linha.Porte),
    capitalSocial: texto(linha["Capital Social"]),
    cnaePrincipal: numeros(linha["CNAE Principal"] || linha.CNAE),
    cnaeSecundarios: texto(linha["CNAEs Secundários"] || linha["CNAEs Secundarios"]),
    segmento: texto(linha.Segmento),
    uf: texto(linha.UF),
    municipioCodigo: texto(linha["Código Município"] || linha["Codigo Municipio"]),
    cep: numeros(linha.CEP),
    logradouro: texto(linha["Endereço"] || linha.Endereco),
    bairro: texto(linha.Bairro),
    telefone1: numeros(linha.Telefone1),
    telefone2: numeros(linha.Telefone2),
    email: texto(linha.Email)?.toLowerCase() || null,
    origem: texto(linha.Origem) || "Receita Federal"
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

async function main() {
  const arquivo = process.argv[2] ? path.resolve(process.argv[2]) : ARQUIVO_PADRAO;
  console.log(`Lendo planilha: ${arquivo}`);

  const workbook = XLSX.readFile(arquivo);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  console.log(`Linhas encontradas: ${linhas.length}`);

  let lote = [];
  let lidos = 0;
  let validos = 0;
  let inseridos = 0;

  for (const linha of linhas) {
    lidos += 1;
    const prospect = mapearLinha(linha);

    if (!prospect) continue;

    validos += 1;
    lote.push(prospect);

    if (lote.length >= TAMANHO_LOTE) {
      inseridos += await salvarLote(lote);
      lote = [];
      console.log(`Lidos: ${lidos} | Validos: ${validos} | Inseridos: ${inseridos}`);
    }
  }

  inseridos += await salvarLote(lote);

  console.log("Importacao finalizada.");
  console.log(`Lidos: ${lidos}`);
  console.log(`Validos: ${validos}`);
  console.log(`Inseridos novos: ${inseridos}`);
}

main()
  .catch((error) => {
    console.error("Erro ao importar planilha:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
