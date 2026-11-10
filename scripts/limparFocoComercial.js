import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { classificarFocoComercial, classificarPalavrasComerciais } from '../src/services/focoComercial.js';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const classificar = process.argv.includes('--estrito') ? classificarFocoComercial : classificarPalavrasComerciais;

try {
  const resumo = await prisma.$transaction(async tx => {
    const empresas = await tx.receitaProspect.findMany({
      select: { id: true, nomeFantasia: true, razaoSocial: true, situacao: true, telefone1: true, telefone2: true, email: true }
    });
    const arquivar = [];
    const grupos = {};
    for (const empresa of empresas) {
      const decisao = classificar(empresa);
      if (!decisao.manter) { arquivar.push(empresa.id); continue; }
      const grupo = grupos[decisao.grupo] ||= { total: 0, comTelefone: 0, comEmail: 0 };
      grupo.total++;
      if (empresa.telefone1 || empresa.telefone2) grupo.comTelefone++;
      if (empresa.email) grupo.comEmail++;
    }
    let arquivados = 0;
    if (aplicar && arquivar.length) {
      // DELETE e arquivamento são um único comando atômico. Falha no INSERT reverte a remoção.
      arquivados = await tx.$executeRaw`
        WITH movidos AS (
          DELETE FROM "ReceitaProspect" WHERE id = ANY(${arquivar}::int[]) RETURNING *
        )
        INSERT INTO "ReceitaProspectArquivo" ("cnpj", "dados", "motivo", "arquivadoEm")
        SELECT movidos."cnpj", to_jsonb(movidos),
          'Fora dos criterios comerciais selecionados ou situacao nao ativa', CURRENT_TIMESTAMP
        FROM movidos
        ON CONFLICT ("cnpj") DO UPDATE SET
          "dados" = EXCLUDED."dados", "motivo" = EXCLUDED."motivo", "arquivadoEm" = EXCLUDED."arquivadoEm"
      `;
      if (arquivados !== arquivar.length) throw new Error('Quantidade arquivada divergente; transação revertida.');
    }
    return { aplicado: aplicar, totalAntes: empresas.length, manter: empresas.length - arquivar.length,
      candidatosArquivamento: arquivar.length, arquivados, grupos };
  }, { isolationLevel: 'Serializable', timeout: 120000 });
  fs.mkdirSync('data/limpeza', { recursive: true });
  const arquivo = `data/limpeza/foco-comercial-${Date.now()}.json`;
  fs.writeFileSync(arquivo, JSON.stringify(resumo, null, 2));
  console.log(JSON.stringify({ ...resumo, relatorio: arquivo }, null, 2));
} catch (error) {
  console.error('Falha na limpeza:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
