import React, { useState } from 'react';
import { AlertCircle, Loader2, ShieldAlert } from 'lucide-react';

interface ConfirmDialogProps {
  titulo: string;
  mensagem: React.ReactNode;
  /** Texto do botão que confirma (padrão "Confirmar") */
  rotuloConfirmar?: string;
  /** Vermelho para exclusões; azul para confirmações comuns */
  perigo?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void | Promise<void>;
}

/**
 * Diálogo de confirmação do sistema — usado em toda exclusão ou remoção,
 * inclusive nas que só acontecem na tela. Nunca usar window.confirm.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  perigo = true,
  onCancelar,
  onConfirmar,
}) => {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await onConfirmar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível concluir a operação.');
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs"
        onClick={ocupado ? undefined : onCancelar}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              perigo
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900'
                : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900'
            }`}
          >
            <ShieldAlert className={`w-5 h-5 ${perigo ? 'text-rose-600' : 'text-blue-600'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{titulo}</h3>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">{mensagem}</div>
          </div>
        </div>

        {erro && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={ocupado}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
              perigo
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{ocupado ? 'Aguarde…' : rotuloConfirmar}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
