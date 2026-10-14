import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, FileText, Image as ImageIcon, ExternalLink, Trash2, X, Loader2, AlertCircle, Inbox } from 'lucide-react';
import { Anexo, MAX_ANEXO, listarAnexos, enviarAnexo, removerAnexo } from '../services/api';
import { Lancamento } from '../types';
import { formatDateTimeBR } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';

interface AnexosDialogProps {
  lancamento: Lancamento;
  onFechar: () => void;
  onToast: (mensagem: string) => void;
  /** Quantidade de anexos depois de cada envio ou remoção, para a lista atualizar o indicador */
  onMudou: (qtd: number) => void;
}

const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Comprovantes e outros documentos de um lançamento: enviar, abrir e remover */
export const AnexosDialog: React.FC<AnexosDialogProps> = ({ lancamento, onFechar, onToast, onMudou }) => {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<Anexo | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await listarAnexos(lancamento.Id);
      setAnexos(r.data);
      onMudou(r.data.length);
    } catch (e: any) {
      setErro(e.message || 'Falha ao carregar os anexos.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamento.Id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Esc fecha (menos durante um envio ou com a confirmação aberta)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando && !removendo) onFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [enviando, removendo, onFechar]);

  const enviar = async (arquivos: File[]) => {
    setErro(null);
    let enviados = 0;
    for (const arquivo of arquivos) {
      if (arquivo.size > MAX_ANEXO) {
        setErro(`"${arquivo.name}" tem mais de 20 MB e não foi enviado.`);
        continue;
      }
      setEnviando(arquivo.name);
      try {
        await enviarAnexo(lancamento.Id, arquivo);
        enviados++;
      } catch (e: any) {
        setErro(`"${arquivo.name}" não foi enviado: ${e?.message || 'erro no envio'}`);
      }
    }
    setEnviando(null);
    if (enviados) onToast(enviados === 1 ? 'Arquivo anexado.' : `${enviados} arquivos anexados.`);
    carregar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={enviando ? undefined : onFechar} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh]"
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (!enviando) enviar(Array.from(e.dataTransfer.files));
        }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="w-10 h-10 rounded-xl border bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
            <Paperclip className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Anexos</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">
              {lancamento.categoria}
              {lancamento.historico ? ` · ${lancamento.historico}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={!!enviando}
            title="Fechar"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {erro && (
          <div className="mx-5 mb-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5">
          {carregando ? (
            <div className="py-10 flex justify-center text-stone-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : anexos.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2 text-xs text-stone-400">
              <Inbox className="w-6 h-6" />
              Nenhum arquivo anexado.
            </div>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800 border-y border-stone-100 dark:border-stone-800">
              {anexos.map((a) => {
                const Icone = a.tipo.startsWith('image/') ? ImageIcon : FileText;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Icone className="w-4 h-4 text-stone-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/anexos/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs font-semibold text-stone-800 dark:text-stone-100 hover:text-blue-600 truncate"
                        title={a.nome}
                      >
                        {a.nome}
                      </a>
                      <div className="text-[11px] text-stone-400">
                        {tamanhoLegivel(Number(a.tamanho))} · {formatDateTimeBR(a.datahora_inclusao)}
                      </div>
                    </div>
                    <a
                      href={`/api/anexos/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir o arquivo"
                      className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setRemovendo(a)}
                      title="Remover o arquivo"
                      className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Envio */}
        <div className="p-5 pt-4">
          <button
            type="button"
            onClick={() => seletor.current?.click()}
            disabled={!!enviando}
            className={`w-full flex flex-col items-center gap-1 px-4 py-4 rounded-xl border-2 border-dashed text-xs transition-colors cursor-pointer disabled:cursor-wait ${
              arrastando
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            {enviando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="truncate max-w-full">Enviando {enviando}…</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span className="font-semibold">Clique ou arraste arquivos aqui</span>
                <span className="text-[11px] text-stone-400">Imagens, PDF, Word, Excel, XML ou ZIP · até 20 MB cada</span>
              </>
            )}
          </button>
          <input
            ref={seletor}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const arquivos: File[] = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              if (arquivos.length) enviar(arquivos);
            }}
          />
        </div>
      </div>

      {removendo && (
        <ConfirmDialog
          titulo="Remover o arquivo?"
          mensagem={
            <>
              O arquivo <strong>{removendo.nome}</strong> será apagado deste lançamento.
            </>
          }
          rotuloConfirmar="Remover"
          onCancelar={() => setRemovendo(null)}
          onConfirmar={async () => {
            await removerAnexo(removendo.id);
            setRemovendo(null);
            onToast('Arquivo removido.');
            await carregar();
          }}
        />
      )}
    </div>
  );
};
