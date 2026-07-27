/* ============================================================
   Apresentacao de status do projeto (secao 12 do brief).

   Quatro recortes com padrao fixo: capa navy com o score, cabecalho
   navy com filete laranja, rodape com data e numeracao, tabelas com
   cabecalho navy, laranja para atraso e verde para concluido, e um
   slide final de proximos passos gerado a partir dos dados.

   Recebe a lista de acoes ja filtrada pela tela, entao a apresentacao
   sempre reflete os filtros ativos. A biblioteca vai empacotada no
   build, sem CDN.
   ============================================================ */
import PptxGenJS from 'pptxgenjs';
import type { Acao, MetricasProjeto, PontoMatriz } from '../domain/tipos';
import { calcularMetricas, montarMatriz } from '../domain/projeto';
import { IMPACTO_CRITICO, ESFORCO_ALTO } from '../config/regras';

export type Recorte = 'executivo' | 'completo' | 'atrasos' | 'responsavel';

export const RECORTES: { valor: Recorte; rotulo: string; descricao: string }[] = [
  { valor: 'executivo', rotulo: 'Executivo', descricao: '5 slides, para a diretoria' },
  { valor: 'completo', rotulo: 'Completo', descricao: '9 slides, com todos os cortes' },
  { valor: 'atrasos', rotulo: 'Foco em atrasos', descricao: '5 slides, o que travou' },
  { valor: 'responsavel', rotulo: 'Por responsável', descricao: '5 slides, carga de cada um' },
];

const NAVY = '001A72';
const NAVY_CLARO = '33488E';
const LARANJA = 'FA4616';
const VERDE = '1F7A4C';
const AMBAR = 'B8860B';
const CINZA = '5B5E6B';
const TINTA = '1D1F2A';
const PAPEL = 'F4F5F7';

const ROTULO_SAUDE: Record<MetricasProjeto['saude'], string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
};
const COR_SAUDE: Record<MetricasProjeto['saude'], string> = {
  saudavel: VERDE,
  atencao: AMBAR,
  critico: LARANJA,
};

const ROTULO_QUADRANTE: Record<PontoMatriz['quadrante'], string> = {
  ganhos_rapidos: 'Ganho rápido',
  estrategicos: 'Estratégico',
  incrementais: 'Incremental',
  baixa_prioridade: 'Baixa prioridade',
};

function dataBR(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
}

function hojeBR(): string {
  return new Date().toLocaleDateString('pt-BR');
}

/* ---------------------------------------------------------------
   Peças fixas do padrao visual
   --------------------------------------------------------------- */

function capa(pptx: PptxGenJS, m: MetricasProjeto, recorte: Recorte) {
  const s = pptx.addSlide();
  s.background = { color: NAVY };

  s.addShape('rect', { x: 0, y: 3.55, w: 13.33, h: 0.06, fill: { color: LARANJA } });

  s.addText('Equalização de Elevadores', {
    x: 0.8, y: 1.5, w: 8.5, h: 0.55,
    fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI',
  });
  s.addText('Status do Projeto · CD Cajamar · Loja do Mecânico', {
    x: 0.8, y: 2.15, w: 8.5, h: 0.4,
    fontSize: 14, color: 'C7CEEA', fontFace: 'Segoe UI',
  });
  s.addText(RECORTES.find((r) => r.valor === recorte)?.rotulo ?? '', {
    x: 0.8, y: 2.7, w: 4, h: 0.35,
    fontSize: 11, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI',
    fill: { color: LARANJA }, align: 'center', valign: 'middle',
  });
  s.addText(hojeBR(), {
    x: 0.8, y: 3.85, w: 4, h: 0.3,
    fontSize: 11, color: '9FB0E0', fontFace: 'Segoe UI',
  });

  /* O score fica na capa porque e a primeira pergunta em reuniao. */
  s.addShape('ellipse', {
    x: 9.9, y: 1.25, w: 2.6, h: 2.6,
    fill: { color: NAVY_CLARO }, line: { color: COR_SAUDE[m.saude], width: 6 },
  });
  s.addText(String(m.score), {
    x: 9.9, y: 1.75, w: 2.6, h: 0.9,
    fontSize: 48, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI',
  });
  s.addText('de 100', {
    x: 9.9, y: 2.6, w: 2.6, h: 0.3,
    fontSize: 11, color: 'C7CEEA', align: 'center', fontFace: 'Segoe UI',
  });
  s.addText(`Saúde: ${ROTULO_SAUDE[m.saude]}`, {
    x: 9.9, y: 4.0, w: 2.6, h: 0.3,
    fontSize: 12, bold: true, color: COR_SAUDE[m.saude], align: 'center', fontFace: 'Segoe UI',
  });
}

