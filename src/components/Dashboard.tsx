import React from 'react';
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown, Landmark, StepForward,
  CalendarClock, Inbox, PieChart as PieChartIcon,
} from 'lucide-react';
import { Conta, DashboardData, DbConnectionStatus } from '../types';
import { formatValor, formatCurrencyBRL } from '../utils/formatters';

interface DashboardProps {
  conta: Conta;
  data: DashboardData | null;
  dbStatus: DbConnectionStatus | null;
  isLoading: boolean;
  error: string | null;
  onNavigate: (tab: string) => void;
}

/** Paleta das fatias do gráfico de despesas, do maior para o menor */
const CORES_FATIAS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#a1a1aa'];

/** Caixa branca padrão dos blocos do painel */
const Cartao: React.FC<{
  titulo: string;
  icone: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ titulo, icone, acao, className = '', children }) => (
  <section
    className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 flex flex-col ${className}`}
  >
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {icone}
        {titulo}
      </h3>
      {acao}
    </div>
    {children}
  </section>
);

/** Medidor em rosca: quanto do previsto do mês já virou despesa realizada */
const Medidor: React.FC<{ percentual: number }> = ({ percentual }) => {
  const limitado = Math.max(0, Math.min(100, percentual));
  const raio = 54;
  const circunferencia = 2 * Math.PI * raio;
  // Meia-volta: o arco vai de 0 a 50% do perímetro
  const preenchido = (limitado / 100) * (circunferencia / 2);
  const cor = limitado > 100 ? '#e11d48' : limitado > 80 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 80" className="w-full max-w-[220px]" role="img" aria-label={`${limitado}% realizado`}>
        <path
          d="M 16 70 A 54 54 0 0 1 124 70"
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          className="stroke-stone-200 dark:stroke-stone-800"
        />
        <path
          d="M 16 70 A 54 54 0 0 1 124 70"
          fill="none"
          stroke={cor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${circunferencia}`}
        />
        <text
          x="70"
          y="64"
          textAnchor="middle"
          className="fill-stone-900 dark:fill-stone-100"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {limitado}%
        </text>
      </svg>
    </div>
  );
};

