import { test } from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { lerProspects, salvarProspects } from '../src/services/importarProspects.js';
function planilha(linhas) {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(linhas), 'Prospects');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
test('consolida CNPJ e não substitui email válido por vazio ou inválido', () => {
  const resultado = lerProspects(planilha([
    { CNPJ: '00.129.989/0001-38', 'Razao Social': 'Empresa', Email: 'TESTE@EXEMPLO.COM', CNAE: '4744001' },
    { CNPJ: '00129989000138', 'Razao Social': '', Email: 'errado', CNAE: '' },
    { CNPJ: 'inválido', 'Razao Social': 'Ignorar' }
  ]));
  assert.equal(resultado.registros.length, 1);
  assert.equal(resultado.registros[0].email, 'teste@exemplo.com');
  assert.equal(resultado.registros[0].razaoSocial, 'Empresa');
  assert.equal(resultado.resumo.invalidos, 1);
  assert.equal(resultado.resumo.duplicados, 1);
  assert.equal(resultado.resumo.emailsInvalidos, 1);
  assert.equal(resultado.registros[0].situacao, undefined);
});
test('rejeita planilhas sem as colunas esperadas', () => {
  assert.throws(() => lerProspects(planilha([{ nome: 'Teste' }])), /CNPJ/);
});
test('importação usa transação e propaga falhas para rollback', async () => {
  let transacao = false;
  const db = { $transaction: async fn => {
    transacao = true;
    return fn({ receitaProspect: { findMany: async () => [] },
      $executeRaw: async () => { throw new Error('falha simulada'); } });
  } };
  await assert.rejects(salvarProspects(db, [{ cnpj: '00129989000138' }]), /falha simulada/);
  assert.equal(transacao, true);
});
