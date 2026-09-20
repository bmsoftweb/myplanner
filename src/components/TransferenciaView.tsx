import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Save, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { lerCombosLancamentos, gravarTransferencia, CombosLancamentos } from '../services/api';
import { hoje } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';
import { NumberField } from './NumberField';

interface TransferenciaViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
}

/**
 * Transferência entre contas: grava dois lançamentos realizados — a saída na
 * conta de débito (categoria de despesa) e a entrada na conta de crédito
 * (categoria de receita) — com a mesma data, valor e histórico.
 */
export const TransferenciaView: React.FC<TransferenciaViewProps> = ({ refreshToken, onToast }) => {
  const [combos, setCombos] = useState<CombosLancamentos | null>(null);
  const [form, setForm] = useState({
    id_banco_debito: '',
    id_categoria_debito: '',
    id_banco_credito: '',
    id_categoria_credito: '',
    id_meta: '',
    valor: '',
    data: hoje(),
    historico: 'Transferência entre contas',
  });
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    lerCombosLancamentos().then(setCombos).catch((e) => setErro(e.message));
  }, [refreshToken]);

  const campo = (chave: keyof typeof form, valor: string) => {
    setForm((f) => ({ ...f, [chave]: valor }));
    setErro(null);
    setSucesso(null);
  };

  /** Só categorias de despesa saem da conta; só de receita entram na outra */
  const subcategoriasPorTipo = (tipo: 'R' | 'D') => {
    if (!combos) return [];
    const categoriasDoTipo = new Set(combos.categorias.filter((c) => c.tipo === tipo).map((c) => c.Id));
    return combos.subcategorias.filter((s) => categoriasDoTipo.has(s.id_cat));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await gravarTransferencia(form);
      setSucesso(r.message);
      onToast(r.message);
      setForm((f) => ({ ...f, valor: '' }));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGravando(false);
    }
  };

  const select = (
    id: string,
    valor: string,
    aoMudar: (v: string) => void,
    itens: { value: string; label: string }[],
    obrigatorio = true,
  ) => (
    <select
      id={id}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      required={obrigatorio}
      className={`${INPUT_CLASS} w-full cursor-pointer`}
    >
      <option value="">—</option>
      {itens.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  );

  const opcoesBancos = (combos?.bancos || []).map((b) => ({
    value: String(b.Id),
    label: `${b.descricao}${b.apelido ? ` (${b.apelido})` : ''}`,
  }));

  return (
    <form onSubmit={enviar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <ArrowLeftRight className="w-4 h-4 text-blue-600" />
          Transferência entre contas
        </h3>
        <button
          type="submit"
          disabled={gravando}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50"
        >
          {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Gravar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-5 py-5 space-y-5">
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

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-3">Sai de</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-banco-deb" className={LABEL_CLASS}>Banco / Conta Débito</label>
                {select('tr-banco-deb', form.id_banco_debito, (v) => campo('id_banco_debito', v), opcoesBancos)}
              </div>
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-cat-deb" className={LABEL_CLASS}>Categoria (despesa)</label>
                {select(
                  'tr-cat-deb',
                  form.id_categoria_debito,
                  (v) => campo('id_categoria_debito', v),
                  subcategoriasPorTipo('D').map((s) => ({ value: String(s.Id), label: s.descricao })),
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-3">Entra em</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-banco-cre" className={LABEL_CLASS}>Banco / Conta Crédito</label>
                {select('tr-banco-cre', form.id_banco_credito, (v) => campo('id_banco_credito', v), opcoesBancos)}
              </div>
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-cat-cre" className={LABEL_CLASS}>Categoria (receita)</label>
                {select(
                  'tr-cat-cre',
                  form.id_categoria_credito,
                  (v) => campo('id_categoria_credito', v),
                  subcategoriasPorTipo('R').map((s) => ({ value: String(s.Id), label: s.descricao })),
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Dados da transferência</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-valor" className={LABEL_CLASS}>Valor a Transferir</label>
                <NumberField
                  id="tr-valor"
                  value={form.valor}
                  onChange={(v) => campo('valor', v)}
                  scale={2}
                  required
                  className={INPUT_CLASS}
                />
              </div>
              <div className={FIELD_CLASS}>
                <label htmlFor="tr-data" className={LABEL_CLASS}>Data da Transferência</label>
                <DateField id="tr-data" value={form.data} onChange={(v) => campo('data', v)} required className={INPUT_CLASS} />
              </div>
              {combos?.config.usar_metas && (
                <div className={FIELD_CLASS}>
                  <label htmlFor="tr-meta" className={LABEL_CLASS}>Meta</label>
                  {select(
                    'tr-meta',
                    form.id_meta,
                    (v) => campo('id_meta', v),
                    (combos?.metas || []).map((m) => ({ value: String(m.Id), label: m.descricao })),
                    false,
                  )}
                </div>
              )}
              <div className={`${FIELD_CLASS} sm:col-span-2 lg:col-span-3`}>
                <label htmlFor="tr-hist" className={LABEL_CLASS}>Histórico</label>
                <input
                  id="tr-hist"
                  type="text"
                  value={form.historico}
                  onChange={(e) => campo('historico', e.target.value)}
                  maxLength={40}
                  className={INPUT_CLASS}
                />
                <p className={HINT_CLASS}>
                  Os dois lançamentos nascem fora da análise, para não entrar no planejamento como receita ou despesa.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
};
