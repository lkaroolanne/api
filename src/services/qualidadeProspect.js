// Validação de formato: não confirma titularidade, atendimento ou WhatsApp.
export { normalizarTelefone } from "../../public/contatos.js";

export function normalizarEmail(valor) {
  const email = String(valor ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export const CNAES_INTERESSE = {
  '4663000': 'Revenda de maquinas e equipamentos industriais',
  '4669999': 'Revenda de equipamentos industriais para solda',
  '4672900': 'Atacado de ferragens e ferramentas',
  '4684299': 'Distribuidor de gases e cilindros',
  '4689399': 'Distribuidor tecnico de produtos para solda',
  '4744001': 'Varejo de ferragens e ferramentas',
  '4759899': 'Revenda tecnica de maquinas e suprimentos'
};
const CNAES_DIRETOS = new Set(['4672900', '4744001']);
const TERMOS = new Set(('solda soldas soldagem eletrodo eletrodos tungstenio macarico macaricos inversora inversoras oxicorte plasma oxigenio argonio acetileno abrasivo abrasivos ferragem ferragens ferramenta ferramentas').split(' '));

export function selecionarSegmento(row) {
  const principal = String(row.cnaePrincipal ?? '').trim();
  const secundarios = String(row.cnaeSecundarios ?? '').match(/\d{7}/g) || [];
  const texto = [row.nomeFantasia, row.razaoSocial].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = texto.match(/[a-z0-9]+/g) || [];
  const evidencia = tokens.some(token => TERMOS.has(token)) || /\bgases industriais\b/.test(texto);
  if (CNAES_DIRETOS.has(principal)) return CNAES_INTERESSE[principal];
  // CNAEs amplos e atividades secundárias exigem evidência no nome comercial.
  if (!evidencia) return null;
  const cnae = [principal, ...secundarios].find(codigo => CNAES_INTERESSE[codigo]);
  return cnae ? CNAES_INTERESSE[cnae] : null;
}
