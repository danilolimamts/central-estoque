import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, PageNumber,
  Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { nomeDoArquivo, semTravessao } from '@/dominio/documento';
import type { DadosDoDocumento, Par, Trio } from '@/dominio/documento';

/* Paleta da especificacao (secao 3.1). Os nomes seguem o documento
   original para que uma mudanca la seja facil de refletir aqui. */
const C = {
  laranja: 'FA4616',
  laranjaEscuro: 'C83812',
  laranjaClaro: 'FB6B45',
  navy: '001A72',
  navyMedio: '1A3180',
  escuro: '1D1F2A',
  escuroTexto: '1A1C26',
  cinzaLinha: 'E0E0E0',
  branco: 'FFFFFF',
  azulFundo: 'EFF2FA',
  azulZebra: 'F0F3FA',
  vermelhoFundo: 'FFF0F0',
  verde: '1D9E75',
  cinzaTexto: '6A6F94',
};

const FONTE = 'Arial';
const LARGURA_TOTAL = 9360;

const CORES_PRIORIDADE: Record<string, string> = {
  ALTA: C.laranjaEscuro,
  'MÉDIA': C.laranja,
  BAIXA: C.verde,
};

interface Imagem {
  dados: Uint8Array;
  largura: number;
  altura: number;
  legenda?: string;
}

export interface RecursosDoDocumento {
  /* O logo e as imagens chegam prontos: buscar arquivo e coisa da tela,
     nao do gerador, e assim o gerador continua testavel sem rede. */
  logo?: Imagem;
  imagens: Record<string, Imagem>;
}

/* ---------------- Componentes reutilizaveis (secao 7) ---------------- */

function texto(conteudo: string, opcoes: {
  tamanho?: number; cor?: string; negrito?: boolean; italico?: boolean;
  alinhamento?: (typeof AlignmentType)[keyof typeof AlignmentType];
  antes?: number; depois?: number; maiusculo?: boolean;
} = {}): Paragraph {
  const limpo = semTravessao(conteudo);
  return new Paragraph({
    alignment: opcoes.alinhamento,
    spacing: { before: opcoes.antes ?? 0, after: opcoes.depois ?? 120, line: 260 },
    children: [new TextRun({
      text: opcoes.maiusculo ? limpo.toUpperCase() : limpo,
      font: FONTE,
      size: opcoes.tamanho ?? 19,
      color: opcoes.cor ?? C.escuroTexto,
      bold: opcoes.negrito,
      italics: opcoes.italico,
    })],
  });
}

const espaco = (antes = 120) => new Paragraph({ spacing: { before: antes }, children: [] });

function semBordas() {
  const nenhuma = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: nenhuma, bottom: nenhuma, left: nenhuma, right: nenhuma };
}

function bordaFina(cor = C.cinzaLinha) {
  const linha = { style: BorderStyle.SINGLE, size: 4, color: cor };
  return { top: linha, bottom: linha, left: linha, right: linha };
}

/* 7.1 Cabecalho de secao: barra laranja estreita + area de titulo. */
function cabecalhoDeSecao(numero: number, titulo: string): Table {
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 420, type: WidthType.DXA },
          shading: { fill: C.laranja },
          borders: semBordas(),
          children: [new Paragraph({ children: [] })],
        }),
        new TableCell({
          width: { size: LARGURA_TOTAL - 420, type: WidthType.DXA },
          shading: { fill: C.azulFundo },
          borders: {
            ...semBordas(),
            bottom: { style: BorderStyle.SINGLE, size: 8, color: C.navyMedio },
          },
          margins: { top: 90, bottom: 90, left: 180, right: 120 },
          children: [new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: `${numero}. `, font: FONTE, size: 22, bold: true, color: C.navy }),
              new TextRun({ text: semTravessao(titulo).toUpperCase(), font: FONTE, size: 22, bold: true, color: C.navy }),
            ],
          })],
        }),
      ],
    })],
  });
}

/* 7.2 Subsecao: laranja negrito com fio cinza embaixo. */
function subsecao(titulo: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.cinzaLinha, space: 2 } },
    children: [new TextRun({ text: semTravessao(titulo), font: FONTE, size: 21, bold: true, color: C.laranja })],
  });
}

