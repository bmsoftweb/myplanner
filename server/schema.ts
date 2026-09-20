/**
 * Registro central de metadados das tabelas do banco myplanner.
 *
 * Este arquivo é a ÚNICA fonte de verdade das telas de manutenção:
 *  - o backend usa para montar SQL com whitelist de colunas (evita SQL injection);
 *  - o frontend consome via GET /api/meta/resources para desenhar as telas de CRUD.
 *
 * Regra de multi-tenant: cada conta do sistema é uma linha da tabela "empresas"
 * e todos os dados do usuário carregam a coluna id_emp. Todo recurso declara
 * como é feito esse isolamento.
 */

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
  /** Nome da coluna no MySQL */
  name: string;
  /** Rótulo exibido na interface */
  label: string;
  type: FieldType;
  /** Texto auxiliar exibido abaixo do campo no formulário */
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Campo apenas leitura (gerado pelo banco): nunca vai em INSERT/UPDATE */
  readOnly?: boolean;
  /** Exibido na grade de listagem */
  listed?: boolean;
  /** Participa da busca textual (LIKE) da barra de busca rápida */
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  /** Opções para type === 'enum' */
  options?: { value: string; label: string }[];
  /** Chave estrangeira: carrega o combo a partir de outro recurso */
  ref?: { resource: string; labelField: string };
  /** Casas decimais para type === 'decimal' */
  scale?: number;
  maxLength?: number;
  /**
   * Coluna char(1) que guarda 'S' / 'N' em vez de 1 / 0. O campo continua sendo
   * um interruptor sim/não na tela; a conversão acontece na gravação e na leitura.
   */
  sn?: boolean;
  /**
   * Desabilita o campo no formulário (e zera o valor) quando outro campo tem o
   * valor indicado.
   */
  disabledWhen?: { field: string; equals: string };
  /** Campo numérico que aceita valor negativo (o sinal alterna ao digitar "-") */
  allowNegative?: boolean;
  /** Número que não é quantidade (ano, por exemplo): sem ponto de milhar */
  semAgrupamento?: boolean;
  /** Largura sugerida da coluna na grade */
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Grade filha exibida no rodapé da listagem quando uma linha é selecionada
 * (mestre-detalhe). Ex.: as sub-categorias de uma categoria.
 */
export interface DetailDef {
  /** Recurso filho, ex.: 'categorias_sub' */
  resource: string;
  /** Coluna do filho que aponta para a PK do pai, ex.: 'id_cat' */
  foreignKey: string;
  label: string;
  /** Campo decimal do filho totalizado no rodapé do painel */
  totalField?: string;
}

export type ResourceGroup = 'cadastros' | 'planejamento' | 'acesso' | 'sistema';

export interface ResourceDef {
  /** Identificador usado nas rotas: /api/crud/:resource */
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  /** Ícone lucide-react renderizado na sidebar */
  icon: string;
  group: ResourceGroup;
  /** Chave primária (array = chave composta) */
  pk: string[];
  /** Se a PK é AUTO_INCREMENT (não é enviada no INSERT) */
  autoIncrement: boolean;
  /** Campo usado como rótulo em combos de chave estrangeira */
  labelField: string;
  /** Ordenação padrão da listagem */
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /**
   * Fragmento SQL de isolamento da conta, com um placeholder "?" para o id_emp.
   * A tabela sempre recebe o alias "t" nas consultas.
   */
  scopeSql: string;
  /** Coluna id_emp preenchida automaticamente no INSERT */
  tenantColumn?: string;
  /**
   * Chave de configuração (tabela config) que liga/desliga esta tela no menu.
   * Sem ela, a tela aparece sempre.
   */
  configKey?: string;
  /** Não aparece na barra lateral (é aberta como detalhe ou por outra tela) */
  hidden?: boolean;
  /**
   * Só o dono da conta (o e-mail principal, que não tem linha em usuarios)
   * enxerga e mantém este recurso.
   */
  somentePrincipal?: boolean;
  /** Grades filhas abertas ao selecionar uma linha da listagem */
  details?: DetailDef[];
  fields: FieldDef[];
}

