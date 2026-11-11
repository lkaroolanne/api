const arquivo = document.querySelector('#prospects-arquivo');
const conferir = document.querySelector('#prospects-conferir');
const salvar = document.querySelector('#prospects-salvar');
const status = document.querySelector('#prospects-status');
const local = ['', 'localhost', '127.0.0.1'].includes(location.hostname);
const api = (window.API_URL || localStorage.getItem('API_URL') ||
  (local ? 'http://localhost:3001' : (location.hostname.endsWith('github.io') ? '' : location.origin))).replace(/\/$/, '');
let conferido = null;
arquivo.addEventListener('change', () => { conferido = null; salvar.disabled = true; });
async function importar(aplicar) {
  const selecionado = arquivo.files[0];
  if (!selecionado || selecionado.size > 10 * 1024 * 1024) {
    status.textContent = 'Selecione uma planilha de até 10 MB.'; return;
  }
  if (aplicar && conferido !== selecionado) return;
  conferir.disabled = salvar.disabled = arquivo.disabled = true;
  status.textContent = aplicar ? 'Salvando atualização. Aguarde…' : 'Conferindo planilha…';
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(selecionado);
    });
    if (!api) throw new Error('Configure a URL do backend para importar.');
    const resposta = await fetch(`${api}/empresas/prospects/importar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arquivo: base64, aplicar })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.mensagem);
    status.textContent = `${dados.linhas.toLocaleString('pt-BR')} linhas; ${dados.validos.toLocaleString('pt-BR')} CNPJs únicos; ${dados.duplicados} duplicados; ${dados.invalidos} linhas inválidas; ${dados.emailsInvalidos} e-mails descartados.`;
    if (aplicar) {
      status.textContent += ` Salvo: ${dados.novos} novos e ${dados.existentes} existentes processados. Faça uma nova busca para ver os dados atualizados.`;
      conferido = null;
    } else {
      conferido = selecionado;
      status.textContent += ' Pronto para salvar. Telefones, endereço e situação existentes serão preservados.';
    }
  } catch (erro) {
    conferido = null;
    status.textContent = erro.message || 'Não foi possível concluir a importação.';
  } finally {
    conferir.disabled = arquivo.disabled = false;
    salvar.disabled = !conferido;
  }
}
conferir.addEventListener('click', () => importar(false));
salvar.addEventListener('click', () => importar(true));