function slide(pptx: PptxGenJS, titulo: string, subtitulo?: string) {
  const s = pptx.addSlide();
  s.background = { color: PAPEL };
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.95, fill: { color: NAVY } });
  s.addShape('rect', { x: 0, y: 0.95, w: 13.33, h: 0.05, fill: { color: LARANJA } });
  s.addText(titulo, {
    x: 0.5, y: 0.18, w: 11, h: 0.4,
    fontSize: 20, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI',
  });
  if (subtitulo) {
    s.addText(subtitulo, {
      x: 0.5, y: 0.58, w: 11, h: 0.28,
      fontSize: 11, color: 'C7CEEA', fontFace: 'Segoe UI',
    });
  }
  return s;
}

function rodape(pptx: PptxGenJS) {
  pptx.defineSlideMaster({
    title: 'RODAPE',
    background: { color: PAPEL },
    objects: [],
  });
}

/* Numeracao e data no rodape de todos os slides, menos a capa. */
function numerar(pptx: PptxGenJS) {
  const slides = (pptx as unknown as { slides: unknown[] }).slides;
  slides.forEach((bruto, i) => {
    if (i === 0) return; // capa
    const s = bruto as PptxGenJS.Slide;
    s.addText(`${hojeBR()}  ·  Equalização de Elevadores`, {
      x: 0.5, y: 7.0, w: 8, h: 0.3, fontSize: 9, color: CINZA, fontFace: 'Segoe UI',
    });
    s.addText(`${i + 1} / ${slides.length}`, {
      x: 11.5, y: 7.0, w: 1.3, h: 0.3, fontSize: 9, color: CINZA, align: 'right', fontFace: 'Segoe UI',
    });
  });
}

function cartoesKpi(
  s: PptxGenJS.Slide,
  itens: { rotulo: string; valor: string; cor: string }[],
  y = 1.35
) {
  const largura = 2.9;
  const espaco = 0.25;
  itens.slice(0, 4).forEach((k, i) => {
    const x = 0.5 + i * (largura + espaco);
    s.addShape('roundRect', {
      x, y, w: largura, h: 1.35,
      fill: { color: 'FFFFFF' }, line: { color: 'E1E4EF', width: 1 }, rectRadius: 0.08,
    });
    s.addShape('rect', { x, y, w: largura, h: 0.06, fill: { color: k.cor } });
    s.addText(k.valor, {
      x: x + 0.15, y: y + 0.25, w: largura - 0.3, h: 0.55,
      fontSize: 26, bold: true, color: TINTA, fontFace: 'Segoe UI',
    });
    s.addText(k.rotulo.toUpperCase(), {
      x: x + 0.15, y: y + 0.82, w: largura - 0.3, h: 0.35,
      fontSize: 9, bold: true, color: CINZA, fontFace: 'Segoe UI',
    });
  });
}

type Linha = { texto: string; cor?: string; negrito?: boolean }[];