/** Barras de receitas × despesas, mês a mês */
const BarrasPorMes: React.FC<{ dados: { anomes: string; receitas: number; despesas: number }[] }> = ({ dados }) => {
  const maior = Math.max(1, ...dados.flatMap((d) => [d.receitas, d.despesas]));

  if (!dados.length) {
    return <p className="text-xs text-stone-400 py-8 text-center">Ainda não há movimento realizado para comparar.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 h-44 overflow-x-auto pb-1">
        {dados.map((d) => (
          <div key={d.anomes} className="flex flex-col items-center gap-1 min-w-[42px] flex-1">
            <div className="flex items-end gap-1 h-36 w-full justify-center">
              <div
                title={`Receitas: ${formatCurrencyBRL(d.receitas)}`}
                className="w-3 rounded-t bg-emerald-500"
                style={{ height: `${Math.max(2, (d.receitas / maior) * 100)}%` }}
              />
              <div
                title={`Despesas: ${formatCurrencyBRL(d.despesas)}`}
                className="w-3 rounded-t bg-rose-500"
                style={{ height: `${Math.max(2, (d.despesas / maior) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-stone-400 whitespace-nowrap">{d.anomes}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-stone-500 dark:text-stone-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Despesas
        </span>
      </div>
    </div>
  );
};

/** Rosca das maiores despesas por sub-categoria */
const RoscaDespesas: React.FC<{ dados: { descricao: string; valor: number }[] }> = ({ dados }) => {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (!total) {
    return <p className="text-xs text-stone-400 py-8 text-center">Nenhuma despesa marcada para o gráfico.</p>;
  }

  const raio = 60;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 160 160" className="w-32 h-32 shrink-0 -rotate-90">
        {dados.map((d, i) => {
          const fatia = (d.valor / total) * circunferencia;
          const deslocamento = -acumulado;
          acumulado += fatia;
          return (
            <circle
              key={d.descricao}
              cx="80"
              cy="80"
              r={raio}
              fill="none"
              stroke={CORES_FATIAS[i % CORES_FATIAS.length]}
              strokeWidth="26"
              strokeDasharray={`${fatia} ${circunferencia - fatia}`}
              strokeDashoffset={deslocamento}
            >
              <title>{`${d.descricao}: ${formatCurrencyBRL(d.valor)}`}</title>
            </circle>
          );
        })}
      </svg>

      <ul className="flex-1 w-full space-y-1.5 min-w-0">
        {dados.map((d, i) => (
          <li key={d.descricao} className="flex items-center justify-between gap-2 text-xs min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: CORES_FATIAS[i % CORES_FATIAS.length] }}
              />
              <span className="truncate min-w-0 text-stone-600 dark:text-stone-300">{d.descricao}</span>
            </span>
            <span className="font-mono font-semibold text-stone-800 dark:text-stone-100 shrink-0">
              {formatValor(d.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ conta, data, dbStatus, isLoading, error, onNavigate }) => {
  if (isLoading && !data) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-xs">Carregando os indicadores…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  const saldoTotal = data.saldosBancos.reduce((s, b) => s + b.saldo, 0);
  const resultadoHoje = data.hoje.receitas - data.hoje.despesas;

  return (
    <div className="space-y-4">
      {/* Faixa de boas-vindas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Olá, {conta.nome.split(' ')[0]}!</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {dbStatus?.connected
              ? 'Este é o resumo da sua vida financeira hoje.'
              : 'O banco de dados está indisponível — os números podem estar desatualizados.'}
          </p>
        </div>
        <button
          onClick={() => onNavigate('lancamentos')}
          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
        >
          Ir para os lançamentos →
        </button>
      </div>

      {/* Indicadores rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            rotulo: 'Saldo em contas',
            valor: formatCurrencyBRL(saldoTotal),
            cor: saldoTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            icone: <Landmark className="w-4 h-4" />,
            destino: 'extrato',
          },
          {
            rotulo: 'A receber hoje',
            valor: formatCurrencyBRL(data.hoje.receitas),
            cor: 'text-emerald-600 dark:text-emerald-400',
            icone: <TrendingUp className="w-4 h-4" />,
            destino: 'lancamentos',
          },
          {
            rotulo: 'A pagar hoje',
            valor: formatCurrencyBRL(data.hoje.despesas),
            cor: 'text-rose-600 dark:text-rose-400',
            icone: <TrendingDown className="w-4 h-4" />,
            destino: 'lancamentos',
          },
          {
            rotulo: 'Resultado do dia',
            valor: formatCurrencyBRL(resultadoHoje),
            cor: resultadoHoje >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            icone: <CalendarClock className="w-4 h-4" />,
            destino: 'planejamento',
          },
        ].map((item) => (
          <button
            key={item.rotulo}
            onClick={() => onNavigate(item.destino)}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 text-left hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-stone-400 mb-1.5">
              {item.icone}
              <span className="text-[11px] font-semibold uppercase tracking-wider">{item.rotulo}</span>
            </div>
            <div className={`text-lg font-bold font-mono ${item.cor}`}>{item.valor}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Medidor do mês */}
        <Cartao titulo="Realizado do mês" icone={<PieChartIcon className="w-3.5 h-3.5" />}>
          <Medidor percentual={data.realizadoDoMes.percentual} />
          <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-stone-400">Previsto</dt>
              <dd className="text-sm font-bold font-mono text-stone-700 dark:text-stone-200">
                {formatValor(data.realizadoDoMes.previsto)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-stone-400">Realizado</dt>
              <dd className="text-sm font-bold font-mono text-stone-700 dark:text-stone-200">
                {formatValor(data.realizadoDoMes.realizado)}
              </dd>
            </div>
          </dl>
        </Cartao>

        {/* 2. Receitas × despesas por mês */}
        <Cartao
          titulo="Receitas × Despesas (12 meses)"
          icone={<TrendingUp className="w-3.5 h-3.5" />}
          className="lg:col-span-2"
        >
          <BarrasPorMes dados={data.porMes} />
        </Cartao>

        {/* 3. Contas do dia */}
        <Cartao
          titulo="Contas de hoje"
          icone={<CalendarClock className="w-3.5 h-3.5" />}
          className="lg:col-span-2"
          acao={
            <button
              onClick={() => onNavigate('lancamentos')}
              className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              ver lançamentos
            </button>
          }
        >
          {data.hoje.itens.length ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-200 dark:border-stone-800">
                    <th className="text-left font-semibold py-1.5 px-1">Categoria</th>
                    <th className="text-left font-semibold py-1.5 px-1">Histórico</th>
                    <th className="text-left font-semibold py-1.5 px-1">Tipo</th>
                    <th className="text-right font-semibold py-1.5 px-1">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hoje.itens.map((i, idx) => (
                    <tr key={idx} className="border-b border-stone-100 dark:border-stone-800/60 last:border-0">
                      <td className="py-1.5 px-1 text-stone-700 dark:text-stone-200">{i.categoria}</td>
                      <td className="py-1.5 px-1 text-stone-500 dark:text-stone-400 truncate max-w-[220px]">
                        {i.historico}
                      </td>
                      <td className="py-1.5 px-1 text-stone-500 dark:text-stone-400">{i.tipo_documento}</td>
                      <td
                        className={`py-1.5 px-1 text-right font-mono font-semibold ${
                          (i as any).rd === 'R'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatValor(i.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 text-xs text-stone-400 py-8">
              <Inbox className="w-4 h-4" />
              Nada pendente para hoje.
            </p>
          )}
        </Cartao>

        {/* 4. Maiores despesas */}
        <Cartao titulo="Maiores despesas" icone={<TrendingDown className="w-3.5 h-3.5" />}>
          <RoscaDespesas dados={data.maioresDespesas} />
        </Cartao>

        {/* Saldos das contas */}
        {data.saldosBancos.length > 0 && (
          <Cartao
            titulo="Saldo das contas"
            icone={<Landmark className="w-3.5 h-3.5" />}
            acao={
              <button
                onClick={() => onNavigate('extrato')}
                className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                extrato
              </button>
            }
          >
            <ul className="space-y-1.5">
              {data.saldosBancos.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-stone-600 dark:text-stone-300">{b.apelido || b.descricao}</span>
                  <span
                    className={`font-mono font-semibold shrink-0 ${
                      b.saldo >= 0 ? 'text-stone-800 dark:text-stone-100' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatValor(b.saldo)}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>
        )}

        {/* Consumo dos limites */}
        {data.limites.length > 0 && (
          <Cartao
            titulo="Limites do mês"
            icone={<StepForward className="w-3.5 h-3.5" />}
            className="lg:col-span-2"
            acao={
              <button
                onClick={() => onNavigate('limites')}
                className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                ver limites
              </button>
            }
          >
            <ul className="space-y-2.5">
              {data.limites.map((l) => {
                const percentual = l.limite > 0 ? Math.round((l.usado / l.limite) * 100) : 0;
                const cor = percentual > 100 ? 'bg-rose-500' : percentual > 80 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <li key={l.id}>
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className="truncate text-stone-600 dark:text-stone-300">
                        {l.descricao}
                        {l.cartao && <span className="ml-1.5 text-[10px] text-stone-400">cartão</span>}
                      </span>
                      <span className="font-mono text-stone-500 dark:text-stone-400 shrink-0">
                        {formatValor(l.usado)} / {formatValor(l.limite)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div className={`h-full ${cor}`} style={{ width: `${Math.min(100, percentual)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        )}
      </div>
    </div>
  );
};
