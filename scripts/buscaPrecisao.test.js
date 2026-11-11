import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { montarConsultaProspects } from '../src/services/consultaProspects.js';

test('identificadores numéricos incompletos geram orientação em vez de uma busca por nome', () => {
  for (const termo of ['123', '12.345.678/0001', '4744']) {
    assert.throws(() => montarConsultaProspects({ termo }), /CNPJ completo/);
  }
});

// Consulta somente registros de teste em memória no PostgreSQL; não lê nem altera empresas.
test('PostgreSQL: precisão de nomes, situações e telefones formatados', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const db = new PrismaClient();
  const registros = [
    { cnpj: '1', razaoSocial: 'Álpha Soldagem', situacao: '02', telefone1: '+55 (11) 99876-5432' },
    { cnpj: '2', razaoSocial: 'Alpha Soldados', situacao: '02', telefone1: '11999999999' },
    { cnpj: '3', razaoSocial: 'Beta Soldas', situacao: null, telefone2: '11 99876-5432' },
    { cnpj: '4', razaoSocial: 'Alpha Solda', situacao: '08' },
    { cnpj: '5', razaoSocial: 'Alphaville Ferragens', situacao: '02', telefone1: '11999999999', telefone2: '1132345678' }
  ];
  async function buscar(entrada) {
    const { where } = montarConsultaProspects(entrada);
    const rows = await db.$queryRaw`SELECT e.cnpj FROM jsonb_to_recordset(${JSON.stringify(registros)}::jsonb)
      AS e(cnpj text, "razaoSocial" text, "nomeFantasia" text, situacao text, uf text,
        "telefone1" text, "telefone2" text, email text, "cnaePrincipal" text)
      WHERE ${where} ORDER BY e.cnpj`;
    return rows.map(r => r.cnpj);
  }
  try {
    assert.deepEqual(await buscar({ termo: 'solda', situacao: 'ativas-pendentes' }), ['1', '3']);
    assert.deepEqual(await buscar({ termo: 'alpha solda' }), ['1']);
    assert.deepEqual(await buscar({ termo: 'solda', situacao: 'pendentes' }), ['3']);
    assert.deepEqual(await buscar({ contato: 'celular', situacao: 'ativas-pendentes' }), ['1', '3']);
    assert.deepEqual(await buscar({ contato: 'telefone' }), ['1', '5']);
  } finally { await db.$disconnect(); }
});
