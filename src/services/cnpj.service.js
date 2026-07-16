import axios from "axios";
import http from "node:http";
import https from "node:https";

const TEMPO_LIMITE_API_MS = Number(process.env.CNPJ_API_TIMEOUT_MS || 8000);
const CNPJA_MAX_AGE = Number(process.env.CNPJA_MAX_AGE || 45);
const CNPJA_GEOCODING = String(process.env.CNPJA_GEOCODING || "false").toLowerCase() === "true";
const CAMPOS_SALDO_CNPJA = [
  "x-ratelimit-remaining",
  "x-rate-limit-remaining",
  "ratelimit-remaining",
  "x-credits-remaining",
  "x-credit-remaining",
  "x-tokens-remaining",
  "x-token-remaining"
];
const CAMPOS_LIMITE_CNPJA = [
  "x-ratelimit-limit",
  "x-rate-limit-limit",
  "ratelimit-limit",
  "x-credits-limit",
  "x-credit-limit",
  "x-tokens-limit",
  "x-token-limit"
];

let ultimoStatusCnpja = {
  configurado: Boolean(process.env.CNPJA_API_KEY),
  saldoRestante: null,
  limite: null,
  atualizadoEm: null,
  fonte: process.env.CNPJA_API_KEY ? "CNPJA_API_KEY" : "open.cnpja.com"
};

const httpClient = axios.create({
  timeout: TEMPO_LIMITE_API_MS,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 40 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 40 }),
  headers: {
    "User-Agent": "VortechProspectAPI/1.0"
  }
});

function limparCnpj(cnpj) {
  return String(cnpj || "").replace(/\D/g, "");
}

function primeiroTelefone(phones = []) {
  const telefone = phones.find((item) => item?.area && item?.number);
  return telefone ? `${telefone.area}${telefone.number}` : null;
}

function primeiroEmail(emails = []) {
  return emails.find((item) => item?.address)?.address || null;
}

function enderecoCompleto(address = {}) {
  return [
    address.street,
    address.number,
    address.details
  ].filter(Boolean).join(", ") || null;
}

