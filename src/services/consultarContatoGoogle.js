import axios from 'axios';
import { selecionarCorrespondencia } from './correspondenciaGoogle.js';

export async function consultarContatoGoogle(empresa, { apiKey = process.env.GOOGLE_PLACES_API_KEY, http = axios } = {}) {
  if (!apiKey) throw Object.assign(new Error('Configure GOOGLE_PLACES_API_KEY no servidor.'), { status: 503 });
  if (!empresa.nomeFantasia && !empresa.razaoSocial) throw Object.assign(new Error('Empresa sem nome para consulta.'), { status: 422 });
  if (!/^\d{8}$/.test(String(empresa.cep || '').replace(/\D/g, '')) || !empresa.numero || !empresa.logradouro || !empresa.uf) {
    throw Object.assign(new Error('Cadastro precisa de CEP, logradouro, numero e UF para comparar com seguranca.'), { status: 422 });
  }
  const textQuery = [empresa.nomeFantasia || empresa.razaoSocial, empresa.tipoLogradouro, empresa.logradouro, empresa.numero, empresa.cep, empresa.uf, 'Brasil'].filter(Boolean).join(' ');
  let data;
  try {
    ({ data } = await http.post('https://places.googleapis.com/v1/places:searchText', {
      textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 5
    }, {
      timeout: 15000,
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus,places.internationalPhoneNumber,places.nationalPhoneNumber,places.googleMapsUri,places.attributions' }
    }));
  } catch (error) {
    // Não propagar objetos Axios: eles contêm a chave nos cabeçalhos.
    const codigo = error.response?.status;
    throw Object.assign(new Error(codigo === 403 ? 'Google recusou a consulta. Confira chave, Places API (New), restricoes e faturamento.' : codigo === 429 ? 'Limite de consultas do Google atingido.' : 'Nao foi possivel consultar o Google agora.'), { status: codigo === 429 ? 429 : 502 });
  }
  const resultado = selecionarCorrespondencia(empresa, data.places || []);
  if (!resultado.selecionado) return { status: resultado.status, contato: null };
  const { place, avaliacao } = resultado.selecionado;
  return {
    status: 'compativel', placeId: place.id,
    contato: { nome: place.displayName?.text, endereco: place.formattedAddress,
      telefone: avaliacao.telefone, celular: avaliacao.telefone.length === 11,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName?.text || 'empresa')}&query_place_id=${encodeURIComponent(place.id)}`,
      attributions: place.attributions || [], atendimentoConfirmado: false, whatsappConfirmado: false }
  };
}
