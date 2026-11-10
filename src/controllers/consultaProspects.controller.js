import { prisma } from '../prisma/client.js';
import { consultarProspects } from '../services/consultaProspects.js';
import { gerarPlanilhaComercial } from '../services/exportarExcel.service.js';
import { montarIndiceClientesBase, separarEmpresasExportaveis, lerBaseVortechArquivoSeguro } from './empresas.controller.js';
import { contatosEmpresa, STATUS_CONTATO } from '../../public/contatos.js';
import { nomePlanilha, CATEGORIAS } from '../../public/consulta.js';

export function criarConsultaProspects({ db = prisma, consultar = consultarProspects, lerBase = lerBaseVortechArquivoSeguro } = {}) {
  return {
    listar: async (req, res) => {
      try {
        const resultado = await consultar(db, req.query);
        return res.json({ sucesso: true, ...resultado });
      } catch (error) {
        return res.status(error.code ? 500 : 400).json({ sucesso: false, mensagem: error.code ? 'Nao foi possivel consultar a base.' : error.message });
      }
    },
    exportar: async (req, res) => {
      try {
        const escopo = req.body?.escopo;
        if (!['pagina', 'todos'].includes(escopo)) throw new Error('Escolha a lista da pagina ou toda a busca.');
        let cnpjs;
        if (escopo === 'pagina') {
          cnpjs = Array.isArray(req.body.cnpjs) ? [...new Set(req.body.cnpjs)] : [];
          if (!cnpjs.length || cnpjs.length > 500 || cnpjs.some(c => typeof c !== 'string' || !/^\d{14}$/.test(c))) {
            throw new Error('Selecione entre 1 e 500 empresas da pagina para exportar.');
          }
        }
        const resultado = await consultar(db, req.body?.consulta, { todos: true, cnpjs });
        let lista = resultado.empresas;
        if (cnpjs) {
          const porCnpj = new Map(lista.map(e => [e.cnpj, e]));
          lista = cnpjs.map(c => porCnpj.get(c)).filter(Boolean);
        }
        const base = Array.isArray(req.body?.baseVortech) ? req.body.baseVortech : [];
        const clientes = montarIndiceClientesBase([...lerBase(), ...base]);
        const { novas, removidasBase, removidasSituacao } = separarEmpresasExportaveis(lista, clientes);
        const registros = req.body?.contatos && typeof req.body.contatos === 'object' && !Array.isArray(req.body.contatos) ? req.body.contatos : {};
        const exportaveis = novas.map(empresa => {
          const contatos = contatosEmpresa(empresa, registros).filter(c => !c.bloqueado);
          return { ...empresa, telefone1: contatos[0]?.numero || null, telefone2: contatos[1]?.numero || null,
            statusContato: contatos[0] ? STATUS_CONTATO[contatos[0].status] : 'Sem telefone valido ou numero marcado como errado' };
        }).filter(empresa => resultado.consulta.contato === 'telefone' ? Boolean(empresa.telefone1 || empresa.telefone2)
          : resultado.consulta.contato === 'celular' ? [empresa.telefone1, empresa.telefone2].some(t => t?.length === 11) : true);
        if (!exportaveis.length) throw new Error('Nenhuma empresa nova para exportar com esses filtros. Confira a Base Vortech e os contatos selecionados.');
        const nome = nomePlanilha(resultado.consulta, escopo);
        res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${nome}.xlsx"`, 'Cache-Control': 'no-store',
          'X-Total-Encontrado': String(lista.length), 'X-Total-Exportado': String(exportaveis.length),
          'X-Total-Removido': String(removidasBase + removidasSituacao + novas.length - exportaveis.length) });
        return res.send(gerarPlanilhaComercial(exportaveis, CATEGORIAS.find(c => c.id === resultado.consulta.grupo)?.nome));
      } catch (error) {
        return res.status(error.code ? 500 : 400).json({ sucesso: false, mensagem: error.code ? 'Nao foi possivel gerar a planilha.' : error.message });
      }
    }
  };
}

export const consultaProspects = criarConsultaProspects();
