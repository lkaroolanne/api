import { prisma } from "../prisma/client.js";
import { buscarCnpjBrasilApi } from "../services/cnpj.service.js";
import { gerarPlanilhaEmpresas } from "../services/exportarExcel.service.js";

const CNAES_SOLDAGEM_REVENDA = new Set([
  "2014200",
  "2511000",
  "2512800",
  "2513600",
  "2539001",
  "2542000",
  "2599399",
  "3314710",
  "3321000",
  "4663000",
  "4669999",
  "4684299",
  "4689301",
  "4689302",
  "4689399",
  "4744001",
  "4744003",
  "4744099",
  "4759899",
  "7732202"
]);

const TERMOS_FORTES_SOLDA = [
  "solda",
  "soldagem",
  "mig",
  "mag",
  "tig",
  "eletrodo",
  "tungstenio",
  "cilindro",
  "cilindros",
  "gas",
  "gases",
  "macarico",
  "valvula",
  "valvulas",
  "regulador",
  "reguladores",
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

const LIMITE_BUSCA_TERMO = 5000;
function normalizarTermoBusca(valor) {
  return String(valor || "").trim();
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
    .filter((empresa) => empresa.aderenciaSolda >= 3 && !(ehRuidoComercial(empresa) && empresa.aderenciaSolda < 6))
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
        { nomeFantasia: { contains: termoLimpo, mode: "insensitive" } },
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
        ...receitaProspectData
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

    if (!cnae) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um CNAE para buscar"
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

    return res.json({
      sucesso: true,
      cnae,
      total: empresas.length,
      exibidos: empresas.length,
      criterio: "CNAE principal exato",
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
