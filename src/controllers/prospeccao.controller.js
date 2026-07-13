import { prisma } from "../prisma/client.js";
import { buscarEmpresasGooglePlaces } from "../services/googlePlaces.service.js";
import XLSX from "xlsx";

const PALAVRAS_SEGMENTO = [
  "solda",
  "soldagem",
  "gases",
  "eletrodos",
  "abrasivos",
  "ferramentas",
  "cilindros de gases",
  "máquinas de solda",
  "equipamentos de solda",
  "revenda de solda",
  "gases industriais",
  "ferramentas eletricas",
  "cilindros oxigênio",
  "equipamentos para soldagem",
  "soldagem industrial",
  "distribuidor de gases",
  "mig",
  "tig",
  "arame mig",
  "vareta tig",
  "maquinas e ferramentas",
  "gases do ar"
];

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function prospectarGoogle(req, res) {
  try {
    const { cidade, estado } = req.query;

    if (!cidade || !estado) {
      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Informe cidade e estado. Exemplo: /prospeccao/google?cidade=Campinas&estado=SP"
      });
    }

    const resultadosSalvos = [];

    for (const palavra of PALAVRAS_SEGMENTO) {
      console.log(`Buscando: ${palavra} ${cidade} ${estado}`);

      const empresas = await buscarEmpresasGooglePlaces({
        palavra,
        cidade,
        estado
      });

      for (const empresa of empresas) {
        const salva = await prisma.prospectGoogle.upsert({
          where: {
            placeId: empresa.placeId
          },
          update: empresa,
          create: empresa
        });

        resultadosSalvos.push(salva);
      }

      await esperar(12000);
    }

    return res.json({
      sucesso: true,
      mensagem: "Prospecção finalizada",
      total: resultadosSalvos.length,
      empresas: resultadosSalvos
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function listarProspectsGoogle(req, res) {
  try {
    const prospects = await prisma.prospectGoogle.findMany({
      orderBy: {
        atualizadoEm: "desc"
      }
    });

    return res.json({
      sucesso: true,
      total: prospects.length,
      prospects
    });
  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}

export async function exportarExcel(req, res) {
  try {
    const prospects = await prisma.prospectGoogle.findMany({
      orderBy: {
        atualizadoEm: "desc"
      }
    });

    const dados = prospects.map((item) => ({
      Nome: item.nome || "",
      Endereco: item.endereco || "",
      Cidade: item.cidade || "",
      Estado: item.estado || "",
      Segmento: item.segmento || "",
      Rating: item.rating || "",
      Site: item.site || "",
      GoogleMaps: item.googleMapsUri || "",
      Latitude: item.latitude || "",
      Longitude: item.longitude || ""
    }));

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(dados);

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Prospects"
    );

    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=prospects.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(excelBuffer);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
}