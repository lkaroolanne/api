import { Router } from "express";

import {
  prospectarGoogle,
  listarProspectsGoogle,
  exportarExcel
} from "../controllers/prospeccao.controller.js";

const router = Router();

router.get("/google", prospectarGoogle);
router.get("/google/listar", listarProspectsGoogle);
router.get("/exportar-excel", exportarExcel);

export default router;