/** Receita ou Despesa: define o sinal do lançamento em todos os relatórios */
const TIPO_CATEGORIA = [
  { value: 'R', label: 'Receita' },
  { value: 'D', label: 'Despesa' },
];

const TIPO_CONTA = [
  { value: 'C', label: 'Conta Corrente' },
  { value: 'A', label: 'Aplicação / Poupança' },
];

const STATUS_LANCAMENTO = [
  { value: 'P', label: 'Pendente' },
  { value: 'O', label: 'OK' },
];

const MESES_OPCOES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

export const RESOURCES: ResourceDef[] = [
  // ============================================================
  // CADASTROS
  // ============================================================
  {
    name: 'categorias',
    table: 'categorias',
    label: 'Categorias',
    labelSingular: 'Categoria',
    description: 'Grupos de receita e de despesa, com as suas sub-categorias',
    icon: 'Tags',
    group: 'cadastros',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'codigo', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    details: [{ resource: 'categorias_sub', foreignKey: 'id_cat', label: 'Sub-Categorias' }],
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'codigo', label: 'Código', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 15, width: 'sm', hint: 'Define a ordem em que a categoria aparece no planejamento' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, width: 'sm', options: TIPO_CATEGORIA },
    ],
  },
  {
    name: 'categorias_sub',
    table: 'categorias_sub',
    label: 'Sub-Categorias',
    labelSingular: 'Sub-Categoria',
    description: 'Detalhamento das categorias — é o que se escolhe no lançamento',
    icon: 'Tag',
    group: 'cadastros',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'codigo', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_cat', label: 'Categoria', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'categorias', labelField: 'descricao' } },
      { name: 'codigo', label: 'Código', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 15, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
      { name: 'relatorio', label: 'Entra no gráfico de despesas', type: 'boolean', sn: true, listed: true, filterable: true, width: 'sm', hint: 'Quando ligado, a sub-categoria concorre às 5 maiores despesas do painel' },
    ],
  },
  {
    name: 'bancos',
    table: 'bancos',
    label: 'Bancos',
    labelSingular: 'Banco',
    description: 'Contas correntes e aplicações, com saldo inicial e extrato',
    icon: 'Landmark',
    group: 'cadastros',
    configKey: 'usar_bancos',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 30 },
      { name: 'apelido', label: 'Apelido', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 10, width: 'sm' },
      { name: 'tipo_conta', label: 'Tipo', type: 'enum', listed: true, filterable: true, width: 'sm', options: TIPO_CONTA },
      { name: 'saldo_inicial', label: 'Saldo Inicial', type: 'decimal', scale: 2, allowNegative: true, listed: true, filterable: true },
      { name: 'data_saldo_inicial', label: 'Data do Saldo Inicial', type: 'date', listed: true, filterable: true },
    ],
  },
  {
    name: 'centroscustos',
    table: 'centroscustos',
    label: 'Centros de Custo',
    labelSingular: 'Centro de Custo',
    description: 'Onde o dinheiro foi aplicado — casa, carro, viagem, filho',
    icon: 'QrCode',
    group: 'cadastros',
    configKey: 'usar_cc',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
    ],
  },
  {
    name: 'limites',
    table: 'limites',
    label: 'Limites',
    labelSingular: 'Limite',
    description: 'Tetos de gasto e cartões de crédito, com fechamento e vencimento',
    icon: 'StepForward',
    group: 'cadastros',
    configKey: 'usar_limites',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    details: [{ resource: 'limites_mensais', foreignKey: 'id_limite', label: 'Limites Mensais', totalField: 'valor' }],
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
      { name: 'limite_mensal', label: 'Limite Mensal Padrão', type: 'decimal', scale: 2, required: true, listed: true, filterable: true },
      { name: 'cartao_credito', label: 'É cartão de crédito', type: 'boolean', sn: true, listed: true, filterable: true, width: 'sm' },
      { name: 'dia_fechamento', label: 'Dia do Fechamento', type: 'number', listed: true, width: 'sm', hint: 'Use 99 para o último dia do mês', disabledWhen: { field: 'cartao_credito', equals: 'false' } },
      { name: 'dia_vencimento', label: 'Dia do Vencimento da Fatura', type: 'number', listed: true, width: 'sm', hint: 'Use 99 para o último dia do mês', disabledWhen: { field: 'cartao_credito', equals: 'false' } },
    ],
  },
  {
    name: 'limites_mensais',
    table: 'limites_mensais',
    label: 'Limites Mensais',
    labelSingular: 'Limite Mensal',
    description: 'Teto diferente do padrão em um mês específico',
    icon: 'CalendarRange',
    group: 'cadastros',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'ano_mes',
    defaultSort: { field: 'ano_mes', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_limite IN (SELECT Id FROM limites WHERE id_emp = ?)',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_limite', label: 'Limite', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'limites', labelField: 'descricao' } },
      { name: 'ano', label: 'Ano', type: 'number', required: true, listed: true, filterable: true, semAgrupamento: true, width: 'xs' },
      { name: 'mes', label: 'Mês', type: 'enum', required: true, listed: true, filterable: true, width: 'sm', options: MESES_OPCOES },
      { name: 'ano_mes', label: 'Ano/Mês', type: 'text', readOnly: true, listed: true, maxLength: 6, width: 'sm', hint: 'Calculado a partir do ano e do mês' },
      { name: 'valor', label: 'Limite do Mês', type: 'decimal', scale: 2, required: true, listed: true, filterable: true },
    ],
  },
  {
    name: 'metas',
    table: 'metas',
    label: 'Metas',
    labelSingular: 'Meta',
    description: 'Quanto você quer juntar, até quando, e o depósito mensal necessário',
    icon: 'MapPin',
    group: 'cadastros',
    configKey: 'usar_metas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    details: [{ resource: 'metas_valores', foreignKey: 'id_meta', label: 'Valores da Meta por Dia', totalField: 'valor' }],
    fields: [
      { name: 'id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
      { name: 'id_banco', label: 'Relacionado ao Banco/Poupança', type: 'number', filterable: true, listed: true, ref: { resource: 'bancos', labelField: 'descricao' } },
      { name: 'data_inicial', label: 'Data Início', type: 'date', required: true, listed: true, filterable: true },
      { name: 'saldo_inicial', label: 'Você já tem guardado', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'data_final', label: 'Data Final', type: 'date', required: true, listed: true, filterable: true },
      { name: 'saldo_final', label: 'Você quer ter', type: 'decimal', scale: 2, required: true, listed: true, filterable: true },
      { name: 'numero_meses', label: 'Meses', type: 'number', readOnly: true, listed: true, width: 'xs', hint: 'Calculado entre a data inicial e a final' },
      { name: 'valor_mensal', label: 'Depósito Mensal', type: 'decimal', scale: 2, readOnly: true, listed: true, hint: 'Calculado: (quanto falta) ÷ (número de meses)' },
      { name: 'id_moeda', label: 'Moeda', type: 'number', filterable: true, ref: { resource: 'moedas', labelField: 'descricao' }, hint: 'Opcional: acompanha a meta em outra moeda' },
    ],
  },
  {
    name: 'metas_valores',
    table: 'metas_valores',
    label: 'Valores das Metas',
    labelSingular: 'Valor da Meta',
    description: 'Saldo da meta em cada data',
    icon: 'CalendarCheck',
    group: 'cadastros',
    hidden: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'data',
    defaultSort: { field: 'data', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_meta IN (SELECT id FROM metas WHERE id_emp = ?)',
    fields: [
      { name: 'id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_meta', label: 'Meta', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'metas', labelField: 'descricao' } },
      { name: 'data', label: 'Data', type: 'date', required: true, listed: true, filterable: true },
      { name: 'valor', label: 'Valor', type: 'decimal', scale: 2, required: true, listed: true, filterable: true },
      { name: 'id_moeda', label: 'Moeda', type: 'number', filterable: true, ref: { resource: 'moedas', labelField: 'descricao' } },
    ],
  },
  {
    name: 'moedas',
    table: 'moedas',
    label: 'Moedas',
    labelSingular: 'Moeda',
    description: 'Moedas e índices usados para acompanhar as metas',
    icon: 'Coins',
    group: 'cadastros',
    configKey: 'usar_metas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    details: [{ resource: 'moedas_cotacao', foreignKey: 'id_moeda', label: 'Cotações da Moeda' }],
    fields: [
      { name: 'id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
    ],
  },
  {
    name: 'moedas_cotacao',
    table: 'moedas_cotacao',
    label: 'Cotações',
    labelSingular: 'Cotação',
    description: 'Cotação da moeda em cada data',
    icon: 'TrendingUp',
    group: 'cadastros',
    hidden: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'data',
    defaultSort: { field: 'data', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_moeda IN (SELECT id FROM moedas WHERE id_emp = ?)',
    fields: [
      { name: 'id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_moeda', label: 'Moeda', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'moedas', labelField: 'descricao' } },
      { name: 'data', label: 'Data', type: 'date', required: true, listed: true, filterable: true },
      { name: 'cotacao', label: 'Cotação', type: 'decimal', scale: 4, required: true, listed: true, filterable: true },
    ],
  },
  {
    name: 'patrimonio',
    table: 'patrimonio',
    label: 'Patrimônio',
    labelSingular: 'Bem',
    description: 'Bens, valor de aquisição, valor atual e depreciação anual',
    icon: 'Ship',
    group: 'cadastros',
    configKey: 'usar_patrimonio',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao_resumida',
    defaultSort: { field: 'descricao_resumida', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'descricao_resumida', label: 'Descrição Resumida', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 80 },
      { name: 'data_aquisicao', label: 'Data de Aquisição', type: 'date', listed: true, filterable: true },
      { name: 'valor_aquisicao', label: 'Valor de Aquisição', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'valor_atual', label: 'Valor Atual', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'depreciacao_anual', label: '% Depreciação Anual', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'descricao_detalhada', label: 'Descrição Detalhada', type: 'textarea', searchable: true },
    ],
  },
  {
    name: 'tipos_doc',
    table: 'tipos_doc',
    label: 'Tipos de Documento',
    labelSingular: 'Tipo de Documento',
    description: 'Formas de pagamento e recebimento usadas nos lançamentos',
    icon: 'FileType',
    group: 'cadastros',
    pk: ['tipo'],
    autoIncrement: false,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    // Tabela compartilhada por todas as contas: o "?" recebe o id_emp e é ignorado
    scopeSql: '? > 0',
    fields: [
      { name: 'tipo', label: 'Sigla', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 2, width: 'xs', hint: 'Até 2 letras, ex.: CC para cartão de crédito' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 20 },
    ],
  },

  // ============================================================
  // ACESSO
  // ============================================================
  {
    name: 'usuarios',
    table: 'usuarios',
    label: 'Usuários',
    labelSingular: 'Usuário',
    description: 'Pessoas que também acessam esta conta',
    icon: 'Users',
    group: 'acesso',
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    somentePrincipal: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 80 },
      { name: 'email', label: 'e-Mail', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 120, hint: 'É com este e-mail que a pessoa entra no sistema' },
      { name: 'senha', label: 'Senha', type: 'password', maxLength: 20, hint: 'Deixe em branco para manter a senha atual' },
    ],
  },

  // ============================================================
  // SISTEMA
  // ============================================================
  {
    name: 'consultas',
    table: 'consultas',
    label: 'Consultas',
    labelSingular: 'Consulta',
    description: 'Consultas em SQL disponíveis na tela de Consultas',
    icon: 'PieChart',
    group: 'sistema',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'titulo',
    defaultSort: { field: 'grupo', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    // Consultas com id_emp nulo valem para todas as contas
    scopeSql: '(t.id_emp = ? OR t.id_emp IS NULL OR t.id_emp = 0)',
    tenantColumn: 'id_emp',
    details: [{ resource: 'consultas_parametros', foreignKey: 'id_consulta', label: 'Parâmetros da Consulta' }],
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'grupo', label: 'Grupo', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 30 },
      { name: 'titulo', label: 'Título', type: 'text', required: true, listed: true, searchable: true, filterable: true, maxLength: 50 },
      { name: 'descricao', label: 'Descrição', type: 'textarea', listed: true, searchable: true },
      { name: 'arquivo', label: 'Arquivo do Relatório', type: 'text', maxLength: 120 },
      { name: 'sql', label: 'SQL', type: 'textarea', required: true, hint: 'Use :NOME para os parâmetros e :ID_EMP para isolar a conta' },
    ],
  },
  {
    name: 'consultas_parametros',
    table: 'consultas_parametros',
    label: 'Parâmetros das Consultas',
    labelSingular: 'Parâmetro',
    description: 'Campos preenchidos antes de rodar a consulta',
    icon: 'SlidersHorizontal',
    group: 'sistema',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'caption_parametro',
    defaultSort: { field: 'Id', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: '? > 0',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_consulta', label: 'Consulta', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'consultas', labelField: 'titulo' } },
      { name: 'caption_parametro', label: 'Rótulo', type: 'text', required: true, listed: true, searchable: true, maxLength: 30 },
      { name: 'id_parametro', label: 'Nome do Parâmetro', type: 'text', required: true, listed: true, maxLength: 15, hint: 'Sem os dois-pontos: DATA_INICIAL' },
      { name: 'tipo_parametro', label: 'Tipo', type: 'enum', required: true, listed: true, width: 'sm', options: [
        { value: 'D', label: 'Data' },
        { value: 'N', label: 'Número' },
        { value: 'S', label: 'Texto' },
      ] },
      { name: 'valor_padrao', label: 'Valor Padrão', type: 'text', listed: true, maxLength: 80 },
      { name: 'valor_teste', label: 'Valor de Teste', type: 'text', maxLength: 80 },
    ],
  },
  {
    name: 'versoes',
    table: 'versoes',
    label: 'Versões',
    labelSingular: 'Versão',
    description: 'Novidades, melhorias e correções por versão',
    icon: 'History',
    group: 'sistema',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'versao',
    defaultSort: { field: 'data_lancamento', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: '? > 0',
    details: [{ resource: 'versoes_detalhes', foreignKey: 'id_versao', label: 'Implementações da Versão' }],
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'versao', label: 'Versão', type: 'text', required: true, listed: true, searchable: true, maxLength: 10, width: 'sm' },
      { name: 'data_lancamento', label: 'Data de Lançamento', type: 'date', listed: true, filterable: true },
    ],
  },
  {
    name: 'versoes_detalhes',
    table: 'versoes_detalhes',
    label: 'Implementações',
    labelSingular: 'Implementação',
    description: 'Cada novidade, melhoria ou correção de uma versão',
    icon: 'ListChecks',
    group: 'sistema',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'descricao_erro',
    defaultSort: { field: 'datahora_inclusao', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: '? > 0',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_versao', label: 'Versão', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'versoes', labelField: 'versao' } },
      { name: 'tipo_alteracao', label: 'Tipo', type: 'enum', listed: true, filterable: true, width: 'sm', options: [
        { value: 'N', label: 'Novidade' },
        { value: 'M', label: 'Melhoria' },
        { value: 'C', label: 'Correção' },
      ] },
      { name: 'descricao_erro', label: 'Implementação', type: 'textarea', required: true, listed: true, searchable: true },
      { name: 'datahora_inclusao', label: 'Incluído em', type: 'datetime', listed: true, filterable: true },
      { name: 'descricao_correcao', label: 'Descrição da Correção', type: 'textarea', searchable: true },
      { name: 'datahora_correcao', label: 'Corrigido em', type: 'datetime', filterable: true },
      { name: 'status', label: 'Status', type: 'enum', listed: true, filterable: true, width: 'sm', options: [
        { value: 'A', label: 'Aberto' },
        { value: 'F', label: 'Concluído' },
      ] },
    ],
  },

  // ============================================================
  // LANÇAMENTOS — a tela própria fica em /lancamentos, mas o recurso
  // continua registrado para as gravações e para a busca avançada.
  // ============================================================
  {
    name: 'lancamentos',
    table: 'lancamentos',
    label: 'Lançamentos',
    labelSingular: 'Lançamento',
    description: 'Receitas e despesas, previstas e realizadas',
    icon: 'PencilLine',
    group: 'planejamento',
    hidden: true,
    pk: ['Id'],
    autoIncrement: true,
    labelField: 'historico',
    defaultSort: { field: 'data_sort', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    scopeSql: 't.id_emp = ?',
    tenantColumn: 'id_emp',
    fields: [
      { name: 'Id', label: 'Id', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'id_categoria', label: 'Sub-Categoria', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'categorias_sub', labelField: 'descricao' } },
      { name: 'data_prevista', label: 'Data Prevista', type: 'date', listed: true, filterable: true },
      { name: 'valor_previsto', label: 'Valor Previsto', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'data_realizado', label: 'Data Realizada', type: 'date', listed: true, filterable: true },
      { name: 'valor_realizado', label: 'Valor Realizado', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'data_sort', label: 'Data de Ordenação', type: 'date', readOnly: true, listed: true, filterable: true, hint: 'A data realizada quando existe; senão, a prevista' },
      { name: 'data_compra', label: 'Data da Compra', type: 'date', filterable: true, hint: 'Usada quando o pagamento é com cartão de crédito' },
      { name: 'historico', label: 'Histórico', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 40 },
      { name: 'tipo_doc', label: 'Tipo do Documento', type: 'text', required: true, listed: true, filterable: true, maxLength: 2, width: 'sm', ref: { resource: 'tipos_doc', labelField: 'descricao' } },
      { name: 'documento', label: 'Documento', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 15, width: 'sm' },
      { name: 'id_cc', label: 'Centro de Custo', type: 'number', listed: true, filterable: true, ref: { resource: 'centroscustos', labelField: 'descricao' } },
      { name: 'id_banco', label: 'Banco', type: 'number', listed: true, filterable: true, ref: { resource: 'bancos', labelField: 'descricao' } },
      { name: 'id_limite', label: 'Limite / Forma de Pagamento', type: 'number', listed: true, filterable: true, ref: { resource: 'limites', labelField: 'descricao' } },
      { name: 'id_meta', label: 'Meta', type: 'number', listed: true, filterable: true, ref: { resource: 'metas', labelField: 'descricao' } },
      { name: 'analise', label: 'Entra na Análise', type: 'boolean', sn: true, listed: true, filterable: true, width: 'sm' },
      { name: 'recorrente', label: 'Recorrente', type: 'boolean', sn: true, listed: true, filterable: true, width: 'sm' },
      { name: 'status', label: 'Status', type: 'enum', listed: true, filterable: true, width: 'sm', options: STATUS_LANCAMENTO },
      { name: 'comprovante_link', label: 'Comprovante', type: 'text', maxLength: 120 },
      { name: 'fitid', label: 'Id do OFX', type: 'text', readOnly: true, maxLength: 20, hint: 'Identificador do lançamento no arquivo do banco' },
      { name: 'datahora_inclusao', label: 'Incluído em', type: 'datetime', readOnly: true, filterable: true },
      { name: 'datahora_alteracao', label: 'Alterado em', type: 'datetime', readOnly: true, filterable: true },
    ],
  },
];

export const RESOURCE_MAP: Record<string, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.name, r]),
);

export function getResource(name: string): ResourceDef | null {
  return Object.prototype.hasOwnProperty.call(RESOURCE_MAP, name) ? RESOURCE_MAP[name] : null;
}

/** Colunas graváveis: exclui readOnly, PK auto-increment e a coluna da conta */
export function writableFields(resource: ResourceDef): FieldDef[] {
  return resource.fields.filter((f) => {
    if (f.readOnly) return false;
    if (f.name === resource.tenantColumn) return false;
    if (resource.autoIncrement && resource.pk.includes(f.name)) return false;
    return true;
  });
}

/** Todas as colunas conhecidas — whitelist de ordenação e de filtro */
export function columnNames(resource: ResourceDef): string[] {
  return resource.fields.map((f) => f.name);
}
