/* Gera a versao publicada do app na pasta que o GitHub Pages serve.
   O site sai de https://danilolimamts.github.io/central-estoque/, que
   e a raiz do repositorio, entao o app precisa ficar em uma pasta
   propria ao lado do inventario-rotativo. */
import { cp, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ORIGEM = resolve('dist');
const DESTINO = resolve('..', 'equalizacao-elevadores');
/* A marca nao sai do build: o index.html aponta o favicon para
   ./brand/. Como a publicacao limpa a pasta antes de copiar, os
   arquivos precisam ser trazidos de novo da raiz do repositorio. */
const MARCA = resolve('..', 'brand');

await rm(DESTINO, { recursive: true, force: true });
await mkdir(DESTINO, { recursive: true });
await cp(ORIGEM, DESTINO, { recursive: true });
await cp(MARCA, resolve(DESTINO, 'brand'), { recursive: true });

console.log(`publicado em ${DESTINO}`);
console.log('endereco: https://danilolimamts.github.io/central-estoque/equalizacao-elevadores/');
