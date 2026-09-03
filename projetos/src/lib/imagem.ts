/* Foto de celular sai com 3 a 6 MB e 4000 px de largura. Guardar isso
   como veio estoura o 1 GB do plano em poucas centenas de fotos e faz a
   galeria demorar a abrir na rede do CD. Redimensionar antes de enviar
   resolve os dois problemas de uma vez, e 1600 px ainda mostra detalhe
   de etiqueta e endereco. */
const LARGURA_MAXIMA = 1600;
const QUALIDADE = 0.82;
/* Abaixo disso nao compensa recomprimir: o ganho e pequeno e a
   recompressao so degrada a imagem. */
const TAMANHO_MINIMO_PARA_COMPRIMIR = 400 * 1024;

export function ehImagem(arquivo: File): boolean {
  return arquivo.type.startsWith('image/');
}

export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!ehImagem(arquivo) || arquivo.type === 'image/gif') return arquivo;

  const bitmap = await criarBitmap(arquivo);
  if (!bitmap) return arquivo;

  const precisaRedimensionar = bitmap.width > LARGURA_MAXIMA || bitmap.height > LARGURA_MAXIMA;
  if (!precisaRedimensionar && arquivo.size < TAMANHO_MINIMO_PARA_COMPRIMIR) {
    bitmap.close?.();
    return arquivo;
  }

  const escala = precisaRedimensionar ? LARGURA_MAXIMA / Math.max(bitmap.width, bitmap.height) : 1;
  const tela = document.createElement('canvas');
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);

  const contexto = tela.getContext('2d');
  if (!contexto) return arquivo;
  contexto.drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => {
    tela.toBlob(resolve, 'image/jpeg', QUALIDADE);
  });
  /* Se a compressao nao encolheu (imagem ja otimizada, PNG de tela com
     poucas cores), fica o original. */
  if (!blob || blob.size >= arquivo.size) return arquivo;

  const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() });
}

async function criarBitmap(arquivo: File): Promise<ImageBitmap | null> {
  try {
    /* HEIC do iPhone nao decodifica em todo navegador; quando falha, o
       arquivo sobe como veio em vez de o envio quebrar. */
    return await createImageBitmap(arquivo);
  } catch {
    return null;
  }
}

export function formatarTamanho(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
