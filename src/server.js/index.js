import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import empresasRoutes from "../routes/empresas.routes.js";
import prospeccaoRoutes from "../routes/prospeccao.routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(publicDir));

app.get("/api", (req, res) => {
  res.json({
    status: "online",
    sistema: "Prospect API Vortech",
    versao: "1.0.0"
  });
});

app.use("/empresas", empresasRoutes);
app.use("/prospeccao", prospeccaoRoutes);

app.use("/empresas", (req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: "Rota de API nao encontrada"
  });
});

app.use("/prospeccao", (req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: "Rota de API nao encontrada"
  });
});

app.get("/health", (req, res) => {
  res.json({
    sucesso: true,
    servidor: "online",
    banco: "postgresql"
  });
});

app.use((req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});
