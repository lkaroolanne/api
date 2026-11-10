const DDDS = new Set(('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '));
export const DDDS_VALIDOS = [...DDDS];

export function normalizarTelefone(valor) {
  let numero = String(valor ?? '').replace(/\D/g, '');
  if ([12, 13].includes(numero.length) && numero.startsWith('55')) numero = numero.slice(2);
  if (!DDDS.has(numero.slice(0, 2))) return null;
  const assinante = numero.slice(2);
  if (!/^(?:[2-5]\d{7}|9\d{8})$/.test(assinante)) return null;
  if (/^(\d)\1+$/.test(assinante)) return null;
  return numero;
}


export const STATUS_CONTATO = {
  pendente: 'Não verificado',
  confirmado: 'Telefone confirmado',
  whatsapp: 'WhatsApp confirmado',
  sem_resposta: 'Sem resposta',
  errado: 'Número errado / desativado'
};

export function chaveContato(empresa, telefone) {
  return `${String(empresa.cnpj || '').replace(/\D/g, '')}:${telefone}`;
}

export function contatosEmpresa(empresa, registros = {}) {
  const numeros = [...new Set([empresa.telefone1, empresa.telefone2, empresa.telefone]
    .map(normalizarTelefone).filter(Boolean))];
  return numeros.map(numero => {
    const registro = registros[chaveContato(empresa, numero)] || {};
    const status = Object.hasOwn(STATUS_CONTATO, registro.status) ? registro.status : 'pendente';
    return { numero, status, atualizadoEm: registro.atualizadoEm || null,
      celular: numero.length === 11,
      confirmado: ['confirmado', 'whatsapp'].includes(status),
      bloqueado: status === 'errado' };
  }).sort((a, b) => prioridadeContato(b) - prioridadeContato(a));
}

export function prioridadeContato(contato) {
  if (!contato || contato.bloqueado) return -100;
  if (contato.status === 'whatsapp') return 50;
  if (contato.status === 'confirmado') return 40;
  if (contato.status === 'sem_resposta') return 5;
  return contato.celular ? 20 : 10;
}

export function melhorContato(empresa, registros = {}) {
  return contatosEmpresa(empresa, registros).find(contato => !contato.bloqueado) || null;
}

export function linkWhatsapp(numero, mensagem = '') {
  const telefone = normalizarTelefone(numero);
  return telefone ? `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}` : '';
}
