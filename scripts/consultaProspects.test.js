import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { normalizarConsulta, nomePlanilha } from '../public/consulta.js';
import { montarConsultaProspects } from '../src/services/consultaProspects.js';
import { criarConsultaProspects } from '../src/controllers/consultaProspects.controller.js';

const consulta = { grupo: 'solda', uf: 'SP', contato: 'telefone', pagina: 2, limite: 100 };
test('situação separa pendentes e ativos sem incluir empresas inativas', () => {
  assert.equal(normalizarConsulta({}).situacao, 'ativas');
  assert.throws(() => normalizarConsulta({ situacao: 'qualquer' }));
  const pendentes = montarConsultaProspects({ situacao: 'pendentes' }).where.text;
  assert.match(pendentes, /NULLIF/);
  assert.doesNotMatch(pendentes, /IN \('02'/);
  const ambas = montarConsultaProspects({ situacao: 'ativas-pendentes' }).where.text;
  assert.match(ambas, /IN \('02', '2', 'ativa', 'ativo'\).* OR .*NULLIF/);
});
const empresas = [
  { cnpj: '12345678000100', cnpjBasico: '12345678', razaoSocial: 'Alpha Soldas', situacao: '02', telefone1: '11987654321', email: 'a@example.com', uf: 'SP' },
  { cnpj: '87654321000100', cnpjBasico: '87654321', razaoSocial: 'Beta Soldas', situacao: '02', telefone1: '1132345678', uf: 'SP' },
  { cnpj: '98765432000100', cnpjBasico: '98765432', razaoSocial: 'Gama Soldas', situacao: '02', telefone1: '1145678901', uf: 'SP' }
];
const resposta = () => ({ codigo: 200, headers: {}, status(c) { this.codigo = c; return this; }, json(d) { this.dados = d; return this; }, set(h) { Object.assign(this.headers, h); return this; }, send(b) { this.buffer = b; return this; } });

test('busca permite nome opcional, valida filtros e nomeia arquivos pelo estado, contato e pagina', () => {
  assert.equal(normalizarConsulta({}).termo, '');
  for (const entrada of [{ grupo: 'qualquer' }, { uf: 'XX' }, { contato: 'qualquer' }, { limite: 10000 }, { pagina: -1 }]) assert.throws(() => normalizarConsulta(entrada));
  assert.equal(nomePlanilha(consulta, 'pagina', new Date('2026-11-11T01:30:00Z')), 'vortech-solda-sp-telefone-pagina-2-2026-11-10');
  assert.match(nomePlanilha(consulta, 'todos'), /busca-completa/);
});
test('CNPJ formatado consulta exatamente CNPJ; CNAE formatado usa CNAE e nao confunde os dois', () => {
  const cnpj = montarConsultaProspects({ termo: '12.345.678/0001-00' }).where;
  assert.match(cnpj.text, /e.cnpj =/);
  assert.ok(cnpj.values.includes('12345678000100'));
  assert.doesNotMatch(cnpj.text, /cnaePrincipal/);
  assert.match(montarConsultaProspects({ termo: '47.44-0\/01' }).where.text, /cnaePrincipal/);
});
test('termos, UF e padroes usam parametros, sem concatenar entrada em SQL', () => {
  const q = montarConsultaProspects({ termo: "alpha'; DROP TABLE teste;--", uf: 'SP', grupo: 'solda' }).where;
  assert.doesNotMatch(q.text, /DROP|alpha|teste/);
  assert.ok(q.values.includes('SP'));
  assert.ok(q.values.includes('\\mdrop'));
});
test('pagina vazia nunca vira exportacao de toda a base', async () => {
  let chamadas = 0;
  const api = criarConsultaProspects({ consultar: async () => { chamadas++; }, lerBase: () => [] });
  const res = resposta();
  await api.exportar({ body: { consulta, escopo: 'pagina', cnpjs: [] } }, res);
  assert.equal(res.codigo, 400);
  assert.equal(chamadas, 0);
});
test('Excel da pagina respeita ordem, exclusao da Base Vortech e numeros marcados errados', async () => {
  const selecionadas = [empresas[2].cnpj, empresas[0].cnpj, empresas[1].cnpj];
  const api = criarConsultaProspects({ db: {}, lerBase: () => [], consultar: async (_, entrada, opcoes) => {
    assert.deepEqual(entrada, consulta);
    assert.deepEqual(opcoes.cnpjs, selecionadas);
    return { consulta, empresas };
  } });
  const res = resposta();
  await api.exportar({ body: { consulta, escopo: 'pagina', cnpjs: selecionadas,
    baseVortech: [{ cnpj: empresas[0].cnpj, razaoSocial: empresas[0].razaoSocial }],
    contatos: { [`${empresas[1].cnpj}:${empresas[1].telefone1}`]: { status: 'errado' } } } }, res);
  assert.equal(res.codigo, 200);
  assert.equal(res.headers['X-Total-Exportado'], '1');
  assert.equal(res.headers['X-Total-Removido'], '2');
  const wb = XLSX.read(res.buffer, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].Empresa, 'Gama Soldas');
  assert.ok(wb.Sheets[wb.SheetNames[0]]['!autofilter']);
  assert.match(res.headers['Content-Disposition'], /solda-sp-telefone-pagina-2/);
});
test('busca completa usa os mesmos filtros e nao se limita aos CNPJs da pagina', async () => {
  const api = criarConsultaProspects({ db: {}, lerBase: () => [], consultar: async (_, entrada, opcoes) => {
    assert.deepEqual(entrada, consulta);
    assert.equal(opcoes.todos, true);
    assert.equal(opcoes.cnpjs, undefined);
    return { consulta, empresas };
  } });
  const res = resposta();
  await api.exportar({ body: { consulta, escopo: 'todos', cnpjs: [empresas[0].cnpj] } }, res);
  assert.equal(res.headers['X-Total-Exportado'], '3');
  assert.match(res.headers['Content-Disposition'], /busca-completa/);
});
