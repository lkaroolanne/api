import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { normalizarTelefone } from '../public/contatos.js';

// Amostra pequena, somente leitura. A API pública admite 5 consultas/minuto/IP.
const prisma = new PrismaClient();
try {
  const empresas = await prisma.receitaProspect.findMany({
    where: { telefone1: null, telefone2: null, OR: [
      { nomeFantasia: { contains: 'solda', mode: 'insensitive' } },
      { razaoSocial: { contains: 'solda', mode: 'insensitive' } }
    ] },
    select: { cnpj: true, telefone1: true, telefone2: true },
    orderBy: { cnpj: 'asc' }, take: 3
  });
  const resultados = [];
  for (let i = 0; i < empresas.length; i++) {
    if (i) await new Promise(resolve => setTimeout(resolve, 13000));
    const empresa = empresas[i];
    const registro = { cnpj: empresa.cnpj, fonte: 'CNPJA_PUBLICA', consultadoEm: new Date().toISOString() };
    try {
      const r = await fetch(`https://open.cnpja.com/office/${empresa.cnpj}`, { signal: AbortSignal.timeout(15000) });
      registro.http = r.status;
      if (!r.ok) { registro.erro = `HTTP ${r.status}`; resultados.push(registro); if (r.status === 429) break; continue; }
      const dados = await r.json();
      if (String(dados.taxId) !== empresa.cnpj) throw new Error('CNPJ da resposta divergente');
      registro.ativa = String(dados.status?.id) === '2';
      registro.dataFonte = dados.updated || null;
      registro.telefones = [...new Set((dados.phones || []).map(item => normalizarTelefone(`${item.area || ''}${item.number || ''}`)).filter(Boolean))];
      registro.celulares = registro.telefones.filter(numero => numero.length === 11).length;
      registro.confirmacaoAtendimento = 'Nao verificado';
      registro.confirmacaoWhatsapp = 'Nao verificado';
    } catch (error) { registro.erro = error.name === 'TimeoutError' ? 'Tempo limite' : error.message; }
    resultados.push(registro);
    console.log(JSON.stringify({ consulta: i + 1, http: registro.http, telefonesValidos: registro.telefones?.length || 0, celulares: registro.celulares || 0, erro: registro.erro }));
  }
  fs.mkdirSync('data/auditoria-contatos', { recursive: true });
  const arquivo = `data/auditoria-contatos/amostra-${Date.now()}.json`;
  fs.writeFileSync(arquivo, JSON.stringify(resultados, null, 2));
  console.log(JSON.stringify({ totalConsultado: resultados.length,
    empresasAtivasComTelefone: resultados.filter(r => r.ativa && r.telefones?.length).length,
    empresasAtivasComCelular: resultados.filter(r => r.ativa && r.celulares).length,
    erros: resultados.filter(r => r.erro).length, alterouBanco: false, relatorio: arquivo }));
} finally { await prisma.$disconnect(); }
