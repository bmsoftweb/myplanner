import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Inbox, X } from 'lucide-react';
import { lerPlanejamento, lerDetalhePlanejamento } from '../services/api';
import { LinhaPlanejamento } from '../types';
import { formatValor, formatDateBR, MESES_CURTOS } from '../utils/formatters';
import {
  useGradeLista,
  ColunaGrade,
  ThIndicador,
  TdIndicador,
  ThSobra,
  TdSobra,
  AlcaRedimensionar,
} from './GradeLista';

interface PlanejamentoViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
}

interface Celula {
  id_subcat: number;
  descricao: string;
  mes: number;
  coluna: 'pre' | 'rea';
}

/**
 * "Meu Planejamento": previsto × realizado de cada sub-categoria, mês a mês.
 *
 * A cor da marca entre as duas colunas repete o sistema original: para despesas,
 * gastar menos que o previsto é bom (azul) e gastar mais é ruim (laranja); para
 * receitas a leitura se inverte.
 */
export const PlanejamentoView: React.FC<PlanejamentoViewProps> = ({ refreshToken, onToast }) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [linhas, setLinhas] = useState<LinhaPlanejamento[]>([]);
  const [totalGeral, setTotalGeral] = useState<{
    meses: { previsto: number; realizado: number }[];
    total_previsto: number;
    total_realizado: number;
  } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [celula, setCelula] = useState<Celula | null>(null);
  const [detalhe, setDetalhe] = useState<{ data: any[]; total: number } | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  /** Linha destacada pelo clique, para acompanhar a leitura de uma conta */
  const [selecionada, setSelecionada] = useState<number | null>(null);

  /**
   * Cada mês é uma coluna só da grade, embora ocupe três células (previsão,
   * realizado e a marca): assim redimensionar move os três juntos, e o menu de
   * contexto reparte o espaço entre meses, e não entre 39 colunas.
   */
  const COLUNAS: ColunaGrade[] = useMemo(
    () => [
      { name: 'conta', label: 'Conta', width: 'lg' },
      ...MESES_CURTOS.map((m, i) => ({ name: `mes_${i + 1}`, label: m, width: 'md' as const })),
      { name: 'total', label: 'Total', width: 'md' as const },
    ],
    [],
  );

  const g = useGradeLista<ColunaGrade>({
    recurso: 'planejamento',
    colunas: COLUNAS,
    onToast,
    recalcularCom: linhas,
    // Os meses têm ordem própria: arrastar para reordenar não faria sentido aqui
    permitirReordenar: false,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await lerPlanejamento(ano);
      setLinhas(r.data);
      setTotalGeral(r.totalGeral);
    } catch (e: any) {
      setErro(e.message || 'Falha ao montar o planejamento.');
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [ano]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  // Abre o detalhe da célula clicada duas vezes
  useEffect(() => {
    if (!celula) return setDetalhe(null);
    let vivo = true;
    setCarregandoDetalhe(true);
    lerDetalhePlanejamento({ ano, mes: celula.mes, id_subcat: celula.id_subcat, coluna: celula.coluna })
      .then((r) => vivo && setDetalhe(r))
      .catch((e) => {
        if (vivo) {
          onToast(e.message);
          setCelula(null);
        }
      })
      .finally(() => vivo && setCarregandoDetalhe(false));
    return () => {
      vivo = false;
    };
  }, [celula, ano, onToast]);

  /** Subtotais por categoria (o grupo), na ordem em que as linhas chegaram */
  const grupos = useMemo(() => {
    const mapa = new Map<string, LinhaPlanejamento[]>();
    for (const linha of linhas) {
      const chave = `${linha.id}|${linha.grupo}`;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(linha);
    }
    return Array.from(mapa.entries()).map(([chave, itens]) => {
      const meses = Array.from({ length: 12 }, () => ({ previsto: 0, realizado: 0 }));
      let totalPrevisto = 0;
      let totalRealizado = 0;
      for (const item of itens) {
        for (let i = 0; i < 12; i++) {
          meses[i].previsto += item.meses[i].previsto;
          meses[i].realizado += item.meses[i].realizado;
        }
        totalPrevisto += item.total_previsto;
        totalRealizado += item.total_realizado;
      }
      return {
        nome: chave.split('|')[1],
        tiporb: itens[0]?.tiporb || 'D',
        itens,
        meses,
        total_previsto: totalPrevisto,
        total_realizado: totalRealizado,
      };
    });
  }, [linhas]);

  /**
   * Marca entre previsto e realizado:
   *  '=' quando são iguais; '+' quando o realizado ficou abaixo do previsto;
   *  '-' quando passou. A cor depende de ser receita ou despesa.
   */
  const marca = (previsto: number, realizado: number, tiporb: string) => {
    const diferenca = realizado - previsto;
    if (Math.abs(diferenca) < 0.005) return { sinal: '=', classe: 'bg-stone-200 dark:bg-stone-700' };
    const gastouMais = diferenca > 0;
    const bom = tiporb === 'R' ? gastouMais : !gastouMais;
    return {
      sinal: gastouMais ? '-' : '+',
      classe: bom ? 'bg-blue-500' : 'bg-orange-400',
    };
  };

  const celulaValor = (valor: number) => (valor ? formatValor(valor) : '');

  const trioDeMes = (
    linha: { meses: { previsto: number; realizado: number }[]; tiporb: string },
    mes: number,
    aoClicar?: (coluna: 'pre' | 'rea') => void,
    negrito = false,
  ) => {
    const { previsto, realizado } = linha.meses[mes];
    const m = marca(previsto, realizado, linha.tiporb);
    const base = `py-[7.5px] px-2 text-right font-mono whitespace-nowrap ${g.bordasCelula} ${
      negrito ? 'font-bold' : ''
    }`;
    return (
      <React.Fragment key={mes}>
        <td
          className={`${base} ${aoClicar ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40' : ''}`}
          onDoubleClick={aoClicar ? () => aoClicar('pre') : undefined}
        >
          {celulaValor(previsto)}
        </td>
        <td
          className={`${base} ${aoClicar ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40' : ''}`}
          onDoubleClick={aoClicar ? () => aoClicar('rea') : undefined}
        >
          {celulaValor(realizado)}
        </td>
        <td className={`py-[7.5px] px-1 text-center ${g.bordasCelula}`}>
          {previsto || realizado ? (
            <span className={`inline-block w-2 h-2 rounded-full ${m.classe}`} title={m.sinal} />
          ) : null}
        </td>
      </React.Fragment>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Barra do ano */}
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAno((a) => a - 1)}
          title="Ano anterior"
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-lg font-bold text-stone-800 dark:text-stone-100 tabular-nums px-2">{ano}</span>
        <button
          type="button"
          onClick={() => setAno((a) => a + 1)}
          title="Próximo ano"
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-4 text-[11px] text-stone-500 dark:text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> dentro do previsto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400" /> fora do previsto
          </span>
          <span className="hidden lg:inline">duplo clique numa célula abre os lançamentos</span>
        </div>
      </div>

      {/* Grade */}
      <div className="flex-1 overflow-auto min-h-0">
        {erro ? (
          <div className="m-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        ) : carregando && !linhas.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Montando o planejamento…</span>
          </div>
        ) : !linhas.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Inbox className="w-7 h-7" />
            <span className="text-xs">Cadastre categorias e sub-categorias para montar o planejamento.</span>
          </div>
        ) : (
          <table ref={g.tabelaRef} className={`text-xs border-separate border-spacing-0 ${carregando ? 'opacity-60' : ''}`}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-stone-100 dark:bg-stone-800 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <ThIndicador grade={g} rowSpan={2} />

                {/* Conta: coluna de dados, mas fixa à esquerda */}
                <th
                  rowSpan={2}
                  data-coluna="conta"
                  style={g.estiloColuna(COLUNAS[0]).style}
                  className="relative sticky left-[30px] z-30 bg-stone-100 dark:bg-stone-800 text-left font-semibold py-2 px-3 border-b border-r border-stone-200 dark:border-stone-700 min-w-[240px]"
                >
                  <AlcaRedimensionar grade={g} coluna={COLUNAS[0]} />
                  Conta
                </th>

                {/* Um mês é uma coluna só: redimensionar move os três campos juntos */}
                {COLUNAS.slice(1).map((c) => (
                  <th
                    key={c.name}
                    colSpan={3}
                    data-coluna={c.name}
                    style={g.estiloColuna(c).style}
                    className={`relative text-center font-semibold py-1.5 px-2 border-b border-r border-stone-200 dark:border-stone-700 ${
                      c.name === 'total' ? 'bg-stone-200 dark:bg-stone-700' : ''
                    }`}
                  >
                    <AlcaRedimensionar grade={g} coluna={c} />
                    {c.label}
                  </th>
                ))}

                {g.comSobra && <ThSobra rowSpan={2} />}
              </tr>

              <tr className="bg-stone-50 dark:bg-stone-800/80 text-[9px] uppercase tracking-wider text-stone-400">
                {COLUNAS.slice(1).map((c) => (
                  <React.Fragment key={c.name}>
                    <th className="text-right font-semibold py-1 px-2 border-b border-stone-200 dark:border-stone-700">
                      Previsão
                    </th>
                    <th className="text-right font-semibold py-1 px-2 border-b border-stone-200 dark:border-stone-700">
                      Realizado
                    </th>
                    <th className="w-5 border-b border-r border-stone-200 dark:border-stone-700" />
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              {grupos.map((grupo) => (
                <React.Fragment key={grupo.nome}>
                  {/* Cabeçalho da categoria */}
                  <tr className="bg-stone-50 dark:bg-stone-800/60">
                    <td className={`sticky left-0 z-10 w-[30px] min-w-[30px] max-w-[30px] bg-stone-50 dark:bg-stone-800/60 border-r border-stone-200 dark:border-stone-800 ${g.bordasCelula}`} />
                    <td
                      colSpan={42}
                      className="sticky left-[30px] py-1.5 px-3 border-b border-stone-200 dark:border-stone-700 text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/60"
                    >
                      {grupo.nome}
                      <span className="ml-2 text-[10px] font-medium text-stone-400">
                        {grupo.tiporb === 'R' ? 'receita' : 'despesa'}
                      </span>
                    </td>
                  </tr>

                  {grupo.itens.map((linha) => {
                    const ativa = selecionada === linha.id_subcat;
                    return (
                      <tr
                        key={linha.id_subcat}
                        onClick={() => setSelecionada(ativa ? null : linha.id_subcat)}
                        className={`group cursor-pointer transition-colors ${
                          ativa
                            ? 'bg-blue-100 dark:bg-blue-950'
                            : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                        }`}
                      >
                        <TdIndicador grade={g} ativa={ativa} />
                        <td
                          data-coluna="conta"
                          style={g.estiloColuna(COLUNAS[0], true).style}
                          className={`sticky left-[30px] z-10 bg-inherit py-[7.5px] px-3 border-r border-stone-200 dark:border-stone-800 whitespace-nowrap truncate ${g.bordasCelula}`}
                        >
                          <span className="text-stone-400 mr-1.5">{linha.codigo}</span>
                          {linha.descricao}
                        </td>

                        {MESES_CURTOS.map((_, i) =>
                          trioDeMes(linha, i, (coluna) =>
                            setCelula({ id_subcat: linha.id_subcat, descricao: linha.descricao, mes: i + 1, coluna }),
                          ),
                        )}

                        {/* Coluna de total do ano */}
                        <td
                          className={`py-[7.5px] px-2 text-right font-mono font-semibold bg-stone-50 dark:bg-stone-800/40 cursor-pointer ${g.bordasCelula}`}
                          onDoubleClick={() =>
                            setCelula({ id_subcat: linha.id_subcat, descricao: linha.descricao, mes: 0, coluna: 'pre' })
                          }
                        >
                          {celulaValor(linha.total_previsto)}
                        </td>
                        <td
                          className={`py-[7.5px] px-2 text-right font-mono font-semibold bg-stone-50 dark:bg-stone-800/40 cursor-pointer ${g.bordasCelula}`}
                          onDoubleClick={() =>
                            setCelula({ id_subcat: linha.id_subcat, descricao: linha.descricao, mes: 0, coluna: 'rea' })
                          }
                        >
                          {celulaValor(linha.total_realizado)}
                        </td>
                        <td className={`bg-stone-50 dark:bg-stone-800/40 ${g.bordasCelula}`} />

                        {g.comSobra && <TdSobra grade={g} />}
                      </tr>
                    );
                  })}

                  {/* Subtotal da categoria */}
                  <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                    <td className={`sticky left-0 z-10 w-[30px] min-w-[30px] max-w-[30px] bg-emerald-50 dark:bg-emerald-950/40 border-r border-stone-200 dark:border-stone-700 ${g.bordasCelula}`} />
                    <td className={`sticky left-[30px] z-10 bg-emerald-50 dark:bg-emerald-950/40 py-[7.5px] px-3 border-r border-stone-200 dark:border-stone-700 font-bold ${g.bordasCelula}`}>
                      Subtotal
                    </td>
                    {MESES_CURTOS.map((_, i) => trioDeMes(grupo, i, undefined, true))}
                    <td className={`py-[7.5px] px-2 text-right font-mono font-bold ${g.bordasCelula}`}>
                      {celulaValor(grupo.total_previsto)}
                    </td>
                    <td className={`py-[7.5px] px-2 text-right font-mono font-bold ${g.bordasCelula}`}>
                      {celulaValor(grupo.total_realizado)}
                    </td>
                    <td className={g.bordasCelula} />

                    {g.comSobra && <TdSobra grade={g} />}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>

            {/* Total geral: receitas menos despesas */}
            {totalGeral && (
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-stone-100 dark:bg-stone-800 font-bold">
                  <td className="sticky left-0 z-30 w-[30px] min-w-[30px] max-w-[30px] bg-stone-100 dark:bg-stone-800 border-t border-r border-stone-300 dark:border-stone-600" />
                  <td className="sticky left-[30px] z-30 bg-stone-100 dark:bg-stone-800 py-2 px-3 border-t border-r border-stone-300 dark:border-stone-600">
                    Total geral
                  </td>
                  {MESES_CURTOS.map((_, i) => {
                    const { previsto, realizado } = totalGeral.meses[i];
                    return (
                      <React.Fragment key={i}>
                        <td
                          className={`py-2 px-2 border-t border-stone-300 dark:border-stone-600 text-right font-mono ${
                            previsto >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {celulaValor(previsto)}
                        </td>
                        <td
                          className={`py-2 px-2 border-t border-stone-300 dark:border-stone-600 text-right font-mono ${
                            realizado >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {celulaValor(realizado)}
                        </td>
                        <td className="border-t border-r border-stone-300 dark:border-stone-600" />
                      </React.Fragment>
                    );
                  })}
                  <td
                    className={`py-2 px-2 border-t border-stone-300 dark:border-stone-600 text-right font-mono ${
                      totalGeral.total_previsto >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-600'
                    }`}
                  >
                    {celulaValor(totalGeral.total_previsto)}
                  </td>
                  <td
                    className={`py-2 px-2 border-t border-stone-300 dark:border-stone-600 text-right font-mono ${
                      totalGeral.total_realizado >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-600'
                    }`}
                  >
                    {celulaValor(totalGeral.total_realizado)}
                  </td>
                  <td className="border-t border-stone-300 dark:border-stone-600" />
                  {g.comSobra && <td className="w-full border-t border-stone-300 dark:border-stone-600" />}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Detalhe da célula */}
      {celula && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={() => setCelula(null)} aria-hidden="true" />
          <div className="relative w-full max-w-3xl max-h-[80vh] flex flex-col bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">{celula.descricao}</h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {celula.mes ? `${MESES_CURTOS[celula.mes - 1]}/${ano}` : `Ano de ${ano}`} •{' '}
                  {celula.coluna === 'pre' ? 'previsto' : 'realizado'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCelula(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              {carregandoDetalhe ? (
                <div className="py-16 flex justify-center text-stone-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : !detalhe?.data.length ? (
                <p className="py-16 text-center text-xs text-stone-400">Nenhum lançamento nesta célula.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/80 sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      <th className="text-center font-semibold py-2 px-2">Data</th>
                      <th className="text-left font-semibold py-2 px-2">Histórico</th>
                      <th className="text-left font-semibold py-2 px-2">Tipo</th>
                      <th className="text-left font-semibold py-2 px-2">Banco</th>
                      <th className="text-left font-semibold py-2 px-2">Centro de Custo</th>
                      <th className="text-right font-semibold py-2 px-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.data.map((l) => (
                      <tr key={l.Id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                        <td className="text-center py-1.5 px-2 whitespace-nowrap">{formatDateBR(l.data)}</td>
                        <td className="py-1.5 px-2">{l.historico}</td>
                        <td className="py-1.5 px-2">{l.descricao_tipo}</td>
                        <td className="py-1.5 px-2">{l.descricao_banco}</td>
                        <td className="py-1.5 px-2">{l.descricao_centro_custos}</td>
                        <td className="text-right py-1.5 px-2 font-mono font-semibold">{formatValor(l.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {detalhe && (
              <div className="px-5 py-2.5 border-t border-stone-200 dark:border-stone-800 text-xs text-right text-stone-600 dark:text-stone-300">
                Total: <strong className="font-mono">{formatValor(detalhe.total)}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
