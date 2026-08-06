/* ============================================================
   Saude do estoque por fornecedor.

   Responde "quanto do que esta parado vira elevador vendavel". A
   leitura e por unidade, nao por SKU: 100 elevadores possiveis com 10
   travados sao 90% OK e 10% sem venda.

   Usa so o saldo do CD. Reversa fica de fora: peca em reversa nao
   esta disponivel para montar nem para vender.
   ============================================================ */
import { useMemo } from 'react';
import type { Componente } from '../domain/tipos';
import { listarPorFornecedor, saudePorFornecedor, totalizarSaude } from '../domain/fornecedores';
import { cores } from '../config/tokens';
import { Cartao, Tabela, Td, Th, Vazio } from './ui';

const COR_OK = cores.semantico.verde;
const COR_TRAVADO = cores.laranja.base;

/* Barra de proporcao: verde do que monta, laranja do que trava. Le-se
   de longe, sem precisar do numero. */
function Proporcao({ pct }: { pct: number }) {
  return (
    <div className="eq-saude-barra" title={`${pct.toFixed(0)}% dos elevadores possíveis montam hoje`}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: COR_OK }} />
    </div>
  );
}

export function SaudeDoEstoque({ componentes }: { componentes: Componente[] }) {
  const linhas = useMemo(
    () => saudePorFornecedor(listarPorFornecedor(componentes)),
    [componentes]
  );
  const total = useMemo(() => totalizarSaude(linhas), [linhas]);

  if (linhas.length === 0) {
    return (
      <Cartao titulo="Saúde do estoque por fornecedor" descricao="quanto vira elevador vendável">
        <Vazio>Nenhum elevador na base importada.</Vazio>
      </Cartao>
    );
  }

  return (
    <Cartao
      titulo="Saúde do estoque por fornecedor"
      descricao="quanto do estoque vira elevador vendável · só saldo do CD, sem reversa"
    >
      <div className="eq-saude-topo">
        <div className="eq-saude-num">
          <span className="eq-saude-rot" style={{ color: COR_OK }}>Completos</span>
          <b style={{ color: COR_OK }}>{total.pctCompleto.toFixed(0)}%</b>
          <span className="eq-saude-det">{total.completos} de {total.potencial} elevadores</span>
        </div>
        <div className="eq-saude-num">
          <span className="eq-saude-rot" style={{ color: COR_TRAVADO }}>Descasados</span>
          <b style={{ color: COR_TRAVADO }}>{total.pctDescasado.toFixed(0)}%</b>
          <span className="eq-saude-det">{total.descasados} elevadores sem venda</span>
        </div>
        <div className="eq-saude-num">
          <span className="eq-saude-rot">Peças paradas</span>
          <b>{total.pecasParadas}</b>
          <span className="eq-saude-det">unidades sem par no CD</span>
        </div>
      </div>

      <Tabela>
        <thead>
          <tr>
            <Th>Fornecedor</Th>
            <Th alinha="right">Elevadores possíveis</Th>
            <Th alinha="right">Completos</Th>
            <Th alinha="right">Descasados</Th>
            <Th>Proporção</Th>
            <Th alinha="right">% OK</Th>
            <Th alinha="right">Peças paradas</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.fornecedor}>
              <Td>
                {l.fornecedor}
                <span className="eq-saude-skus">
                  {l.itens} SKU(s)
                  {l.itensDescasados > 0 && ` · ${l.itensDescasados} descasado(s)`}
                </span>
              </Td>
              <Td alinha="right" numerico>{l.potencial}</Td>
              <Td alinha="right" numerico>
                <b style={{ color: COR_OK }}>{l.completos}</b>
              </Td>
              <Td alinha="right" numerico>
                {l.descasados > 0 ? <b style={{ color: COR_TRAVADO }}>{l.descasados}</b> : '—'}
              </Td>
              <Td><Proporcao pct={l.pctCompleto} /></Td>
              <Td alinha="right" numerico>{l.pctCompleto.toFixed(0)}%</Td>
              <Td alinha="right" numerico>{l.pecasParadas || '—'}</Td>
            </tr>
          ))}
          <tr className="eq-saude-total">
            <Td><b>Total</b></Td>
            <Td alinha="right" numerico><b>{total.potencial}</b></Td>
            <Td alinha="right" numerico><b>{total.completos}</b></Td>
            <Td alinha="right" numerico><b>{total.descasados}</b></Td>
            <Td><Proporcao pct={total.pctCompleto} /></Td>
            <Td alinha="right" numerico><b>{total.pctCompleto.toFixed(0)}%</b></Td>
            <Td alinha="right" numerico><b>{total.pecasParadas}</b></Td>
          </tr>
        </tbody>
      </Tabela>
    </Cartao>
  );
}
