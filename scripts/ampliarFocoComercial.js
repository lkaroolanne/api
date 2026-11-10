import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { classificarPalavrasComerciais } from '../src/services/focoComercial.js';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
try {
  const resumo = await prisma.$transaction(async tx => {
    const ativos = await tx.receitaProspect.findMany({
      select: { cnpj: true, nomeFantasia: true, razaoSocial: true, situacao: true, telefone1: true, telefone2: true, email: true }
    });
    const arquivo = await tx.$queryRaw`
      SELECT cnpj, dados->>'nomeFantasia' AS "nomeFantasia", dados->>'razaoSocial' AS "razaoSocial",
        dados->>'situacao' AS situacao, dados->>'telefone1' AS telefone1,
        dados->>'telefone2' AS telefone2, dados->>'email' AS email
      FROM "ReceitaProspectArquivo"
    `;
    const existentes = new Set(ativos.map(e => e.cnpj));
    const selecionadas = arquivo.filter(e => !existentes.has(e.cnpj) && classificarPalavrasComerciais(e).manter);
    let restaurados = 0;
    if (aplicar && selecionadas.length) {
      const cnpjs = selecionadas.map(e => e.cnpj);
      restaurados = await tx.$executeRaw`
        WITH restaurados AS (
          INSERT INTO "ReceitaProspect"
          SELECT (jsonb_populate_record(NULL::"ReceitaProspect", dados)).*
          FROM "ReceitaProspectArquivo" WHERE cnpj = ANY(${cnpjs}::text[])
          ON CONFLICT DO NOTHING RETURNING cnpj
        )
        DELETE FROM "ReceitaProspectArquivo" AS arquivo USING restaurados
        WHERE arquivo.cnpj = restaurados.cnpj
      `;
      if (restaurados !== selecionadas.length) throw new Error('Quantidade restaurada divergente; operação revertida.');
    }
    const grupos = {};
    for (const empresa of [...ativos, ...selecionadas]) {
      const grupo = classificarPalavrasComerciais(empresa).grupo;
      const item = grupos[grupo] ||= { total: 0, comTelefone: 0, comEmail: 0 };
      item.total++;
      if (empresa.telefone1 || empresa.telefone2) item.comTelefone++;
      if (empresa.email) item.comEmail++;
    }
    return { aplicado: aplicar, ativosAntes: ativos.length, encontradosNoArquivo: selecionadas.length,
      restaurados, ativosDepois: ativos.length + (aplicar ? restaurados : 0),
      arquivadosDepois: arquivo.length - (aplicar ? restaurados : 0), grupos };
  }, { isolationLevel: 'Serializable', timeout: 120000 });
  fs.mkdirSync('data/limpeza', { recursive: true });
  fs.writeFileSync(`data/limpeza/ampliacao-${Date.now()}.json`, JSON.stringify(resumo, null, 2));
  console.log(JSON.stringify(resumo, null, 2));
} catch (error) {
  console.error('Falha na ampliação:', error.code || error.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
