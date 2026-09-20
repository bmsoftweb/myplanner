import React, { useState } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle, Settings } from 'lucide-react';
import { ConfigUsuario } from '../types';
import { gravarConfigUsuario } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { Toggle } from './Toggle';

interface ConfigViewProps {
  config: ConfigUsuario;
  onConfigChange: (config: ConfigUsuario) => void;
  onToast: (msg: string) => void;
}

const MODULOS: { chave: keyof ConfigUsuario; rotulo: string; dica: string }[] = [
  { chave: 'usar_previsao', rotulo: 'Mostrar previsão nos lançamentos', dica: 'Exibe os campos de valor e data previstos ao lançar' },
  { chave: 'usar_limites', rotulo: 'Usar cadastro de Limites', dica: 'Tetos de gasto e cartões de crédito' },
  { chave: 'usar_bancos', rotulo: 'Usar cadastro de Bancos', dica: 'Contas, extrato, transferências e importação de OFX' },
  { chave: 'usar_cc', rotulo: 'Usar cadastro de Centros de Custos', dica: 'Onde o dinheiro foi aplicado' },
  { chave: 'usar_metas', rotulo: 'Usar cadastro de Metas', dica: 'Objetivos de poupança, com moedas e cotações' },
  { chave: 'usar_patrimonio', rotulo: 'Usar cadastro de Patrimônio', dica: 'Bens, valor atual e depreciação' },
];

const PAGINAS = [
  { valor: '1', rotulo: 'Home (painel)' },
  { valor: '2', rotulo: 'Lançamentos' },
  { valor: '3', rotulo: 'Meu Planejamento' },
];

/** Configurações da conta: quais módulos aparecem no menu e qual é a página inicial */
export const ConfigView: React.FC<ConfigViewProps> = ({ config, onConfigChange, onToast }) => {
  const [rascunho, setRascunho] = useState<ConfigUsuario>(config);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const alterar = (chave: keyof ConfigUsuario, valor: any) => {
    setRascunho((c) => ({ ...c, [chave]: valor }));
    setSucesso(null);
    setErro(null);
  };

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    try {
      const r = await gravarConfigUsuario(rascunho);
      onConfigChange(r.config);
      setRascunho(r.config);
      setSucesso('Configuração gravada.');
      onToast('Configuração gravada.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGravando(false);
    }
  };

  return (
    <form onSubmit={gravar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <Settings className="w-4 h-4 text-blue-600" />
          Faça a configuração do sistema
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
        <div className="max-w-2xl mx-auto px-5 py-5 space-y-5">
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

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
            {MODULOS.map((m) => (
              <div key={m.chave} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-700 dark:text-stone-200">{m.rotulo}</div>
                  <div className={HINT_CLASS}>{m.dica}</div>
                </div>
                <Toggle
                  id={`config-${m.chave}`}
                  checked={Boolean(rascunho[m.chave])}
                  onChange={(v) => alterar(m.chave, v)}
                />
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
            <div className={FIELD_CLASS}>
              <label htmlFor="config-pagina" className={LABEL_CLASS}>
                Página inicial
              </label>
              <select
                id="config-pagina"
                value={rascunho.pagina_padrao}
                onChange={(e) => alterar('pagina_padrao', e.target.value)}
                className={`${INPUT_CLASS} w-full cursor-pointer`}
              >
                {PAGINAS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>É a tela que abre logo depois de você entrar no sistema</p>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
};