function tabela(
  s: PptxGenJS.Slide,
  cabecalho: string[],
  linhas: Linha[],
  larguras: number[],
  y = 1.35,
  altura?: number
) {
  const linhasPptx: PptxGenJS.TableRow[] = [
    cabecalho.map((c) => ({
      text: c.toUpperCase(),
      options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 9 },
    })),
    ...linhas.map((l) =>
      l.map((c) => ({
        text: c.texto,
        options: { color: c.cor ?? TINTA, bold: c.negrito, fontSize: 9 },
      }))
    ),
  ];
  s.addTable(linhasPptx, {
    x: 0.5, y, w: 12.33, colW: larguras,
    border: { type: 'solid', color: 'E1E4EF', pt: 0.5 },
    fill: { color: 'FFFFFF' },
    fontFace: 'Segoe UI',
    valign: 'middle',
    rowH: altura ?? 0.28,
    autoPage: false,
  });
}

/* ---------------------------------------------------------------
   Conteudos reaproveitados entre os recortes
   --------------------------------------------------------------- */

function slideResumo(pptx: PptxGenJS, m: MetricasProjeto) {
  const s = slide(pptx, 'Resumo executivo', 'como o plano está hoje');
  cartoesKpi(s, [
    { rotulo: 'Ações concluídas', valor: `${m.concluidas} / ${m.total}`, cor: VERDE },
    { rotulo: 'Em atraso', valor: String(m.atrasadas), cor: LARANJA },
    { rotulo: 'Reagendadas', valor: String(m.reagendadas), cor: AMBAR },
    { rotulo: 'Score', valor: `${m.score} / 100`, cor: COR_SAUDE[m.saude] },
  ]);

  s.addText('Score decomposto', {
    x: 0.5, y: 3.1, w: 6, h: 0.3, fontSize: 13, bold: true, color: TINTA, fontFace: 'Segoe UI',
  });
  m.pilares.forEach((p, i) => {
    const y = 3.55 + i * 0.55;
    s.addText(p.rotulo, {
      x: 0.5, y, w: 1.9, h: 0.35, fontSize: 11, color: TINTA, fontFace: 'Segoe UI', valign: 'middle',
    });
    s.addShape('rect', { x: 2.5, y: y + 0.09, w: 6, h: 0.18, fill: { color: 'E1E4EF' } });
    s.addShape('rect', {
      x: 2.5, y: y + 0.09, w: Math.max(0.04, (6 * p.valor) / 100), h: 0.18, fill: { color: NAVY },
    });
    s.addText(`${p.valor.toFixed(0)} × ${p.peso.toFixed(2)} = ${p.contribuicao.toFixed(1)}`, {
      x: 8.7, y, w: 3.5, h: 0.35, fontSize: 10, color: CINZA, fontFace: 'Segoe UI', valign: 'middle',
    });
  });
  s.addText(`Soma = ${m.score}`, {
    x: 8.7, y: 5.85, w: 3.5, h: 0.3, fontSize: 12, bold: true, color: TINTA, fontFace: 'Segoe UI',
  });
}