function normalizarCnae(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function primeiroHeader(headers, nomes) {
  for (const nome of nomes) {
    const valor = headers?.[nome];
    if (valor !== undefined && valor !== null && String(valor).trim()) {
      return String(valor).trim();
    }
  }

  return null;
}

function atualizarStatusCnpja(headers = {}) {
  ultimoStatusCnpja = {
    configurado: Boolean(process.env.CNPJA_API_KEY),
    saldoRestante: primeiroHeader(headers, CAMPOS_SALDO_CNPJA),
    limite: primeiroHeader(headers, CAMPOS_LIMITE_CNPJA),
    atualizadoEm: new Date().toISOString(),
    fonte: process.env.CNPJA_API_KEY ? "CNPJÁ" : "open.cnpja.com"
  };
}

export function obterStatusCnpja() {
  return {
    ...ultimoStatusCnpja,
    configurado: Boolean(process.env.CNPJA_API_KEY),
    fonte: process.env.CNPJA_API_KEY ? "CNPJÁ" : "open.cnpja.com"
  };
}

function mapearCnpja(data) {
  const cnaePrincipal = normalizarCnae(data.mainActivity?.id);
  const cnaesSecundarios = (data.sideActivities || [])
    .map((item) => normalizarCnae(item.id))
    .filter(Boolean)
    .join(",");

  const telefone = primeiroTelefone(data.phones);
  const email = primeiroEmail(data.emails);

  const empresa = {
    cnpj: limparCnpj(data.taxId),
    razaoSocial: data.company?.name || null,
    nomeFantasia: data.alias || null,
    situacao: data.status?.text || null,
    porte: data.company?.size?.text || data.company?.size?.acronym || null,
    cnaePrincipal,
    cnaeDescricao: data.mainActivity?.text || null,
    telefone,
    email,
    cep: data.address?.zip || null,
    endereco: enderecoCompleto(data.address),
    bairro: data.address?.district || null,
    cidade: data.address?.city || null,
    estado: data.address?.state || null,
    latitude: data.address?.latitude || null,
    longitude: data.address?.longitude || null,
    origem: "CNPJa"
  };

  return {
    empresa,
    receitaProspect: {
      cnpj: empresa.cnpj,
      cnpjBasico: empresa.cnpj.slice(0, 8),
      razaoSocial: empresa.razaoSocial,
      naturezaJuridica: data.company?.nature?.text || null,
      capitalSocial: data.company?.equity ? String(data.company.equity) : null,
      porteEmpresa: empresa.porte,
      nomeFantasia: empresa.nomeFantasia,
      situacao: empresa.situacao,
      cnaePrincipal,
      cnaeSecundarios: cnaesSecundarios || null,
      logradouro: data.address?.street || null,
      numero: data.address?.number || null,
      complemento: data.address?.details || null,
      bairro: empresa.bairro,
      cep: empresa.cep,
      uf: empresa.estado,
      municipioCodigo: data.address?.municipality ? String(data.address.municipality) : null,
      telefone1: telefone,
      email,
      origem: "Receita Federal / CNPJa"
    }
  };
}

async function buscarCnpjCnpja(cnpjLimpo) {
  const apiKey = process.env.CNPJA_API_KEY;
  const baseUrl = apiKey ? "https://api.cnpja.com" : "https://open.cnpja.com";
  const params = apiKey
    ? { strategy: "CACHE_IF_FRESH", maxAge: CNPJA_MAX_AGE, geocoding: CNPJA_GEOCODING }
    : {};

  const response = await httpClient.get(`${baseUrl}/office/${cnpjLimpo}`, {
    params,
    headers: apiKey ? { Authorization: apiKey } : undefined,
  });

  atualizarStatusCnpja(response.headers);

  return mapearCnpja(response.data);
}

async function buscarCnpjBrasilApiFallback(cnpjLimpo) {
  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`;
  const response = await httpClient.get(url);
  const data = response.data;

  const empresa = {
    cnpj: limparCnpj(data.cnpj),
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia,
    situacao: data.descricao_situacao_cadastral,
    porte: data.porte,
    cnaePrincipal: String(data.cnae_fiscal),
    cnaeDescricao: data.cnae_fiscal_descricao,
    telefone: data.ddd_telefone_1,
    email: data.email,
    cep: data.cep,
    endereco: `${data.logradouro || ""}, ${data.numero || ""}`.trim(),
    bairro: data.bairro,
    cidade: data.municipio,
    estado: data.uf,
    origem: "BrasilAPI"
  };

  return {
    empresa,
    receitaProspect: {
      cnpj: empresa.cnpj,
      cnpjBasico: empresa.cnpj.slice(0, 8),
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      situacao: empresa.situacao,
      cnaePrincipal: empresa.cnaePrincipal,
      telefone1: empresa.telefone,
      email: empresa.email,
      cep: empresa.cep,
      logradouro: empresa.endereco,
      bairro: empresa.bairro,
      uf: empresa.estado,
      origem: "Receita Federal / BrasilAPI"
    }
  };
}

export async function buscarCnpjBrasilApi(cnpj) {
  const cnpjLimpo = limparCnpj(cnpj);

  if (cnpjLimpo.length !== 14) {
    throw new Error("CNPJ invalido");
  }

  const erros = [];

  try {
    return await buscarCnpjCnpja(cnpjLimpo);
  } catch (error) {
    const detalhe = formatarErroApi(error);
    erros.push(`CNPJa: ${detalhe}`);
    console.log("Erro CNPJa, usando fallback BrasilAPI:", error.response?.data || error.message);
  }

  try {
    return await buscarCnpjBrasilApiFallback(cnpjLimpo);
  } catch (error) {
    const detalhe = formatarErroApi(error);
    erros.push(`BrasilAPI: ${detalhe}`);
    console.log("Erro BrasilAPI:", error.response?.data || error.message);
    throw new Error(`Nao foi possivel atualizar este CNPJ pela API. ${erros.join(" | ")}`);
  }
}

function formatarErroApi(error) {
  if (error.code === "ECONNABORTED") {
    return `tempo limite de ${Math.round(TEMPO_LIMITE_API_MS / 1000)}s`;
  }

  if (error.response?.status) {
    const mensagem = error.response.data?.message ||
      error.response.data?.mensagem ||
      error.response.data?.error ||
      error.response.statusText ||
      "erro externo";

    return `HTTP ${error.response.status} - ${String(mensagem).slice(0, 120)}`;
  }

  return String(error.message || "erro externo").slice(0, 120);
}
