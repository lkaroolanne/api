import { Router } from "express";

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
