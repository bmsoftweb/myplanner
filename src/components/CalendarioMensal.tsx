import React, { useMemo } from 'react';
import { Lancamento } from '../types';
import { formatValor, hoje } from '../utils/formatters';

interface CalendarioMensalProps {
  linhas: Lancamento[];
  /** Mês (0-11) e ano exibidos */
  mes: number;
  ano: number;
  /** Clique num dia: abre a lista só daquele dia */
  onDia: (data: string) => void;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const chave = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Visão mensal dos lançamentos: em cada dia, o total a receber (azul), o total
 * a pagar (vermelho) e o saldo do dia. Vale o realizado quando existe; senão, o
 * previsto — na data de data_sort, a mesma que ordena a lista.
 */
export const CalendarioMensal: React.FC<CalendarioMensalProps> = ({ linhas, mes, ano, onDia }) => {
  const porDia = useMemo(() => {
    const mapa: Record<string, { receber: number; pagar: number }> = {};
    for (const l of linhas) {
      const dia = String(l.data_sort || '').slice(0, 10);
      if (!dia) continue;
      const valor = Number(l.valor_realizado) > 0 ? Number(l.valor_realizado) : Number(l.valor_previsto || 0);
      const t = (mapa[dia] ||= { receber: 0, pagar: 0 });
      if (l.mais_ou_menos === '+') t.receber += valor;
      else t.pagar += valor;
    }
    return mapa;
  }, [linhas]);

  // Semanas completas, de domingo a sábado, cobrindo o mês inteiro
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const ultimo = new Date(ano, mes + 1, 0);
  const dias = Math.ceil((primeiro.getDay() + ultimo.getDate()) / 7) * 7;
  const diaDeHoje = hoje();

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-800 shrink-0 bg-stone-50 dark:bg-stone-950/90">
        {DIAS.map((d) => (
          <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase text-stone-500 dark:text-stone-400">
            {d}
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
        {Array.from({ length: dias }, (_, i) => {
          const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
          const k = chave(d);
          const foraDoMes = d.getMonth() !== mes;
          const t = foraDoMes ? undefined : porDia[k];
          const saldo = t ? t.receber - t.pagar : 0;
          return (
            <button
              type="button"
              key={k}
              disabled={foraDoMes}
              onClick={() => onDia(k)}
              title={foraDoMes ? undefined : 'Ver os lançamentos do dia'}
              className={`min-h-[88px] p-1.5 border-b border-r border-stone-200 dark:border-stone-800 flex flex-col items-stretch gap-0.5 min-w-0 text-left ${
                foraDoMes
                  ? 'bg-stone-50/70 dark:bg-stone-950/40 cursor-default'
                  : 'hover:bg-blue-50/60 dark:hover:bg-blue-950/20 cursor-pointer'
              }`}
            >
              <span
                className={`self-end w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                  k === diaDeHoje
                    ? 'bg-blue-600 text-white'
                    : foraDoMes
                    ? 'text-stone-300 dark:text-stone-600'
                    : 'text-stone-700 dark:text-stone-200'
                }`}
              >
                {d.getDate()}
              </span>
              {t && (
                <div className="mt-auto flex flex-col gap-0.5 text-[11px] font-mono leading-tight text-right">
                  {t.receber > 0 && (
                    <span className="text-blue-600 dark:text-blue-400" title="A receber">
                      {formatValor(t.receber)}
                    </span>
                  )}
                  {t.pagar > 0 && (
                    <span className="text-rose-600 dark:text-rose-400" title="A pagar">
                      {formatValor(t.pagar)}
                    </span>
                  )}
                  <span
                    className={`pt-0.5 mt-0.5 border-t border-stone-200 dark:border-stone-700 font-bold ${
                      saldo >= 0 ? 'text-stone-800 dark:text-stone-100' : 'text-rose-700 dark:text-rose-400'
                    }`}
                    title="Saldo do dia"
                  >
                    {formatValor(saldo)}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
