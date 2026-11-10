import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarConsultaGoogle } from '../src/controllers/contatoGoogle.controller.js';

function preparar({ chave = 'teste', count = 0, repetida = false, consultar } = {}) {
  const registros = [];
  const empresa = { cnpj: '12345678000100', situacao: '02', telefone1: '1132345678' };
  const db = {
    receitaProspect: { findUnique: async () => empresa },
    consultaContatoGoogle: {
      count: async () => count, findFirst: async () => repetida ? { id: 1 } : null,
      create: async ({ data }) => { registros.push(data); return { id: 1, ...data }; },
      update: async ({ data }) => { registros.push(data); return data; }
    },
    $transaction: async fn => fn(db)
  };
  const handler = criarConsultaGoogle({ db, chave: () => chave,
    consultar: consultar || (async () => ({ status: 'compativel', placeId: 'abc', contato: { telefone: '11987654321', whatsappConfirmado: false } })) });
  const res = { codigo: 200, cabecalhos: {}, set(k, v) { this.cabecalhos[k] = v; return this; },
    status(c) { this.codigo = c; return this; }, json(data) { this.dados = data; return this; } };
  return { handler, res, registros, empresa };
}
const req = { params: { cnpj: '12345678000100' } };

test('histórico guarda data, status e placeId, sem copiar telefone para banco', async () => {
  const { handler, res, registros, empresa } = preparar();
  await handler(req, res);
  assert.equal(res.codigo, 200);
  assert.equal(res.cabecalhos['Cache-Control'], 'no-store');
  assert.equal(res.dados.contato.telefone, '11987654321');
  assert.equal(empresa.telefone1, '1132345678');
  assert.doesNotMatch(JSON.stringify(registros), /11987654321|contato|telefone/);
  assert.equal(registros[1].placeId, 'abc');
});
test('sem chave, limite global ou repetição não provocam chamadas pagas', async () => {
  let chamadas = 0;
  for (const [opcoes, esperado] of [[{ chave: '' }, 503], [{ count: 1000000 }, 429], [{ repetida: true }, 429]]) {
    const { handler, res } = preparar({ ...opcoes, consultar: async () => { chamadas++; } });
    await handler(req, res);
    assert.equal(res.codigo, esperado);
  }
  assert.equal(chamadas, 0);
});
test('CNPJ inválido e erro de provedor não sobrescrevem contato existente', async () => {
  const primeiro = preparar();
  await primeiro.handler({ params: { cnpj: 'invalido' } }, primeiro.res);
  assert.equal(primeiro.res.codigo, 400);
  const segundo = preparar({ consultar: async () => { throw Object.assign(new Error('Indisponivel'), { status: 502 }); } });
  await segundo.handler(req, segundo.res);
  assert.equal(segundo.res.codigo, 502);
  assert.equal(segundo.empresa.telefone1, '1132345678');
  assert.equal(segundo.registros.at(-1).status, 'erro');
});
test('rota HTTP retorna instrução de configuração sem chave e sem acesso externo', async () => {
  const app = express();
  app.post('/empresas/contato-google/:cnpj', criarConsultaGoogle({ chave: () => '' }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/empresas/contato-google/12345678000100`, { method: 'POST' });
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match((await r.json()).mensagem, /GOOGLE_PLACES_API_KEY/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
