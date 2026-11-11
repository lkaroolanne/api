import 'dotenv/config';
import fs from 'node:fs';
import { prisma } from '../src/prisma/client.js';
import { lerProspects, salvarProspects } from '../src/services/importarProspects.js';

try {
  const arquivo = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!arquivo) throw new Error('Informe o caminho da planilha. Use --aplicar para salvar.');
  const { registros, resumo } = lerProspects(fs.readFileSync(arquivo));
  console.log(JSON.stringify(resumo, null, 2));
  if (process.argv.includes('--aplicar')) console.log(await salvarProspects(prisma, registros));
  else console.log('Simulação concluída. Use --aplicar para salvar no banco.');
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
