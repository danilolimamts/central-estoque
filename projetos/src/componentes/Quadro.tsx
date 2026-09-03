import { useState } from 'react';
import type { ReactNode } from 'react';

export interface ColunaDoQuadro {
  id: string;
  rotulo: string;
  cor: string;
}

export interface CartaoDoQuadro {
  id: string;
  coluna: string;
}

interface Props<T extends CartaoDoQuadro> {
  colunas: ColunaDoQuadro[];
  itens: T[];
  aoMover: (item: T, coluna: string) => void | Promise<void>;
  aoAbrir?: (item: T) => void;
  cartao: (item: T) => ReactNode;
  /* Rodape opcional da coluna, para o "+ Adicionar" de cada situacao. */
  rodape?: (coluna: ColunaDoQuadro) => ReactNode;
}

/* Quadro de colunas com arrastar e soltar, no espirito do Jira. Usa a
   API de arrastar do proprio navegador em vez de biblioteca: sao poucas
   dezenas de linhas e nada para manter atualizado.

   No celular nao ha arrastar - por isso todo cartao tambem tem o seletor
   de situacao na propria lista, que continua sendo o caminho garantido. */
export default function Quadro<T extends CartaoDoQuadro>({
  colunas, itens, aoMover, aoAbrir, cartao, rodape,
}: Props<T>) {
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-3 p-3">
        {colunas.map((coluna) => {
          const daColuna = itens.filter((i) => i.coluna === coluna.id);
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => { e.preventDefault(); setAlvo(coluna.id); }}
              onDragLeave={() => setAlvo((atual) => (atual === coluna.id ? null : atual))}
              onDrop={(e) => {
                e.preventDefault();
                setAlvo(null);
                const item = itens.find((i) => i.id === arrastado);
                setArrastado(null);
                if (item && item.coluna !== coluna.id) void aoMover(item, coluna.id);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border p-2 transition ${
                alvo === coluna.id ? 'border-roxo bg-roxo-suave' : 'border-linha bg-papel'
              }`}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: coluna.cor }} />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-tinta-suave">
                  {coluna.rotulo}
                </span>
                <span className="ml-auto text-[11px] font-bold text-tinta-suave">{daColuna.length}</span>
              </div>

              <div className="flex-1 space-y-2">
                {daColuna.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setArrastado(item.id)}
                    onDragEnd={() => { setArrastado(null); setAlvo(null); }}
                    onClick={() => aoAbrir?.(item)}
                    className={`cursor-grab rounded-lg border border-linha bg-white p-2.5 shadow-card transition active:cursor-grabbing ${
                      arrastado === item.id ? 'opacity-50' : 'hover:shadow-alto'
                    }`}
                  >
                    {cartao(item)}
                  </div>
                ))}
                {!daColuna.length && (
                  <p className="rounded-lg border border-dashed border-linha py-4 text-center text-[11px] text-tinta-suave">
                    Arraste um cartão para cá
                  </p>
                )}
              </div>

              {rodape && <div className="pt-2">{rodape(coluna)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