/* 7.3 Bullet. */
function bullet(conteudo: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60, line: 260 },
    indent: { left: 560, hanging: 280 },
    children: [
      new TextRun({ text: '· ', font: FONTE, size: 19, color: C.laranja, bold: true }),
      new TextRun({ text: semTravessao(conteudo), font: FONTE, size: 19, color: C.escuroTexto }),
    ],
  });
}

function celula(conteudo: string, opcoes: {
  largura: number; fundo?: string; negrito?: boolean; cor?: string; tamanho?: number;
  alinhamento?: (typeof AlignmentType)[keyof typeof AlignmentType];
}): TableCell {
  return new TableCell({
    width: { size: opcoes.largura, type: WidthType.DXA },
    shading: opcoes.fundo ? { fill: opcoes.fundo } : undefined,
    borders: bordaFina(),
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opcoes.alinhamento,
      spacing: { after: 0, line: 250 },
      children: [new TextRun({
        text: semTravessao(conteudo),
        font: FONTE,
        size: opcoes.tamanho ?? 19,
        bold: opcoes.negrito,
        color: opcoes.cor ?? C.escuroTexto,
      })],
    })],
  });
}

/* 7.4 Tabela de duas colunas com zebra. */
function tabelaDuasColunas(cabecalhos: [string, string], linhas: Par[]): Table {
  const larguras: [number, number] = [2800, 6560];
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: cabecalhos.map((t, i) => celula(t, {
          largura: larguras[i], fundo: C.navy, negrito: true, cor: C.branco,
        })),
      }),
      ...linhas.map((linha, i) => new TableRow({
        children: [
          celula(linha.a, { largura: larguras[0], fundo: i % 2 ? C.branco : C.azulZebra, negrito: true, cor: C.navy }),
          celula(linha.b, { largura: larguras[1], fundo: i % 2 ? C.branco : C.azulZebra }),
        ],
      })),
    ],
  });
}

/* 7.5 Tabela de tres colunas com numero em laranja. */
function tabelaTresColunas(cabecalhos: [string, string, string], linhas: Trio[]): Table {
  const larguras: [number, number, number] = [560, 4400, 4400];
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: cabecalhos.map((t, i) => celula(t, {
          largura: larguras[i], fundo: C.navy, negrito: true, cor: C.branco,
          alinhamento: i === 0 ? AlignmentType.CENTER : undefined,
        })),
      }),
      ...linhas.map((linha, i) => new TableRow({
        children: [
          celula(linha.a, {
            largura: larguras[0], fundo: i % 2 ? C.branco : C.azulZebra,
            negrito: true, cor: C.laranja, tamanho: 20, alinhamento: AlignmentType.CENTER,
          }),
          celula(linha.b, { largura: larguras[1], fundo: i % 2 ? C.branco : C.azulZebra }),
          celula(linha.c, { largura: larguras[2], fundo: i % 2 ? C.branco : C.azulZebra }),
        ],
      })),
    ],
  });
}

/* 7.6 InfoBox: borda superior grossa e fundo claro. */
function infoBox(conteudo: string, opcoes: { negrito?: boolean; risco?: boolean } = {}): Table {
  const acento = opcoes.risco ? C.laranjaEscuro : C.laranja;
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: LARGURA_TOTAL, type: WidthType.DXA },
        shading: { fill: opcoes.risco ? C.vermelhoFundo : C.azulFundo },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 24, color: acento },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: C.cinzaLinha },
          left: { style: BorderStyle.SINGLE, size: 4, color: C.cinzaLinha },
          right: { style: BorderStyle.SINGLE, size: 4, color: C.cinzaLinha },
        },
        margins: { top: 140, bottom: 140, left: 180, right: 180 },
        children: [new Paragraph({
          spacing: { after: 0, line: 260 },
          children: [new TextRun({
            text: semTravessao(conteudo),
            font: FONTE, size: 19, color: C.navy,
            bold: opcoes.negrito, italics: !opcoes.negrito,
          })],
        })],
      })],
    })],
  });
}

