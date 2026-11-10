import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefone, normalizarEmail, selecionarSegmento } from '../src/services/qualidadeProspect.js';

test('preserva fixos e celulares válidos, com formatação e código do país', () => {
  assert.equal(normalizarTelefone('+55 (11) 98765-4321'), '11987654321');
  assert.equal(normalizarTelefone('(55) 3234-5678'), '5532345678');
  assert.equal(normalizarTelefone('1132345678'), '1132345678');
});
test('descarta DDD inexistente, repetição, celular antigo e dígitos ausentes', () => {
  for (const numero of ['20987654321', '11999999999', '1187654321', '987654321', '', '1100000000']) {
    assert.equal(normalizarTelefone(numero), null, numero);
  }
});
test('normaliza email e rejeita campos malformados', () => {
  assert.equal(normalizarEmail(' CONTATO@EXEMPLO.COM.BR '), 'contato@exemplo.com.br');
  assert.equal(normalizarEmail('sem email'), null);
});
test('mantém revendas diretas e exige nome aderente em CNAEs amplos', () => {
  assert.ok(selecionarSegmento({ cnaePrincipal: '4744001' }));
  assert.ok(selecionarSegmento({ cnaePrincipal: '4663000', nomeFantasia: 'Casa da Soldagem' }));
  assert.equal(selecionarSegmento({ cnaePrincipal: '4759899', nomeFantasia: 'Antiga Loja', logradouro: 'Rua da Solda', email: 'solda@exemplo.com' }), null);
  assert.equal(selecionarSegmento({ cnaePrincipal: '4684299', nomeFantasia: 'Quimica Geral' }), null);
});
test('aceita CNAE secundário relevante somente com evidência no nome', () => {
  assert.ok(selecionarSegmento({ cnaePrincipal: '0000000', cnaeSecundarios: '4672900,4663000', nomeFantasia: 'Distribuidora de Ferramentas' }));
  assert.equal(selecionarSegmento({ cnaePrincipal: '0000000', cnaeSecundarios: '4672900', nomeFantasia: 'Loja Geral' }), null);
});
