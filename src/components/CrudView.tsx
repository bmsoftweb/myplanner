import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TamanhoCampo } from '../utils/configListas';
import {
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  Inbox,
  Plus,
  ShieldAlert,
  X,
  List,
  FilePlus2,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { FiltroAvancado, OpcaoRef, RegistroCrud, ResourceDef } from '../types';
import {
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchOptions,
  invalidateOptions,
} from '../services/api';
import { RecordForm } from './RecordForm';
import { CellValue } from './CellValue';
import { DetailPanel } from './DetailPanel';
import { AdvancedSearch } from './AdvancedSearch';
import {
  useGradeLista,
  ThIndicador,
  TdIndicador,
  ThSobra,
  TdSobra,
  ThAcoes,
  TdAcoes,
  AlcaRedimensionar,
} from './GradeLista';
import { INPUT_CLASS } from '../utils/formStyles';

interface CrudViewProps {
  resource: ResourceDef;
  /** Definições de todos os recursos, usadas pelas grades de detalhe */
  allResources: ResourceDef[];
  /** Incrementado pelo Header para forçar recarga */
  refreshToken: number;
  /** Abertura da aba de inclusão disparada pelo Header */
  createToken: number;
  onToast: (msg: string) => void;
  onCountChange: (resourceName: string, total: number) => void;
  /** Navegação para outra tela, usada pelo atalho do painel de detalhe */
  onNavigate: (resourceName: string) => void;
}

/** Uma aba aberta sobre um registro (inclusão ou edição) */
interface AbaRegistro {
  /** 'novo' para inclusão, ou 'edit:<id>' para edição */
  key: string;
  /** `null` quando é uma inclusão */
  record: RegistroCrud | null;
  titulo: string;
}

const LIST_TAB = 'lista';

export const CrudView: React.FC<CrudViewProps> = ({
  resource,
  allResources,
  refreshToken,
  createToken,
  onToast,
  onCountChange,
  onNavigate,
}) => {
  // Colunas visíveis: as escolhidas pelo usuário (config_listas) ou, sem escolha, as marcadas como listed
  const [visiveis, setVisiveis] = useState<string[] | null>(null);
  const listedFields = useMemo(
    () =>
      resource.fields.filter((f) =>
        f.type === 'password' ? false : visiveis ? visiveis.includes(f.name) : f.listed,
      ),
    [resource, visiveis],
  );

  const alternarColuna = (nome: string) =>
    setVisiveis((atual) => {
      const base = atual ?? resource.fields.filter((f) => f.listed).map((f) => f.name);
      return base.includes(nome) ? base.filter((n) => n !== nome) : [...base, nome];
    });

  const refFields = useMemo(() => resource.fields.filter((f) => f.ref), [resource]);
  const isSearchable = useMemo(() => resource.fields.some((f) => f.searchable), [resource]);
  // Campos da busca avançada: os escolhidos pelo usuário (config_listas) ou, sem escolha, os filterable
  const [camposBusca, setCamposBusca] = useState<string[] | null>(null);
  const [ordemForm, setOrdemForm] = useState<string[]>([]);
  const [tamanhosForm, setTamanhosForm] = useState<Record<string, TamanhoCampo>>({});
  const camposBuscaAtuais = useMemo(
    () =>
      resource.fields
        .filter((f) => f.type !== 'password' && f.type !== 'image')
        .filter((f) => (camposBusca ? camposBusca.includes(f.name) : f.filterable))
        .map((f) => f.name),
    [resource, camposBusca],
  );
  const alternarCampoBusca = (nome: string) =>
    setCamposBusca(() =>
      camposBuscaAtuais.includes(nome)
        ? camposBuscaAtuais.filter((n) => n !== nome)
        : [...camposBuscaAtuais, nome],
    );
  const temBuscaAvancada = camposBuscaAtuais.length > 0;

  /**
   * Recursos que possuem a coluna "ativo" abrem listando somente os ativos.
   * O operador pode ver os inativos (ou todos) pela busca avançada.
   */
  const filtroPadrao = useMemo<FiltroAvancado[]>(() => {
    const temAtivo = resource.fields.some((f) => f.name === 'ativo' && f.type === 'boolean');
    return temAtivo ? [{ field: 'ativo', op: 'eq', value: '1' }] : [];
  }, [resource]);

  /** Indica que os filtros atuais são exatamente o padrão "somente ativos" */
  const ehFiltroPadrao = (lista: FiltroAvancado[]) =>
    lista.length === 1 && lista[0].field === 'ativo' && lista[0].op === 'eq' && lista[0].value === '1';

  const [rows, setRows] = useState<RegistroCrud[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState(resource.defaultSort.field);

  /** Números/moeda à direita, datas e Sim/Não centralizados, o resto à esquerda */
  const alinhamento = (tipo: string) =>
    tipo === 'number' || tipo === 'decimal'
      ? 'text-right'
      : tipo === 'date' || tipo === 'datetime' || tipo === 'boolean'
      ? 'text-center'
      : 'text-left';

  const [dir, setDir] = useState<'asc' | 'desc'>(resource.defaultSort.dir);

  /**
   * Coluna indicadora, menu de contexto, larguras, ordem e linhas de grade —
   * tudo compartilhado com a tela de Lançamentos.
   */
  const g = useGradeLista({
    recurso: resource.name,
    colunas: listedFields,
    onToast,
    // Além do que a grade guarda, esta tela guarda o que é do formulário
    configExtra: () => ({
      visiveis: listedFields.map((f) => f.name),
      busca: camposBuscaAtuais,
      ordemForm: ordemForm.length ? ordemForm : undefined,
      tamanhosForm: Object.keys(tamanhosForm).length ? tamanhosForm : undefined,
    }),
    aoCarregar: (cfg) => {
      setVisiveis(cfg.visiveis || null);
      setCamposBusca(cfg.busca || null);
      setOrdemForm(cfg.ordemForm || []);
      setTamanhosForm(cfg.tamanhosForm || {});
    },
    recalcularCom: rows,
  });
  const colunas = g.colunas;
  const salvarConfiguracao = g.salvarConfiguracao;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Busca avançada: painel aberto e filtros aplicados
  const [buscaAvancadaAberta, setBuscaAvancadaAberta] = useState(false);
  const [filtros, setFiltros] = useState<FiltroAvancado[]>(filtroPadrao);

  const [refOptions, setRefOptions] = useState<Record<string, OpcaoRef[]>>({});

  // Abas abertas e aba ativa
  const [abas, setAbas] = useState<AbaRegistro[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<string>(LIST_TAB);

  const [deleting, setDeleting] = useState<RegistroCrud | null>(null);
  const [isDeletingBusy, setIsDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Linha selecionada que alimenta o painel mestre-detalhe
  const [selecionado, setSelecionado] = useState<RegistroCrud | null>(null);

  /** O mestre-detalhe exige detalhes declarados e chave primária simples */
  const temDetalhe = Boolean(resource.details?.length) && resource.pk.length === 1;

  const recordId = useCallback(
    (row: RegistroCrud) => resource.pk.map((c) => row[c]).join('~'),
    [resource.pk],
  );

  /** Rótulo curto do registro, usado no título da aba */
  const recordLabel = useCallback(
    (row: RegistroCrud) => {
      const raw = row[resource.labelField];
      const texto = raw === null || raw === undefined || raw === '' ? `#${recordId(row)}` : String(raw);
      return texto.length > 28 ? `${texto.slice(0, 28)}…` : texto;
    },
    [resource.labelField, recordId],
  );

  // Ao trocar de recurso, reinicia a grade e fecha as abas do recurso anterior
  useEffect(() => {
    setPage(1);
    setSearch('');
    setSearchInput('');
    setSort(resource.defaultSort.field);
    setDir(resource.defaultSort.dir);
    setError(null);
    setAbas([]);
    setAbaAtiva(LIST_TAB);
    setSelecionado(null);
    setFiltros(filtroPadrao);
    setBuscaAvancadaAberta(false);
  }, [resource.name, resource.defaultSort.field, resource.defaultSort.dir, filtroPadrao]);

  // A seleção do mestre-detalhe não sobrevive a uma troca de página ou de busca
  useEffect(() => {
    setSelecionado(null);
  }, [page, search, filtros]);

  // Carrega os combos de chave estrangeira do recurso
  useEffect(() => {
    let alive = true;
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
  }, [refFields, refreshToken]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listRecords(resource.name, { page, limit, search, sort, dir, filters: filtros });
      setRows(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      onCountChange(resource.name, data.total);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar os registros.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [resource.name, page, limit, search, sort, dir, filtros, onCountChange]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  // ----------------------------------------------------------
  // Gestão das abas
  // ----------------------------------------------------------
  const abrirAbaNovo = useCallback(() => {
    setAbas((prev) =>
      prev.some((a) => a.key === 'novo')
        ? prev
        : [...prev, { key: 'novo', record: null, titulo: `Novo ${resource.labelSingular}` }],
    );
    setAbaAtiva('novo');
  }, [resource.labelSingular]);

  const abrirAbaEdicao = useCallback(
    (row: RegistroCrud) => {
      const key = `edit:${recordId(row)}`;
      setAbas((prev) => {
        const existente = prev.find((a) => a.key === key);
        // Reabre com os dados mais recentes da grade
        if (existente) return prev.map((a) => (a.key === key ? { ...a, record: row } : a));
        return [...prev, { key, record: row, titulo: recordLabel(row) }];
      });
      setAbaAtiva(key);
    },
    [recordId, recordLabel],
  );

  const fecharAba = useCallback(
    (key: string) => {
      setAbas((prev) => {
        const idx = prev.findIndex((a) => a.key === key);
        const restantes = prev.filter((a) => a.key !== key);
        // Ao fechar a aba ativa, foca a vizinha à esquerda (ou a listagem)
        setAbaAtiva((atual) => {
          if (atual !== key) return atual;
          if (!restantes.length) return LIST_TAB;
          return restantes[Math.max(0, idx - 1)].key;
        });
        return restantes;
      });
    },
    [],
  );

  // Abertura da aba de inclusão solicitada pelo Header
  useEffect(() => {
    if (createToken > 0 && resource.canCreate) abrirAbaNovo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createToken]);

  const handleSort = (fieldName: string) => {
    if (sort === fieldName) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(fieldName);
      setDir('asc');
    }
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleSave = async (aba: AbaRegistro, payload: RegistroCrud) => {
    if (aba.record) {
      await updateRecord(resource.name, recordId(aba.record), payload);
      onToast(`${resource.labelSingular} atualizado com sucesso.`);
    } else {
      await createRecord(resource.name, payload);
      onToast(`${resource.labelSingular} incluído com sucesso.`);
    }
    invalidateOptions(resource.name);
    fecharAba(aba.key);
    await load();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeletingBusy(true);
    setDeleteError(null);
    try {
      const id = recordId(deleting);
      await deleteRecord(resource.name, id);
      invalidateOptions(resource.name);
      onToast(`${resource.labelSingular} excluído com sucesso.`);
      setDeleting(null);
      // Fecha a aba do registro excluído, se estiver aberta
      fecharAba(`edit:${id}`);
      if (rows.length === 1 && page > 1) setPage((p) => p - 1);
      else await load();
    } catch (err: any) {
      setDeleteError(err.message || 'Não foi possível excluir o registro.');
    } finally {
      setIsDeletingBusy(false);
    }
  };

  const firstRecord = (page - 1) * limit + 1;
  const lastRecord = Math.min(page * limit, total);
  const abaAtual = abas.find((a) => a.key === abaAtiva) || null;

  // ----------------------------------------------------------
  // Barra de abas — só aparece quando há algum registro aberto,
  // para a listagem não exibir uma "orelha" solitária.
  // ----------------------------------------------------------
  const tabBar = (
    <div className="flex items-stretch bg-stone-100 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 overflow-x-auto overflow-y-hidden shrink-0">
      {/* Aba fixa da listagem */}
      <button
        onClick={() => setAbaAtiva(LIST_TAB)}
        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-r border-stone-200 dark:border-stone-800 border-b-2 transition-colors cursor-pointer ${
          abaAtiva === LIST_TAB
            ? 'bg-white dark:bg-stone-900 text-blue-700 dark:text-blue-400 border-b-blue-600'
            : 'border-b-transparent text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        <span>{resource.label}</span>
        <span className="text-[10px] font-mono text-stone-400">{total}</span>
      </button>

      {/* Abas de registro */}
      {abas.map((aba) => {
        const ativa = abaAtiva === aba.key;
        const isNovo = aba.record === null;
        return (
          <div
            key={aba.key}
            className={`flex items-center gap-1.5 pl-4 pr-2 border-r border-stone-200 dark:border-stone-800 border-b-2 transition-colors ${
              ativa
                ? 'bg-white dark:bg-stone-900 border-b-blue-600'
                : 'border-b-transparent hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
            }`}
          >
            <button
              onClick={() => setAbaAtiva(aba.key)}
              className={`flex items-center gap-2 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                ativa
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {isNovo ? <FilePlus2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{aba.titulo}</span>
            </button>
            <button
              onClick={() => fecharAba(aba.key)}
              title="Fechar aba"
              className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );

  // ----------------------------------------------------------
  // Painel de listagem
  // ----------------------------------------------------------
  const listPanel = (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Barra de ferramentas, encostada na barra de abas */}
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-stone-900 overflow-x-auto overflow-y-hidden">
        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate min-w-0">
          {isLoading
            ? 'Carregando registros…'
            : total === 0
            ? 'Nenhum registro encontrado'
            : `${firstRecord}–${lastRecord} de ${total} registro(s) • tabela ${resource.table}`}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {isSearchable && (
            <form onSubmit={handleSearchSubmit} className="relative w-52 sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input
                id={`busca-${resource.name}`}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar…"
                className={`${INPUT_CLASS} w-full pl-9 pr-8`}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          )}

          {temBuscaAvancada && (
            <button
              onClick={() => setBuscaAvancadaAberta((a) => !a)}
              title="Filtrar por categoria, situação, faixa de preço e outros campos"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                buscaAvancadaAberta || filtros.length > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300'
                  : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Busca avançada</span>
              {filtros.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 rounded-full">
                  {filtros.length}
                </span>
              )}
            </button>
          )}

          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            title="Registros por página"
            className={`${INPUT_CLASS} shrink-0 cursor-pointer`}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </select>

          {resource.canCreate && (
            <button
              onClick={abrirAbaNovo}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo</span>
            </button>
          )}
        </div>
      </div>

      {/* Painel de busca avançada, logo abaixo da barra de ferramentas */}
      {temBuscaAvancada && buscaAvancadaAberta && (
        <AdvancedSearch
          resource={resource}
          camposVisiveis={camposBuscaAtuais}
          refOptions={refOptions}
          aplicados={filtros}
          onAplicar={(novos) => {
            setFiltros(novos);
            setPage(1);
          }}
          onFechar={() => setBuscaAvancadaAberta(false)}
        />
      )}

      {/* Resumo dos filtros quando o painel está recolhido */}
      {temBuscaAvancada && !buscaAvancadaAberta && filtros.length > 0 && (
        <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-800 bg-blue-50/60 dark:bg-blue-950/20 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-blue-800 dark:text-blue-300 truncate">
            {ehFiltroPadrao(filtros) ? (
              <>
                Exibindo <strong>somente os registros ativos</strong> (padrão da tela)
              </>
            ) : (
              <>
                <strong>{filtros.length}</strong> filtro(s) de busca avançada aplicado(s)
              </>
            )}
          </span>
          <button
            onClick={() => setFiltros([])}
            className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
          >
            {ehFiltroPadrao(filtros) ? 'Ver todos' : 'Limpar'}
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Grade ocupando toda a altura restante */}
      <div className="flex-1 overflow-auto min-h-0">
        <table ref={g.tabelaRef} className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr className="bg-stone-50 dark:bg-stone-950/90 backdrop-blur-xs">
              <ThIndicador grade={g} />
              {colunas.map((f) => {
                const isSorted = sort === f.name;
                return (
                  <th
                    key={f.name}
                    data-coluna={f.name}
                    {...g.propsArraste(f.name)}
                    onClick={() => handleSort(f.name)}
                    style={g.estiloColuna(f).style}
                    className={`relative px-3 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap cursor-pointer select-none hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors border-b border-r border-stone-200 dark:border-stone-800 ${
                      g.grade === 'ambas' || g.grade === 'verticais' ? '' : 'border-r-transparent'
                    } ${g.estiloColuna(f).className}`}
                    title={`Ordenar por ${f.label}`}
                  >
                    <AlcaRedimensionar grade={g} coluna={f} />
                    <span className="inline-flex items-center gap-1 justify-center">
                      {f.label}
                      {isSorted &&
                        (dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        ))}
                    </span>
                  </th>
                );
              })}
              {/* Coluna de sobra: fica com o espaço livre, para que arrastar uma coluna mude mesmo a largura */}
              {g.comSobra && <ThSobra />}
              <ThAcoes />
            </tr>
          </thead>

          <tbody className={isLoading && rows.length > 0 ? 'opacity-60' : undefined}>
            {isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 3} className="px-3 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-stone-500 dark:text-stone-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Carregando registros…</span>
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 3} className="px-3 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-stone-400">
                    <Inbox className="w-8 h-8" />
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
                      {search || filtros.length > 0
                        ? 'Nenhum registro corresponde aos filtros informados'
                        : `Nenhum registro em ${resource.label}`}
                    </span>
                    {filtros.length > 0 && (
                      <button
                        onClick={() => setFiltros([])}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {ehFiltroPadrao(filtros)
                          ? 'Ver também os inativos'
                          : 'Limpar a busca avançada'}
                      </button>
                    )}
                    {resource.canCreate && !search && filtros.length === 0 && (
                      <button
                        onClick={abrirAbaNovo}
                        className="mt-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Incluir o primeiro {resource.labelSingular.toLowerCase()}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {rows.map((row) => {
                const id = recordId(row);
                const abertaEmAba = abas.some((a) => a.key === `edit:${id}`);
                const estaSelecionada = temDetalhe && selecionado !== null && recordId(selecionado) === id;
                return (
                  <tr
                    key={id}
                    onClick={temDetalhe ? () => setSelecionado(row) : undefined}
                    onDoubleClick={() => resource.canUpdate && abrirAbaEdicao(row)}
                    className={`group transition-colors ${temDetalhe ? 'cursor-pointer' : ''} ${
                      estaSelecionada
                        ? 'bg-blue-100 dark:bg-blue-950'
                        : abertaEmAba
                        ? 'bg-blue-50 dark:bg-stone-800'
                        : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <TdIndicador grade={g} ativa={estaSelecionada || abertaEmAba} />
                    {colunas.map((f) => (
                      <td
                        key={f.name}
                        data-coluna={f.name}
                        style={g.estiloColuna(f, true).style}
                        className={`px-3 py-[7.5px] text-stone-700 dark:text-stone-300 align-middle max-w-xs truncate ${g.bordasCelula} ${alinhamento(f.type)}`}
                      >
                        <CellValue field={f} row={row} refOptions={refOptions} />
                      </td>
                    ))}
                    {g.comSobra && <TdSobra grade={g} />}
                    <TdAcoes grade={g}>
                        {resource.canUpdate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirAbaEdicao(row);
                            }}
                            title="Editar em nova aba"
                            className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {resource.canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleting(row);
                              setDeleteError(null);
                            }}
                            title="Excluir registro"
                            className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </TdAcoes>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Paginação fixa ao pé */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mestre-detalhe: grades filhas do registro selecionado */}
      {temDetalhe && selecionado && (
        <DetailPanel
          key={recordId(selecionado)}
          parent={resource}
          parentRow={selecionado}
          details={resource.details!}
          allResources={allResources}
          parentLabel={recordLabel(selecionado)}
          refreshToken={refreshToken}
          onClose={() => setSelecionado(null)}
          onOpenResource={onNavigate}
        />
      )}

      {/* Dica exibida enquanto nenhuma linha foi selecionada */}
      {temDetalhe && !selecionado && rows.length > 0 && (
        <div className="px-4 py-2 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 text-[11px] text-stone-500 dark:text-stone-400 shrink-0">
          Clique em um {resource.labelSingular.toLowerCase()} para ver{' '}
          {resource.details!.map((d) => d.label.toLowerCase()).join(' e ')} aqui embaixo. Duplo clique
          abre o registro para edição.
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {abas.length > 0 && tabBar}

      {/* Somente o painel da aba ativa é montado */}
      {abaAtual ? (
        <RecordForm
          key={abaAtual.key}
          resource={resource}
          record={abaAtual.record}
          refOptions={refOptions}
          onCancel={() => fecharAba(abaAtual.key)}
          onSave={(payload) => handleSave(abaAtual, payload)}
          colunasVisiveis={listedFields.map((f) => f.name)}
          onAlternarColuna={alternarColuna}
          camposBusca={camposBuscaAtuais}
          onAlternarBusca={alternarCampoBusca}
          ordemCampos={ordemForm}
          onReordenarCampos={setOrdemForm}
          tamanhosCampos={tamanhosForm}
          onRedimensionarCampo={(campo, tamanho) =>
            setTamanhosForm((atual) => ({ ...atual, [campo]: { ...atual[campo], ...tamanho } }))
          }
          onSalvarLayout={salvarConfiguracao}
          onRestaurarPadrao={() => {
            setTamanhosForm({});
            setOrdemForm([]);
          }}
        />
      ) : (
        listPanel
      )}

      {/* Confirmação de exclusão */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs"
            onClick={isDeletingBusy ? undefined : () => setDeleting(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Excluir {resource.labelSingular}?
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  O registro{' '}
                  <strong className="font-mono text-stone-700 dark:text-stone-200">
                    #{recordId(deleting)}
                  </strong>{' '}
                  será removido definitivamente da tabela <strong>{resource.table}</strong>. Esta ação
                  não pode ser desfeita.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleting(null)}
                disabled={isDeletingBusy}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingBusy}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeletingBusy ? 'Excluindo…' : 'Excluir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
