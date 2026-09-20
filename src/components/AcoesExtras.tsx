import React, { useEffect, useState } from 'react';
import { Sparkles, Mail, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { lerCategoriasPadrao, criarCategoriasPadrao, listRecords, enviarSenhaDoUsuario } from '../services/api';
import { INPUT_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';

interface AcoesExtrasProps {
  /** Recurso aberto na tela de listagem */
  recurso: string;
  onToast: (msg: string) => void;
  /** Recarrega a listagem depois de uma ação que muda os dados */
  onAtualizar: () => void;
}

/**
 * Ações do sistema original que não são "incluir / editar / excluir" e por isso
 * não cabem na barra padrão da lista:
 *  - Categorias: "Criar Padrões" (copia o plano de contas de fábrica);
 *  - Usuários: "Enviar e-mail com a senha".
 */
export const AcoesExtras: React.FC<AcoesExtrasProps> = ({ recurso, onToast, onAtualizar }) => {
  if (recurso === 'categorias') return <CriarPadroes onToast={onToast} onAtualizar={onAtualizar} />;
  if (recurso === 'usuarios') return <EnviarSenha onToast={onToast} />;
  return null;
};

// ------------------------------------------------------------
// Categorias: criar o plano de contas padrão
// ------------------------------------------------------------
const CriarPadroes: React.FC<{ onToast: (m: string) => void; onAtualizar: () => void }> = ({
  onToast,
  onAtualizar,
}) => {
  const [situacao, setSituacao] = useState<{ podeCriar: boolean; jaCadastradas: number } | null>(null);
  const [fj, setFj] = useState<'F' | 'J'>('F');
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    lerCategoriasPadrao().then(setSituacao).catch(() => setSituacao(null));
  }, []);

  // Com categorias já cadastradas a operação não é oferecida: ela não mistura
  // o padrão de fábrica com o que o usuário montou.
  if (!situacao?.podeCriar) return null;

  return (
    <>
      <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900 flex flex-wrap items-center gap-3 text-xs text-blue-900 dark:text-blue-200">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>
          Você ainda não tem categorias. Quer começar com um plano de contas pronto?
        </span>
        <select
          value={fj}
          onChange={(e) => setFj(e.target.value as 'F' | 'J')}
          className={`${INPUT_CLASS} cursor-pointer`}
          title="Tipo do plano de contas"
        >
          <option value="F">Pessoa Física</option>
          <option value="J">Pessoa Jurídica</option>
        </select>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
        >
          Criar Padrões
        </button>
      </div>

      {confirmando && (
        <ConfirmDialog
          titulo="Criar as categorias padrão?"
          mensagem={
            <>
              Serão criadas as categorias e sub-categorias de fábrica para{' '}
              <strong>{fj === 'F' ? 'pessoa física' : 'pessoa jurídica'}</strong>. Depois disso você poderá
              renomeá-las e acrescentar as suas.
            </>
          }
          rotuloConfirmar="Criar"
          perigo={false}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={async () => {
            const r = await criarCategoriasPadrao(fj);
            setConfirmando(false);
            setSituacao({ podeCriar: false, jaCadastradas: 1 });
            onToast(r.message);
            onAtualizar();
          }}
        />
      )}
    </>
  );
};

// ------------------------------------------------------------
// Usuários: enviar a senha por e-mail
// ------------------------------------------------------------
const EnviarSenha: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [usuarios, setUsuarios] = useState<{ Id: string; nome: string; email: string }[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    listRecords('usuarios', { limit: 200, sort: 'nome', dir: 'asc' })
      .then((r) => setUsuarios(r.data.map((u) => ({ Id: String(u.Id), nome: u.nome, email: u.email }))))
      .catch(() => setUsuarios([]));
  }, []);

  if (!usuarios.length) return null;

  const enviar = async () => {
    if (!escolhido) return;
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const r = await enviarSenhaDoUsuario(escolhido);
      setSucesso(r.message);
      onToast(r.message);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
      <Mail className="w-4 h-4 shrink-0 text-blue-600" />
      <span>Enviar e-mail com a senha para:</span>
      <select
        value={escolhido}
        onChange={(e) => {
          setEscolhido(e.target.value);
          setErro(null);
          setSucesso(null);
        }}
        className={`${INPUT_CLASS} cursor-pointer min-w-52`}
      >
        <option value="">Escolha o usuário</option>
        {usuarios.map((u) => (
          <option key={u.Id} value={u.Id}>
            {u.nome} — {u.email}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={enviar}
        disabled={!escolhido || enviando}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Enviar
      </button>

      {erro && (
        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5" />
          {erro}
        </span>
      )}
      {sucesso && (
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />
          {sucesso}
        </span>
      )}
    </div>
  );
};
