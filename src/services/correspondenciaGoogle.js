import { normalizarTelefone } from '../../public/contatos.js';

const ignorar = new Set('de da do das dos e a o ltda limitada me epp eireli sa comercio comercial industria industrial industrias industriais servico servicos solda soldas soldagem ferramenta ferramentas ferragem ferragens maquina maquinas gas gases quimica quimicos casa loja distribuidora distribuidor'.split(' '));
const limpar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const numeros = valor => String(valor || '').replace(/\D/g, '');
const tokens = valor => limpar(valor).split(' ').filter(t => t.length >= 3 && !ignorar.has(t) && !/^\d+$/.test(t));

function nomeCompativel(empresa, nome) {
  const destino = new Set(tokens(nome));
  return [empresa.nomeFantasia, empresa.razaoSocial].some(valor => {
    const origem = [...new Set(tokens(valor))];
    return origem.length && origem.filter(t => destino.has(t)).length / origem.length >= 0.8;
  });
}

function componente(place, tipo) {
  const item = (place.addressComponents || []).find(c => c.types?.includes(tipo));
  return item?.shortText || item?.longText || '';
}

export function avaliarCorrespondencia(empresa, place) {
  const cep = numeros(empresa.cep);
  const numero = limpar(empresa.numero);
  const rua = valor => limpar(valor).split(' ').filter(t => t && !['rua', 'avenida', 'av', 'r', 'rodovia', 'estrada', 'de', 'da', 'do', 'dos', 'das'].includes(t));
  const ruaOrigem = rua(empresa.logradouro);
  const ruaDestino = new Set(rua(componente(place, 'route')));
  const ruaConfere = ruaOrigem.length > 0 && ruaOrigem.filter(t => ruaDestino.has(t)).length / ruaOrigem.length >= 0.8;
  const motivos = [];
  if (!nomeCompativel(empresa, place.displayName?.text)) motivos.push('Nome sem correspondencia suficiente');
  if (cep.length !== 8 || cep !== numeros(componente(place, 'postal_code'))) motivos.push('CEP ausente ou divergente');
  if (!/^\d+[a-z]?$/.test(numero) || numero !== limpar(componente(place, 'street_number'))) motivos.push('Numero do endereco ausente ou divergente');
  if (!empresa.uf || limpar(empresa.uf) !== limpar(componente(place, 'administrative_area_level_1'))) motivos.push('UF ausente ou divergente');
  if (componente(place, 'country').toUpperCase() !== 'BR') motivos.push('Pais divergente');
  if (!ruaConfere) motivos.push('Logradouro sem correspondencia suficiente');
  if (place.businessStatus !== 'OPERATIONAL') motivos.push('Estabelecimento nao informado como operacional');
  const telefone = [place.internationalPhoneNumber, place.nationalPhoneNumber].map(normalizarTelefone).find(Boolean);
  if (!telefone) motivos.push('Sem telefone em formato valido');
  return { compativel: motivos.length === 0, motivos, telefone: motivos.length ? null : telefone };
}

export function selecionarCorrespondencia(empresa, places) {
  const unicos = [...new Map(places.filter(p => p.id).map(p => [p.id, p])).values()];
  const correspondencias = unicos.map(place => ({ place, avaliacao: avaliarCorrespondencia(empresa, place) }))
    .filter(item => item.avaliacao.compativel);
  if (correspondencias.length !== 1) return { status: correspondencias.length ? 'ambiguo' : 'sem_correspondencia', selecionado: null };
  return { status: 'compativel', selecionado: correspondencias[0] };
}
