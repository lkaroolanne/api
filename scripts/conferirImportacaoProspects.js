import 'dotenv/config';
import fs from 'node:fs';
import { prisma } from '../src/prisma/client.js';
import { lerProspects } from '../src/services/importarProspects.js';
try {
  const { registros } = lerProspects(fs.readFileSync(process.argv[2]));
  const cnpjs = registros.map(r => r.cnpj);
  let encontrados = 0;
  for (let i = 0; i < cnpjs.length; i += 10000) {
    encontrados += await prisma.receitaProspect.count({ where: { cnpj: { in: cnpjs.slice(i, i + 10000) } } });
  }
  const situacoes = await prisma.receitaProspect.groupBy({ by: ['situacao'], _count: true });
  const importados = await prisma.receitaProspect.groupBy({ by: ['situacao'],
    where: { origem: 'Planilha Prospects' }, _count: true });
  console.log(JSON.stringify({ planilha: registros.length, encontrados, situacoes, importados }, null, 2));
} catch (erro) { console.error(erro.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
