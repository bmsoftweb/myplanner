import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Repeat, Paperclip, Download, FileDown, RefreshCw, Search,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Inbox, Save, X, CalendarDays,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { CombosLancamentos, FiltrosLancamentos } from '../services/api';
import {
  listarLancamentos, lerLancamento, gravarLancamento, excluirLancamento,
  gravarRecorrentes, preverDatasRecorrentes, enviarComprovante, removerComprovante,
  baixarLancamentosCsv, lerCombosLancamentos,
} from '../services/api';
import { ConfigUsuario, Lancamento } from '../types';
import {
  formatValor, formatDateBR, MESES, hoje, primeiroDiaDoMes, ultimoDiaDoMes,
  inicioDaSemana, fimDaSemana,
} from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import {
  useGradeLista,
  ColunaGrade,
  ThIndicador,
  TdIndicador,
  ThSobra,
  TdSobra,
  ThAcoes,
  TdAcoes,
  AlcaRedimensionar,
} from './GradeLista';
import { DateField } from './DateField';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { ConfirmDialog } from './ConfirmDialog';

type Aba = 'lista' | 'form' | 'recorrente';

interface LancamentosViewProps {
  refreshToken: number;
  createToken: number;
  onToast: (msg: string) => void;
  onCountChange: (total: number) => void;
}

/** Formulário de um lançamento, com os mesmos campos do sistema original */
interface FormLancamento {
  id_cat: string;
  id_categoria: string;
  tipo_doc: string;
  id_cc: string;
  id_limite: string;
  id_banco: string;
  id_meta: string;
  documento: string;
  data_compra: string;
  historico: string;
  valor_previsto: string;
  data_prevista: string;
  valor_realizado: string;
  data_realizado: string;
  analise: boolean;
}

const FORM_VAZIO: FormLancamento = {
  id_cat: '', id_categoria: '', tipo_doc: '', id_cc: '', id_limite: '', id_banco: '', id_meta: '',
  documento: '', data_compra: '', historico: '',
  valor_previsto: '', data_prevista: hoje(), valor_realizado: '', data_realizado: hoje(),
  analise: true,
};

/** Uma coluna da grade de lançamentos: o que desenha e por que valor ordena */
interface ColunaLanc extends ColunaGrade {
  align?: 'left' | 'center' | 'right';
  /** Conteúdo da célula */
  render: (l: Lancamento) => React.ReactNode;
  /** Valor usado na ordenação (o texto exibido nem sempre ordena direito) */
  valor: (l: Lancamento) => string | number;
  /** Chave da configuração que liga/desliga esta coluna, como no sistema original */
  configKey?: keyof ConfigUsuario;
}

const INTERVALOS = [
  { valor: 'diario', rotulo: 'Diário', diasSemana: true },
  { valor: 'semanal', rotulo: 'Semanal', diasSemana: true },
  { valor: 'quinzenal', rotulo: 'Quinzenal', diasSemana: false },
  { valor: 'mensal', rotulo: 'Mensal', diasSemana: false },
  { valor: 'bimestral', rotulo: 'Bimestral', diasSemana: false },
  { valor: 'trimestral', rotulo: 'Trimestral', diasSemana: false },
  { valor: 'semestral', rotulo: 'Semestral', diasSemana: false },
  { valor: 'anual', rotulo: 'Anual', diasSemana: false },
];

const DIAS_SEMANA = [
  { valor: 0, rotulo: 'Domingo' },
  { valor: 1, rotulo: 'Segunda' },
  { valor: 2, rotulo: 'Terça' },
  { valor: 3, rotulo: 'Quarta' },
  { valor: 4, rotulo: 'Quinta' },
  { valor: 5, rotulo: 'Sexta' },
  { valor: 6, rotulo: 'Sábado' },
];