function slideAlertas(pptx: PptxGenJS, acoes: Acao[], m: MetricasProjeto) {
  const s = slide(pptx, 'Alertas', 'o que precisa de decisão');
  const criticas = acoes.filter((a) => a.impacto >= IMPACTO_CRITICO && !a.concluida).length;
  const esforcoAlto = acoes.filter((a) => a.esforco >= ESFORCO_ALTO && !a.concluida).length;

  const porResponsavel = new Map<string, number>();
  for (const a of acoes) {
    if (a.concluida) continue;
    porResponsavel.set(a.responsavel, (porResponsavel.get(a.responsavel) ?? 0) + 1);
  }
  const sobrecarga = [...porResponsavel.entries()].sort((x, y) => y[1] - x[1])[0];

  const alertas: { texto: string; detalhe: string; cor: string }[] = [
    { texto: `${m.atrasadas} ação(ões) em atraso`, detalhe: 'prazo vencido sem conclusão', cor: LARANJA },
    { texto: `${m.reagendadas} reagendada(s)`, detalhe: `de ${m.total} ações do plano`, cor: AMBAR },
    { texto: `${m.concluidasSemData} concluída(s) sem data`, detalhe: 'distorcem o acompanhamento', cor: LARANJA },
    { texto: `${criticas} crítica(s) em aberto`, detalhe: `impacto ${IMPACTO_CRITICO}`, cor: NAVY },
    { texto: `${esforcoAlto} de alto esforço`, detalhe: `esforço ≥ ${ESFORCO_ALTO}`, cor: NAVY_CLARO },
    {
      texto: sobrecarga ? `${sobrecarga[0]}: ${sobrecarga[1]} em aberto` : 'Sem sobrecarga',
      detalhe: 'maior carga individual',
      cor: CINZA,
    },
  ];

  alertas.forEach((a, i) => {
    const x = 0.5 + (i % 2) * 6.35;
    const y = 1.4 + Math.floor(i / 2) * 1.25;
    s.addShape('roundRect', {
      x, y, w: 5.98, h: 1.0,
      fill: { color: 'FFFFFF' }, line: { color: 'E1E4EF', width: 1 }, rectRadius: 0.08,
    });
    s.addShape('rect', { x, y, w: 0.07, h: 1.0, fill: { color: a.cor } });
    s.addText(a.texto, {
      x: x + 0.25, y: y + 0.14, w: 5.5, h: 0.4,
      fontSize: 13, bold: true, color: TINTA, fontFace: 'Segoe UI',
    });
    s.addText(a.detalhe, {
      x: x + 0.25, y: y + 0.55, w: 5.5, h: 0.3,
      fontSize: 10, color: CINZA, fontFace: 'Segoe UI',
    });
  });
}

function slideAtrasadas(pptx: PptxGenJS, acoes: Acao[]) {
  const atrasadas = acoes
    .filter((a) => a.atrasada)
    .sort((a, b) => (a.prazoValido?.getTime() ?? 0) - (b.prazoValido?.getTime() ?? 0));
  const s = slide(pptx, 'Ações em atraso', `${atrasadas.length} com prazo vencido`);
  if (atrasadas.length === 0) {
    s.addText('Nenhuma ação em atraso neste recorte.', {
      x: 0.5, y: 3, w: 12.33, h: 0.5, fontSize: 14, color: VERDE, align: 'center', fontFace: 'Segoe UI',
    });
    return;
  }
  tabela(
    s,
    ['Nº', 'Proposta', 'O que fazer', 'Responsável', 'Prazo', 'Impacto'],
    atrasadas.slice(0, 14).map((a) => [
      { texto: a.numPlanAction },
      { texto: a.proposta },
      { texto: a.oQueFazer },
      { texto: a.responsavel },
      { texto: dataBR(a.prazoValido), cor: LARANJA, negrito: true },
      { texto: String(a.impacto) },
    ]),
    [0.7, 2.4, 4.4, 2.0, 1.3, 1.53]
  );
}

function slidePorResponsavel(pptx: PptxGenJS, acoes: Acao[]) {
  const mapa = new Map<string, { total: number; concluidas: number; atrasadas: number; abertas: number }>();
  for (const a of acoes) {
    const nome = a.responsavel || '—';
    const r = mapa.get(nome) ?? { total: 0, concluidas: 0, atrasadas: 0, abertas: 0 };
    r.total++;
    if (a.concluida) r.concluidas++;
    else r.abertas++;
    if (a.atrasada) r.atrasadas++;
    mapa.set(nome, r);
  }
  const linhas = [...mapa.entries()].sort((x, y) => y[1].abertas - x[1].abertas);
  const s = slide(pptx, 'Carga por responsável', `${linhas.length} pessoas no plano`);
  tabela(
    s,
    ['Responsável', 'Ações', 'Concluídas', 'Em aberto', 'Atrasadas', '% concluído'],
    linhas.slice(0, 14).map(([nome, r]) => [
      { texto: nome },
      { texto: String(r.total) },
      { texto: String(r.concluidas), cor: VERDE },
      { texto: String(r.abertas) },
      { texto: String(r.atrasadas), cor: r.atrasadas > 0 ? LARANJA : TINTA, negrito: r.atrasadas > 0 },
      { texto: `${Math.round((r.concluidas / r.total) * 100)}%` },
    ]),
    [3.4, 1.5, 1.9, 1.7, 1.7, 2.13]
  );
}

