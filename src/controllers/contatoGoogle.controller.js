import { prisma } from '../prisma/client.js';
import { consultarContatoGoogle } from '../services/consultarContatoGoogle.js';

export function criarConsultaGoogle({ db = prisma, consultar = consultarContatoGoogle,
  chave = () => process.env.GOOGLE_PLACES_API_KEY, agora = () => new Date() } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let tentativa;
    try {
      if (!chave()) return res.status(503).json({ sucesso: false, mensagem: 'Consulta Google indisponivel: configure GOOGLE_PLACES_API_KEY no servidor.' });
      const cnpj = String(req.params.cnpj || '');
      if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ sucesso: false, mensagem: 'Informe um CNPJ com 14 digitos.' });
      const empresa = await db.receitaProspect.findUnique({ where: { cnpj } });
      if (!empresa) return res.status(404).json({ sucesso: false, mensagem: 'Empresa nao encontrada na base principal.' });
      if (!['02', '2', 'ativa', 'ativo'].includes(String(empresa.situacao || '').toLowerCase())) {
        return res.status(422).json({ sucesso: false, mensagem: 'Consulte apenas empresas com situacao ativa.' });
      }
      const configurado = Number(process.env.GOOGLE_CONTATOS_LIMITE_24H || 20);
      const limite = Number.isInteger(configurado) && configurado > 0 ? configurado : 20;
      const instante = agora();
      tentativa = await db.$transaction(async tx => {
        const recentes = await tx.consultaContatoGoogle.count({ where: { consultadoEm: { gte: new Date(instante.getTime() - 86400000) } } });
        if (recentes >= limite) throw Object.assign(new Error('Limite de consultas Google das ultimas 24 horas atingido.'), { status: 429 });
        const repetida = await tx.consultaContatoGoogle.findFirst({ where: { cnpj, consultadoEm: { gte: new Date(instante.getTime() - 3600000) } } });
        if (repetida) throw Object.assign(new Error('Este CNPJ ja foi consultado na ultima hora. Tente novamente mais tarde.'), { status: 429 });
        return tx.consultaContatoGoogle.create({ data: { cnpj, status: 'iniciada', consultadoEm: instante } });
      }, { isolationLevel: 'Serializable' });
      const resultado = await consultar(empresa, { apiKey: chave() });
      await db.consultaContatoGoogle.update({ where: { id: tentativa.id }, data: { status: resultado.status, placeId: resultado.placeId || null } });
      return res.json({ sucesso: true, ...resultado, consultadoEm: instante.toISOString(), fonte: 'Google Maps',
        mensagem: resultado.contato ? 'Nome e endereco compativeis. Atendimento e WhatsApp ainda nao confirmados.' : resultado.status === 'ambiguo' ? 'Mais de um local compativel. Nenhum telefone foi associado.' : 'Nenhum local com nome, endereco e telefone suficientemente compativeis.' });
    } catch (error) {
      if (tentativa) {
        await db.consultaContatoGoogle.update({ where: { id: tentativa.id }, data: { status: 'erro' } }).catch(() => {});
      }
      return res.status(error.code === 'P2034' ? 429 : error.status || 500).json({ sucesso: false,
        mensagem: error.code === 'P2034' ? 'Outra consulta foi iniciada ao mesmo tempo. Tente novamente.' : error.status ? error.message : 'Falha ao consultar contato Google.' });
    }
  };
}

export const consultarGoogle = criarConsultaGoogle();
