import { Router } from "express";

import {
  buscarSalvarEmpresaPorCnpj,
  buscarEmpresasPorTermo,
  listarEmpresas,
  listarEmpresasPorCnae,
  contarEmpresasPorCnae,
  obterMetricasProspects,
  exportarEmpresasExcel,
  exportarEmpresasPorTermoExcel,
  exportarEmpresasPorCnaeExcel
} from "../controllers/empresas.controller.js";

const router = Router();

router.get("/", listarEmpresas);

router.get("/metricas", obterMetricasProspects);

router.get("/busca/exportar", exportarEmpresasPorTermoExcel);

router.get("/busca", buscarEmpresasPorTermo);

router.get("/cnae/:cnae/exportar", exportarEmpresasPorCnaeExcel);

router.get("/cnae/:cnae/contar", contarEmpresasPorCnae);

router.get("/cnae/:cnae", listarEmpresasPorCnae);

router.get("/buscar-cnpj/:cnpj", buscarSalvarEmpresaPorCnpj);

router.get("/exportar", exportarEmpresasExcel);

export default router;
