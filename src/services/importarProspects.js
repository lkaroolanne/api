import xlsx from 'xlsx';
import { normalizarEmail } from './qualidadeProspect.js';

export function lerProspects(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (!linhas.length || !Object.hasOwn(linhas[0], 'CNPJ') ||
      !['Razao Social', 'Razão Social'].some(k => Object.hasOwn(linhas[0], k))) {
    throw new Error('Use uma planilha com CNPJ e Razao Social. Colunas opcionais: CNAE, Segmento e Email.');
  }
  const registros = new Map();
  let invalidos = 0, duplicados = 0, emailsInvalidos = 0;
  const texto = v => String(v ?? '').trim() || null;
  for (const linha of linhas) {
    const cnpj = String(linha.CNPJ).replace(/\D/g, '').padStart(14, '0');
    if (!/^\d{14}$/.test(cnpj) || /^0+$/.test(cnpj)) { invalidos++; continue; }
    const email = normalizarEmail(linha.Email);
    if (texto(linha.Email) && !email) emailsInvalidos++;
    const cnae = String(linha.CNAE ?? '').replace(/\D/g, '');
    const registro = { cnpj, cnpjBasico: cnpj.slice(0, 8),
      razaoSocial: texto(linha['Razao Social'] || linha['Razão Social']),
      cnaePrincipal: /^\d{7}$/.test(cnae) ? cnae : null,
      segmento: texto(linha.Segmento), email };
    if (registros.has(cnpj)) {
      duplicados++;
      const anterior = registros.get(cnpj);
      for (const [k, v] of Object.entries(registro)) if (v) anterior[k] = v;
    } else registros.set(cnpj, registro);
  }
  return { registros: [...registros.values()], resumo: {
    linhas: linhas.length, validos: registros.size, invalidos, duplicados, emailsInvalidos
  } };
}

export async function salvarProspects(db, registros) {
  let novos = 0, existentes = 0;
  // Uma transação para impedir importações parciais em caso de erro.
  await db.$transaction(async tx => {
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const encontrados = await tx.receitaProspect.findMany({
        where: { cnpj: { in: lote.map(r => r.cnpj) } }, select: { cnpj: true }
      });
      existentes += encontrados.length;
      novos += lote.length - encontrados.length;
      await tx.$executeRaw`
        INSERT INTO "ReceitaProspect" (cnpj, "cnpjBasico", "razaoSocial", "cnaePrincipal", segmento, email, origem, "criadoEm", "atualizadoEm")
        SELECT r.cnpj, r."cnpjBasico", r."razaoSocial", r."cnaePrincipal", r.segmento, r.email,
          'Planilha Prospects', NOW(), NOW()
        FROM jsonb_to_recordset(${JSON.stringify(lote)}::jsonb)
          AS r(cnpj text, "cnpjBasico" text, "razaoSocial" text, "cnaePrincipal" text, segmento text, email text)
        ON CONFLICT (cnpj) DO UPDATE SET
          "razaoSocial" = COALESCE(EXCLUDED."razaoSocial", "ReceitaProspect"."razaoSocial"),
          "cnaePrincipal" = COALESCE(EXCLUDED."cnaePrincipal", "ReceitaProspect"."cnaePrincipal"),
          segmento = COALESCE(EXCLUDED.segmento, "ReceitaProspect".segmento),
          email = COALESCE(EXCLUDED.email, "ReceitaProspect".email), "atualizadoEm" = NOW()`;
    }
  }, { timeout: 300000, maxWait: 10000 });
  return { novos, existentes };
}
