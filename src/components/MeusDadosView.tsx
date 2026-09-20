import React, { useEffect, useState } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle, UserCog } from 'lucide-react';
import { lerMeusDados, gravarMeusDados } from '../services/api';
import { mascaraCpfCnpj, formatDateBR, formatDateTimeBR } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';

interface MeusDadosViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
  /** Atualiza o nome exibido no cabeçalho e na barra lateral */
  onNomeAlterado: (nome: string) => void;
}

/** Cadastro da conta: nome, CPF/CNPJ e senha do e-mail principal */
export const MeusDadosView: React.FC<MeusDadosViewProps> = ({ refreshToken, onToast, onNomeAlterado }) => {
  const [dados, setDados] = useState<any | null>(null);
  const [nome, setNome] = useState('');
  const [cpfcnpj, setCpfcnpj] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    lerMeusDados()
      .then((d) => {
        setDados(d);
        setNome(d.nome || '');
        setCpfcnpj(mascaraCpfCnpj(d.cpfcnpj || ''));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [refreshToken]);

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await gravarMeusDados({ nome, cpfcnpj, senha: senha || undefined });
      setSucesso(r.message);
      onToast(r.message);
      onNomeAlterado(nome);
      setSenha('');
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

  return (
    <form onSubmit={gravar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <UserCog className="w-4 h-4 text-blue-600" />
          Meus Dados
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`${FIELD_CLASS} sm:col-span-2`}>
              <label htmlFor="md-nome" className={LABEL_CLASS}>Nome</label>
              <input
                id="md-nome"
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={80}
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className={FIELD_CLASS}>
              <label htmlFor="md-email" className={LABEL_CLASS}>e-Mail (login)</label>
              <input id="md-email" type="text" value={dados?.email || ''} readOnly className={`${INPUT_CLASS} opacity-70`} />
              <p className={HINT_CLASS}>O e-mail principal da conta não pode ser trocado aqui</p>
            </div>

            <div className={FIELD_CLASS}>
              <label htmlFor="md-cpfcnpj" className={LABEL_CLASS}>CPF / CNPJ</label>
              <input
                id="md-cpfcnpj"
                type="text"
                value={cpfcnpj}
                onChange={(e) => setCpfcnpj(mascaraCpfCnpj(e.target.value))}
                maxLength={18}
                className={`${INPUT_CLASS} font-mono`}
              />
              <p className={HINT_CLASS}>Usado para identificar o seu pagamento nos planos pagos</p>
            </div>

            <div className={FIELD_CLASS}>
              <label htmlFor="md-senha" className={LABEL_CLASS}>Nova senha</label>
              <input
                id="md-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                maxLength={20}
                autoComplete="new-password"
                placeholder="Deixe em branco para manter a atual"
                className={INPUT_CLASS}
              />
              <p className={HINT_CLASS}>Mínimo de 6 caracteres</p>
            </div>
          </div>

          <section className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {[
              { rotulo: 'Plano atual', valor: dados?.plano?.nome || '—' },
              { rotulo: 'Cadastro', valor: dados?.data_cadastro ? formatDateBR(dados.data_cadastro) : '—' },
              { rotulo: 'Validade', valor: dados?.data_validade ? formatDateBR(dados.data_validade) : '—' },
              {
                rotulo: 'Última atividade',
                valor: dados?.ultima_atividade ? formatDateTimeBR(dados.ultima_atividade) : '—',
              },
            ].map((item) => (
              <div key={item.rotulo}>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">{item.rotulo}</div>
                <div className="font-semibold text-stone-700 dark:text-stone-200 mt-0.5">{item.valor}</div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </form>
  );
};
