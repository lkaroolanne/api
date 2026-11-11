export const CATEGORIAS = [
  { id: 'ferragens', nome: 'Ferragens e ferramentas', padrao: '(ferragem|ferragens|ferragista|ferragistas|ferramenta|ferramentas)' },
  { id: 'atacado', nome: 'Atacado de ferramentas', padrao: '(ferragem|ferragens|ferramenta|ferramentas)' },
  { id: 'maquinas', nome: 'Máquinas industriais', padrao: '(maquina|maquinas|maquinario|maquinarios)' },
  { id: 'gases', nome: 'Gases e químicos', padrao: '(gas|gases|quimico|quimicos|quimica|quimicas|oxigenio|argonio|acetileno)' },
  { id: 'solda', nome: 'Solda e eletrodos', padrao: '(solda|soldas|soldagem|soldagens|eletrodo|eletrodos|tungstenio|oxicorte)' },
  { id: 'reguladores', nome: 'Reguladores e maçaricos', padrao: '(regulador|reguladores|macarico|macaricos|valvula|valvulas)' }
];
export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
export const TIPOS_CONTATO = ['todos', 'telefone', 'celular', 'email', 'sem-email', 'sem-contato'];

export function normalizarConsulta(valor = {}) {
  const grupo = String(valor.grupo || 'todos');
  const uf = String(valor.uf || '').toUpperCase();
  const contato = String(valor.contato || 'todos');
  const situacao = String(valor.situacao || 'ativas');
  if (!['ativas', 'pendentes', 'ativas-pendentes'].includes(situacao)) throw new Error('Situacao invalida.');
  if (grupo !== 'todos' && !CATEGORIAS.some(c => c.id === grupo)) throw new Error('Categoria invalida.');
  if (uf && !UFS.includes(uf)) throw new Error('Estado invalido.');
  if (!TIPOS_CONTATO.includes(contato)) throw new Error('Filtro de contato invalido.');
  const numero = (entrada, padrao, max) => {
    if (entrada === undefined || entrada === '') return padrao;
    const n = Number(entrada);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Paginacao invalida.');
    return n;
  };
  const termo = String(valor.termo || '').trim();
  if (termo.length > 120) throw new Error('Use ate 120 caracteres na busca.');
  return { grupo, uf, contato, situacao, termo, pagina: numero(valor.pagina, 1, 100000), limite: numero(valor.limite, 100, 500) };
}

export function nomePlanilha(consulta, escopo, instante = new Date()) {
  const q = normalizarConsulta(consulta);
  const data = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(instante);
  const texto = q.termo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
  return ['vortech', q.grupo, q.uf.toLowerCase() || 'brasil', q.contato, texto,
    escopo === 'pagina' ? `pagina-${q.pagina}` : 'busca-completa', data].filter(Boolean).join('-');
}
