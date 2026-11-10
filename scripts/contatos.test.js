import test from 'node:test';
import assert from 'node:assert/strict';
import { contatosEmpresa, melhorContato, chaveContato, linkWhatsapp } from '../public/contatos.js';

const empresa = { cnpj: '12345678000100', telefone1: '1132345678', telefone2: '11987654321' };
test('prioriza celular válido e usa o segundo telefone quando o primeiro é inválido', () => {
  assert.equal(melhorContato(empresa).numero, empresa.telefone2);
  assert.equal(melhorContato({ ...empresa, telefone1: '000' }).numero, empresa.telefone2);
});
test('confirmação pertence ao par CNPJ/telefone e prioriza telefone confirmado', () => {
  const registros = { [chaveContato(empresa, empresa.telefone1)]: { status: 'confirmado' } };
  assert.equal(melhorContato(empresa, registros).numero, empresa.telefone1);
  assert.equal(melhorContato({ ...empresa, cnpj: 'outro' }, registros).status, 'pendente');
});
test('número errado perde ações, permite alternativa e pode ser reabilitado', () => {
  const registros = { [chaveContato(empresa, empresa.telefone2)]: { status: 'errado' } };
  assert.equal(melhorContato(empresa, registros).numero, empresa.telefone1);
  registros[chaveContato(empresa, empresa.telefone1)] = { status: 'errado' };
  assert.equal(melhorContato(empresa, registros), null);
  registros[chaveContato(empresa, empresa.telefone2)] = { status: 'whatsapp' };
  assert.equal(melhorContato(empresa, registros).status, 'whatsapp');
});
test('sem resposta não significa número inválido; contatos duplicados aparecem uma vez', () => {
  const registros = { [chaveContato(empresa, empresa.telefone2)]: { status: 'sem_resposta' } };
  assert.equal(contatosEmpresa(empresa, registros).find(item => item.numero === empresa.telefone2).bloqueado, false);
  assert.equal(contatosEmpresa({ ...empresa, telefone2: empresa.telefone1 }).length, 1);
});
test('WhatsApp inclui código do país mesmo para DDD 55 e codifica a mensagem', () => {
  assert.equal(linkWhatsapp('55987654321', 'Olá & compras?'), 'https://wa.me/5555987654321?text=Ol%C3%A1%20%26%20compras%3F');
  assert.equal(linkWhatsapp('123'), '');
});