function slideMatriz(pptx: PptxGenJS, pontos: PontoMatriz[]) {
  const s = slide(pptx, 'Impacto × Esforço', `${pontos.length} propostas priorizadas`);
  const ordem: PontoMatriz['quadrante'][] = [
    'ganhos_rapidos', 'estrategicos', 'incrementais', 'baixa_prioridade',
  ];
  const linhas = [...pontos].sort(
    (a, b) => ordem.indexOf(a.quadrante) - ordem.indexOf(b.quadrante) || b.impacto - a.impacto
  );
  tabela(
    s,
    ['Proposta', 'Impacto', 'Esforço', 'Prioridade', 'Ações'],
    linhas.map((p) => [
      { texto: p.proposta },
      { texto: String(p.impacto) },
      { texto: String(p.esforco) },
      {
        texto: ROTULO_QUADRANTE[p.quadrante],
        cor: p.quadrante === 'ganhos_rapidos' ? VERDE : p.quadrante === 'estrategicos' ? NAVY : CINZA,
        negrito: p.quadrante === 'ganhos_rapidos',
      },
      { texto: String(p.acoes) },
    ]),
    [5.0, 1.6, 1.6, 2.6, 1.53]
  );
  s.addText(
    'Ganho rápido: impacto alto e esforço baixo, começa por aqui. Estratégico: vale o investimento, precisa de plano.',
    { x: 0.5, y: 6.5, w: 12.33, h: 0.3, fontSize: 10, color: CINZA, fontFace: 'Segoe UI' }
  );
}

function slidePlano(pptx: PptxGenJS, acoes: Acao[]) {
  const s = slide(pptx, 'Plano de ação', `${acoes.length} ações no recorte`);
  const linhas = [...acoes].sort((a, b) => Number(a.concluida) - Number(b.concluida) || b.impacto - a.impacto);
  tabela(
    s,
    ['Nº', 'Proposta', 'O que fazer', 'Responsável', 'Prazo', 'Situação'],
    linhas.slice(0, 14).map((a) => [
      { texto: a.numPlanAction },
      { texto: a.proposta },
      { texto: a.oQueFazer },
      { texto: a.responsavel },
      { texto: dataBR(a.prazoValido), cor: a.atrasada ? LARANJA : TINTA, negrito: a.atrasada },
      {
        texto: a.concluida ? 'Concluída' : a.atrasada ? 'Atrasada' : 'Em aberto',
        cor: a.concluida ? VERDE : a.atrasada ? LARANJA : CINZA,
        negrito: true,
      },
    ]),
    [0.7, 2.4, 4.4, 2.0, 1.3, 1.53]
  );
}

function slideBeneficios(pptx: PptxGenJS, acoes: Acao[]) {
  const s = slide(pptx, 'Benefícios esperados', 'quantas ações endereçam cada frente');
  const sim = (v: string) => String(v ?? '').trim().toUpperCase().startsWith('S');
  const frentes: { rotulo: string; qtd: number }[] = [
    { rotulo: 'Reduz erro', qtd: acoes.filter((a) => sim(a.reduzErro)).length },
    { rotulo: 'Melhora produtividade', qtd: acoes.filter((a) => sim(a.melhoraProdutividade)).length },
    { rotulo: 'Melhora para o cliente', qtd: acoes.filter((a) => sim(a.melhoraCliente)).length },
    { rotulo: 'Reduz custo', qtd: acoes.filter((a) => sim(a.reduzCusto)).length },
    { rotulo: 'Aumenta segurança', qtd: acoes.filter((a) => sim(a.aumentaSeguranca)).length },
  ];
  const total = acoes.length || 1;
  frentes.forEach((f, i) => {
    const y = 1.5 + i * 0.85;
    const pct = Math.round((f.qtd / total) * 100);
    s.addText(f.rotulo, {
      x: 0.5, y, w: 3.4, h: 0.45, fontSize: 12, color: TINTA, fontFace: 'Segoe UI', valign: 'middle',
    });
    s.addShape('rect', { x: 4.0, y: y + 0.12, w: 6.5, h: 0.22, fill: { color: 'E1E4EF' } });
    s.addShape('rect', {
      x: 4.0, y: y + 0.12, w: Math.max(0.04, (6.5 * pct) / 100), h: 0.22, fill: { color: LARANJA },
    });
    s.addText(`${f.qtd} de ${acoes.length}  (${pct}%)`, {
      x: 10.7, y, w: 2.2, h: 0.45, fontSize: 11, color: CINZA, fontFace: 'Segoe UI', valign: 'middle',
    });
  });
}