/* 7.7 Badge. */
function badge(conteudo: string, fundo: string): Table {
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: LARGURA_TOTAL, type: WidthType.DXA },
        shading: { fill: fundo },
        borders: semBordas(),
        margins: { top: 120, bottom: 120, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({
            text: semTravessao(conteudo).toUpperCase(),
            font: FONTE, size: 24, bold: true, color: C.branco,
          })],
        })],
      })],
    })],
  });
}

function barra(cor: string, altura = 80): Table {
  return new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      height: { value: altura, rule: 'exact' },
      children: [new TableCell({
        width: { size: LARGURA_TOTAL, type: WidthType.DXA },
        shading: { fill: cor },
        borders: semBordas(),
        children: [new Paragraph({ spacing: { after: 0 }, children: [] })],
      })],
    })],
  });
}

function imagem(img: Imagem, largura = 520): Paragraph[] {
  const escala = largura / img.largura;
  const partes = [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: img.legenda ? 40 : 160 },
    children: [new ImageRun({
      data: img.dados,
      type: 'png',
      transformation: { width: largura, height: Math.round(img.altura * escala) },
    })],
  })];
  if (img.legenda) {
    partes.push(texto(img.legenda, {
      tamanho: 16, cor: C.cinzaTexto, italico: true,
      alinhamento: AlignmentType.CENTER, depois: 160,
    }));
  }
  return partes;
}

/* ---------------- Documento ---------------- */

function capa(dados: DadosDoDocumento, recursos: RecursosDoDocumento) {
  const partes: (Paragraph | Table)[] = [barra(C.laranja, 100), espaco(160)];

  if (recursos.logo) {
    partes.push(new Paragraph({
      spacing: { after: 240 },
      children: [new ImageRun({
        data: recursos.logo.dados,
        type: 'png',
        transformation: { width: 220, height: 58 },
      })],
    }));
  }

  // Banner navy com o nome do padrao de documento.
  partes.push(new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: LARGURA_TOTAL, type: WidthType.DXA },
        shading: { fill: C.navy },
        borders: semBordas(),
        margins: { top: 260, bottom: 260, left: 240, right: 240 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({
              text: 'PROPOSTA DE MELHORIA SISTÊMICA',
              font: FONTE, size: 32, bold: true, color: C.branco,
            })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [new TextRun({
              text: 'Sistema Bseller | Controle de Estoque',
              font: FONTE, size: 21, color: C.laranjaClaro,
            })],
          }),
        ],
      })],
    })],
  }));

  partes.push(espaco(320));

  // Bloco de titulo com barra laranja vertical.
  partes.push(new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 120, type: WidthType.DXA },
          shading: { fill: C.laranja },
          borders: semBordas(),
          children: [new Paragraph({ children: [] })],
        }),
        new TableCell({
          width: { size: LARGURA_TOTAL - 120, type: WidthType.DXA },
          borders: semBordas(),
          margins: { top: 60, bottom: 60, left: 240, right: 120 },
          children: [
            texto(dados.titulo, { tamanho: 32, negrito: true, cor: C.navy, depois: 60 }),
            ...(dados.subtitulo ? [texto(dados.subtitulo, { tamanho: 21, cor: C.laranjaClaro, italico: true, depois: 0 })] : []),
          ],
        }),
      ],
    })],
  }));

  partes.push(espaco(360));

  const metadados: Par[] = [
    { a: 'Documento', b: `${String(dados.numero).padStart(2, '0')} | Proposta de Melhoria Sistêmica` },
    { a: 'Versão', b: dados.versao },
    { a: 'Data', b: dados.data },
    { a: 'Elaborado por', b: dados.elaborado_por },
    { a: 'Destinatário', b: dados.destinatario },
    { a: 'Aprovação final', b: 'Gestão de Controle de Estoque' },
    { a: 'Status', b: dados.status },
  ];
  if (dados.categoria) metadados.splice(1, 0, { a: 'Categoria', b: dados.categoria });
  if (dados.documento_relacionado) metadados.push({ a: 'Documento relacionado', b: dados.documento_relacionado });

  partes.push(tabelaDuasColunas(['Campo', 'Informação'], metadados));
  partes.push(espaco(400));

  partes.push(new Table({
    width: { size: LARGURA_TOTAL, type: WidthType.DXA },
    borders: semBordas(),
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: LARGURA_TOTAL, type: WidthType.DXA },
        shading: { fill: C.escuro },
        borders: semBordas(),
        margins: { top: 120, bottom: 120, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({
            text: 'CONFIDENCIAL | USO INTERNO | Loja do Mecânico',
            font: FONTE, size: 18, bold: true, color: C.branco,
          })],
        })],
      })],
    })],
  }));

  partes.push(espaco(120), barra(C.laranja, 100));
  return partes;
}

