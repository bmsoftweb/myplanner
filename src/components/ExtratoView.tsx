import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertCircle, Inbox, CalendarDays, Upload, Save, X, FileDown, Printer,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  lerExtrato, lerCombosLancamentos, lerArquivoOfx, gravarImportacaoOfx, CombosLancamentos,
} from '../services/api';
import {
  formatValor, formatDateBR, hoje, primeiroDiaDoMes, ultimoDiaDoMes,
  inicioDaSemana, fimDaSemana, primeiroDiaDoAno, ultimoDiaDoAno,
} from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import {
  useGradeLista,
  ColunaGrade,
  ThIndicador,
  TdIndicador,
  ThSobra,
  TdSobra,
  AlcaRedimensionar,
} from './GradeLista';
import { DateField } from './DateField';
import { Toggle } from './Toggle';

interface ExtratoViewProps {
  refreshToken: number;
  onToast: (msg: string) => void;
}

/** Uma coluna do extrato: o que desenha e por que valor ordena */
interface ColunaExtrato extends ColunaGrade {
  align?: 'left' | 'center' | 'right';
  render: (l: any) => React.ReactNode;
  valor: (l: any) => string | number;
}

interface ItemOfx {
  fitid: string;
  data: string;
  valor: number;
  memo: string;
  chknum: string;
  ja_importado: boolean;
  importar: boolean;
  id_categoria: number;
  id_cc: number;
  id_limite: number;
  tipo_doc: string;
  complemento_historico: string;
}

