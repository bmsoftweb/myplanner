import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Inbox, Play, ArrowLeft, FileDown, FileSearch } from 'lucide-react';
import { listarConsultas, executarConsulta, ConsultaCadastrada } from '../services/api';
import { formatDateBR, formatValor, hoje } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';
import { NumberField } from './NumberField';

interface ConsultasViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
}

/**
 * Consultas cadastradas: escolha a consulta, preencha os parâmetros e veja o
 * resultado. O servidor só aceita comandos de leitura e liga a consulta à conta
 * da sessão pelo parâmetro :ID_EMP.
 */
export const ConsultasView: React.FC<ConsultasViewProps> = ({ refreshToken, onToast }) => {
  const [consultas, setConsultas] = useState<ConsultaCadastrada[]>([]);
  const [escolhida, setEscolhida] = useState<ConsultaCadastrada | null>(null);
  const [parametros, setParametros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ titulo: string; colunas: string[]; data: any[]; total: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    listarConsultas()
      .then((r) => setConsultas(r.data))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [refreshToken]);

  /** As consultas agrupadas pelo campo "grupo" */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ConsultaCadastrada[]>();
    for (const c of consultas) {
      const chave = c.grupo || 'Geral';
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(c);
    }
    return Array.from(mapa.entries());
  }, [consultas]);

  const escolher = (c: ConsultaCadastrada) => {
    setEscolhida(c);
    setResultado(null);
    setErro(null);
    // Cada parâmetro começa com o valor padrão cadastrado; data em branco vira hoje
    const iniciais: Record<string, string> = {};
    for (const p of c.parametros) {
      const chave = p.id_parametro.toUpperCase();
      iniciais[chave] = p.valor_padrao || (p.tipo_parametro === 'D' ? hoje() : '');
    }
    setParametros(iniciais);
  };

  const executar = async () => {
    if (!escolhida) return;
    setExecutando(true);
    setErro(null);
    try {
      setResultado(await executarConsulta(escolhida.Id, parametros));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setExecutando(false);
    }
  };

  const exportar = () => {
    if (!resultado?.data.length) return;
    const escapar = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      resultado.colunas.map(escapar).join(';'),
      ...resultado.data.map((l) => resultado.colunas.map((c) => escapar(l[c])).join(';')),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resultado.titulo.replace(/[^\w]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Resultado exportado.');
  };

  /** Valores de data e número ganham formatação; o resto sai como texto */
  const formatarCelula = (valor: any) => {
    if (valor === null || valor === undefined) return '—';
    if (typeof valor === 'number') return formatValor(valor);
    const texto = String(valor);
    if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(texto)) return formatDateBR(texto);
    return texto;
  };

  const alinhamento = (valor: any) =>
    typeof valor === 'number' ? 'text-right font-mono' : /^\d{4}-\d{2}-\d{2}/.test(String(valor ?? '')) ? 'text-center' : 'text-left';

  // ----------------------------------------------------------
  // Resultado
  // ----------------------------------------------------------
  if (resultado) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">{resultado.titulo}</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">{resultado.total} registro(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setResultado(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <button
              type="button"
              onClick={exportar}
              disabled={!resultado.data.length}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40"
            >
              <FileDown className="w-3.5 h-3.5" /> Exportar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {!resultado.data.length ? (
            <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
              <Inbox className="w-7 h-7" />
              <span className="text-xs">A consulta não retornou registros.</span>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800/95 backdrop-blur">
                <tr className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {resultado.colunas.map((c) => (
                    <th
                      key={c}
                      className="text-center font-semibold py-2 px-2 border-b border-r border-stone-200 dark:border-stone-700 whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.data.map((linha, i) => (
                  <tr key={i} className="bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    {resultado.colunas.map((c) => (
                      <td
                        key={c}
                        className={`py-[7.5px] px-2 border-b border-r border-stone-100 dark:border-stone-800 ${alinhamento(linha[c])}`}
                      >
                        {formatarCelula(linha[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Escolha da consulta e parâmetros
  // ----------------------------------------------------------
  return (
    <div className="flex-1 flex min-h-0 bg-white dark:bg-stone-900">
      {/* Lista das consultas */}
      <div className="w-72 shrink-0 border-r border-stone-200 dark:border-stone-800 overflow-y-auto">
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Escolha uma consulta
          </h3>
        </div>

        {carregando ? (
          <div className="py-16 flex justify-center text-stone-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !consultas.length ? (
          <p className="px-4 py-10 text-xs text-stone-400 text-center">
            Nenhuma consulta cadastrada. Cadastre-as na tabela <strong>consultas</strong>.
          </p>
        ) : (
          grupos.map(([grupo, itens]) => (
            <div key={grupo} className="pt-2">
              <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{grupo}</div>
              {itens.map((c) => (
                <button
                  key={c.Id}
                  type="button"
                  onClick={() => escolher(c)}
                  className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors cursor-pointer ${
                    escolhida?.Id === c.Id
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'border-transparent text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/70'
                  }`}
                >
                  <div className="text-xs truncate">{c.titulo}</div>
                  {c.descricao && (
                    <div className="text-[10px] text-stone-400 truncate mt-0.5">{c.descricao}</div>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Parâmetros */}
      <div className="flex-1 overflow-y-auto min-h-0 p-5">
        {!escolhida ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-stone-400">
            <FileSearch className="w-8 h-8" />
            <span className="text-xs">Escolha uma consulta à esquerda.</span>
          </div>
        ) : (
          <div className="max-w-2xl">
            <h3 className="text-base font-bold text-stone-800 dark:text-stone-100">{escolhida.titulo}</h3>
            {escolhida.descricao && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{escolhida.descricao}</p>
            )}

            {erro && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{erro}</span>
              </div>
            )}

            {escolhida.parametros.length > 0 && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {escolhida.parametros.map((p) => {
                  const chave = p.id_parametro.toUpperCase();
                  const id = `param-${p.Id}`;
                  return (
                    <div key={p.Id} className={FIELD_CLASS}>
                      <label htmlFor={id} className={LABEL_CLASS}>
                        {p.caption_parametro}
                      </label>
                      {p.tipo_parametro === 'D' ? (
                        <DateField
                          id={id}
                          value={parametros[chave] || ''}
                          onChange={(v) => setParametros((atual) => ({ ...atual, [chave]: v }))}
                          className={INPUT_CLASS}
                        />
                      ) : p.tipo_parametro === 'N' ? (
                        <NumberField
                          id={id}
                          value={parametros[chave] || ''}
                          onChange={(v) => setParametros((atual) => ({ ...atual, [chave]: v }))}
                          scale={2}
                          className={INPUT_CLASS}
                        />
                      ) : (
                        <input
                          id={id}
                          type="text"
                          value={parametros[chave] || ''}
                          onChange={(e) => setParametros((atual) => ({ ...atual, [chave]: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={executar}
              disabled={executando}
              className="mt-5 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50"
            >
              {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Avançar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