function listaOuPendente(itens: string[], vazio: string): Paragraph[] {
  if (!itens.length) return [texto(vazio, { italico: true, cor: C.cinzaTexto })];
  return itens.map(bullet);
}

function corpo(dados: DadosDoDocumento, recursos: RecursosDoDocumento) {
  const p: (Paragraph | Table)[] = [];
  const imagensDe = (secao: 'as_is' | 'to_be' | 'anexo') => dados.imagens
    .filter((i) => i.secao === secao)
    .flatMap((i) => {
      const img = recursos.imagens[i.url];
      return img ? imagem({ ...img, legenda: i.legenda }) : [];
    });

  // 1. Título da melhoria
  p.push(texto(dados.titulo, { tamanho: 28, negrito: true, cor: C.navy, alinhamento: AlignmentType.CENTER, depois: 60 }));
  if (dados.subtitulo) {
    p.push(texto(dados.subtitulo, { tamanho: 21, italico: true, cor: C.laranja, alinhamento: AlignmentType.CENTER, depois: 240 }));
  }

  // 2. Objetivo
  p.push(cabecalhoDeSecao(2, 'Objetivo'), espaco());
  p.push(texto(dados.objetivo || 'A definir.'));
  p.push(subsecao('2.1 A dor de hoje'), texto(dados.dor || 'A definir.'));
  p.push(subsecao('2.2 O que muda'), texto(dados.to_be || 'A definir.'));
  if (dados.ganhos.length) {
    p.push(subsecao('2.3 Ganho direto'), tabelaDuasColunas(['Dimensão', 'Ganho'], dados.ganhos));
  }
  p.push(espaco(200));

  // 3. Cenário atual
  p.push(cabecalhoDeSecao(3, 'Cenário Atual (AS IS)'), espaco());
  p.push(texto(dados.dor || 'A definir.'));
  p.push(...imagensDe('as_is'));
  p.push(espaco(200));

  // 4. Descrição do problema
  p.push(cabecalhoDeSecao(4, 'Descrição do Problema'), espaco());
  p.push(infoBox(dados.problema_central || 'A definir.', { negrito: true }));
  if (dados.contexto_especial) {
    p.push(espaco(120), infoBox(dados.contexto_especial, { risco: true }));
  }
  p.push(espaco(200));

  // 5. Proposta de melhoria
  p.push(cabecalhoDeSecao(5, 'Proposta de Melhoria (TO BE)'), espaco());
  p.push(texto(dados.to_be || 'A definir.'));
  if (dados.exemplo_pratico) {
    p.push(subsecao('5.1 Exemplo prático'), infoBox(dados.exemplo_pratico));
  }
  p.push(...imagensDe('to_be'));
  p.push(espaco(200));

  // 6. Regras de negócio
  p.push(cabecalhoDeSecao(6, 'Regras de Negócio'), espaco());
  p.push(...listaOuPendente(dados.regras_negocio, 'Regras a detalhar com o time técnico.'));
  if (dados.pontos_aberto.length) {
    p.push(subsecao('6.1 Pontos em aberto'), ...dados.pontos_aberto.map(bullet));
  }
  p.push(espaco(200));

  // 7. Fluxo do processo
  p.push(cabecalhoDeSecao(7, 'Fluxo do Processo (AS IS vs. TO BE)'), espaco());
  if (dados.fluxo.length) {
    p.push(tabelaTresColunas(['#', 'Etapa | AS IS', 'Etapa | TO BE'], dados.fluxo.map((f, i) => ({
      a: String(i + 1).padStart(2, '0'),
      b: `${f.a}: ${f.b}`,
      c: f.c,
    }))));
  } else {
    p.push(texto('Fluxo a detalhar.', { italico: true, cor: C.cinzaTexto }));
  }
  for (const fluxo of dados.fluxogramas) {
    const img = recursos.imagens[`fluxo:${fluxo.titulo}`];
    if (img) p.push(...imagem({ ...img, legenda: fluxo.titulo }, 460));
  }
  p.push(espaco(200));

  // 8. Impactos esperados
  p.push(cabecalhoDeSecao(8, 'Impactos Esperados'), espaco());
  p.push(dados.impactos.length
    ? tabelaDuasColunas(['Dimensão', 'Impacto'], dados.impactos)
    : texto('Impactos a mapear.', { italico: true, cor: C.cinzaTexto }));
  p.push(espaco(200));

  // 9. Riscos e dependências
  p.push(cabecalhoDeSecao(9, 'Riscos e Dependências'), espaco());
  p.push(dados.riscos.length
    ? tabelaDuasColunas(['Item', 'Descrição'], dados.riscos)
    : texto('Sem riscos mapeados até o momento.', { italico: true, cor: C.cinzaTexto }));
  p.push(espaco(200));

  // 10. Esforço estimado
  p.push(cabecalhoDeSecao(10, 'Esforço Estimado'), espaco());
  p.push(badge(dados.esforco, C.navy), espaco(120));
  if (dados.esforco_justificativa) p.push(texto(dados.esforco_justificativa));
  p.push(...dados.esforco_bullets.map(bullet));
  p.push(espaco(200));

  // 11. Prioridade
  p.push(cabecalhoDeSecao(11, 'Prioridade da Melhoria'), espaco());
  p.push(badge(`PRIORIDADE ${dados.prioridade}`, CORES_PRIORIDADE[dados.prioridade] ?? C.laranja), espaco(120));
  if (dados.prioridade_justificativa) p.push(texto(dados.prioridade_justificativa));
  p.push(espaco(200));

  // 12. Critérios de aceite
  p.push(cabecalhoDeSecao(12, 'Critérios de Aceite'), espaco());
  p.push(subsecao('12.1 Comportamentos obrigatórios'));
  p.push(...listaOuPendente(dados.criterios_aceite, 'Critérios a definir.'));
  if (dados.cenarios_validacao.length) {
    p.push(subsecao('12.2 Cenários de validação'), ...dados.cenarios_validacao.map(bullet));
  }
  p.push(espaco(200));

  // 13. KPIs
  p.push(cabecalhoDeSecao(13, 'Métricas de Sucesso (KPIs)'), espaco());
  p.push(dados.kpis.length
    ? tabelaTresColunas(['#', 'Indicador', 'Meta TO BE'], dados.kpis.map((k, i) => ({
      a: String(i + 1).padStart(2, '0'), b: k.a, c: k.b,
    })))
    : texto('Indicadores a definir.', { italico: true, cor: C.cinzaTexto }));
  p.push(espaco(200));

  // 14. Rollout
  p.push(cabecalhoDeSecao(14, 'Estratégia de Implantação (Rollout)'), espaco());
  p.push(dados.rollout.length
    ? tabelaDuasColunas(['Fase', 'Atividades'], dados.rollout)
    : texto('Fases a definir com o time técnico.', { italico: true, cor: C.cinzaTexto }));
  p.push(espaco(200));

  // 15. ROI
  p.push(cabecalhoDeSecao(15, 'Retorno Esperado (ROI)'), espaco());
  p.push(...listaOuPendente(dados.roi_bullets, 'Retorno a quantificar.'));
  if (dados.roi_fechamento) p.push(espaco(120), infoBox(dados.roi_fechamento));
  p.push(espaco(240));

  // Resumo executivo
  if (dados.resumo_executivo) {
    p.push(cabecalhoDeSecao(16, 'Resumo Executivo'), espaco());
    p.push(infoBox(dados.resumo_executivo));
    p.push(espaco(240));
  }

  // Anexos visuais
  const anexos = imagensDe('anexo');
  if (anexos.length) {
    p.push(cabecalhoDeSecao(17, 'Anexos'), espaco(), ...anexos, espaco(200));
  }

  // Aprovação e assinaturas
  p.push(cabecalhoDeSecao(18, 'Aprovação e Assinaturas'), espaco());
  p.push(tabelaDuasColunas(['Papel', 'Nome e assinatura'], [
    { a: 'Elaborado por', b: dados.elaborado_por },
    { a: 'Destinatário', b: dados.destinatario },
    { a: 'Aprovação final', b: '' },
    { a: 'Data de aprovação', b: '' },
  ]));

  return p;
}

