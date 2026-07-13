const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PALAVRAS = [
  "solda", "soldagem", "mig", "tig", "eletrodo", "eletrodos",
  "arame mig", "vareta tig", "abrasivos", "ferramentas",
  "gases", "gases industriais", "oxigenio", "oxigênio",
  "argonio", "argônio", "acetileno", "co2",
  "cilindro", "cilindros", "recarga", "enchimento",
  "aluguel de cilindro", "locação de cilindro",
  "maquina de solda", "máquina de solda",
  "maquinas de solda", "máquinas de solda",
  "equipamentos de solda", "equipamentos para soldagem",
  "caldeiraria", "serralheria", "usinagem", "metalurgica", "metalúrgica"
];

function temPalavra(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  return PALAVRAS.some(p => t.includes(p));
}

async function main() {
  console.log("Buscando leads filtrados da Vortech...");

  const dados = await prisma.receitaProspect.findMany({
    where: {
      OR: [
        { razaoSocial: { contains: "solda", mode: "insensitive" } },
        { nomeFantasia: { contains: "solda", mode: "insensitive" } },
        { segmento: { contains: "solda", mode: "insensitive" } },
        { segmento: { contains: "gases", mode: "insensitive" } },
        { segmento: { contains: "ferramentas", mode: "insensitive" } },
        { segmento: { contains: "cilindro", mode: "insensitive" } },
        { segmento: { contains: "máquina", mode: "insensitive" } }
      ]
    }
  });

  const filtrados = dados.filter((e) => {
    const texto = [
      e.razaoSocial,
      e.nomeFantasia,
      e.segmento,
      e.cnaePrincipal,
      e.cnaeSecundarios
    ].join(" ");

    return temPalavra(texto);
  });

  console.log(`Leads encontrados: ${filtrados.length}`);

  const linhas = filtrados.map((e) => ({
    CNPJ: e.cnpj,
    "Razão Social": e.razaoSocial,
    "Nome Fantasia": e.nomeFantasia,
    Situação: e.situacao,
    Porte: e.porteEmpresa,
    "Capital Social": e.capitalSocial,
    "CNAE Principal": e.cnaePrincipal,
    "CNAEs Secundários": e.cnaeSecundarios,
    Segmento: e.segmento,
    UF: e.uf,
    "Código Município": e.municipioCodigo,
    CEP: e.cep,
    Endereço: `${e.tipoLogradouro || ""} ${e.logradouro || ""}, ${e.numero || ""}`.trim(),
    Bairro: e.bairro,
    Telefone1: e.telefone1,
    Telefone2: e.telefone2,
    Email: e.email,
    Origem: e.origem
  }));

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Base Vortech Solda");

  XLSX.writeFile(wb, "../Base_Vortech_Solda.xlsx");

  console.log("Planilha gerada: Base_Vortech_Solda.xlsx");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });