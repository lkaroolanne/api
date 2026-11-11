import { Prisma } from '@prisma/client';
import { CATEGORIAS, normalizarConsulta } from '../../public/consulta.js';
import { DDDS_VALIDOS } from '../../public/contatos.js';

const FAMILIAS_BUSCA = {
  solda: ['solda', 'soldas', 'soldagem', 'soldagens'],
  soldagem: ['solda', 'soldas', 'soldagem', 'soldagens'],
  ferramenta: ['ferramenta', 'ferramentas'], ferramentas: ['ferramenta', 'ferramentas'],
  ferragem: ['ferragem', 'ferragens', 'ferragista', 'ferragistas'],
  ferragens: ['ferragem', 'ferragens', 'ferragista', 'ferragistas'],
  maquina: ['maquina', 'maquinas', 'maquinario'], maquinas: ['maquina', 'maquinas', 'maquinario'],
  eletrodo: ['eletrodo', 'eletrodos'], eletrodos: ['eletrodo', 'eletrodos']
};

export function termosParaBusca(valor) {
  const termos = String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .match(/[a-z0-9]+/g)?.filter(t => !['de', 'da', 'do', 'das', 'dos', 'e'].includes(t)) || [];
  return [...new Set(termos)].map(termo => FAMILIAS_BUSCA[termo]
    ? `\\m(${FAMILIAS_BUSCA[termo].join('|')})\\M` : `\\m${termo}`);
}

export function montarConsultaProspects(entrada) {
  const consulta = normalizarConsulta(entrada);
  const nomes = Prisma.sql`translate(lower(concat_ws(' ', e."nomeFantasia", e."razaoSocial")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
  const telefone = campo => {
    const limpo = Prisma.sql`regexp_replace(coalesce(${campo}, ''), '[^0-9]', '', 'g')`;
    const padrao = `^(55)?(${DDDS_VALIDOS.join('|')})([2-5][0-9]{7}|9[0-9]{8})$`;
    return Prisma.sql`(${limpo} ~ ${padrao} AND ${limpo} !~ ${'([0-9])\\1{7,8}$'})`;
  };
  const telefoneValido = Prisma.sql`(${telefone(Prisma.sql`e."telefone1"`)} OR ${telefone(Prisma.sql`e."telefone2"`)})`;
  const email = Prisma.sql`trim(coalesce(e.email, '')) ~ ${'^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'}`;
  const ativa = Prisma.sql`lower(trim(e.situacao)) IN ('02', '2', 'ativa', 'ativo')`;
  const pendente = Prisma.sql`NULLIF(trim(e.situacao), '') IS NULL`;
  const filtros = [consulta.situacao === 'pendentes' ? pendente
    : consulta.situacao === 'ativas-pendentes' ? Prisma.sql`(${ativa} OR ${pendente})` : ativa];
  if (consulta.uf) filtros.push(Prisma.sql`e.uf = ${consulta.uf}`);
  if (consulta.grupo !== 'todos') {
    const categoria = CATEGORIAS.find(c => c.id === consulta.grupo);
    filtros.push(Prisma.sql`${nomes} ~ ${`\\m${categoria.padrao}\\M`}`);
    if (consulta.grupo === 'atacado') filtros.push(Prisma.sql`(e."cnaePrincipal" = '4672900' OR ${nomes} ~ ${'\\m(atacado|atacadista|atacadistas)\\M'})`);
  }
  if (consulta.contato === 'telefone') filtros.push(telefoneValido);
  if (consulta.contato === 'celular') {
    const padrao = `^(55)?(${DDDS_VALIDOS.join('|')})9[0-9]{8}$`;
    const celular = campo => {
      const limpo = Prisma.sql`regexp_replace(coalesce(${campo}, ''), '[^0-9]', '', 'g')`;
      return Prisma.sql`(${limpo} ~ ${padrao} AND ${telefone(campo)})`;
    };
    filtros.push(Prisma.sql`(${celular(Prisma.sql`e."telefone1"`)} OR ${celular(Prisma.sql`e."telefone2"`)})`);
  }
  if (consulta.contato === 'email') filtros.push(email);
  if (consulta.contato === 'sem-email') filtros.push(Prisma.sql`NOT (${email})`);
  if (consulta.contato === 'sem-contato') filtros.push(Prisma.sql`NOT ${telefoneValido} AND NOT (${email})`);
  if (consulta.termo) {
    const digitos = consulta.termo.replace(/\D/g, '');
    if (/^[\d.\s/-]+$/.test(consulta.termo) && ![7, 14].includes(digitos.length)) {
      throw new Error('Digite o CNPJ completo (14 dígitos) ou CNAE (7 dígitos).');
    }
    if (/^[\d.\s/-]+$/.test(consulta.termo) && [7, 14].includes(digitos.length)) {
      filtros.push(digitos.length === 14 ? Prisma.sql`e.cnpj = ${digitos}` : Prisma.sql`e."cnaePrincipal" = ${digitos}`);
    } else {
      const termos = termosParaBusca(consulta.termo);
      if (!termos.length) throw new Error('Digite parte do nome, CNPJ ou CNAE.');
      for (const termo of termos) filtros.push(Prisma.sql`${nomes} ~ ${termo}`);
    }
  }
  return { consulta, where: Prisma.sql`${Prisma.join(filtros, ' AND ')}` };
}

export async function consultarProspects(db, entrada, { todos = false, cnpjs } = {}) {
  const { consulta, where } = montarConsultaProspects(entrada);
  const selecao = cnpjs ? Prisma.sql` AND e.cnpj IN (${Prisma.join(cnpjs)})` : Prisma.empty;
  const [contagem] = await db.$queryRaw`SELECT count(*)::int AS total FROM "ReceitaProspect" e WHERE ${where}${selecao}`;
  if (todos && contagem.total > 50000) throw new Error('Selecione uma categoria ou estado para exportar ate 50 mil empresas por arquivo.');
  if (!todos) consulta.pagina = Math.min(consulta.pagina, Math.max(1, Math.ceil(contagem.total / consulta.limite)));
  const limite = todos ? 50000 : consulta.limite;
  const offset = todos ? 0 : (consulta.pagina - 1) * consulta.limite;
  const empresas = await db.$queryRaw`SELECT e.* FROM "ReceitaProspect" e WHERE ${where}${selecao}
    ORDER BY e."razaoSocial" ASC NULLS LAST, e.cnpj ASC LIMIT ${limite} OFFSET ${offset}`;
  return { consulta, total: contagem.total, empresas, pagina: consulta.pagina, limite: consulta.limite,
    totalPaginas: Math.max(1, Math.ceil(contagem.total / consulta.limite)), exibidos: empresas.length };
}