export async function gerarDocumentoWord(
  dados: DadosDoDocumento, recursos: RecursosDoDocumento,
): Promise<{ blob: Blob; nome: string }> {
  const cabecalho = new Header({
    children: [new Table({
      width: { size: LARGURA_TOTAL, type: WidthType.DXA },
      borders: {
        ...semBordas(),
        bottom: { style: BorderStyle.SINGLE, size: 8, color: C.laranja },
      },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 4680, type: WidthType.DXA },
            borders: semBordas(),
            children: [recursos.logo
              ? new Paragraph({
                spacing: { after: 60 },
                children: [new ImageRun({
                  data: recursos.logo.dados,
                  type: 'png',
                  transformation: { width: 140, height: 37 },
                })],
              })
              : new Paragraph({ children: [new TextRun({ text: 'Loja do Mecânico', font: FONTE, size: 18, bold: true, color: C.navy })] })],
          }),
          new TableCell({
            width: { size: 4680, type: WidthType.DXA },
            borders: semBordas(),
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
              children: [new TextRun({
                text: 'Proposta de Melhoria Sistêmica',
                font: FONTE, size: 16, italics: true, color: C.cinzaTexto,
              })],
            })],
          }),
        ],
      })],
    })],
  });

  const rodape = new Footer({
    children: [new Table({
      width: { size: LARGURA_TOTAL, type: WidthType.DXA },
      borders: {
        ...semBordas(),
        top: { style: BorderStyle.SINGLE, size: 8, color: C.laranja },
      },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            borders: semBordas(),
            children: [new Paragraph({
              spacing: { before: 60, after: 0 },
              children: [new TextRun({
                text: 'CONFIDENCIAL | USO INTERNO | Loja do Mecânico',
                font: FONTE, size: 15, color: C.cinzaTexto,
              })],
            })],
          }),
          new TableCell({
            width: { size: 3360, type: WidthType.DXA },
            borders: semBordas(),
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 60, after: 0 },
              children: [
                new TextRun({ text: 'Página ', font: FONTE, size: 15, color: C.cinzaTexto }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: 15, bold: true, color: C.laranja }),
                new TextRun({ text: ' de ', font: FONTE, size: 15, color: C.cinzaTexto }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTE, size: 15, bold: true, color: C.laranja }),
              ],
            })],
          }),
        ],
      })],
    })],
  });

  const pagina = {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
    },
  };

  const documento = new Document({
    styles: {
      default: {
        document: { run: { font: FONTE, size: 19, color: C.escuroTexto } },
        heading1: { run: { font: FONTE } },
      },
    },
    sections: [
      { properties: pagina, footers: { default: rodape }, children: capa(dados, recursos) },
      {
        properties: { ...pagina, type: 'nextPage' as const },
        headers: { default: cabecalho },
        footers: { default: rodape },
        children: corpo(dados, recursos),
      },
    ],
  });

  return { blob: await Packer.toBlob(documento), nome: nomeDoArquivo(dados) };
}

/* Mantem o HeadingLevel referenciado: a lib exige o import quando o
   estilo heading1 e declarado, e o linter removeria sem uso. */
export const NIVEL_TITULO = HeadingLevel.HEADING_1;