/** Extrato bancário com saldo acumulado e importação de arquivos OFX */
export const ExtratoView: React.FC<ExtratoViewProps> = ({ refreshToken, onToast }) => {
  const [combos, setCombos] = useState<CombosLancamentos | null>(null);
  const [idBanco, setIdBanco] = useState('');
  const [d1, setD1] = useState(() => primeiroDiaDoMes());
  const [d2, setD2] = useState(() => ultimoDiaDoMes());
  const [extrato, setExtrato] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Importação OFX
  const [ofx, setOfx] = useState<ItemOfx[] | null>(null);
  const [gravandoOfx, setGravandoOfx] = useState(false);

  // ----------------------------------------------------------
  // Colunas do extrato, na mesma mecânica das outras listas.
  // O extrato é só leitura, então não há coluna de Ações.
  // ----------------------------------------------------------
  const COLUNAS: ColunaExtrato[] = useMemo(
    () => [
      {
        name: 'data', label: 'Data', width: 'sm', align: 'center',
        valor: (l) => l.data || '',
        render: (l) => formatDateBR(l.data),
      },
      {
        name: 'documento', label: 'Documento', width: 'sm', align: 'left',
        valor: (l) => l.documento || '',
        render: (l) => l.documento,
      },
      {
        name: 'categoria', label: 'Categoria', width: 'md', align: 'left',
        valor: (l) => l.categoria || '',
        render: (l) => l.categoria,
      },
      {
        name: 'historico', label: 'Histórico', width: 'lg', align: 'left',
        valor: (l) => l.historico || '',
        render: (l) => l.historico,
      },
      {
        name: 'centro_custo', label: 'Centro de Custo', width: 'md', align: 'left',
        valor: (l) => l.centro_custo || '',
        render: (l) => l.centro_custo,
      },
      {
        name: 'limite', label: 'Limite', width: 'md', align: 'left',
        valor: (l) => l.limite || '',
        render: (l) => l.limite,
      },
      {
        name: 'tipo', label: 'Tipo', width: 'sm', align: 'left',
        valor: (l) => l.tipo || '',
        render: (l) => l.tipo,
      },
      {
        name: 'es', label: '.', width: 'xs', align: 'center',
        valor: (l) => l.es || '',
        render: (l) => (
          <span className={`font-bold ${l.es === '+' ? 'text-emerald-600' : 'text-rose-600'}`}>{l.es}</span>
        ),
      },
      {
        name: 'valor', label: 'Valor', width: 'sm', align: 'right',
        valor: (l) => Number(l.valor || 0),
        render: (l) => formatValor(l.valor),
      },
      {
        name: 'saldo', label: 'Saldo', width: 'sm', align: 'right',
        valor: (l) => Number(l.saldo || 0),
        render: (l) => (
          <span className={`font-semibold ${l.saldo >= 0 ? 'text-stone-800 dark:text-stone-100' : 'text-rose-600'}`}>
            {formatValor(l.saldo)}
          </span>
        ),
      },
    ],
    [],
  );

  const g = useGradeLista<ColunaExtrato>({
    recurso: 'extrato',
    colunas: COLUNAS,
    onToast,
    recalcularCom: extrato,
  });

  /** Linha destacada pelo clique, só para acompanhar a leitura do extrato */
  const [selecionada, setSelecionada] = useState<string | null>(null);

  // Ordenação no cliente: o extrato do período vem inteiro do servidor
  const [ordenacao, setOrdenacao] = useState<{ campo: string; dir: 'asc' | 'desc' } | null>(null);

  const ordenarPor = (nome: string) =>
    setOrdenacao((atual) =>
      atual?.campo === nome
        ? { campo: nome, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
        : { campo: nome, dir: 'asc' },
    );

  const linhasOrdenadas = useMemo(() => {
    const linhas: any[] = extrato?.data || [];
    if (!ordenacao) return linhas;
    const coluna = COLUNAS.find((c) => c.name === ordenacao.campo);
    if (!coluna) return linhas;
    const sinal = ordenacao.dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = coluna.valor(a);
      const vb = coluna.valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), 'pt-BR') * sinal;
    });
  }, [extrato, ordenacao, COLUNAS]);

  /** Números à direita, datas e marcas centralizadas, o resto à esquerda */
  const alinhamento = (c: ColunaExtrato) =>
    c.align === 'right' ? 'text-right font-mono' : c.align === 'center' ? 'text-center' : 'text-left';

  useEffect(() => {
    lerCombosLancamentos()
      .then((c) => {
        setCombos(c);
        if (!idBanco && c.bancos.length) setIdBanco(String(c.bancos[0].Id));
      })
      .catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const carregar = useCallback(async () => {
    if (!idBanco) return;
    setCarregando(true);
    setErro(null);
    try {
      setExtrato(await lerExtrato(idBanco, d1, d2));
    } catch (e: any) {
      setErro(e.message || 'Falha ao montar o extrato.');
      setExtrato(null);
    } finally {
      setCarregando(false);
    }
  }, [idBanco, d1, d2]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const escolherArquivo = async (arquivo: File) => {
    setErro(null);
    try {
      const texto = await arquivo.text();
      const r = await lerArquivoOfx(idBanco, texto);
      setOfx(r.data as ItemOfx[]);
    } catch (e: any) {
      onToast(e.message || 'Falha ao ler o arquivo OFX.');
    }
  };

  const gravarOfx = async () => {
    if (!ofx) return;
    setGravandoOfx(true);
    try {
      const r = await gravarImportacaoOfx(idBanco, ofx);
      onToast(r.message);
      setOfx(null);
      carregar();
    } catch (e: any) {
      onToast(e.message || 'Falha ao gravar a importação.');
    } finally {
      setGravandoOfx(false);
    }
  };

  const alterarItem = (indice: number, mudanca: Partial<ItemOfx>) =>
    setOfx((atual) => atual!.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)));

  const botaoPeriodo = (rotulo: string, aoClicar: () => void) => (
    <button
      type="button"
      onClick={aoClicar}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
    >
      <CalendarDays className="w-3.5 h-3.5" />
      {rotulo}
    </button>
  );

  // ----------------------------------------------------------
  // Tela de importação do OFX
  // ----------------------------------------------------------
  if (ofx) {
    const pendentes = ofx.filter((i) => i.importar && !i.ja_importado);
    const semCategoria = pendentes.filter((i) => !i.id_categoria).length;

    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">Importar OFX</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {pendentes.length} lançamento(s) a importar
              {semCategoria > 0 && ` • ${semCategoria} ainda sem categoria`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOfx(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              type="button"
              onClick={gravarOfx}
              disabled={gravandoOfx || !pendentes.length || semCategoria > 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gravandoOfx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Gravar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800/95 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {['Imp', 'Ok', 'Data', 'Valor', 'ES', 'Documento', 'Histórico', 'Complemento', 'Categoria', 'Centro de Custo', 'Limite', 'Tipo'].map(
                  (t) => (
                    <th key={t} className="text-center font-semibold py-2 px-2 border-b border-r border-stone-200 dark:border-stone-700 whitespace-nowrap">
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ofx.map((item, i) => (
                <tr
                  key={`${item.fitid}-${i}`}
                  className={item.ja_importado ? 'bg-stone-50 dark:bg-stone-800/40 opacity-60' : 'bg-white dark:bg-stone-900'}
                >
                  <td className="text-center py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800">
                    <Toggle
                      id={`ofx-imp-${i}`}
                      checked={item.importar}
                      onChange={(v) => alterarItem(i, { importar: v })}
                      disabled={item.ja_importado}
                      size="sm"
                      label=" "
                    />
                  </td>
                  <td className="text-center py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800 text-stone-400">
                    {item.ja_importado ? '✓' : ''}
                  </td>
                  <td className="text-center py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800 whitespace-nowrap">
                    {formatDateBR(item.data)}
                  </td>
                  <td className="text-right py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800 font-mono">
                    {formatValor(Math.abs(item.valor))}
                  </td>
                  <td
                    className={`text-center py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800 font-bold ${
                      item.valor >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {item.valor >= 0 ? '+' : '-'}
                  </td>
                  <td className="py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800">{item.chknum}</td>
                  <td className="py-1.5 px-2 border-b border-r border-stone-100 dark:border-stone-800 max-w-[220px] truncate" title={item.memo}>
                    {item.memo}
                  </td>
                  <td className="py-1.5 px-1 border-b border-r border-stone-100 dark:border-stone-800">
                    <input
                      type="text"
                      value={item.complemento_historico}
                      onChange={(e) => alterarItem(i, { complemento_historico: e.target.value })}
                      disabled={item.ja_importado}
                      className={`${INPUT_CLASS} w-36 !py-1`}
                    />
                  </td>
                  <td className="py-1.5 px-1 border-b border-r border-stone-100 dark:border-stone-800">
                    <select
                      value={item.id_categoria || ''}
                      onChange={(e) => alterarItem(i, { id_categoria: Number(e.target.value) })}
                      disabled={item.ja_importado}
                      className={`${INPUT_CLASS} w-40 !py-1 cursor-pointer`}
                    >
                      <option value="">—</option>
                      {(combos?.subcategorias || []).map((s) => (
                        <option key={s.Id} value={s.Id}>
                          {s.descricao}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 border-b border-r border-stone-100 dark:border-stone-800">
                    <select
                      value={item.id_cc || ''}
                      onChange={(e) => alterarItem(i, { id_cc: Number(e.target.value) })}
                      disabled={item.ja_importado}
                      className={`${INPUT_CLASS} w-36 !py-1 cursor-pointer`}
                    >
                      <option value="">—</option>
                      {(combos?.centros || []).map((c) => (
                        <option key={c.Id} value={c.Id}>
                          {c.descricao}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 border-b border-r border-stone-100 dark:border-stone-800">
                    <select
                      value={item.id_limite || ''}
                      onChange={(e) => alterarItem(i, { id_limite: Number(e.target.value) })}
                      disabled={item.ja_importado}
                      className={`${INPUT_CLASS} w-32 !py-1 cursor-pointer`}
                    >
                      <option value="">—</option>
                      {(combos?.limites || []).map((l) => (
                        <option key={l.Id} value={l.Id}>
                          {l.descricao}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 border-b border-stone-100 dark:border-stone-800">
                    <select
                      value={item.tipo_doc}
                      onChange={(e) => alterarItem(i, { tipo_doc: e.target.value })}
                      disabled={item.ja_importado}
                      className={`${INPUT_CLASS} w-28 !py-1 cursor-pointer`}
                    >
                      {(combos?.tiposDoc || []).map((t) => (
                        <option key={t.tipo} value={t.tipo}>
                          {t.descricao}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Extrato
  // ----------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="extrato-banco" className={`${LABEL_CLASS} sr-only`}>
            Banco
          </label>
          <select
            id="extrato-banco"
            value={idBanco}
            onChange={(e) => setIdBanco(e.target.value)}
            className={`${INPUT_CLASS} cursor-pointer min-w-44`}
          >
            <option value="">Escolha a conta</option>
            {(combos?.bancos || []).map((b) => (
              <option key={b.Id} value={b.Id}>
                {b.descricao}
                {b.apelido ? ` (${b.apelido})` : ''}
              </option>
            ))}
          </select>
        </div>

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        <DateField value={d1} onChange={setD1} className={INPUT_CLASS} placeholder="Data início" />
        <span className="text-xs text-stone-400">até</span>
        <DateField value={d2} onChange={setD2} className={INPUT_CLASS} placeholder="Data final" />

        {botaoPeriodo('Hoje', () => {
          setD1(hoje());
          setD2(hoje());
        })}
        {botaoPeriodo('Semana', () => {
          setD1(inicioDaSemana());
          setD2(fimDaSemana());
        })}
        {botaoPeriodo('Mês', () => {
          setD1(primeiroDiaDoMes());
          setD2(ultimoDiaDoMes());
        })}
        {botaoPeriodo('Ano', () => {
          const a = new Date().getFullYear();
          setD1(primeiroDiaDoAno(a));
          setD2(ultimoDiaDoAno(a));
        })}
        {botaoPeriodo('Tudo', () => {
          setD1('1980-01-01');
          setD2('2099-12-31');
        })}

        <div className="ml-auto flex items-center gap-2">
          <label
            title={idBanco ? 'Importar arquivo OFX do banco' : 'Escolha a conta antes de importar'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              idBanco
                ? 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer'
                : 'border-stone-200 dark:border-stone-800 text-stone-300 dark:text-stone-600 cursor-not-allowed'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Importar OFX
            <input
              type="file"
              accept=".ofx,.ofc,.qfx,text/plain"
              className="hidden"
              disabled={!idBanco}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = '';
                if (arquivo) escolherArquivo(arquivo);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!extrato?.data.length}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>

          <button
            type="button"
            onClick={() => {
              if (!extrato?.data.length) return;
              const cabecalho = ['Data', 'Documento', 'Categoria', 'Histórico', 'Centro de Custo', 'Limite', 'ES', 'Valor', 'Saldo'];
              const linhas = extrato.data.map((l: any) =>
                [
                  formatDateBR(l.data), l.documento, l.categoria, l.historico,
                  l.centro_custo, l.limite, l.es,
                  Number(l.valor).toFixed(2).replace('.', ','),
                  Number(l.saldo).toFixed(2).replace('.', ','),
                ]
                  .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                  .join(';'),
              );
              const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n');
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `extrato_${extrato.banco.apelido || extrato.banco.descricao}_${d1}_${d2}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={!extrato?.data.length}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {erro ? (
          <div className="m-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        ) : carregando ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Montando o extrato…</span>
          </div>
        ) : !idBanco ? (
          <p className="py-20 text-center text-xs text-stone-400">Escolha uma conta para ver o extrato.</p>
        ) : !extrato?.data.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Inbox className="w-7 h-7" />
            <span className="text-xs">Nenhum movimento no período escolhido.</span>
          </div>
        ) : (
          <table ref={g.tabelaRef} className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-50 dark:bg-stone-950/90 backdrop-blur-xs text-[10px] uppercase tracking-wider">
                <ThIndicador grade={g} />

                {g.colunas.map((c) => {
                  const ordenada = ordenacao?.campo === c.name;
                  return (
                    <th
                      key={c.name}
                      data-coluna={c.name}
                      {...g.propsArraste(c.name)}
                      onClick={() => ordenarPor(c.name)}
                      style={g.estiloColuna(c).style}
                      className={`relative px-2 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap cursor-pointer select-none hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors border-b border-r border-stone-200 dark:border-stone-800 ${
                        g.grade === 'ambas' || g.grade === 'verticais' ? '' : 'border-r-transparent'
                      } ${g.estiloColuna(c).className}`}
                      title={`Ordenar por ${c.label}`}
                    >
                      <AlcaRedimensionar grade={g} coluna={c} />
                      <span className="inline-flex items-center gap-1 justify-center">
                        {c.label}
                        {ordenada &&
                          (ordenacao!.dir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          ))}
                      </span>
                    </th>
                  );
                })}

                {g.comSobra && <ThSobra />}
              </tr>
            </thead>

            <tbody>
              {linhasOrdenadas.map((l: any, i: number) => {
                const chave = `${l.id_lanc}-${i}`;
                const ativa = selecionada === chave;
                return (
                  <tr
                    key={chave}
                    onClick={() => setSelecionada(ativa ? null : chave)}
                    className={`group cursor-pointer transition-colors ${
                      ativa
                        ? 'bg-blue-100 dark:bg-blue-950'
                        : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <TdIndicador grade={g} ativa={ativa} />

                    {g.colunas.map((c) => (
                      <td
                        key={c.name}
                        data-coluna={c.name}
                        style={g.estiloColuna(c, true).style}
                        className={`px-2 py-[7.5px] text-stone-700 dark:text-stone-300 align-middle max-w-xs truncate ${g.bordasCelula} ${alinhamento(c)}`}
                      >
                        {c.render(l)}
                      </td>
                    ))}

                    {g.comSobra && <TdSobra grade={g} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {extrato && (
        <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center justify-end gap-6 text-xs bg-stone-50 dark:bg-stone-900">
          <span className="text-stone-500 dark:text-stone-400">
            Saldo anterior: <strong className="font-mono">{formatValor(extrato.saldoAnterior)}</strong>
          </span>
          <span className="text-stone-500 dark:text-stone-400">
            Saldo final:{' '}
            <strong className={`font-mono ${extrato.saldoFinal >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-600'}`}>
              {formatValor(extrato.saldoFinal)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
};
