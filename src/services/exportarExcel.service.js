import XLSX from "xlsx";

const SITUACOES_RECEITA = {
  "01": "Nula",
  "1": "Nula",
  "02": "Ativa",
  "2": "Ativa",
  "03": "Suspensa",
  "3": "Suspensa",
  "04": "Inapta",
  "4": "Inapta",
  "08": "Baixada",
  "8": "Baixada"
};

function texto(valor) {
  return valor === undefined || valor === null ? "" : String(valor);
}

function normalizarTexto(valor) {
  return texto(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function limparNumeros(valor) {
  return texto(valor).replace(/\D/g, "");
}

function formatarCnpj(valor) {
  const cnpj = limparNumeros(valor);
  if (cnpj.length !== 14) return texto(valor);
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatarEndereco(empresa) {
  return empresa.endereco || [
    empresa.tipoLogradouro,
    empresa.logradouro,
    empresa.numero,
    empresa.complemento
  ].filter(Boolean).join(" ");
}

function situacaoDetalhada(empresa) {
  const valorOriginal = texto(empresa.situacao || empresa.status || empresa.situacaoCadastral).trim();
  const valor = normalizarTexto(valorOriginal);
  const codigo = limparNumeros(valorOriginal);

  if (!valor) return "Nao informada";
  if (SITUACOES_RECEITA[valorOriginal]) return SITUACOES_RECEITA[valorOriginal];
  if (SITUACOES_RECEITA[codigo]) return SITUACOES_RECEITA[codigo];
  if (["ativa", "ativo"].includes(valor)) return "Ativa";

  const problemas = [
    ["baix", "Baixada"],
    ["inativ", "Inativa"],
    ["inapt", "Inapta"],
    ["suspens", "Suspensa"],
    ["nul", "Nula"],
    ["cancel", "Cancelada"],
    ["encerr", "Encerrada"],
    ["irregular", "Irregular"]
  ];
  const problema = problemas.find(([chave]) => valor.includes(chave));

  return problema ? problema[1] : valorOriginal;
}

function situacaoBloqueiaVenda(empresa) {
  const situacao = situacaoDetalhada(empresa);
  return ["Baixada", "Inativa", "Inapta", "Suspensa", "Nula", "Cancelada", "Encerrada", "Irregular"].includes(situacao);
}

function valorSimNao(valor) {
  return valor ? "Sim" : "Nao";
}

export function gerarPlanilhaEmpresas(empresas) {
  const dados = empresas.map((empresa) => ({
    CNPJ: formatarCnpj(empresa.cnpj),
    "CNPJ Somente Numeros": limparNumeros(empresa.cnpj),
    "CNPJ Raiz": empresa.cnpjBasico || limparNumeros(empresa.cnpj).slice(0, 8),
    "Razao Social": empresa.razaoSocial,
    "Nome Fantasia": empresa.nomeFantasia,
    Situacao: situacaoDetalhada(empresa),
    "Situacao Original": empresa.situacao || empresa.status || empresa.situacaoCadastral,
    "Bloqueia Venda": valorSimNao(situacaoBloqueiaVenda(empresa)),
    Porte: empresa.porte || empresa.porteEmpresa,
    "Natureza Juridica": empresa.naturezaJuridica,
    "Qualificacao Responsavel": empresa.qualificacaoResponsavel,
    "Capital Social": empresa.capitalSocial,
    "Ente Federativo": empresa.enteFederativo,
    CNAE: empresa.cnaePrincipal,
    "CNAEs Secundarios": empresa.cnaeSecundarios,
    "Descricao CNAE": empresa.cnaeDescricao,
    Segmento: empresa.segmento,
    Telefone: empresa.telefone || empresa.telefone1,
    "Telefone 2": empresa.telefone2,
    Email: empresa.email,
    Site: empresa.site,
    CEP: empresa.cep,
    Endereco: formatarEndereco(empresa),
    "Tipo Logradouro": empresa.tipoLogradouro,
    Logradouro: empresa.logradouro,
    Numero: empresa.numero,
    Complemento: empresa.complemento,
    Bairro: empresa.bairro,
    Cidade: empresa.cidade || empresa.municipioCodigo,
    "Codigo Municipio": empresa.municipioCodigo,
    Estado: empresa.estado || empresa.uf,
    UF: empresa.uf || empresa.estado,
    Latitude: empresa.latitude,
    Longitude: empresa.longitude,
    "Aderencia Solda": empresa.aderenciaSolda,
    Tags: Array.isArray(empresa.tags) ? empresa.tags.join(", ") : empresa.tags,
    Score: empresa.score,
    "Acao Sugerida": empresa.acaoSugerida,
    "Na Base Vortech": valorSimNao(Boolean(empresa.baseVortechMatch)),
    "Grupo Base Vortech": empresa.baseVortechMatch?.grupo || empresa.baseVortechMatch?.tipoCliente || empresa.baseVortechMatch?.tipo,
    "Razao Base Vortech": empresa.baseVortechMatch?.razaoSocial,
    Origem: empresa.origem,
    Observacao: empresa.observacao,
    "Criado Em": empresa.criadoEm,
    "Atualizado Em": empresa.atualizadoEm
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Prospects");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
}
