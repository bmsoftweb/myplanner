import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, BadgeCheck, CreditCard } from 'lucide-react';
import { lerPlanos, gravarPlano } from '../services/api';
import { formatCurrencyBRL, mascaraCpfCnpj } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';

interface PlanosViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
  /** Avisa o resto da aplicação que o plano mudou */
  onPlanoAlterado: (idPlano: number) => void;
}

/** Escolha do plano: grátis, 300 lançamentos/mês ou ilimitado */
export const PlanosView: React.FC<PlanosViewProps> = ({ refreshToken, onToast, onPlanoAlterado }) => {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof lerPlanos>> | null>(null);
  const [escolhido, setEscolhido] = useState(1);
  const [cpfcnpj, setCpfcnpj] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    lerPlanos()
      .then((d) => {
        setDados(d);
        setEscolhido(d.id_plano);
        setCpfcnpj(mascaraCpfCnpj(d.cpfcnpj));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [refreshToken]);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await gravarPlano(escolhido, cpfcnpj);
      setSucesso(r.message);
      onToast(r.message);
      onPlanoAlterado(escolhido);
      setDados((d) => (d ? { ...d, id_plano: escolhido } : d));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGravando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex-1 flex justify-center items-center text-stone-400 bg-white dark:bg-stone-900">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const planoEscolhido = dados?.planos.find((p) => p.id === escolhido);
  const precisaCpfCnpj = Boolean(planoEscolhido && planoEscolhido.valor > 0);

  return (
    <form onSubmit={confirmar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <CreditCard className="w-4 h-4 text-blue-600" />
          Escolha o seu plano
        </h3>
        <button
          type="submit"
          disabled={gravando || escolhido === dados?.id_plano}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
          Quero Confirmar o Plano
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-4xl mx-auto px-5 py-5 space-y-5">
          {erro && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{erro}</span>
            </div>
          )}
          {sucesso && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{sucesso}</span>
            </div>
          )}

          {dados && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300">
              Você já fez <strong>{dados.lancamentosNoMes}</strong> lançamento(s) neste mês.
              {(() => {
                const atual = dados.planos.find((p) => p.id === dados.id_plano);
                if (!atual || atual.limite === 0) return ' Seu plano atual não tem limite mensal.';
                return ` Seu plano atual permite ${atual.limite} por mês.`;
              })()}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dados?.planos.map((p) => {
              const ativo = escolhido === p.id;
              const atual = dados.id_plano === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setEscolhido(p.id)}
                  className={`flex flex-col text-left rounded-2xl border p-5 transition-colors cursor-pointer ${
                    ativo
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-sm'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Plano
                    </span>
                    {atual && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        atual
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-black text-stone-900 dark:text-stone-100 mt-1">{p.nome}</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">{p.descricao}</div>
                  <div className="mt-4 text-lg font-bold text-blue-700 dark:text-blue-300">
                    {p.valor === 0 ? 'R$ 0,00' : formatCurrencyBRL(p.valor)}
                    <span className="text-xs font-medium text-stone-400"> / mês</span>
                  </div>
                </button>
              );
            })}
          </div>

          {precisaCpfCnpj && (
            <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4 max-w-md">
              <div className={FIELD_CLASS}>
                <label htmlFor="plano-cpfcnpj" className={LABEL_CLASS}>
                  CPF / CNPJ
                </label>
                <input
                  id="plano-cpfcnpj"
                  type="text"
                  value={cpfcnpj}
                  onChange={(e) => setCpfcnpj(mascaraCpfCnpj(e.target.value))}
                  maxLength={18}
                  required
                  className={`${INPUT_CLASS} font-mono`}
                />
                <p className={HINT_CLASS}>Necessitamos do seu CPF/CNPJ para identificar o pagamento</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </form>
  );
};
