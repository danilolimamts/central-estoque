/* Print vindo da area de transferencia.

   O que se cola aqui e a tela do coletor ou do BSeller: PNG de tela
   cheia, com facil 1 MB. Guardado cru dentro do JSON da pagina isso
   pesaria na linha do banco e na abertura da tela toda vez.

   Entao a imagem passa por um redesenho antes de entrar: no maximo
   1200 px de largura e JPEG de qualidade alta, que derruba o tamanho
   para uma fracao sem estragar a leitura de um print. */

const LARGURA_MAXIMA = 1200;
const QUALIDADE = 0.85;

export interface ImagemReduzida {
  dados: string;
  largura: number;
  altura: number;
}

export async function reduzirImagem(arquivo: Blob): Promise<ImagemReduzida> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, recusar) => {
      const elemento = new Image();
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => recusar(new Error('Não consegui ler a imagem colada.'));
      elemento.src = url;
    });

    const escala = Math.min(1, LARGURA_MAXIMA / (img.naturalWidth || 1));
    const largura = Math.max(1, Math.round(img.naturalWidth * escala));
    const altura = Math.max(1, Math.round(img.naturalHeight * escala));

    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const pincel = tela.getContext('2d');
    if (!pincel) throw new Error('Este navegador não conseguiu preparar a imagem.');
    /* Fundo branco: print com transparencia viraria area preta no JPEG. */
    pincel.fillStyle = '#FFFFFF';
    pincel.fillRect(0, 0, largura, altura);
    pincel.drawImage(img, 0, 0, largura, altura);

    return { dados: tela.toDataURL('image/jpeg', QUALIDADE), largura, altura };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* A imagem de um evento de colar. Devolve nulo quando o que veio foi
   texto, que e o caso comum e nao deve atrapalhar. */
export function imagemDoEvento(evento: ClipboardEvent | React.ClipboardEvent): Blob | null {
  const itens = evento.clipboardData?.items;
  if (!itens) return null;
  for (const item of Array.from(itens)) {
    if (item.type.startsWith('image/')) {
      const arquivo = item.getAsFile();
      if (arquivo) return arquivo;
    }
  }
  return null;
}
