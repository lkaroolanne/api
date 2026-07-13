import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import empresasRoutes from "../routes/empresas.routes.js";
import prospeccaoRoutes from "../routes/prospeccao.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "online",
    sistema: "Prospect API Vortech",
    versao: "1.0.0"
  });
});

app.use("/empresas", empresasRoutes);
app.use("/prospeccao", prospeccaoRoutes);

app.get("/health", (req, res) => {
  res.json({
    sucesso: true,
    servidor: "online",
    banco: "postgresql"
  });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});