export const LancamentosView: React.FC<LancamentosViewProps> = ({
  refreshToken, createToken, onToast, onCountChange,
}) => {
  const [aba, setAba] = useState<Aba>('lista');
  const [combos, setCombos] = useState<CombosLancamentos | null>(null);

  // ----------------------------------------------------------
  // Filtros da barra superior
  // ----------------------------------------------------------
  const agora = new Date();
  const [mes, setMes] = useState(agora.getMonth());
  const [ano, setAno] = useState(agora.getFullYear());
  const [d1, setD1] = useState(() => primeiroDiaDoMes());
  const [d2, setD2] = useState(() => ultimoDiaDoMes());
  const [documento, setDocumento] = useState('');
  const [historicoFiltro, setHistoricoFiltro] = useState('');
  const [idBancoFiltro, setIdBancoFiltro] = useState('');
  const [idCategoriaFiltro, setIdCategoriaFiltro] = useState('');
  const [tipoDocFiltro, setTipoDocFiltro] = useState('');
  const [comCartao, setComCartao] = useState(true);
  const [comPrevisao, setComPrevisao] = useState(true);

  const [linhas, setLinhas] = useState<Lancamento[]>([]);
  const [totais, setTotais] = useState({ previsto: 0, realizado: 0 });
  /** Quando o período pega mais linhas do que o servidor devolve de uma vez */
  const [corte, setCorte] = useState<{ total: number; limite: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Lancamento | null>(null);
  const [excluindo, setExcluindo] = useState<Lancamento | null>(null);
  const [removendoAnexo, setRemovendoAnexo] = useState<Lancamento | null>(null);

  const filtros: FiltrosLancamentos = useMemo(
    () => ({
      d1, d2, documento, historico: historicoFiltro,
      id_banco: idBancoFiltro, id_categoria: idCategoriaFiltro, tipo_doc: tipoDocFiltro,
      comCartao, comPrevisao,
    }),
    [d1, d2, documento, historicoFiltro, idBancoFiltro, idCategoriaFiltro, tipoDocFiltro, comCartao, comPrevisao],
  );

  // Só recarrega ao clicar em Filtrar ou ao trocar de período — não a cada tecla
  const [tokenBusca, setTokenBusca] = useState(0);
  const filtrosAplicados = useRef(filtros);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarLancamentos(filtrosAplicados.current);
      setLinhas(r.data);
      setTotais(r.totais);
      setCorte(r.limitado ? { total: r.total, limite: r.limite || r.data.length } : null);
      onCountChange(r.total);
    } catch (e: any) {
      setErro(e.message || 'Falha ao carregar os lançamentos.');
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    filtrosAplicados.current = filtros;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenBusca, refreshToken, d1, d2, comCartao, comPrevisao]);

  useEffect(() => {
    lerCombosLancamentos().then(setCombos).catch(() => setCombos(null));
  }, [refreshToken]);

  // O botão "Novo" do cabeçalho abre a inclusão
  useEffect(() => {
    if (createToken > 0) abrirInclusao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createToken]);

  /** Aplica o período do mês/ano escolhidos na barra */
  const aplicarMesAno = (novoMes: number, novoAno: number) => {
    const referencia = new Date(novoAno, novoMes, 1);
    setMes(novoMes);
    setAno(novoAno);
    setD1(primeiroDiaDoMes(referencia));
    setD2(ultimoDiaDoMes(referencia));
  };

  const mesAnterior = () => {
    const d = new Date(ano, mes - 1, 1);
    aplicarMesAno(d.getMonth(), d.getFullYear());
  };
  const mesSeguinte = () => {
    const d = new Date(ano, mes + 1, 1);
    aplicarMesAno(d.getMonth(), d.getFullYear());
  };

  // ----------------------------------------------------------
  // Formulário de inclusão / alteração
  // ----------------------------------------------------------
  const [form, setForm] = useState<FormLancamento>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const campo = (chave: keyof FormLancamento, valor: any) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  const limiteEscolhido = combos?.limites.find((l) => String(l.Id) === form.id_limite);
  const ehCartao = limiteEscolhido?.cartao_credito === 'S';

  const subcategoriasDaCategoria = useMemo(
    () => (combos?.subcategorias || []).filter((s) => !form.id_cat || String(s.id_cat) === form.id_cat),
    [combos, form.id_cat],
  );

  const abrirInclusao = () => {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO });
    setErroForm(null);
    setAba('form');
  };

  const abrirEdicao = async (linha: Lancamento) => {
    setErroForm(null);
    try {
      const l = await lerLancamento(linha.Id);
      setEditandoId(l.Id);
      setForm({
        id_cat: l.id_cat ? String(l.id_cat) : '',
        id_categoria: l.id_categoria ? String(l.id_categoria) : '',
        tipo_doc: l.tipo_doc || '',
        id_cc: l.id_cc ? String(l.id_cc) : '',
        id_limite: l.id_limite ? String(l.id_limite) : '',
        id_banco: l.id_banco ? String(l.id_banco) : '',
        id_meta: l.id_meta ? String(l.id_meta) : '',
        documento: l.documento || '',
        data_compra: l.data_compra || '',
        historico: l.historico || '',
        valor_previsto: l.valor_previsto != null ? String(l.valor_previsto) : '',
        data_prevista: l.data_prevista || '',
        valor_realizado: l.valor_realizado != null ? String(l.valor_realizado) : '',
        data_realizado: l.data_realizado || '',
        analise: String(l.analise || 'S').toUpperCase() === 'S',
      });
      setAba('form');
    } catch (e: any) {
      onToast(e.message || 'Falha ao abrir o lançamento.');
    }
  };

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErroForm(null);
    try {
      await gravarLancamento(editandoId, {
        ...form,
        analise: form.analise ? 'S' : 'N',
      });
      onToast(editandoId ? 'Lançamento alterado.' : 'Lançamento incluído.');
      setAba('lista');
      carregar();
    } catch (err: any) {
      setErroForm(err.message);
    } finally {
      setGravando(false);
    }
  };

  // ----------------------------------------------------------
  // Recorrentes
  // ----------------------------------------------------------
  const [rec, setRec] = useState({
    intervalo: 'mensal',
    repeticoes: 12,
    data_inicio: hoje(),
    valor_parcela: '',
    lancar_como: 'previsto' as 'previsto' | 'realizado' | 'ambos',
    add_meses: 1,
    dias_semana: [1, 2, 3, 4, 5] as number[],
  });
  const [previa, setPrevia] = useState<{ primeira: string; ultima: string; datas: string[] }>({
    primeira: '', ultima: '', datas: [],
  });

  const intervaloAtual = INTERVALOS.find((i) => i.valor === rec.intervalo);

  // A prévia de datas vem do servidor, que usa exatamente a regra da gravação
  useEffect(() => {
    if (aba !== 'recorrente') return;
    let vivo = true;
    preverDatasRecorrentes({
      intervalo: rec.intervalo,
      data_inicio: rec.data_inicio,
      repeticoes: rec.repeticoes,
      dias_semana: rec.dias_semana,
      add_meses: rec.add_meses,
    })
      .then((r) => vivo && setPrevia(r))
      .catch(() => vivo && setPrevia({ primeira: '', ultima: '', datas: [] }));
    return () => {
      vivo = false;
    };
  }, [aba, rec.intervalo, rec.data_inicio, rec.repeticoes, rec.dias_semana, rec.add_meses]);

  const abrirRecorrente = () => {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO });
    setErroForm(null);
    setAba('recorrente');
  };

  const gravarRecorrente = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    setErroForm(null);
    try {
      const r = await gravarRecorrentes({
        ...form,
        analise: form.analise ? 'S' : 'N',
        intervalo: rec.intervalo,
        repeticoes: rec.repeticoes,
        data_inicio: rec.data_inicio,
        valor_parcela: rec.valor_parcela,
        lancar_como: rec.lancar_como,
        add_meses: rec.add_meses,
        dias_semana: rec.dias_semana,
      });
      onToast(`${r.gerados} lançamento(s) gerado(s), de ${formatDateBR(r.primeira)} a ${formatDateBR(r.ultima)}.`);
      setAba('lista');
      carregar();
    } catch (err: any) {
      setErroForm(err.message);
    } finally {
      setGravando(false);
    }
  };

  // ----------------------------------------------------------
  // Comprovante
  // ----------------------------------------------------------
  const inputArquivo = useRef<HTMLInputElement>(null);

  const anexar = async (arquivo: File) => {
    if (!selecionado) return;
    try {
      await enviarComprovante(selecionado.Id, arquivo);
      onToast('Comprovante anexado.');
      carregar();
    } catch (e: any) {
      onToast(e.message || 'Falha ao anexar o comprovante.');
    }
  };

  const baixar = () => {
    if (!selecionado?.comprovante_link) return onToast('Este lançamento não tem comprovante anexado.');
    window.open(selecionado.comprovante_link, '_blank', 'noopener,noreferrer');
  };

  // ----------------------------------------------------------
  // Peças da interface
  // ----------------------------------------------------------
  const botao = (
    rotulo: string,
    Icone: typeof Plus,
    aoClicar: () => void,
    opcoes: { desabilitado?: boolean; destaque?: boolean; titulo?: string } = {},
  ) => (
    <button
      type="button"
      onClick={aoClicar}
      disabled={opcoes.desabilitado}
      title={opcoes.titulo || rotulo}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
        opcoes.desabilitado
          ? 'border-stone-200 dark:border-stone-800 text-stone-300 dark:text-stone-600 cursor-not-allowed'
          : opcoes.destaque
          ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer'
      }`}
    >
      <Icone className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{rotulo}</span>
    </button>
  );

  const selectCombo = (
    id: string,
    valor: string,
    aoMudar: (v: string) => void,
    itens: { value: string; label: string }[],
    obrigatorio = false,
    desabilitado = false,
  ) => (
    <select
      id={id}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      required={obrigatorio}
      disabled={desabilitado}
      className={`${INPUT_CLASS} w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <option value="">—</option>
      {itens.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  );

  const opcoesCategorias = (combos?.categorias || []).map((c) => ({
    value: String(c.Id),
    label: `${c.codigo ? `${c.codigo} · ` : ''}${c.descricao} (${c.tipo === 'R' ? 'Receita' : 'Despesa'})`,
  }));
  const opcoesSub = subcategoriasDaCategoria.map((s) => ({
    value: String(s.Id),
    label: `${s.codigo ? `${s.codigo} · ` : ''}${s.descricao}`,
  }));
  const opcoesTipoDoc = (combos?.tiposDoc || []).map((t) => ({ value: t.tipo, label: t.descricao }));
  const opcoesCC = (combos?.centros || []).map((c) => ({ value: String(c.Id), label: c.descricao }));
  const opcoesBancos = (combos?.bancos || []).map((b) => ({ value: String(b.Id), label: b.apelido || b.descricao }));
  const opcoesLimites = (combos?.limites || []).map((l) => ({
    value: String(l.Id),
    label: `${l.descricao}${l.cartao_credito === 'S' ? ' (cartão)' : ''}`,
  }));
  const opcoesMetas = (combos?.metas || []).map((m) => ({ value: String(m.Id), label: m.descricao }));

  const config = combos?.config;
  const podeIncluir = combos?.plano.podeIncluir !== false;

  // ----------------------------------------------------------
  // Colunas da grade — as mesmas do sistema original, na mesma ordem.
  // As que dependem de um módulo somem quando ele está desligado na
  // configuração, como acontecia no gridLanc do Delphi.
  // ----------------------------------------------------------
  const TODAS_COLUNAS: ColunaLanc[] = useMemo(
    () => [
      {
        name: 'status', label: 'St', width: 'xs', align: 'center',
        valor: (l) => l.status || '',
        render: (l) => (
          <span
            title={l.status === 'P' ? 'Pendente' : 'Conciliado'}
            className={`inline-block w-2 h-2 rounded-full ${l.status === 'P' ? 'bg-amber-500' : 'bg-emerald-500'}`}
          />
        ),
      },
      {
        name: 'recorrente', label: 'R', width: 'xs', align: 'center',
        valor: (l) => l.recorrente || '',
        render: (l) => (l.recorrente === 'S' ? <Repeat className="w-3 h-3 inline text-stone-400" /> : null),
      },
      {
        name: 'anexo', label: 'A', width: 'xs', align: 'center',
        valor: (l) => (l.comprovante_link ? 'S' : ''),
        render: (l) => (l.comprovante_link ? <Paperclip className="w-3 h-3 inline text-stone-400" /> : null),
      },
      {
        name: 'categoria', label: 'Categoria', width: 'lg', align: 'left',
        valor: (l) => `${l.categoria_pai || ''} ${l.categoria || ''}`,
        render: (l) => (
          <>
            <span className="text-stone-700 dark:text-stone-200">{l.categoria || '—'}</span>
            <span className="text-stone-400 ml-1.5">{l.categoria_pai}</span>
          </>
        ),
      },
      {
        name: 'mais_ou_menos', label: '.', width: 'xs', align: 'center',
        valor: (l) => l.mais_ou_menos,
        render: (l) => (
          <span className={`font-bold ${l.mais_ou_menos === '+' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {l.mais_ou_menos}
          </span>
        ),
      },
      {
        name: 'data_prevista', label: 'Data Prev.', width: 'sm', align: 'center',
        configKey: 'usar_previsao',
        valor: (l) => l.data_prevista || '',
        render: (l) => (l.data_prevista ? formatDateBR(l.data_prevista) : ''),
      },
      {
        name: 'valor_previsto', label: 'Valor Prev.', width: 'sm', align: 'right',
        configKey: 'usar_previsao',
        valor: (l) => Number(l.valor_previsto || 0),
        render: (l) => (l.valor_previsto != null ? formatValor(l.valor_previsto) : ''),
      },
      {
        name: 'data_realizado', label: 'Data Real.', width: 'sm', align: 'center',
        valor: (l) => l.data_realizado || '',
        render: (l) => (l.data_realizado ? formatDateBR(l.data_realizado) : ''),
      },
      {
        name: 'valor_realizado', label: 'Valor Real.', width: 'sm', align: 'right',
        valor: (l) => Number(l.valor_realizado || 0),
        render: (l) => (
          <span className="font-semibold">{l.valor_realizado != null ? formatValor(l.valor_realizado) : ''}</span>
        ),
      },
      {
        name: 'analise', label: 'An', width: 'xs', align: 'center',
        valor: (l) => l.analise || '',
        render: (l) => (l.analise === 'S' ? <span className="text-stone-400">✓</span> : null),
      },
      {
        name: 'historico', label: 'Histórico', width: 'lg', align: 'left',
        valor: (l) => l.historico || '',
        render: (l) => l.historico,
      },
      {
        name: 'descricao_tipo', label: 'Tipo', width: 'sm', align: 'left',
        valor: (l) => l.descricao_tipo || '',
        render: (l) => l.descricao_tipo,
      },
      {
        name: 'documento', label: 'Documento', width: 'sm', align: 'left',
        valor: (l) => l.documento || '',
        render: (l) => l.documento,
      },
      {
        name: 'descricao_banco', label: 'Banco', width: 'md', align: 'left',
        configKey: 'usar_bancos',
        valor: (l) => l.descricao_banco || '',
        render: (l) => l.descricao_banco,
      },
      {
        name: 'descricao_centro_custos', label: 'Centro de Custo', width: 'md', align: 'left',
        configKey: 'usar_cc',
        valor: (l) => l.descricao_centro_custos || '',
        render: (l) => l.descricao_centro_custos,
      },
      {
        name: 'descricao_limite', label: 'Limite', width: 'md', align: 'left',
        configKey: 'usar_limites',
        valor: (l) => l.descricao_limite || '',
        render: (l) => l.descricao_limite,
      },
      {
        name: 'descricao_meta', label: 'Meta', width: 'md', align: 'left',
        configKey: 'usar_metas',
        valor: (l) => l.descricao_meta || '',
        render: (l) => l.descricao_meta,
      },
      {
        name: 'comprovante', label: 'Comprovante', width: 'sm', align: 'center',
        valor: (l) => l.comprovante_link || '',
        render: (l) =>
          l.comprovante_link ? (
            <a
              href={l.comprovante_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blue-600 hover:underline"
            >
              ver
            </a>
          ) : null,
      },
    ],
    [],
  );

  const colunasVisiveis = useMemo(
    () => TODAS_COLUNAS.filter((c) => !c.configKey || !config || Boolean(config[c.configKey])),
    [TODAS_COLUNAS, config],
  );

  /** A mesma mecânica de grade das telas de cadastro */
  const g = useGradeLista<ColunaLanc>({
    recurso: 'lancamentos',
    colunas: colunasVisiveis,
    onToast,
    recalcularCom: linhas,
  });

  // Ordenação no cliente: a listagem do período já vem inteira do servidor
  const [ordenacao, setOrdenacao] = useState<{ campo: string; dir: 'asc' | 'desc' } | null>(null);

  const ordenarPor = (nome: string) =>
    setOrdenacao((atual) =>
      atual?.campo === nome
        ? { campo: nome, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
        : { campo: nome, dir: 'asc' },
    );

  const linhasOrdenadas = useMemo(() => {
    if (!ordenacao) return linhas;
    const coluna = TODAS_COLUNAS.find((c) => c.name === ordenacao.campo);
    if (!coluna) return linhas;
    const sinal = ordenacao.dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = coluna.valor(a);
      const vb = coluna.valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), 'pt-BR') * sinal;
    });
  }, [linhas, ordenacao, TODAS_COLUNAS]);

  /** Números à direita, datas e marcas centralizadas, o resto à esquerda */
  const alinhamento = (c: ColunaLanc) =>
    c.align === 'right' ? 'text-right font-mono' : c.align === 'center' ? 'text-center' : 'text-left';

  // ----------------------------------------------------------
  // Campos comuns ao lançamento normal e ao recorrente
  // ----------------------------------------------------------
  const camposDoLancamento = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className={`${FIELD_CLASS} sm:col-span-2`}>
        <label htmlFor="lanc-cat" className={LABEL_CLASS}>Categoria</label>
        {selectCombo('lanc-cat', form.id_cat, (v) => setForm((f) => ({ ...f, id_cat: v, id_categoria: '' })), opcoesCategorias, true)}
      </div>

      <div className={`${FIELD_CLASS} sm:col-span-2`}>
        <label htmlFor="lanc-sub" className={LABEL_CLASS}>Sub-Categoria</label>
        {selectCombo('lanc-sub', form.id_categoria, (v) => campo('id_categoria', v), opcoesSub, true, !form.id_cat)}
      </div>

      <div className={FIELD_CLASS}>
        <label htmlFor="lanc-tipo" className={LABEL_CLASS}>Tipo do Documento</label>
        {selectCombo('lanc-tipo', form.tipo_doc, (v) => campo('tipo_doc', v), opcoesTipoDoc, true)}
      </div>

      <div className={FIELD_CLASS}>
        <label htmlFor="lanc-doc" className={LABEL_CLASS}>Documento</label>
        <input
          id="lanc-doc"
          type="text"
          value={form.documento}
          onChange={(e) => campo('documento', e.target.value)}
          maxLength={15}
          className={INPUT_CLASS}
        />
      </div>

      {config?.usar_cc && (
        <div className={FIELD_CLASS}>
          <label htmlFor="lanc-cc" className={LABEL_CLASS}>Centro de Custo</label>
          {selectCombo('lanc-cc', form.id_cc, (v) => campo('id_cc', v), opcoesCC, true)}
        </div>
      )}

      {config?.usar_limites && (
        <div className={FIELD_CLASS}>
          <label htmlFor="lanc-limite" className={LABEL_CLASS}>Limite / Forma de Pagamento</label>
          {selectCombo('lanc-limite', form.id_limite, (v) => campo('id_limite', v), opcoesLimites)}
        </div>
      )}

      {config?.usar_bancos && (
        <div className={FIELD_CLASS}>
          <label htmlFor="lanc-banco" className={LABEL_CLASS}>Banco</label>
          {selectCombo('lanc-banco', form.id_banco, (v) => campo('id_banco', v), opcoesBancos)}
        </div>
      )}

      {config?.usar_metas && (
        <div className={FIELD_CLASS}>
          <label htmlFor="lanc-meta" className={LABEL_CLASS}>Meta</label>
          {selectCombo('lanc-meta', form.id_meta, (v) => campo('id_meta', v), opcoesMetas)}
        </div>
      )}

      <div className={FIELD_CLASS}>
        <label htmlFor="lanc-datacompra" className={LABEL_CLASS}>Data da compra</label>
        <DateField
          id="lanc-datacompra"
          value={form.data_compra}
          onChange={(v) => campo('data_compra', v)}
          required={ehCartao}
          className={INPUT_CLASS}
        />
        <p className={HINT_CLASS}>Usada quando o pagamento é com cartão de crédito</p>
      </div>

      <div className={`${FIELD_CLASS} sm:col-span-2 lg:col-span-4`}>
        <label htmlFor="lanc-hist" className={LABEL_CLASS}>Histórico</label>
        <input
          id="lanc-hist"
          type="text"
          value={form.historico}
          onChange={(e) => campo('historico', e.target.value)}
          maxLength={40}
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );

  // ----------------------------------------------------------
  // Aba: formulário de lançamento
  // ----------------------------------------------------------
  if (aba === 'form') {
    return (
      <form onSubmit={gravar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">
            {editandoId ? `Editar lançamento #${editandoId}` : 'Incluir lançamento'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAba('lista')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              type="submit"
              disabled={gravando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50"
            >
              {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Gravar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto px-5 py-5 space-y-5">
            {erroForm && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{erroForm}</span>
              </div>
            )}

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Dados Gerais</h4>
              {camposDoLancamento}
            </section>

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Valores</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {config?.usar_previsao && (
                  <>
                    <div className={FIELD_CLASS}>
                      <label htmlFor="lanc-vpre" className={LABEL_CLASS}>Previsão — Valor</label>
                      <NumberField
                        id="lanc-vpre"
                        value={form.valor_previsto}
                        onChange={(v) => campo('valor_previsto', v)}
                        scale={2}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className={FIELD_CLASS}>
                      <label htmlFor="lanc-dpre" className={LABEL_CLASS}>Previsão — Data</label>
                      <DateField
                        id="lanc-dpre"
                        value={form.data_prevista}
                        onChange={(v) => campo('data_prevista', v)}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </>
                )}

                <div className={FIELD_CLASS}>
                  <label htmlFor="lanc-vrea" className={LABEL_CLASS}>Realizado — Valor</label>
                  <NumberField
                    id="lanc-vrea"
                    value={form.valor_realizado}
                    onChange={(v) => campo('valor_realizado', v)}
                    scale={2}
                    className={INPUT_CLASS}
                  />
                </div>
                <div className={FIELD_CLASS}>
                  <label htmlFor="lanc-drea" className={LABEL_CLASS}>Realizado — Data</label>
                  <DateField
                    id="lanc-drea"
                    value={form.data_realizado}
                    onChange={(v) => campo('data_realizado', v)}
                    className={INPUT_CLASS}
                  />
                  {ehCartao && !editandoId && (
                    <p className={HINT_CLASS}>
                      Compra no cartão: a data é calculada pelo vencimento da fatura
                    </p>
                  )}
                </div>

                <div className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Entra na Análise</span>
                  <Toggle id="lanc-analise" checked={form.analise} onChange={(v) => campo('analise', v)} />
                  <p className={HINT_CLASS}>Desligado, o lançamento não aparece no planejamento</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </form>
    );
  }

  // ----------------------------------------------------------
  // Aba: lançamentos recorrentes
  // ----------------------------------------------------------
  if (aba === 'recorrente') {
    return (
      <form onSubmit={gravarRecorrente} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">Lançamentos recorrentes</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAba('lista')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              type="submit"
              disabled={gravando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50"
            >
              {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Gravar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto px-5 py-5 space-y-5">
            {erroForm && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{erroForm}</span>
              </div>
            )}

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Repetição</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={FIELD_CLASS}>
                  <label htmlFor="rec-valor" className={LABEL_CLASS}>Valor de Cada Parcela</label>
                  <NumberField
                    id="rec-valor"
                    value={rec.valor_parcela}
                    onChange={(v) => setRec((r) => ({ ...r, valor_parcela: v }))}
                    scale={2}
                    required
                    className={INPUT_CLASS}
                  />
                </div>

                <div className={FIELD_CLASS}>
                  <label htmlFor="rec-inicio" className={LABEL_CLASS}>Iniciar em</label>
                  <DateField
                    id="rec-inicio"
                    value={rec.data_inicio}
                    onChange={(v) => setRec((r) => ({ ...r, data_inicio: v }))}
                    required
                    className={INPUT_CLASS}
                  />
                </div>

                <div className={FIELD_CLASS}>
                  <label htmlFor="rec-vezes" className={LABEL_CLASS}>Repetir (vezes)</label>
                  <NumberField
                    id="rec-vezes"
                    value={String(rec.repeticoes)}
                    onChange={(v) => setRec((r) => ({ ...r, repeticoes: Math.max(1, Number(v) || 1) }))}
                    scale={0}
                    required
                    className={INPUT_CLASS}
                  />
                </div>

                <div className={FIELD_CLASS}>
                  <label htmlFor="rec-intervalo" className={LABEL_CLASS}>Intervalo</label>
                  <select
                    id="rec-intervalo"
                    value={rec.intervalo}
                    onChange={(e) => setRec((r) => ({ ...r, intervalo: e.target.value }))}
                    className={`${INPUT_CLASS} w-full cursor-pointer`}
                  >
                    {INTERVALOS.map((i) => (
                      <option key={i.valor} value={i.valor}>
                        {i.rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                {rec.intervalo === 'mensal' && (
                  <div className={FIELD_CLASS}>
                    <label htmlFor="rec-addmeses" className={LABEL_CLASS}>A cada quantos meses</label>
                    <NumberField
                      id="rec-addmeses"
                      value={String(rec.add_meses)}
                      onChange={(v) => setRec((r) => ({ ...r, add_meses: Math.max(1, Number(v) || 1) }))}
                      scale={0}
                      className={INPUT_CLASS}
                    />
                  </div>
                )}

                {intervaloAtual?.diasSemana && (
                  <div className={`${FIELD_CLASS} sm:col-span-2 lg:col-span-3`}>
                    <span className={LABEL_CLASS}>Marque os dias da semana</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS_SEMANA.map((d) => {
                        const marcado = rec.dias_semana.includes(d.valor);
                        return (
                          <button
                            key={d.valor}
                            type="button"
                            onClick={() =>
                              setRec((r) => ({
                                ...r,
                                dias_semana: marcado
                                  ? r.dias_semana.filter((x) => x !== d.valor)
                                  : [...r.dias_semana, d.valor].sort(),
                              }))
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              marcado
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                            }`}
                          >
                            {d.rotulo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={FIELD_CLASS}>
                  <label htmlFor="rec-como" className={LABEL_CLASS}>Lançar como</label>
                  <select
                    id="rec-como"
                    value={rec.lancar_como}
                    onChange={(e) => setRec((r) => ({ ...r, lancar_como: e.target.value as any }))}
                    className={`${INPUT_CLASS} w-full cursor-pointer`}
                  >
                    <option value="previsto">Previsto</option>
                    <option value="realizado">Realizado</option>
                    <option value="ambos">Previsto e Realizado</option>
                  </select>
                </div>

                <div className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Entra na Análise</span>
                  <Toggle id="rec-analise" checked={form.analise} onChange={(v) => campo('analise', v)} />
                </div>
              </div>

              {previa.datas.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 flex items-center gap-2 flex-wrap">
                  <CalendarDays className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Serão gerados <strong>{previa.datas.length}</strong> lançamentos, de{' '}
                    <strong>{formatDateBR(previa.primeira)}</strong> até{' '}
                    <strong>{formatDateBR(previa.ultima)}</strong>.
                  </span>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Dados Gerais</h4>
              {camposDoLancamento}
            </section>
          </div>
        </div>
      </form>
    );
  }

  // ----------------------------------------------------------
  // Aba: lista
  // ----------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Barra de período e filtros */}
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={mesAnterior}
            title="Mês anterior"
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={mes}
            onChange={(e) => aplicarMesAno(Number(e.target.value), ano)}
            className={`${INPUT_CLASS} cursor-pointer`}
            title="Mês"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => aplicarMesAno(mes, Number(e.target.value))}
            className={`${INPUT_CLASS} cursor-pointer`}
            title="Ano"
          >
            {Array.from({ length: 21 }, (_, i) => agora.getFullYear() - 10 + i).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={mesSeguinte}
            title="Próximo mês"
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        {botao('Hoje', CalendarDays, () => {
          setD1(hoje());
          setD2(hoje());
        })}
        {botao('Semana', CalendarDays, () => {
          setD1(inicioDaSemana());
          setD2(fimDaSemana());
        })}
        {botao('Todos', CalendarDays, () => {
          setD1('1980-01-01');
          setD2('2099-12-31');
        })}

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        <div className="flex items-center gap-1.5">
          <DateField value={d1} onChange={setD1} className={INPUT_CLASS} placeholder="Data inicial" />
          <span className="text-xs text-stone-400">até</span>
          <DateField value={d2} onChange={setD2} className={INPUT_CLASS} placeholder="Data final" />
        </div>

        <input
          type="search"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setTokenBusca((t) => t + 1)}
          placeholder="Documento"
          className={`${INPUT_CLASS} w-28`}
        />
        <input
          type="search"
          value={historicoFiltro}
          onChange={(e) => setHistoricoFiltro(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setTokenBusca((t) => t + 1)}
          placeholder="Histórico"
          className={`${INPUT_CLASS} w-32`}
        />
        <select
          value={idCategoriaFiltro}
          onChange={(e) => setIdCategoriaFiltro(e.target.value)}
          className={`${INPUT_CLASS} cursor-pointer max-w-44`}
          title="Sub-categoria"
        >
          <option value="">Todas as categorias</option>
          {(combos?.subcategorias || []).map((s) => (
            <option key={s.Id} value={s.Id}>
              {s.descricao}
            </option>
          ))}
        </select>
        {config?.usar_bancos && (
          <select
            value={idBancoFiltro}
            onChange={(e) => setIdBancoFiltro(e.target.value)}
            className={`${INPUT_CLASS} cursor-pointer max-w-36`}
            title="Banco"
          >
            <option value="">Todos os bancos</option>
            {(combos?.bancos || []).map((b) => (
              <option key={b.Id} value={b.Id}>
                {b.apelido || b.descricao}
              </option>
            ))}
          </select>
        )}
        <select
          value={tipoDocFiltro}
          onChange={(e) => setTipoDocFiltro(e.target.value)}
          className={`${INPUT_CLASS} cursor-pointer max-w-36`}
          title="Tipo do documento"
        >
          <option value="">Todos os tipos</option>
          {(combos?.tiposDoc || []).map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.descricao}
            </option>
          ))}
        </select>

        {botao('Filtrar', Search, () => setTokenBusca((t) => t + 1), { destaque: true })}
        {botao('Atualizar', RefreshCw, () => setTokenBusca((t) => t + 1))}
      </div>

      {/* Barra de ações */}
      <div className="border-b border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center gap-2">
        {botao('Incluir', Plus, abrirInclusao, {
          destaque: true,
          desabilitado: !podeIncluir,
          titulo: podeIncluir ? 'Incluir lançamento' : combos?.plano.mensagem,
        })}
        {botao('Editar', Pencil, () => selecionado && abrirEdicao(selecionado), { desabilitado: !selecionado })}
        {botao('Excluir', Trash2, () => setExcluindo(selecionado), { desabilitado: !selecionado })}
        {botao('Recorrente', Repeat, abrirRecorrente, {
          desabilitado: !podeIncluir,
          titulo: podeIncluir ? 'Gerar lançamentos repetidos' : combos?.plano.mensagem,
        })}

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        {botao('Anexar', Paperclip, () => inputArquivo.current?.click(), { desabilitado: !selecionado })}
        {botao('Baixar', Download, baixar, { desabilitado: !selecionado?.comprovante_link })}
        {botao('Remover anexo', X, () => setRemovendoAnexo(selecionado), {
          desabilitado: !selecionado?.comprovante_link,
        })}
        <input
          ref={inputArquivo}
          type="file"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            if (arquivo) anexar(arquivo);
          }}
        />

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        {botao('Exportar', FileDown, () =>
          baixarLancamentosCsv(filtrosAplicados.current).catch((e) => onToast(e.message)),
        )}

        <span className="w-px h-6 bg-stone-200 dark:bg-stone-800" />

        <Toggle id="filtro-cartao" checked={comCartao} onChange={setComCartao} size="sm" label="Com Cartão de Crédito" />
        <Toggle id="filtro-previsao" checked={comPrevisao} onChange={setComPrevisao} size="sm" label="Com Previsão" />

        <div className="ml-auto text-xs text-stone-500 dark:text-stone-400">
          Mostrando <strong>{linhas.length}</strong> registro(s)
          {corte && <> de <strong>{corte.total}</strong></>}
        </div>
      </div>

      {corte && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          O período escolhido tem {corte.total} lançamentos e a tela mostra os {corte.limite} primeiros.
          Os totais abaixo consideram o período inteiro. Reduza o período para ver todos.
        </div>
      )}

      {combos && !podeIncluir && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {combos.plano.mensagem}
        </div>
      )}

      {/* Grade */}
      <div className="flex-1 overflow-auto min-h-0">
        {erro ? (
          <div className="m-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{erro}</span>
          </div>
        ) : carregando && !linhas.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Carregando…</span>
          </div>
        ) : !linhas.length ? (
          <div className="py-20 flex flex-col items-center gap-3 text-stone-400">
            <Inbox className="w-7 h-7" />
            <span className="text-xs">Nenhum lançamento no período escolhido.</span>
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
                <ThAcoes />
              </tr>
            </thead>

            <tbody className={carregando ? 'opacity-60' : undefined}>
              {linhasOrdenadas.map((l) => {
                const ativa = selecionado?.Id === l.Id;
                return (
                  <tr
                    key={l.Id}
                    onClick={() => setSelecionado(l)}
                    onDoubleClick={() => abrirEdicao(l)}
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

                    <TdAcoes grade={g}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirEdicao(l);
                        }}
                        title="Editar lançamento"
                        className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExcluindo(l);
                        }}
                        title="Excluir lançamento"
                        className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TdAcoes>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Totais */}
      <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-2.5 flex flex-wrap items-center justify-end gap-6 text-xs bg-stone-50 dark:bg-stone-900">
        <span className="text-stone-500 dark:text-stone-400">
          Total previsto:{' '}
          <strong
            className={`font-mono ${totais.previsto >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-600'}`}
          >
            {formatValor(totais.previsto)}
          </strong>
        </span>
        <span className="text-stone-500 dark:text-stone-400">
          Total realizado:{' '}
          <strong
            className={`font-mono ${totais.realizado >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-600'}`}
          >
            {formatValor(totais.realizado)}
          </strong>
        </span>
      </div>

      {excluindo && (
        <ConfirmDialog
          titulo="Excluir lançamento?"
          mensagem={
            <>
              O lançamento <strong>#{excluindo.Id}</strong> — {excluindo.historico || excluindo.categoria} — será
              removido definitivamente. Esta ação não pode ser desfeita.
            </>
          }
          rotuloConfirmar="Excluir"
          onCancelar={() => setExcluindo(null)}
          onConfirmar={async () => {
            await excluirLancamento(excluindo.Id);
            setExcluindo(null);
            setSelecionado(null);
            onToast('Lançamento excluído.');
            carregar();
          }}
        />
      )}

      {removendoAnexo && (
        <ConfirmDialog
          titulo="Remover o comprovante?"
          mensagem="O arquivo anexado a este lançamento será apagado do servidor."
          rotuloConfirmar="Remover"
          onCancelar={() => setRemovendoAnexo(null)}
          onConfirmar={async () => {
            await removerComprovante(removendoAnexo.Id);
            setRemovendoAnexo(null);
            onToast('Comprovante removido.');
            carregar();
          }}
        />
      )}
    </div>
  );
};
