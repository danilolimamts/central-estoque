import { porcentagem } from '@/dominio/cobertura';
import type { Cobertura } from '@/dominio/cobertura';

/* A esteira em numeros: quanto ja foi escrito, quanto ja foi pedido,
   quanto da para pedir hoje e quanto ja foi entregue.

   A situacao de cada linha diz o que esta acontecendo com ela; esta
   faixa responde a pergunta que se faz de fora da lista, e e a mesma
   tanto no painel (a carteira inteira) quanto dentro de um projeto (as
   atividades dele) — por isso vive num componente so. */
export default function Esteira({ numeros, plural }: { numeros: Cobertura; plural: string }) {
  /* Projeto que nao trabalha com chamado (um estudo, uma obra) nunca vai
     ter numero de chamado nem situacao marcada como tal: mostrar dois
     cartoes travados em zero so ocupa espaco e faz a tela parecer
     quebrada. Some sozinho, sem configuracao. */
  const usaChamado = numeros.comChamado > 0 || numeros.aAbrir > 0;

  const cartoes = [
    {
      rotulo: 'Documentadas',
      parte: numeros.documentadas,
      cor: '#6D28D9',
      ajuda: `${plural} com página escrita, proposta gerada ou arquivo anexado`,
    },
    {
      rotulo: 'Com chamado aberto',
      chamado: true,
      parte: numeros.comChamado,
      cor: '#2F6FE0',
      ajuda: `${plural} com o número do chamado anotado ou já numa situação a partir da abertura do chamado`,
    },
    {
      rotulo: 'Prontas para abrir chamado',
      chamado: true,
      parte: numeros.aAbrir,
      cor: '#C79212',
      ajuda: 'documentadas e ainda sem chamado: a fila do que dá para pedir',
    },
    {
      rotulo: 'Concluídas',
      parte: numeros.concluidas,
      cor: '#2E8B57',
      ajuda: `${plural} numa situação marcada como concluída`,
    },
  ].filter((c) => usaChamado || !c.chamado);

  return (
    <div
      data-guia="esteira"
      className={`grid gap-2 sm:grid-cols-2 ${cartoes.length > 2 ? 'xl:grid-cols-4' : ''}`}
    >
      {cartoes.map((c) => (
        <div key={c.rotulo} className="rounded-lg bg-white px-3 py-2 shadow-card" title={c.ajuda}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-tinta-suave">{c.rotulo}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-titulo text-xl font-extrabold" style={{ color: c.cor }}>
              {porcentagem(c.parte, numeros.total)}%
            </span>
            <span className="text-xs text-tinta-suave">{c.parte} de {numeros.total}</span>
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-papel">
            <div
              className="h-full rounded-full"
              style={{ width: `${porcentagem(c.parte, numeros.total)}%`, backgroundColor: c.cor }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
