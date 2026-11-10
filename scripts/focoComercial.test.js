import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarFocoComercial, classificarPalavrasComerciais } from '../src/services/focoComercial.js';
const classificar = dados => classificarFocoComercial({ situacao: '02', ...dados });

test('mantém solda explícita no nome fantasia ou razão social, com acentos e pontuação', () => {
  for (const dados of [{ nomeFantasia: 'Tech-Solda' }, { razaoSocial: 'Comércio de Eletrodos Ltda' }, { nomeFantasia: 'Soldagem Industrial' }]) {
    assert.equal(classificar(dados).grupo, 'Solda');
    assert.equal(classificar(dados).manter, true);
  }
});
test('mantém gases industriais e técnicos, sem tratar gás de cozinha ou medicinal como industrial', () => {
  for (const nome of ['Gases Industriais', 'Oxigênio Industrial', 'Comércio de Argônio e Acetileno']) {
    assert.equal(classificar({ nomeFantasia: nome }).grupo, 'Gases industriais');
  }
  for (const nome of ['Depósito de Gás GLP', 'Oxigênio Medicinal', 'Gases e Bebidas']) {
    assert.equal(classificar({ nomeFantasia: nome }).manter, false);
  }
});
test('não aceita CNAE amplo, segmento gerado, endereço ou e-mail como evidência', () => {
  assert.equal(classificar({ cnaePrincipal: '4744001', nomeFantasia: 'Ferragens Gerais', segmento: 'Revenda para solda', logradouro: 'Rua da Soldagem', email: 'solda@exemplo.com' }).manter, false);
});
test('não confunde partes de palavras com termos de solda', () => {
  for (const nome of ['Antiga Loja', 'Soldan Ferragens', 'Amigas Ferramentas', 'Casa Sol da Manhã']) {
    assert.equal(classificar({ nomeFantasia: nome }).manter, false);
  }
});
test('nome comercial não supera situação não ativa ou desconhecida', () => {
  for (const situacao of ['08', '03', '', null]) {
    assert.equal(classificar({ nomeFantasia: 'Casa da Solda', situacao }).manter, false);
  }
});

test('ampliação considera as palavras dos atalhos em nomes cadastrados', () => {
  for (const nome of ['Ferragens Silva', 'Casa das Ferramentas', 'Atacado de Ferramentas', 'Máquinas ABC', 'Produtos Químicos', 'Reguladores ABC']) {
    assert.equal(classificarPalavrasComerciais({ situacao: '02', nomeFantasia: nome }).manter, true, nome);
  }
  assert.equal(classificarPalavrasComerciais({ situacao: '02', nomeFantasia: 'Atacado de Ferramentas' }).grupo, 'Atacado de ferramentas');
});

test('ampliação não usa CNAE amplo nem email como substitutos de nome compatível', () => {
  assert.equal(classificarPalavrasComerciais({ situacao: '02', nomeFantasia: 'Loja ABC', cnaePrincipal: '4744001', email: 'ferramentas@exemplo.com' }).manter, false);
  assert.equal(classificarPalavrasComerciais({ situacao: '08', nomeFantasia: 'Ferragens ABC' }).manter, false);
  assert.equal(classificarPalavrasComerciais({ situacao: '02', nomeFantasia: 'Distribuidora de Gás GLP' }).manter, false);
});
