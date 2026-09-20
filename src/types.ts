export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'boolean'
  | 'password'
  | 'json'
  | 'cnpj'
  | 'image';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  listed?: boolean;
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  options?: { value: string; label: string }[];
  ref?: { resource: string; labelField: string };
  scale?: number;
  maxLength?: number;
  /** Coluna char(1) que guarda 'S' / 'N' em vez de 1 / 0 */
  sn?: boolean;
  /** Desabilita (e zera) o campo quando outro campo tiver o valor indicado */
  disabledWhen?: { field: string; equals: string };
  /** Campo numérico que aceita valor negativo */
  allowNegative?: boolean;
  /** Número que não é quantidade (ano, por exemplo): sem ponto de milhar */
  semAgrupamento?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export type ResourceGroup = 'cadastros' | 'planejamento' | 'acesso' | 'sistema';

/** Grade filha exibida ao selecionar uma linha da listagem (mestre-detalhe) */
export interface DetailDef {
  resource: string;
  foreignKey: string;
  label: string;
  totalField?: string;
}

export interface ResourceDef {
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  icon: string;
  group: ResourceGroup;
  pk: string[];
  autoIncrement: boolean;
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  scopeSql: string;
  tenantColumn?: string;
  /** Chave da tabela config que liga/desliga a tela no menu */
  configKey?: string;
  /** Não aparece na barra lateral */
  hidden?: boolean;
  /** Só o dono da conta (o e-mail principal) enxerga e mantém este recurso */
  somentePrincipal?: boolean;
  details?: DetailDef[];
  fields: FieldDef[];
}

/** A conta do sistema: uma linha de "empresas", que é o tenant (id_emp) */
export interface Conta {
  id: string;
  nome: string;
  email: string;
  cpfcnpj: string;
  chave: string;
  id_plano: number;
  ativado: string;
  data_validade: string;
}

/** Quem está usando: o dono da conta ou um usuário cadastrado dentro dela */
export interface UsuarioSessao {
  id: string;
  id_emp: string;
  nome: string;
  email: string;
  /** Verdadeiro quando é o e-mail principal da conta (só ele vê Usuários e Meus Dados) */
  principal: boolean;
}

/** Tabela config: liga e desliga módulos e define a página inicial */
export interface ConfigUsuario {
  usar_previsao: boolean;
  usar_limites: boolean;
  usar_bancos: boolean;
  usar_cc: boolean;
  usar_metas: boolean;
  usar_patrimonio: boolean;
  /** '1' menu, '2' lançamentos, '3' planejamento */
  pagina_padrao: string;
}

export type RegistroCrud = Record<string, any>;

/** Operadores aceitos pela busca avançada */
export type FiltroOp = 'contains' | 'eq' | 'ne' | 'gte' | 'lte';

export interface FiltroAvancado {
  field: string;
  op: FiltroOp;
  value: string;
}

export interface ListaPaginada {
  data: RegistroCrud[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OpcaoRef {
  value: string;
  label: string;
}

export interface DbConnectionStatus {
  connected: boolean;
  latencyMs: number;
  version?: string;
  database?: string;
  host?: string;
  port?: number;
  user?: string;
  error?: string;
  tableCounts?: Record<string, number>;
}

// ------------------------------------------------------------
// Painel (Home)
// ------------------------------------------------------------
export interface DashboardData {
  counts: Record<string, number>;
  /** Percentual do previsto do mês que já foi realizado (despesas) */
  realizadoDoMes: { previsto: number; realizado: number; percentual: number };
  /** Receitas e despesas realizadas nos últimos 12 meses */
  porMes: { anomes: string; receitas: number; despesas: number }[];
  /** Movimentação pendente do dia */
  hoje: {
    receitas: number;
    despesas: number;
    itens: { categoria: string; historico: string; tipo_documento: string; valor: number }[];
  };
  /** As 5 maiores despesas por sub-categoria, mais "Outros" */
  maioresDespesas: { descricao: string; valor: number }[];
  /** Saldo atual de cada banco */
  saldosBancos: { id: string; descricao: string; apelido: string; saldo: number }[];
  /** Quanto de cada limite já foi consumido no mês */
  limites: { id: string; descricao: string; limite: number; usado: number; cartao: boolean }[];
}

// ------------------------------------------------------------
// Lançamentos
// ------------------------------------------------------------
export interface Lancamento {
  Id: number;
  status: string;
  id_categoria: number;
  categoria: string;
  categoria_pai: string;
  mais_ou_menos: '+' | '-';
  data_sort: string;
  data_prevista: string | null;
  data_compra: string | null;
  valor_previsto: number | null;
  data_realizado: string | null;
  valor_realizado: number | null;
  analise: string;
  historico: string;
  tipo_doc: string;
  descricao_tipo: string;
  documento: string;
  id_banco: number;
  descricao_banco: string;
  id_cc: number;
  descricao_centro_custos: string;
  id_limite: number;
  descricao_limite: string;
  id_meta: number;
  descricao_meta: string;
  comprovante_link: string;
  recorrente: string;
}

export interface FiltroLancamentos {
  d1: string;
  d2: string;
  documento: string;
  id_banco: string;
  id_categoria: string;
  tipo_doc: string;
  comCartao: boolean;
  comPrevisao: boolean;
}

// ------------------------------------------------------------
// Planejamento (grade de 12 meses)
// ------------------------------------------------------------
export interface LinhaPlanejamento {
  grupo: string;
  id: number;
  id_subcat: number;
  codigo: string;
  descricao: string;
  /** 'R' receita, 'D' despesa */
  tiporb: string;
  /** Por mês (1 a 12) e total: previsto e realizado */
  meses: { previsto: number; realizado: number }[];
  total_previsto: number;
  total_realizado: number;
}

// ------------------------------------------------------------
// Extrato bancário
// ------------------------------------------------------------
export interface LinhaExtrato {
  id_lanc: number;
  data: string;
  documento: string;
  categoria: string;
  historico: string;
  centro_custo: string;
  limite: string;
  /** '+' entrada, '-' saída */
  es: string;
  valor: number;
  saldo: number;
}