function slideDistribuicao(pptx: PptxGenJS, acoes: Acao[], m: MetricasProjeto) {
  const s = slide(pptx, 'Distribuição do plano', 'como as ações se dividem');
  cartoesKpi(s, [
    { rotulo: 'Propostas', valor: String(m.propostas), cor: NAVY },
    { rotulo: 'Responsáveis', valor: String(m.responsaveis), cor: NAVY_CLARO },
    { rotulo: 'Impacto médio', valor: m.mediaImpacto.toFixed(1), cor: LARANJA },
    { rotulo: 'Esforço médio', valor: m.mediaEsforco.toFixed(1), cor: AMBAR },
  ]);

  const porProposta = new Map<string, number>();
  for (const a of acoes) porProposta.set(a.proposta, (porProposta.get(a.proposta) ?? 0) + 1);
  const linhas = [...porProposta.entries()].sort((x, y) => y[1] - x[1]);
  const maximo = linhas[0]?.[1] ?? 1;

  s.addText('Ações por proposta', {
    x: 0.5, y: 3.1, w: 6, h: 0.3, fontSize: 13, bold: true, color: TINTA, fontFace: 'Segoe UI',
  });
  linhas.slice(0, 8).forEach(([nome, qtd], i) => {
    const y = 3.55 + i * 0.42;
    s.addText(nome, {
      x: 0.5, y, w: 4.0, h: 0.32, fontSize: 10, color: TINTA, fontFace: 'Segoe UI', valign: 'middle',
    });
    s.addShape('rect', { x: 4.7, y: y + 0.08, w: 6.0, h: 0.16, fill: { color: 'E1E4EF' } });
    s.addShape('rect', {
      x: 4.7, y: y + 0.08, w: Math.max(0.04, (6.0 * qtd) / maximo), h: 0.16, fill: { color: NAVY },
    });
    s.addText(String(qtd), {
      x: 10.9, y, w: 0.8, h: 0.32, fontSize: 10, color: CINZA, fontFace: 'Segoe UI', valign: 'middle',
    });
  });
}

