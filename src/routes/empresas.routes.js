import { Router } from "express";
import { prisma } from '../prisma/client.js';
import { lerProspects, salvarProspects } from '../services/importarProspects.js';
import { consultarGoogle } from '../controllers/contatoGoogle.controller.js';
import { consultaProspects } from '../controllers/consultaProspects.controller.js';

import {
  buscarSalvarEmpresaPorCnpj,
  buscarEmpresasPorTermo,
  listarEmpresas,
  listarEmpresasPorCnae,
  contarEmpresasPorCnae,
  obterMetricasProspects,
  obterStatusCnpjaApi,
  obterBaseVortech,
  importarBaseVortechPlanilha,
  listarContagensPorCnae,
  exportarEmpresasExcel,
  exportarEmpresasFiltradasExcel,
  exportarEmpresasPorTermoExcel,
  exportarEmpresasPorCnaeExcel
} from "../controllers/empresas.controller.js";

const router = Router();

router.post('/prospects/importar', async (req, res) => {
  try {
    const base64 = req.body?.arquivo;
    if (typeof base64 !== 'string' || !base64.length || base64.length > 14000000) {
      return res.status(400).json({ mensagem: 'Selecione uma planilha de até 10 MB.' });
    }
    const { registros, resumo } = lerProspects(Buffer.from(base64, 'base64'));
    if (!registros.length || registros.length > 100000) {
      return res.status(400).json({ mensagem: 'A planilha precisa ter entre 1 e 100 mil CNPJs válidos.' });
    }
    const resultado = req.body.aplicar === true ? await salvarProspects(prisma, registros) : {};
    res.json({ ...resumo, ...resultado, aplicado: req.body.aplicar === true });
  } catch (erro) {
    console.error('Importação de prospects:', erro.message);
    res.status(400).json({ mensagem: 'Não foi possível importar. Confira as colunas CNPJ, Razao Social, CNAE, Segmento e Email e a conexão com o banco.' });
  }
});

router.get('/consulta', consultaProspects.listar);
router.post('/consulta/exportar', consultaProspects.exportar);

router.post('/contato-google/:cnpj', consultarGoogle);

router.get("/", listarEmpresas);

router.get("/metricas", obterMetricasProspects);

router.get("/cnpja/status", obterStatusCnpjaApi);

router.get("/base-vortech", obterBaseVortech);

router.post("/base-vortech/importar", importarBaseVortechPlanilha);

router.get("/cnaes/contagens", listarContagensPorCnae);

router.get("/busca/exportar", exportarEmpresasPorTermoExcel);

router.post("/exportar-filtradas", exportarEmpresasFiltradasExcel);

router.get("/busca", buscarEmpresasPorTermo);

router.get("/cnae/:cnae/exportar", exportarEmpresasPorCnaeExcel);

router.get("/cnae/:cnae/contar", contarEmpresasPorCnae);

router.get("/cnae/:cnae", listarEmpresasPorCnae);

router.get("/buscar-cnpj/:cnpj", buscarSalvarEmpresaPorCnpj);

router.get("/exportar", exportarEmpresasExcel);

export default router;
