import XLSX from "xlsx";

export function gerarPlanilhaEmpresas(empresas) {
  const dados = empresas.map((empresa) => ({
    CNPJ: empresa.cnpj,
    "Razao Social": empresa.razaoSocial,
    "Nome Fantasia": empresa.nomeFantasia,
    Situacao: empresa.situacao,
    Porte: empresa.porte || empresa.porteEmpresa,
    "Natureza Juridica": empresa.naturezaJuridica,
    "Capital Social": empresa.capitalSocial,
    CNAE: empresa.cnaePrincipal,
    "CNAEs Secundarios": empresa.cnaeSecundarios,
    "Descricao CNAE": empresa.cnaeDescricao,
    Telefone: empresa.telefone || empresa.telefone1,
    "Telefone 2": empresa.telefone2,
    Email: empresa.email,
    Site: empresa.site,
    CEP: empresa.cep,
    Endereco: empresa.endereco || [
      empresa.tipoLogradouro,
      empresa.logradouro,
      empresa.numero,
      empresa.complemento
    ].filter(Boolean).join(" "),
    Bairro: empresa.bairro,
    Cidade: empresa.cidade || empresa.municipioCodigo,
    Estado: empresa.estado || empresa.uf,
    Latitude: empresa.latitude,
    Longitude: empresa.longitude,
    Segmento: empresa.segmento,
    Origem: empresa.origem,
    Observacao: empresa.observacao
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Prospects");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
}
