// Evidência cadastral de afinidade; não confirma produtos vendidos ou intenção de compra.
export function classificarFocoComercial(empresa) {
  const normalizar = valor => String(valor || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const situacao = normalizar(empresa.situacao);
  if (!['02', '2', 'ativa', 'ativo'].includes(situacao)) {
    return { manter: false, grupo: 'Revisar', motivo: 'Situação ativa não identificada' };
  }
  // Não usar segmento (gerado pelo importador), endereço, e-mail ou CNAE amplo como prova.
  const nomes = [empresa.nomeFantasia, empresa.razaoSocial].map(normalizar);
  const solda = /\b(solda|soldas|soldagem|soldagens|eletrodo|eletrodos|tungstenio|macarico|macaricos|oxicorte)\b/;
  if (nomes.some(nome => solda.test(nome))) {
    return { manter: true, grupo: 'Solda', motivo: 'Termo específico de solda no nome cadastrado' };
  }
  const gases = nomes.some(nome => /\b(argonio|acetileno)\b/.test(nome) ||
    (/\b(gas|gases|oxigenio)\b/.test(nome) && /\b(industrial|industriais)\b/.test(nome)));
  if (gases) return { manter: true, grupo: 'Gases industriais', motivo: 'Gás técnico ou industrial no nome cadastrado' };
  return { manter: false, grupo: 'Revisar', motivo: 'Sem evidência específica de solda ou gases industriais no nome' };
}

export function classificarPalavrasComerciais(empresa) {
  const especifico = classificarFocoComercial(empresa);
  if (especifico.manter) return especifico;
  if (especifico.motivo === 'Situação ativa não identificada') return especifico;
  const texto = [empresa.nomeFantasia, empresa.razaoSocial].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const categorias = [
    ['Atacado de ferramentas', /\b(atacado|atacadista|atacadistas)\b/, /\b(ferramenta|ferramentas)\b/],
    ['Ferragens e ferramentas', /\b(ferragem|ferragens|ferragista|ferragistas|ferramenta|ferramentas)\b/],
    ['Máquinas industriais', /\b(maquina|maquinas|maquinario|maquinarios)\b/],
    ['Reguladores e maçaricos', /\b(regulador|reguladores|macarico|macaricos)\b/],
    ['Gases e químicos', /\b(quimico|quimicos|quimica|quimicas)\b/]
  ];
  for (const [grupo, ...regras] of categorias) {
    if (regras.every(regra => regra.test(texto))) return { manter: true, grupo, motivo: 'Palavra comercial identificada no nome cadastrado' };
  }
  // Não ampliar para depósitos de gás de cozinha identificados pelo nome.
  if (/\b(gas|gases|oxigenio)\b/.test(texto) && !/\b(glp|cozinha|butano|propano|medicinal|medicinais)\b/.test(texto)) {
    return { manter: true, grupo: 'Gases e químicos', motivo: 'Gás no nome; aplicação industrial ainda não confirmada' };
  }
  return especifico;
}
