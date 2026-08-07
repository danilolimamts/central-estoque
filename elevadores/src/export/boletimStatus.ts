/* ============================================================
   Boletim do Status do Projeto: a imagem do proprio painel.

   Em vez de redesenhar os numeros, a imagem sai do que esta na tela,
   com os mesmos graficos que a pessoa acabou de olhar. E o mesmo
   caminho do boletim do Inventario Rotativo.

   O que nao faz sentido no e-mail (filtros, tabelas longas e os
   controles de exportacao) fica marcado com a classe abaixo e sai da
   captura. A pagina viva nao e alterada: o html2canvas trabalha sobre
   um clone dela.
   ============================================================ */
import html2canvas from 'html2canvas';
import type { Acao, MetricasProjeto } from '../domain/tipos';
import { explicarSaude, proximosPassos, montarMatriz, situacaoDe } from '../domain/projeto';
import { LOGO_HORIZONTAL } from '../dados/logo';

/* Marque com esta classe o que deve ficar de fora do boletim. */
export const CLASSE_FORA = 'fora-do-boletim';

/* O contrario: bloco que existe so no boletim. Fica escondido na tela
   e aparece na captura, quando a classe e retirada do clone.

   Serve para o que faz sentido no relatorio mas nao na pagina - a
   saude do estoque, por exemplo, mora no Dashboard Geral e nao teria
   por que ser repetida na tela do projeto, mas quem recebe o e-mail
   precisa dela junto do andamento. */
export const CLASSE_SO_BOLETIM = 'so-no-boletim';

const FUNDO = '#F1F2F6';

const ROTULO_SAUDE = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
} as const;

const COR_SAUDE = {
  saudavel: '#1F7A4C',
  atencao: '#B8860B',
  critico: '#C83812',
} as const;

export interface DadosBoletim {
  titulo: string;
  subtitulo: string;
  data: string;
  score: number;
  saudeRotulo: string;
  saudeCor: string;
}

export function dadosDoBoletim(
  metricas: MetricasProjeto,
  data: Date,
  local = 'CD Cajamar'
): DadosBoletim {
  return {
    titulo: 'Equalização de Elevadores',
    subtitulo: `Status do projeto · ${local}`,
    data: data.toLocaleDateString('pt-BR'),
    score: metricas.score,
    saudeRotulo: ROTULO_SAUDE[metricas.saude],
    saudeCor: COR_SAUDE[metricas.saude],
  };
}

/* Faixa da marca no topo da imagem. Vai por HTML mesmo, para nascer
   com as fontes e o tema da pagina, igual ao resto do boletim. */
function montarCabecalho(doc: Document, dados: DadosBoletim): HTMLElement {
  const faixa = doc.createElement('div');
  faixa.className = 'eq-boletim-topo';
  faixa.innerHTML = `
    <img src="${LOGO_HORIZONTAL}" alt="Loja do Mecânico" />
    <div class="eq-boletim-titulo">
      <strong>${dados.titulo}</strong>
      <span>${dados.subtitulo}</span>
    </div>
    <div class="eq-boletim-selos">
      <div class="eq-boletim-score">
        <b>${dados.score}</b>
        <span>score</span>
      </div>
      <div class="eq-boletim-saude" style="background:${dados.saudeCor}">${dados.saudeRotulo}</div>
      <time>${dados.data}</time>
    </div>`;
  return faixa;
}

function montarRodape(doc: Document): HTMLElement {
  const pe = doc.createElement('div');
  pe.className = 'eq-boletim-pe';
  pe.textContent =
    'Boletim gerado pela Central de Equalização de Elevadores · Loja do Mecânico. Os números respeitam os filtros aplicados na tela.';
  return pe;
}

/* Captura o painel. O clone recebe a faixa da marca, perde o que esta
   marcado para sair e ganha largura fixa, para o boletim nao depender
   do tamanho da janela de quem gerou. */
export async function gerarBoletim(
  alvo: HTMLElement,
  dados: DadosBoletim,
  opcoes: { escala?: number; largura?: number } = {}
): Promise<HTMLCanvasElement> {
  const largura = opcoes.largura ?? 1180;
  return html2canvas(alvo, {
    backgroundColor: FUNDO,
    scale: opcoes.escala ?? 2,
    useCORS: true,
    logging: false,
    windowWidth: largura,
    onclone: (doc: Document, clone: HTMLElement) => {
      clone.querySelectorAll(`.${CLASSE_FORA}`).forEach((e) => e.remove());
      /* Tirar a classe basta: o display:none vem dela. */
      clone.querySelectorAll(`.${CLASSE_SO_BOLETIM}`).forEach((e) => e.classList.remove(CLASSE_SO_BOLETIM));
      clone.classList.add('eq-boletim');
      clone.style.width = `${largura}px`;
      clone.style.padding = '0';
      clone.prepend(montarCabecalho(doc, dados));
      clone.append(montarRodape(doc));
    },
  });
}

export function nomeDoArquivo(data: Date): string {
  return `boletim-status-projeto-${data.toISOString().slice(0, 10)}.png`;
}

export async function baixarBoletim(
  alvo: HTMLElement,
  dados: DadosBoletim,
  data: Date
): Promise<void> {
  const canvas = await gerarBoletim(alvo, dados);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivo(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Copiar a imagem e o caminho mais curto: cola direto no corpo do
   e-mail. Nem todo navegador deixa, por isso o retorno diz se foi. */
export async function copiarBoletim(alvo: HTMLElement, dados: DadosBoletim): Promise<boolean> {
  try {
    const canvas = await gerarBoletim(alvo, dados);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/* Resumo em texto para o corpo do e-mail, junto da imagem: quem abre
   no celular le isso antes de a imagem carregar. */
export function textoBoletim(acoes: Acao[], metricas: MetricasProjeto, data: Date): string {
  const dados = dadosDoBoletim(metricas, data);
  const conta = (s: 'concluida' | 'andamento' | 'pendente') =>
    acoes.filter((a) => situacaoDe(a) === s).length;
  const pct = (n: number) => (metricas.total > 0 ? ((n / metricas.total) * 100).toFixed(0) : '0');

  const passos = proximosPassos(acoes, metricas, montarMatriz(acoes)).slice(0, 4);

  return [
    `${dados.titulo} — status do projeto em ${dados.data}`,
    '',
    `Score: ${metricas.score}/100 · Saúde: ${dados.saudeRotulo}`,
    explicarSaude(metricas),
    '',
    'Andamento das ações:',
    `  - Concluídas: ${conta('concluida')} (${pct(conta('concluida'))}%)`,
    `  - Em andamento: ${conta('andamento')} (${pct(conta('andamento'))}%)`,
    `  - Não iniciadas: ${conta('pendente')} (${pct(conta('pendente'))}%)`,
    `  - Em atraso: ${metricas.atrasadas} (${pct(metricas.atrasadas)}%)`,
    '',
    'Próximos passos:',
    ...passos.map((p, i) => `  ${i + 1}. ${p.texto}`),
    '',
    'O boletim em imagem traz o painel completo, com os gráficos do projeto.',
  ].join('\n');
}
