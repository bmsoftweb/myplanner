import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Inbox, CreditCard, BarChart3,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { lerCombosLancamentos, lerFaturaCartao, lerAnaliseLimite, CombosLancamentos } from '../services/api';
import { formatValor, formatDateBR, MESES_CURTOS } from '../utils/formatters';
import { INPUT_CLASS } from '../utils/formStyles';
import {
  useGradeLista,
  ColunaGrade,
  ThIndicador,
  TdIndicador,
  ThSobra,
  TdSobra,
  AlcaRedimensionar,
} from './GradeLista';

/** Uma coluna da fatura: o que desenha e por que valor ordena */
interface ColunaFatura extends ColunaGrade {
  align?: 'left' | 'center' | 'right';
  render: (l: any) => React.ReactNode;
  valor: (l: any) => string | number;
}

interface FaturaCartaoViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
}

/**
 * Fatura do cartão e análise mensal do limite.
 *
 * Como a compra no cartão é gravada com data_realizado igual ao vencimento da
 * fatura, a fatura de um mês é simplesmente o conjunto de lançamentos daquela
 * data — as setas andam de fatura em fatura.
 */
export const FaturaCartaoView: React.FC<FaturaCartaoViewProps> = ({ refreshToken, onToast }) => {
  const [combos, setCombos] = useState<CombosLancamentos | null>(null);
  const [idLimite, setIdLimite] = useState('');
  const [deslocamento, setDeslocamento] = useState(0);
  const [fatura, setFatura] = useState<any | null>(null);
  const [analise, setAnalise] = useState<{ ano: number; mes: number; limite: number; realizado: number }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cartoes = (combos?.limites || []).filter((l) => l.cartao_credito === 'S');

  // ----------------------------------------------------------
  // Colunas da fatura, na mesma mecânica das outras listas.
  // A fatura é só leitura: o lançamento é editado na tela de Lançamentos.
  // ----------------------------------------------------------
  const COLUNAS: ColunaFatura[] = useMemo(
    () => [
      {
        name: 'data_compra', label: 'Data da Compra', width: 'sm', align: 'center',
        valor: (l) => l.data_compra || '',
        render: (l) => (l.data_compra ? formatDateBR(l.data_compra) : '—'),
      },
      {
        name: 'descricao', label: 'Categoria', width: 'md', align: 'left',
        valor: (l) => l.descricao || '',
        render: (l) => l.descricao,
      },
      {
        name: 'descricao_cc', label: 'Centro de Custo', width: 'md', align: 'left',
        valor: (l) => l.descricao_cc || '',
        render: (l) => l.descricao_cc,
      },
      {
        name: 'historico', label: 'Histórico', width: 'lg', align: 'left',
        valor: (l) => l.historico || '',
        render: (l) => l.historico,
      },
      {
        name: 'valor_realizado', label: 'Valor', width: 'sm', align: 'right',
        valor: (l) => Number(l.valor_realizado || 0),
        render: (l) => <span className="font-semibold">{formatValor(l.valor_realizado)}</span>,
      },
    ],
    [],
  );

  const g = useGradeLista<ColunaFatura>({
    recurso: 'fatura',
    colunas: COLUNAS,
    onToast,
    recalcularCom: fatura,
  });

  /** Linha destacada pelo clique, para acompanhar a conferência da fatura */
  const [selecionada, setSelecionada] = useState<number | null>(null);

  // Ordenação no cliente: a fatura vem inteira do servidor
  const [ordenacao, setOrdenacao] = useState<{ campo: string; dir: 'asc' | 'desc' } | null>(null);

  const ordenarPor = (nome: string) =>
    setOrdenacao((atual) =>
      atual?.campo === nome
        ? { campo: nome, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
        : { campo: nome, dir: 'asc' },
    );

  const linhasOrdenadas = useMemo(() => {
    const linhas: any[] = fatura?.data || [];
    if (!ordenacao) return linhas;
    const coluna = COLUNAS.find((c) => c.name === ordenacao.campo);
    if (!coluna) return linhas;
    const sinal = ordenacao.dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = coluna.valor(a);
      const vb = coluna.valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), 'pt-BR') * sinal;
    });
  }, [fatura, ordenacao, COLUNAS]);

  /** Números à direita, datas centralizadas, o resto à esquerda */
  const alinhamento = (c: ColunaFatura) =>
    c.align === 'right' ? 'text-right font-mono' : c.align === 'center' ? 'text-center' : 'text-left';

  useEffect(() => {
    lerCombosLancamentos()
      .then((c) => {
        setCombos(c);
        const primeiro = c.limites.find((l) => l.cartao_credito === 'S');
        if (primeiro) setIdLimite((atual) => atual || String(primeiro.Id));
      })
      .catch((e) => setErro(e.message));
  }, [refreshToken]);

  const carregar = useCallback(async () => {
    if (!idLimite) return;
    setCarregando(true);
    setErro(null);
    try {
      const [f, a] = await Promise.all([lerFaturaCartao(idLimite, deslocamento), lerAnaliseLimite(idLimite)]);
      setFatura(f);
      setAnalise(a.data);
    } catch (e: any) {
      setErro(e.message || 'Falha ao montar a fatura.');
      setFatura(null);
    } finally {
      setCarregando(false);
    }
  }, [idLimite, deslocamento]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const maiorDaAnalise = Math.max(1, ...analise.flatMap((a) => [a.limite, a.realizado]));

  if (!cartoes.length && combos) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-stone-400 bg-white dark:bg-stone-900">
        <CreditCard className="w-8 h-8" />
        <p className="text-xs max-w-sm text-center">
          Nenhum limite está marcado como cartão de crédito. Abra <strong>Limites</strong>, ligue a opção
          “É cartão de crédito” e informe os dias de fechamento e de vencimento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <select
          value={idLimite}
          onChange={(e) => {
            setIdLimite(e.target.value);
            setDeslocamento(0);
          }}
          className={`${INPUT_CLASS} cursor-pointer min-w-48`}
          title="Cartão de crédito"
        >
          <option value="">Escolha o cartão</option>
          {cartoes.map((l) => (
            <option key={l.Id} value={l.Id}>
              {l.descricao}
            </option>
          ))}
        </select>

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        <button
          type="button"
          onClick={() => setDeslocamento((d) => d - 1)}
          title="Fatura anterior"
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-stone-800 dark:text-stone-100 px-2 whitespace-nowrap">
          {fatura ? `Vencimento: ${formatDateBR(fatura.vencimento)}` : '—'}
        </span>
        <button
          type="button"
          onClick={() => setDeslocamento((d) => d + 1)}
          title="Próxima fatura"
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {deslocamento !== 0 && (
          <button
            type="button"
            onClick={() => setDeslocamento(0)}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            fatura atual
          </button>
        )}

        {fatura && (
          <div className="ml-auto text-xs text-stone-500 dark:text-stone-400">
            Total da fatura:{' '}
            <strong className="font-mono text-rose-600 dark:text-rose-400">{formatValor(fatura.total)}</strong>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {erro ? (
          <div className="m-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        ) : carregando ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Montando a fatura…</span>
          </div>
        ) : !fatura?.data.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Inbox className="w-7 h-7" />
            <span className="text-xs">Nenhuma compra nesta fatura.</span>
          </div>
        ) : (
          <table ref={g.tabelaRef} className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-50 dark:bg-stone-950/90 backdrop-blur-xs text-[10px] uppercase tracking-wider">
                <ThIndicador grade={g} />

                {g.colunas.map((c) => {
                  const ordenada = ordenacao?.campo === c.name;
                  return (
                    <th
                      key={c.name}
                      data-coluna={c.name}
                      {...g.propsArraste(c.name)}
                      onClick={() => ordenarPor(c.name)}
                      style={g.estiloColuna(c).style}
                      className={`relative px-2 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap cursor-pointer select-none hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors border-b border-r border-stone-200 dark:border-stone-800 ${
                        g.grade === 'ambas' || g.grade === 'verticais' ? '' : 'border-r-transparent'
                      } ${g.estiloColuna(c).className}`}
                      title={`Ordenar por ${c.label}`}
                    >
                      <AlcaRedimensionar grade={g} coluna={c} />
                      <span className="inline-flex items-center gap-1 justify-center">
                        {c.label}
                        {ordenada &&
                          (ordenacao!.dir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          ))}
                      </span>
                    </th>
                  );
                })}

                {g.comSobra && <ThSobra />}
              </tr>
            </thead>

            <tbody>
              {linhasOrdenadas.map((l: any) => {
                const ativa = selecionada === l.Id;
                return (
                  <tr
                    key={l.Id}
                    onClick={() => setSelecionada(ativa ? null : l.Id)}
                    className={`group cursor-pointer transition-colors ${
                      ativa
                        ? 'bg-blue-100 dark:bg-blue-950'
                        : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <TdIndicador grade={g} ativa={ativa} />

                    {g.colunas.map((c) => (
                      <td
                        key={c.name}
                        data-coluna={c.name}
                        style={g.estiloColuna(c, true).style}
                        className={`px-2 py-[7.5px] text-stone-700 dark:text-stone-300 align-middle max-w-xs truncate ${g.bordasCelula} ${alinhamento(c)}`}
                      >
                        {c.render(l)}
                      </td>
                    ))}

                    {g.comSobra && <TdSobra grade={g} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Análise: limite × realizado, mês a mês */}
      {analise.length > 0 && (
        <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-3 bg-stone-50 dark:bg-stone-900">
          <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
            <BarChart3 className="w-3.5 h-3.5" />
            Limite × realizado por mês
          </h4>
          <div className="flex items-end gap-2 h-28 overflow-x-auto pb-1">
            {analise.map((a) => (
              <div key={`${a.ano}-${a.mes}`} className="flex flex-col items-center gap-1 min-w-[46px]">
                <div className="flex items-end gap-1 h-20">
                  <div
                    title={`Limite: ${formatValor(a.limite)}`}
                    className="w-3 rounded-t bg-stone-300 dark:bg-stone-600"
                    style={{ height: `${Math.max(2, (a.limite / maiorDaAnalise) * 100)}%` }}
                  />
                  <div
                    title={`Realizado: ${formatValor(a.realizado)}`}
                    className={`w-3 rounded-t ${a.realizado > a.limite ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ height: `${Math.max(2, (a.realizado / maiorDaAnalise) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-400 whitespace-nowrap">
                  {MESES_CURTOS[a.mes - 1]}/{String(a.ano).slice(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
