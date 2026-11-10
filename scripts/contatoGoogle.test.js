import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarCorrespondencia, selecionarCorrespondencia } from '../src/services/correspondenciaGoogle.js';
import { consultarContatoGoogle } from '../src/services/consultarContatoGoogle.js';

const empresa = { cnpj: '12345678000100', nomeFantasia: 'Alpha Soldas', razaoSocial: 'Alpha Comercio Ltda', cep: '13010000', numero: '123', logradouro: 'Rua das Flores', uf: 'SP' };
const place = { id: 'abc', displayName: { text: 'Alpha Soldas' }, formattedAddress: 'Rua das Flores, 123', businessStatus: 'OPERATIONAL', internationalPhoneNumber: '+55 11 98765-4321', addressComponents: [
  { types: ['postal_code'], shortText: '13010-000' }, { types: ['street_number'], shortText: '123' },
  { types: ['route'], shortText: 'Rua das Flores' }, { types: ['administrative_area_level_1'], shortText: 'SP' },
  { types: ['country'], shortText: 'BR' }
] };

test('exige nome distintivo, CEP, rua, numero, UF e funcionamento compativeis', () => {
  assert.equal(avaliarCorrespondencia(empresa, place).telefone, '11987654321');
  for (const alteracao of [{ nomeFantasia: 'Beta Soldas', razaoSocial: 'Beta' }, { cep: '99999999' }, { numero: '124' }, { uf: 'RJ' }, { logradouro: 'Rua das Pedras' }, { numero: 'S/N' }]) {
    assert.equal(avaliarCorrespondencia({ ...empresa, ...alteracao }, place).compativel, false, JSON.stringify(alteracao));
  }
  assert.equal(avaliarCorrespondencia(empresa, { ...place, businessStatus: 'CLOSED_PERMANENTLY' }).telefone, null);
});
test('nome apenas generico, telefones invalidos e filiais ambiguas nao recebem telefone associado', () => {
  assert.equal(avaliarCorrespondencia({ ...empresa, nomeFantasia: 'Casa da Solda', razaoSocial: 'Ferragens Ltda' }, place).compativel, false);
  assert.equal(avaliarCorrespondencia(empresa, { ...place, internationalPhoneNumber: '000' }).telefone, null);
  assert.equal(selecionarCorrespondencia(empresa, [place, { ...place, id: 'outra-filial' }]).status, 'ambiguo');
  assert.equal(selecionarCorrespondencia(empresa, [place, place]).status, 'compativel');
});
test('consulta pede somente campos necessarios e nao confirma atendimento ou WhatsApp', async () => {
  const resultado = await consultarContatoGoogle(empresa, { apiKey: 'chave-teste', http: { post: async (url, body, config) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(body.pageSize, 5);
    assert.match(body.textQuery, /13010000/);
    assert.equal(config.headers['X-Goog-Api-Key'], 'chave-teste');
    assert.doesNotMatch(config.headers['X-Goog-FieldMask'], /\*/);
    return { data: { places: [place] } };
  } } });
  assert.equal(resultado.contato.telefone, '11987654321');
  assert.equal(resultado.contato.whatsappConfirmado, false);
  assert.equal(resultado.contato.atendimentoConfirmado, false);
});
test('sem chave ou endereco suficiente nao efetua chamada paga e erro externo nao expoe credenciais', async () => {
  const http = { post: () => { throw new Error('Nao deveria chamar'); } };
  await assert.rejects(consultarContatoGoogle(empresa, { apiKey: '', http }), { status: 503 });
  await assert.rejects(consultarContatoGoogle({ ...empresa, cep: '' }, { apiKey: 'teste', http }), { status: 422 });
  await assert.rejects(consultarContatoGoogle(empresa, { apiKey: 'SEGREDO', http: { post: async () => { throw Object.assign(new Error('SEGREDO'), { response: { status: 403 } }); } } }), error => error.status === 502 && !error.message.includes('SEGREDO'));
});
