import { fluxoParaSvg, lerFluxo } from '@/dominio/fluxo';

/* O gerador do .docx precisa dos bytes da imagem, nao da URL. Estas
   funcoes baixam e convertem tudo para PNG, que e o unico formato que
   vale para print de tela, foto e fluxograma ao mesmo tempo. */

export interface ImagemEmBytes {
  dados: Uint8Array;
  largura: number;
  altura: number;
}

async function paraPng(fonte: Blob, escala = 1): Promise<ImagemEmBytes> {
  /* O blob vira URL local antes de virar imagem: desenhar direto de um
     endereco de outro dominio contamina o canvas e o navegador recusa
     a leitura dos pixels. */
  const endereco = URL.createObjectURL(fonte);
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não consegui ler a imagem.'));
      i.src = endereco;
    });

    const tela = document.createElement('canvas');
    tela.width = Math.round((imagem.naturalWidth || imagem.width) * escala);
    tela.height = Math.round((imagem.naturalHeight || imagem.height) * escala);
    const contexto = tela.getContext('2d');
    if (!contexto) throw new Error('Navegador sem suporte a canvas.');
    /* Fundo branco: PNG transparente vira fundo preto no Word. */
    contexto.fillStyle = '#FFFFFF';
    contexto.fillRect(0, 0, tela.width, tela.height);
    contexto.drawImage(imagem, 0, 0, tela.width, tela.height);

    const png = await new Promise<Blob | null>((resolve) => tela.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Não consegui converter a imagem.');

    return {
      dados: new Uint8Array(await png.arrayBuffer()),
      largura: tela.width,
      altura: tela.height,
    };
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

export async function baixarImagem(url: string): Promise<ImagemEmBytes> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não consegui baixar a imagem (${resposta.status}).`);
  return paraPng(await resposta.blob());
}

/* Fluxograma vira imagem: o Word nao desenha o quadro, entao o desenho
   e rasterizado em dobro do tamanho para nao serrilhar na impressao. */
export async function fluxogramaEmPng(conteudo: string): Promise<ImagemEmBytes> {
  const fluxo = lerFluxo(conteudo);
  if (fluxo) return paraPng(new Blob([fluxoParaSvg(fluxo)], { type: 'image/svg+xml' }), 2);

  /* Fluxo escrito no formato antigo, em texto: continua desenhado pela
     biblioteca de diagramas, para documento antigo nao sair sem ele. */
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'Arial' });
  const { svg } = await mermaid.render(`doc-${Math.random().toString(36).slice(2)}`, conteudo);
  const ajustado = svg.replace('<svg ', '<svg width="900" ');
  return paraPng(new Blob([ajustado], { type: 'image/svg+xml' }), 2);
}
