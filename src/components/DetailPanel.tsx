import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Inbox, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { DetailDef, OpcaoRef, RegistroCrud, ResourceDef } from '../types';
import { formatCurrencyBRL } from '../utils/formatters';
import { listRecords, fetchOptions } from '../services/api';
import { CellValue } from './CellValue';

interface DetailPanelProps {
  /** Recurso pai (ex.: pedidos) */
  parent: ResourceDef;
  /** Registro selecionado na grade principal */
  parentRow: RegistroCrud;
  /** Grades filhas declaradas no metadado do pai */
  details: DetailDef[];
  /** Definições completas dos recursos, para resolver o filho pelo nome */
  allResources: ResourceDef[];
  /** Rótulo curto do registro pai, exibido no cabeçalho do painel */
  parentLabel: string;
  refreshToken: number;
  onClose: () => void;
  /** Navega para a tela própria do recurso filho */
  onOpenResource: (resourceName: string) => void;
}

const DETAIL_LIMIT = 200;

export const DetailPanel: React.FC<DetailPanelProps> = ({
  parent,
  parentRow,
  details,
  allResources,
  parentLabel,
  refreshToken,
  onClose,
  onOpenResource,
}) => {
  const [activeDetail, setActiveDetail] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [rows, setRows] = useState<RegistroCrud[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refOptions, setRefOptions] = useState<Record<string, OpcaoRef[]>>({});

  const detail = details[Math.min(activeDetail, details.length - 1)];
  const childResource = useMemo(
    () => allResources.find((r) => r.name === detail?.resource) || null,
    [allResources, detail?.resource],
  );

  // A PK do pai usada no filtro (mestre-detalhe só se aplica a PK simples)
  const parentId = parent.pk.length === 1 ? String(parentRow[parent.pk[0]] ?? '') : '';

  /** Colunas do filho, omitindo a própria chave estrangeira (redundante aqui) */
  const listedFields = useMemo(
    () =>
      (childResource?.fields || []).filter((f) => f.listed && f.name !== detail?.foreignKey),
    [childResource, detail?.foreignKey],
  );

  // Volta para a primeira aba ao trocar de registro pai
  useEffect(() => {
    setActiveDetail(0);
  }, [parentId]);

  // Combos de chave estrangeira do recurso filho
  useEffect(() => {
    let alive = true;
    const refFields = (childResource?.fields || []).filter((f) => f.ref);
    if (!refFields.length) {
      setRefOptions({});
      return;
    }

    (async () => {
      const map: Record<string, OpcaoRef[]> = {};
      for (const f of refFields) {
        try {
          map[f.name] = await fetchOptions(f.ref!.resource, f.ref!.labelField);
        } catch {
          map[f.name] = [];
        }
      }
      if (alive) setRefOptions(map);
    })();

    return () => {
      alive = false;
    };
  }, [childResource]);

  const load = useCallback(async () => {
    if (!childResource || !detail || !parentId) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await listRecords(childResource.name, {
        limit: DETAIL_LIMIT,
        filterField: detail.foreignKey,
        filterValue: parentId,
        sort: childResource.pk[0],
        dir: 'asc',
      });
      setRows(data.data);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar os itens.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [childResource, detail, parentId]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const total = useMemo(() => {
    if (!detail?.totalField) return null;
    return rows.reduce((acc, r) => acc + (Number(r[detail.totalField!]) || 0), 0);
  }, [rows, detail?.totalField]);

  if (!childResource || !detail) return null;

  return (
    <div
      className={`shrink-0 border-t-2 border-blue-500/60 dark:border-blue-600/60 bg-white dark:bg-stone-900 flex flex-col ${
        isCollapsed ? '' : 'h-[38%] min-h-[200px]'
      }`}
    >
      {/* Cabeçalho do painel: abas das grades filhas + identificação do pai */}
      <div className="flex items-center justify-between gap-3 px-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/60 shrink-0">
        <div className="flex items-stretch min-w-0 overflow-x-auto overflow-y-hidden">
          {details.map((d, i) => {
            const ativa = i === Math.min(activeDetail, details.length - 1);
            return (
              <button
                key={d.resource}
                onClick={() => {
                  setActiveDetail(i);
                  setIsCollapsed(false);
                }}
                className={`px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                  ativa
                    ? 'text-blue-700 dark:text-blue-400 border-blue-600'
                    : 'text-stone-500 dark:text-stone-400 border-transparent hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {d.label}
                {ativa && !isLoading && (
                  <span className="ml-1.5 text-[10px] font-mono text-stone-400">{rows.length}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-[11px] text-stone-500 dark:text-stone-400 truncate max-w-[280px]">
            {parent.labelSingular} <strong className="text-stone-700 dark:text-stone-200">{parentLabel}</strong>
          </span>

          <button
            onClick={() => onOpenResource(childResource.name)}
            title={`Abrir a tela de ${childResource.label}`}
            className="p-1.5 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsCollapsed((c) => !c)}
            title={isCollapsed ? 'Expandir painel' : 'Recolher painel'}
            className="p-1.5 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            title="Fechar painel de detalhe"
            className="p-1.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div className="flex-1 overflow-auto min-h-0">
            {error && (
              <div className="m-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-stone-500 dark:text-stone-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Carregando {detail.label.toLowerCase()}…</span>
              </div>
            ) : rows.length === 0 && !error ? (
              <div className="flex flex-col items-center gap-2 py-10 text-stone-400">
                <Inbox className="w-6 h-6" />
                <span className="text-xs text-stone-600 dark:text-stone-300">
                  Este {parent.labelSingular.toLowerCase()} não possui {detail.label.toLowerCase()}.
                </span>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-stone-50 dark:bg-stone-950/90">
                    {listedFields.map((f) => (
                      <th
                        key={f.name}
                        className="px-3 py-2 text-left font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap border-b border-stone-200 dark:border-stone-800"
                      >
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={childResource.pk.map((c) => row[c]).join('~')}
                      className="border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
                    >
                      {listedFields.map((f) => (
                        <td
                          key={f.name}
                          className="px-3 py-2 text-stone-700 dark:text-stone-300 align-middle max-w-xs truncate"
                        >
                          <CellValue field={f} row={row} refOptions={refOptions} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Totalizador */}
          {!isLoading && rows.length > 0 && (
            <div className="px-3 py-2 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                {rows.length} registro(s)
                {rows.length === DETAIL_LIMIT && ' (limite exibido)'}
              </span>
              {total !== null && (
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                  Total:{' '}
                  <span className="font-mono text-blue-700 dark:text-blue-400">
                    {formatCurrencyBRL(total)}
                  </span>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
