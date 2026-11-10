import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as contatos from '../public/contatos.js';
import * as consulta from '../public/consulta.js';

function tela() {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*?;\s*$/gm, '');
  // Check the entire page script, then run the functions without startup/network calls.
  new vm.Script(script);
  const context = vm.createContext({ ...contatos, ...consulta, console,
    window: { location: { hostname: 'localhost' }, localStorage: { getItem: () => null } },
    document: { querySelector: () => ({}) }
  });
  vm.runInContext(script.slice(0, script.indexOf('    form.addEventListener')), context);
  return code => vm.runInContext(code, context);
}

test('tela retira ações do número errado e promove o telefone alternativo', () => {
  const run = tela();
  run(`empresasAtuais = [{cnpj:'12345678000100',telefone1:'11987654321',telefone2:'1132345678',situacao:'02'}];`);
  assert.match(run('renderizarAcoesLead(enriquecerEmpresa(empresasAtuais[0]),0)'), /Verificar WhatsApp/);
  run(`estadoLocal.contatos['12345678000100:11987654321'] = {status:'errado'};`);
  const html = run('renderizarAcoesLead(enriquecerEmpresa(empresasAtuais[0]),0)');
  assert.match(html, /tel:\+551132345678/);
  assert.doesNotMatch(html, /wa\.me/);
});

test('confirmações novas vencem cache da tela; empresas baixadas não têm ações de contato', () => {
  const run = tela();
  run(`var lead = enriquecerEmpresa({cnpj:'12345678000100',telefone1:'1132345678',situacao:'02'});`);
  run(`estadoLocal.contatos['12345678000100:1132345678'] = {status:'whatsapp'};`);
  assert.match(run('renderizarAcoesLead(enriquecerEmpresa(lead),0)'), /WhatsApp confirmado/);
  assert.doesNotMatch(run(`renderizarAcoesLead(enriquecerEmpresa({...lead,situacao:'08'}),0)`), /wa\.me|tel:/);
});

test('prioriza confirmados em relação a celulares; filtros reconhecem o segundo número', () => {
  const run = tela();
  run(`var lista = [{cnpj:'1',telefone1:'1132345678',situacao:'02'}, {cnpj:'2',telefone1:'000',telefone2:'11987654321',situacao:'02'}]; estadoLocal.contatos['1:1132345678'] = {status:'confirmado'};`);
  assert.equal(run('ordenarLeads(lista.map(enriquecerEmpresa))[0].cnpj'), '1');
  assert.equal(run(`filtroAtual='celular'; filtrarLeads(lista)[0].cnpj`), '2');
  assert.equal(run(`filtroAtual='confirmados'; filtrarLeads(lista)[0].cnpj`), '1');
});

test('exportação fica bloqueada durante busca e confirmações locais não liberam exportação global', () => {
  const run = tela();
  run(`buscaAtual={consulta:normalizarConsulta({grupo:'solda',uf:'SP'}),total:238}; empresasVisiveis=[{cnpj:'12345678000100'}]; buscaEmAndamento=true; atualizarExportacao();`);
  assert.equal(run('botaoExportar.disabled'), true);
  assert.equal(run('botaoExportarBusca.disabled'), true);
  run(`buscaEmAndamento=false; filtroAtual='confirmados'; atualizarExportacao();`);
  assert.equal(run('botaoExportar.disabled'), false);
  assert.equal(run('botaoExportarBusca.disabled'), true);
});

test('lista exportada envia apenas CNPJs filtrados da página e a consulta que gerou o resultado', async () => {
  const run = tela();
  run(`buscaAtual={consulta:normalizarConsulta({grupo:'solda',uf:'SP',contato:'telefone'}),total:238}; empresasVisiveis=[{cnpj:'12345678000100'},{cnpj:'98765432000100'}]; globalThis.fetch=async(url,opcoes)=>{globalThis.envio=JSON.parse(opcoes.body);return {ok:false,status:400,json:async()=>({mensagem:'fim do teste'})};};`);
  await run(`exportarConsulta('pagina')`);
  assert.equal(run('envio.escopo'), 'pagina');
  assert.equal(run('envio.consulta.uf'), 'SP');
  assert.equal(run('envio.cnpjs.join(",")'), '12345678000100,98765432000100');
  assert.equal(run('exportacaoEmAndamento'), false);
});