/* O ultimo slide sai dos proprios dados: nada e escrito a mao. */
function slideProximosPassos(pptx: PptxGenJS, acoes: Acao[], m: MetricasProjeto, pontos: PontoMatriz[]) {
  const s = slide(pptx, 'Próximos passos', 'gerado a partir dos dados deste recorte');
  const passos: string[] = [];

  const atrasadas = acoes.filter((a) => a.atrasada);
  if (atrasadas.length) {
    const nomes = [...new Set(atrasadas.map((a) => a.responsavel).filter(Boolean))].slice(0, 3);
    passos.push(
      `Repactuar as ${atrasadas.length} ações em atraso com ${nomes.join(', ') || 'os responsáveis'}, definindo nova data ou tirando do plano.`
    );
  }
  if (m.concluidasSemData > 0) {
    passos.push(
      `Preencher a data de conclusão das ${m.concluidasSemData} ações já concluídas, para o acompanhamento parar de distorcer.`
    );
  }
  const ganhos = pontos.filter((p) => p.quadrante === 'ganhos_rapidos');
  if (ganhos.length) {
    passos.push(
      `Priorizar os ganhos rápidos (${ganhos.slice(0, 3).map((p) => p.proposta).join(', ')}): impacto alto com esforço baixo.`
    );
  }
  const criticas = acoes.filter((a) => a.impacto >= IMPACTO_CRITICO && !a.concluida);
  if (criticas.length) {
    passos.push(`Destravar as ${criticas.length} ações de impacto ${IMPACTO_CRITICO} ainda em aberto.`);
  }
  if (m.reagendadas / (m.total || 1) > 0.3) {
    passos.push(
      `Revisar o dimensionamento do plano: ${m.reagendadas} de ${m.total} ações já foram reagendadas.`
    );
  }
  if (passos.length === 0) {
    passos.push('Plano em dia neste recorte. Manter a rotina de acompanhamento semanal.');
  }

  passos.slice(0, 5).forEach((texto, i) => {
    const y = 1.5 + i * 1.0;
    s.addShape('roundRect', {
      x: 0.5, y, w: 12.33, h: 0.82,
      fill: { color: 'FFFFFF' }, line: { color: 'E1E4EF', width: 1 }, rectRadius: 0.08,
    });
    s.addShape('ellipse', { x: 0.75, y: y + 0.21, w: 0.4, h: 0.4, fill: { color: LARANJA } });
    s.addText(String(i + 1), {
      x: 0.75, y: y + 0.24, w: 0.4, h: 0.35,
      fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI',
    });
    s.addText(texto, {
      x: 1.35, y: y + 0.14, w: 11.2, h: 0.55,
      fontSize: 12, color: TINTA, fontFace: 'Segoe UI', valign: 'middle',
    });
  });
}

/* ---------------------------------------------------------------
   Montagem dos recortes
   --------------------------------------------------------------- */

export function gerarApresentacao(acoes: Acao[], recorte: Recorte): PptxGenJS {
  const m = calcularMetricas(acoes);
  const pontos = montarMatriz(acoes);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Central de Equalização de Elevadores';
  pptx.company = 'Loja do Mecânico';
  pptx.subject = 'Status do Projeto';
  pptx.title = `Status do Projeto — ${RECORTES.find((r) => r.valor === recorte)?.rotulo}`;
  rodape(pptx);

  capa(pptx, m, recorte);

  if (recorte === 'executivo') {
    slideResumo(pptx, m);
    slideAlertas(pptx, acoes, m);
    slideMatriz(pptx, pontos);
    slideProximosPassos(pptx, acoes, m, pontos);
  } else if (recorte === 'atrasos') {
    slideAlertas(pptx, acoes, m);
    slideAtrasadas(pptx, acoes);
    slidePorResponsavel(pptx, acoes.filter((a) => a.atrasada));
    slideProximosPassos(pptx, acoes, m, pontos);
  } else if (recorte === 'responsavel') {
    slidePorResponsavel(pptx, acoes);
    slidePlano(pptx, acoes);
    slideAtrasadas(pptx, acoes);
    slideProximosPassos(pptx, acoes, m, pontos);
  } else {
    /* Nove slides: o plano de acao completo fica de fora porque ja sai
       inteiro no Excel, e em slide viraria uma tabela ilegivel. */
    slideResumo(pptx, m);
    slideAlertas(pptx, acoes, m);
    slideDistribuicao(pptx, acoes, m);
    slideMatriz(pptx, pontos);
    slidePorResponsavel(pptx, acoes);
    slideAtrasadas(pptx, acoes);
    slideBeneficios(pptx, acoes);
    slideProximosPassos(pptx, acoes, m, pontos);
  }

  numerar(pptx);
  return pptx;
}

export async function baixarApresentacao(acoes: Acao[], recorte: Recorte): Promise<void> {
  const pptx = gerarApresentacao(acoes, recorte);
  const data = new Date().toISOString().slice(0, 10);
  await pptx.writeFile({ fileName: `status-projeto-${recorte}-${data}.pptx` });
}
