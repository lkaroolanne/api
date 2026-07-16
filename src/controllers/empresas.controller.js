import { prisma } from "../prisma/client.js";
import { buscarCnpjBrasilApi, obterStatusCnpja } from "../services/cnpj.service.js";
import { gerarPlanilhaEmpresas } from "../services/exportarExcel.service.js";
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const CNAES_SOLDAGEM_REVENDA = new Set([
  "4663000",
  "4669999",
  "4672900",
  "4684299",
  "4689399",
  "4744001",
  "4759899"
]);

const LOTE_EXPORTACAO_CNAE = 10000;

const TERMOS_FORTES_SOLDA = [
  "solda",
  "soldagem",
  "soldador",
  "soldadores",
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
  "gas",
  "gases",
  "oxigenio",
  "argonio",
  "acetileno",
  "co2",
  "macarico",
  "macaricos",
  "valvula",
  "valvulas",
  "regulador",
  "reguladores",
  "inversora",
  "inversoras",
  "retificador",
  "retificadores",
  "tocha",
  "tochas",
  "abrasivo",
  "abrasivos",
  "oxicorte",
  "plasma",
  "ferragem",
  "ferragens",
  "ferramenta",
  "ferramentas",
  "epi",
  "mascara",
  "mascaras"
];

const TERMOS_REVENDA = [
  "revenda",
  "revendedor",
  "distribuidor",
  "distribuidora",
  "comercio",
  "comercial",
  "loja",
  "ferragens",
  "ferramentas",
  "suprimentos",
  "equipamentos"
];

const TERMOS_RUIDO = [
  "moda",
  "beleza",
  "estetica",
  "estetico",
  "salao",
  "cabelo",
  "barbearia",
  "cosmetico",
  "cosmeticos",
  "maquiagem",
  "perfumaria",
  "boutique",
  "confeccao",
  "vestuario",
  "roupa",
  "roupas",
  "calcado",
  "calcados",
  "bijuteria",
  "lingerie",
  "manicure",
  "esmalteria",
  "spa"
];

function lerLimiteEnv(chave, padrao) {
  const valor = Number(process.env[chave]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

const LIMITE_BUSCA_TERMO = lerLimiteEnv("LIMITE_BUSCA_TERMO", 1500);
const LIMITE_CNAE_TELA = lerLimiteEnv("LIMITE_CNAE_TELA", 10000);
const LIMITE_MAXIMO_TELA = lerLimiteEnv("LIMITE_MAXIMO_TELA", 10000);
const ARQUIVO_BASE_VORTECH = path.resolve(process.cwd(), "data", "base-vortech.xlsx");
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
let cacheBaseVortech = {
  mtimeMs: 0,
  registros: []
};

const CAMPOS_LISTA_PROSPECTS = {
  cnpj: true,
  cnpjBasico: true,
  razaoSocial: true,
  nomeFantasia: true,
  situacao: true,
  porteEmpresa: true,
  naturezaJuridica: true,
  capitalSocial: true,
  cnaePrincipal: true,
  cnaeSecundarios: true,
  tipoLogradouro: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cep: true,
  uf: true,
  municipioCodigo: true,
  telefone1: true,
  telefone2: true,
  email: true,
  segmento: true
};

function normalizarTermoBusca(valor) {
  return String(valor || "").trim();
}

function limparNumerosBase(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function raizCnpjBase(valor) {
  const limpo = limparNumerosBase(valor);
  return limpo.length >= 8 ? limpo.slice(0, 8) : "";
}

function normalizarCabecalhoBase(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function escolherCampoBase(linha, nomes) {
  const mapa = new Map(
    Object.entries(linha).map(([chave, valor]) => [normalizarCabecalhoBase(chave), valor])
  );

  for (const nome of nomes) {
    const valor = mapa.get(normalizarCabecalhoBase(nome));
    if (valor !== undefined && valor !== null && String(valor).trim()) {
      return String(valor).trim();
    }
  }

  return "";
}

function lerBaseVortechArquivo() {
  const stat = fs.statSync(ARQUIVO_BASE_VORTECH);

  if (cacheBaseVortech.mtimeMs === stat.mtimeMs && cacheBaseVortech.registros.length) {
    return cacheBaseVortech.registros;
  }

  const workbook = xlsx.readFile(ARQUIVO_BASE_VORTECH, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  cacheBaseVortech = {
    mtimeMs: stat.mtimeMs,
    registros: mapearLinhasBaseVortech(linhas)
  };

  return cacheBaseVortech.registros;

  const registros = new Map();

  for (const linha of linhas) {
    const cnpj = limparNumerosBase(escolherCampoBase(linha, ["CNPJ", "cnpj"]));
    const razaoSocial = escolherCampoBase(linha, [
      "RAZAO_SOCIAL",
      "RAZAO SOCIAL",
      "RAZÃO SOCIAL",
      "Razao Social",
      "Nome",
      "Cliente"
    ]);
    const tipoCliente = escolherCampoBase(linha, ["TIPO_CLIENTE", "TIPO CLIENTE", "Tipo"]);

    if (!cnpj && !razaoSocial) continue;

    registros.set(cnpj || normalizarCabecalhoBase(razaoSocial), {
      cnpj,
      razaoSocial,
      tipoCliente
    });
  }

  cacheBaseVortech = {
    mtimeMs: stat.mtimeMs,
    registros: Array.from(registros.values())
  };

  return cacheBaseVortech.registros;
}

function mapearLinhasBaseVortech(linhas) {
  const registros = new Map();

  for (const linha of linhas) {
    const cnpj = limparNumerosBase(escolherCampoBase(linha, ["CNPJ", "cnpj", "CPF/CNPJ", "Documento"]));
    const razaoSocial = escolherCampoBase(linha, [
      "RAZAO_SOCIAL",
      "RAZAO SOCIAL",
      "RAZÃƒO SOCIAL",
      "Razao Social",
      "Razão Social",
      "Nome",
      "Cliente",
      "Nome Cliente",
      "Razao",
      "Empresa"
    ]);
    const tipoCliente = escolherCampoBase(linha, [
      "TIPO_CLIENTE",
      "TIPO CLIENTE",
      "Tipo",
      "Classificacao",
      "Classificação",
      "Categoria"
    ]);
    const grupo = escolherCampoBase(linha, [
      "GRUPO",
      "Grupo",
      "Grupo Cliente",
      "Grupo Economico",
      "Grupo Econômico",
      "Grupo de Cliente",
      "Grupo de Empresas",
      "Grupo Empresarial",
      "CNPJ Raiz",
      "Raiz CNPJ",
      "Raiz",
      "Matriz",
      "Rede",
      "Holding",
      "Segmento"
    ]);

    if (!cnpj && !razaoSocial) continue;
    const cnpjRaiz = raizCnpjBase(cnpj);

    registros.set(cnpj || normalizarCabecalhoBase(razaoSocial), {
      cnpj,
      cnpjRaiz,
      razaoSocial,
      tipoCliente,
      grupo: grupo || cnpjRaiz
    });
  }

  return Array.from(registros.values());
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokensTexto(valor) {
  return normalizarTexto(valor).match(/[a-z0-9]+/g) || [];
}

function normalizarRazaoBase(valor) {
  return normalizarTexto(valor)
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(ltda|limitada|me|epp|eireli|sa|s a|comercio|comercial|industria|servicos|servico|matriz|filial)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensRazaoBase(valor) {
  return normalizarRazaoBase(valor)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function montarIndiceClientesBase(registros = []) {
  const cnpjs = new Set();
  const raizes = new Set();
  const nomes = new Set();

  for (const item of registros) {
    const cnpj = limparNumerosBase(item.cnpj);
    const raiz = raizCnpjBase(item.cnpjRaiz) || raizCnpjBase(cnpj);
    const nome = normalizarRazaoBase(item.razaoSocial || item.nome || item.nomeFantasia);

    if (cnpj) cnpjs.add(cnpj);
    if (raiz) raizes.add(raiz);
    if (nome) {
      nomes.add(nome);
    }
  }

  return { cnpjs, raizes, nomes };
}

function existeNaBaseCliente(empresa, indice) {
  const cnpj = limparNumerosBase(empresa?.cnpj);
  const raiz = raizCnpjBase(cnpj);
  const nomeLead = normalizarRazaoBase(empresa?.razaoSocial || empresa?.nomeFantasia);

  if (cnpj && indice.cnpjs.has(cnpj)) return true;
  if (raiz && indice.raizes.has(raiz)) return true;
  if (nomeLead && indice.nomes.has(nomeLead)) return true;

  return false;
}

function foiConferidaNaApiCnpj(empresa) {
  const origem = normalizarTexto([
    empresa?.origem,
    empresa?.situacaoFonte
  ].filter(Boolean).join(" "));

  return Boolean(empresa?.cnpjaConferido) || origem.includes("cnpja");
}

async function completarEmpresasParaExportacao(empresas = []) {
  const cnpjs = empresas
    .map((empresa) => limparNumerosBase(empresa?.cnpj))
    .filter(Boolean);

  if (!cnpjs.length) return empresas;

  const registrosCompletos = await prisma.receitaProspect.findMany({
    where: {
      cnpj: {
        in: cnpjs
      }
    }
  });
  const porCnpj = new Map(registrosCompletos.map((empresa) => [limparNumerosBase(empresa.cnpj), empresa]));

  return empresas.map((empresa) => {
    const cnpj = limparNumerosBase(empresa?.cnpj);
    return {
      ...(porCnpj.get(cnpj) || {}),
      ...empresa
    };
  });
}

function situacaoBloqueiaVenda(empresa) {
  const valorOriginal = String(empresa?.situacao || empresa?.status || empresa?.situacaoCadastral || "").trim();
  const valor = normalizarTexto(valorOriginal);
  const codigo = limparNumerosBase(valorOriginal);

  if (!valor) return false;
  if (SITUACOES_RECEITA[valorOriginal] === "Ativa" || SITUACOES_RECEITA[codigo] === "Ativa") return false;
  if (SITUACOES_RECEITA[valorOriginal] || SITUACOES_RECEITA[codigo]) return true;
  if (["ativa", "ativo"].includes(valor)) return false;
  if (/baix|inativ|inapt|suspens|nul|cancel|encerr|irregular/.test(valor)) return true;

  return /^\d+$/.test(codigo) && codigo !== "02" && codigo !== "2";
}

function textoEmpresa(empresa) {
  return [
    empresa.razaoSocial,
    empresa.nomeFantasia,
    empresa.segmento,
    empresa.cnaePrincipal,
    empresa.cnaeSecundarios,
    empresa.tipoLogradouro,
    empresa.logradouro,
    empresa.bairro,
    empresa.email
  ].filter(Boolean).join(" ");
}

function contemTokenOuFrase(texto, termo) {
  const termoNormalizado = normalizarTexto(termo);
  const tokensTermo = tokensTexto(termoNormalizado);
  const tokensBase = new Set(tokensTexto(texto));
  const textoNormalizado = ` ${normalizarTexto(texto)} `;

  if (!tokensTermo.length) {
    return false;
  }

  if (tokensTermo.length === 1) {
    return tokensBase.has(tokensTermo[0]);
  }

  return tokensTermo.every((token) => tokensBase.has(token)) ||
    textoNormalizado.includes(` ${tokensTermo.join(" ")} `);
}

function calcularAderenciaSolda(empresa, termo) {
  const texto = textoEmpresa(empresa);
  const tokens = new Set(tokensTexto(texto));
  const cnaePrincipal = String(empresa.cnaePrincipal || "");
  const cnaeSecundarios = String(empresa.cnaeSecundarios || "");
  let score = 0;

  if (CNAES_SOLDAGEM_REVENDA.has(cnaePrincipal)) {
    score += 4;
  }

  for (const cnae of CNAES_SOLDAGEM_REVENDA) {
    if (cnaeSecundarios.includes(cnae)) {
      score += 2;
      break;
    }
  }

  if (termo && contemTokenOuFrase(texto, termo)) {
    score += 3;
  }

  for (const palavra of TERMOS_FORTES_SOLDA) {
    if (tokens.has(palavra)) {
      score += 1;
    }
  }

  for (const palavra of TERMOS_REVENDA) {
    if (tokens.has(palavra)) {
      score += 1;
    }
  }

  return score;
}

function ehRuidoComercial(empresa) {
  const tokens = new Set(tokensTexto(textoEmpresa(empresa)));
  return TERMOS_RUIDO.some((termo) => tokens.has(termo));
}

function filtrarEmpresasAderentes(empresas, termo) {
  return empresas
    .map((empresa) => ({
      ...empresa,
      aderenciaSolda: calcularAderenciaSolda(empresa, termo)
    }))
    .filter((empresa) => empresa.aderenciaSolda >= 5 && !(ehRuidoComercial(empresa) && empresa.aderenciaSolda < 7))
    .sort((a, b) => b.aderenciaSolda - a.aderenciaSolda || String(a.nomeFantasia || "").localeCompare(String(b.nomeFantasia || "")));
}

function montarFiltroBusca(termo) {
  const termoLimpo = normalizarTermoBusca(termo);
  const numeros = termoLimpo.replace(/\D/g, "");

  if (numeros && numeros.length >= 4 && numeros.length === termoLimpo.replace(/\D/g, "").length) {
    return {
      termo: numeros,
      where: {
        OR: [
          { cnaePrincipal: { contains: numeros } },
          { cnaeSecundarios: { contains: numeros } },
          { cnpj: { contains: numeros } }
        ]
      }
    };
  }

  return {
    termo: termoLimpo,
    where: {
      OR: [
        { razaoSocial: { contains: termoLimpo, mode: "insensitive" } },
        { nomeFantasia: { contains: termoLimpo, mode: "insensitive" } },
        { cnaeDescricao: { contains: termoLimpo, mode: "insensitive" } },
        { segmento: { contains: termoLimpo, mode: "insensitive" } },
        { cnaeSecundarios: { contains: termoLimpo, mode: "insensitive" } },
        { logradouro: { contains: termoLimpo, mode: "insensitive" } },
        { bairro: { contains: termoLimpo, mode: "insensitive" } },
        { email: { contains: termoLimpo, mode: "insensitive" } }
      ]
    }
  };
}

export async function buscarSalvarEmpresaPorCnpj(req, res) {
  try {
    const { cnpj } = req.params;

    const dados = await buscarCnpjBrasilApi(cnpj);
    const empresaData = dados.empresa;
    const receitaProspectData = dados.receitaProspect;

    const empresa = await prisma.empresa.upsert({
      where: {
        cnpj: empresaData.cnpj
      },
      update: empresaData,
      create: empresaData
    });

    await prisma.receitaProspect.updateMany({
      where: {
        cnpj: empresaData.cnpj
      },
      data: receitaProspectData
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Empresa encontrada e atualizada com sucesso",
      empresa: {
        ...empresa,
        ...receitaProspectData,
        cnpjaConferido: true,
        situacaoFonte: "CNPJÁ"
      }
    });
  } catch (error) {
    return res.status(400).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function listarEmpresas(req, res) {
  try {
    const empresas = await prisma.receitaProspect.findMany({
      orderBy: {
        criadoEm: "desc"
      },
      select: CAMPOS_LISTA_PROSPECTS,
      take: 1000
    });

    return res.json({
      sucesso: true,
      total: empresas.length,
      empresas
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function obterBaseVortech(req, res) {
  try {
    if (!fs.existsSync(ARQUIVO_BASE_VORTECH)) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Planilha da Base Vortech nao encontrada no servidor.",
        caminho: "data/base-vortech.xlsx"
      });
    }

    const registros = lerBaseVortechArquivo();

    return res.json({
      sucesso: true,
      origem: "data/base-vortech.xlsx",
      total: registros.length,
      registros
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: `Nao foi possivel carregar a Base Vortech: ${error.message}`
    });
  }
}

export async function importarBaseVortechPlanilha(req, res) {
  try {
    const { nomeArquivo, conteudoBase64 } = req.body || {};

    if (!conteudoBase64) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Envie uma planilha da Base Vortech."
      });
    }

    const buffer = Buffer.from(conteudoBase64, "base64");
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    const registros = mapearLinhasBaseVortech(linhas);

    return res.json({
      sucesso: true,
      origem: nomeArquivo || "upload",
      total: registros.length,
      registros
    });
  } catch (error) {
    return res.status(400).json({
      sucesso: false,
      mensagem: `Nao foi possivel ler a planilha da Base Vortech: ${error.message}`
    });
  }
}

export async function obterMetricasProspects(req, res) {
  try {
    const [total, comEmail, comTelefone, porCnae] = await Promise.all([
      prisma.receitaProspect.count(),
      prisma.receitaProspect.count({
        where: {
          email: {
            not: null
          }
        }
      }),
      prisma.receitaProspect.count({
        where: {
          OR: [
            { telefone1: { not: null } },
            { telefone2: { not: null } }
          ]
        }
      }),
      prisma.receitaProspect.groupBy({
        by: ["cnaePrincipal"],
        _count: {
          cnaePrincipal: true
        },
        orderBy: {
          _count: {
            cnaePrincipal: "desc"
          }
        },
        take: 12
      })
    ]);

    return res.json({
      sucesso: true,
      total,
      comEmail,
      comTelefone,
      porCnae: porCnae.map((item) => ({
        cnae: item.cnaePrincipal,
        total: item._count.cnaePrincipal
      }))
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function obterStatusCnpjaApi(req, res) {
  return res.json({
    sucesso: true,
    cnpja: obterStatusCnpja()
  });
}

export async function listarContagensPorCnae(req, res) {
  try {
    const cnaes = String(req.query.cnaes || "")
      .split(",")
      .map((cnae) => cnae.replace(/\D/g, ""))
      .filter(Boolean);

    if (!cnaes.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe CNAEs para contar"
      });
    }

    const contagens = await prisma.receitaProspect.groupBy({
      by: ["cnaePrincipal"],
      where: {
        cnaePrincipal: {
          in: cnaes
        }
      },
      _count: {
        cnaePrincipal: true
      }
    });

    const porCnae = Object.fromEntries(cnaes.map((cnae) => [cnae, 0]));

    for (const item of contagens) {
      porCnae[item.cnaePrincipal] = item._count.cnaePrincipal;
    }

    return res.json({
      sucesso: true,
      porCnae
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function buscarEmpresasPorTermo(req, res) {
  try {
    const { termo, where } = montarFiltroBusca(req.query.termo);

    if (!termo) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um termo para buscar"
      });
    }

    const empresas = await prisma.receitaProspect.findMany({
      where,
      select: CAMPOS_LISTA_PROSPECTS,
      orderBy: [
        { uf: "asc" },
        { nomeFantasia: "asc" },
        { cnpj: "asc" }
      ],
      take: LIMITE_BUSCA_TERMO
    });
    const empresasFiltradas = filtrarEmpresasAderentes(empresas, termo);

    return res.json({
      sucesso: true,
      termo,
      total: empresasFiltradas.length,
      brutos: empresas.length,
      limite: LIMITE_BUSCA_TERMO,
      filtroAderencia: true,
      empresas: empresasFiltradas
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function listarEmpresasPorCnae(req, res) {
  try {
    const cnae = String(req.params.cnae || "").replace(/\D/g, "");
    const limiteSolicitado = Number.parseInt(req.query.limite, 10);
    const paginaSolicitada = Number.parseInt(req.query.pagina, 10);
    const limite = Number.isFinite(limiteSolicitado)
      ? Math.min(Math.max(limiteSolicitado, 1), LIMITE_MAXIMO_TELA)
      : LIMITE_CNAE_TELA;
    const pagina = Number.isFinite(paginaSolicitada)
      ? Math.max(paginaSolicitada, 1)
      : 1;
    const skip = (pagina - 1) * limite;

    if (!cnae) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um CNAE para buscar"
      });
    }

    const where = { cnaePrincipal: cnae };
    const whereTotal = { cnaePrincipal: cnae };
    const [total, empresas] = await Promise.all([
      prisma.receitaProspect.count({ where: whereTotal }),
      prisma.receitaProspect.findMany({
        where,
        select: CAMPOS_LISTA_PROSPECTS,
        orderBy: [
          { razaoSocial: "asc" },
          { nomeFantasia: "asc" },
          { cnpj: "asc" }
        ],
        skip,
        take: limite
      })
    ]);
    const totalPaginas = Math.max(Math.ceil(total / limite), 1);

    return res.json({
      sucesso: true,
      cnae,
      total,
      exibidos: empresas.length,
      limite,
      pagina,
      totalPaginas,
      inicio: total ? skip + 1 : 0,
      fim: skip + empresas.length,
      parcial: total > empresas.length,
      criterio: "CNAE principal exato ordenado por razao social",
      empresas
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function contarEmpresasPorCnae(req, res) {
  try {
    const cnae = String(req.params.cnae || "").replace(/\D/g, "");

    if (!cnae) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um CNAE para contar"
      });
    }

    const total = await prisma.receitaProspect.count({
      where: {
        cnaePrincipal: cnae
      }
    });

    return res.json({
      sucesso: true,
      cnae,
      total,
      criterio: "CNAE principal exato"
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function exportarEmpresasPorTermoExcel(req, res) {
  try {
    const { termo, where } = montarFiltroBusca(req.query.termo);

    if (!termo) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um termo para exportar"
      });
    }

    const empresas = await prisma.receitaProspect.findMany({
      where,
      orderBy: [
        { uf: "asc" },
        { nomeFantasia: "asc" },
        { cnpj: "asc" }
      ],
      take: LIMITE_BUSCA_TERMO
    });
    const empresasFiltradas = filtrarEmpresasAderentes(empresas, termo);

    const arquivo = gerarPlanilhaEmpresas(empresasFiltradas);
    const nomeArquivo = termo.replace(/[^\w-]+/g, "-").toLowerCase();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=receita-prospects-busca-${nomeArquivo}.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(arquivo);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function exportarEmpresasExcel(req, res) {
  try {
    const empresas = await prisma.receitaProspect.findMany();

    const arquivo = gerarPlanilhaEmpresas(empresas);

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=receita-prospects.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(arquivo);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function exportarEmpresasFiltradasExcel(req, res) {
  try {
    const busca = req.body?.busca || {};
    const empresasRecebidas = Array.isArray(req.body?.empresas) ? req.body.empresas : [];
    const baseVortech = Array.isArray(req.body?.baseVortech) ? req.body.baseVortech : [];
    const nomeArquivo = String(req.body?.nomeArquivo || "vortech-prospects")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "vortech-prospects";
    const lotePagina = Math.max(Number(req.body?.lotePagina || 0), 0);
    let empresas = [];
    let empresasNovas = [];
    let totalEncontrado = 0;
    let temProximoLote = false;
    const indiceClientes = montarIndiceClientesBase(baseVortech);

    if (empresasRecebidas.length) {
      empresas = await completarEmpresasParaExportacao(empresasRecebidas);
      totalEncontrado = empresas.length;
      empresasNovas = empresas.filter((empresa) => !existeNaBaseCliente(empresa, indiceClientes) && !situacaoBloqueiaVenda(empresa));
    } else if (busca.tipo === "cnae") {
      const cnae = String(busca.valor || "").replace(/\D/g, "");

      if (!cnae) {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Informe um CNAE para exportar."
        });
      }

      const lote = await prisma.receitaProspect.findMany({
        where: {
          cnaePrincipal: cnae
        },
        orderBy: [
          { uf: "asc" },
          { nomeFantasia: "asc" },
          { cnpj: "asc" }
        ],
        skip: lotePagina * LOTE_EXPORTACAO_CNAE,
        take: LOTE_EXPORTACAO_CNAE + 1
      });

      temProximoLote = lote.length > LOTE_EXPORTACAO_CNAE;
      empresas = lote.slice(0, LOTE_EXPORTACAO_CNAE);
      totalEncontrado = empresas.length;
      empresasNovas = empresas.filter((empresa) => !existeNaBaseCliente(empresa, indiceClientes) && !situacaoBloqueiaVenda(empresa));
    } else {
      const { termo, where } = montarFiltroBusca(busca.valor);

      if (!termo) {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Informe uma busca para exportar."
        });
      }

      const encontradas = await prisma.receitaProspect.findMany({
        where,
        orderBy: [
          { uf: "asc" },
          { nomeFantasia: "asc" },
          { cnpj: "asc" }
        ],
        take: LIMITE_BUSCA_TERMO
      });

      empresas = filtrarEmpresasAderentes(encontradas, termo);
      totalEncontrado = empresas.length;
      empresasNovas = empresas.filter((empresa) => !existeNaBaseCliente(empresa, indiceClientes) && !situacaoBloqueiaVenda(empresa));
    }

    if (!empresasNovas.length && busca.tipo === "cnae") {
      res.setHeader("X-Total-Encontrado", String(totalEncontrado));
      res.setHeader("X-Total-Exportado", "0");
      res.setHeader("X-Total-Removido", String(totalEncontrado));
      res.setHeader("X-Tem-Proximo-Lote", temProximoLote ? "1" : "0");
      res.setHeader("X-Lote-Pagina", String(lotePagina));
      return res.status(204).send();
    }

    if (!empresasNovas.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Nenhuma empresa nova para exportar."
      });
    }

    const arquivo = gerarPlanilhaEmpresas(empresasNovas);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${nomeArquivo}.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader("X-Total-Encontrado", String(totalEncontrado));
    res.setHeader("X-Total-Exportado", String(empresasNovas.length));
    res.setHeader("X-Total-Removido", String(totalEncontrado - empresasNovas.length));
    res.setHeader("X-Tem-Proximo-Lote", temProximoLote ? "1" : "0");
    res.setHeader("X-Lote-Pagina", String(lotePagina));

    return res.send(arquivo);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function exportarEmpresasPorCnaeExcel(req, res) {
  try {
    const cnae = String(req.params.cnae || "").replace(/\D/g, "");

    if (!cnae) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um CNAE para exportar"
      });
    }

    const empresas = await prisma.receitaProspect.findMany({
      where: {
        cnaePrincipal: cnae
      },
      orderBy: [
        { uf: "asc" },
        { nomeFantasia: "asc" },
        { cnpj: "asc" }
      ]
    });

    const arquivo = gerarPlanilhaEmpresas(empresas);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=receita-prospects-cnae-${cnae}.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(arquivo);
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}
