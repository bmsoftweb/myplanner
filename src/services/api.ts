import {
  ResourceDef,
  ListaPaginada,
  FiltroAvancado,
  RegistroCrud,
  OpcaoRef,
  DbConnectionStatus,
  DashboardData,
  Conta,
  UsuarioSessao,
  ConfigUsuario,
  Lancamento,
  LinhaPlanejamento,
} from '../types';

/**
 * O id_emp da sessão acompanha toda requisição no cabeçalho x-id-emp: é ele que
 * isola os dados da conta em todas as consultas do servidor. O x-id-usuario
 * distingue o dono da conta (0) de um usuário cadastrado dentro dela.
 */
let idEmpAtual: string | null = null;
let idUsuarioAtual: string | null = null;

export function setSessaoApi(idEmp: string | null, idUsuario: string | null) {
  idEmpAtual = idEmp;
  idUsuarioAtual = idUsuario;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (idEmpAtual) h['x-id-emp'] = idEmpAtual;
  if (idUsuarioAtual !== null) h['x-id-usuario'] = idUsuarioAtual;
  return h;
}

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro: any = new Error(data?.error || `Falha na requisição (HTTP ${res.status}).`);
    erro.dados = data;
    erro.status = res.status;
    throw erro;
  }
  return data;
}

// ------------------------------------------------------------
// Entrar e cadastrar
// ------------------------------------------------------------
export interface RespostaLogin {
  success: boolean;
  conta: Conta;
  usuario: UsuarioSessao;
  config: ConfigUsuario;
}

export async function entrar(email: string, senha: string): Promise<RespostaLogin> {
  const res = await fetch('/api/app/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  return parseOrThrow(res);
}

export async function cadastrar(dados: {
  nome: string;
  email: string;
  cpfcnpj: string;
  senha: string;
  senha2: string;
  id_plano: number;
  termos: boolean;
}): Promise<{ success: boolean; chave?: string; enviado: boolean; message: string }> {
  const res = await fetch('/api/app/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function ativarConta(chave: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/app/ativar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave }),
  });
  return parseOrThrow(res);
}

export async function reenviarChave(email: string): Promise<{ success: boolean; chave?: string; enviado: boolean; message: string }> {
  const res = await fetch('/api/app/reenviar-chave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseOrThrow(res);
}

export async function recuperarSenha(email: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/app/recuperar-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseOrThrow(res);
}

/**
 * Confere se a sessão guardada no navegador continua valendo.
 * Só devolve false quando o servidor recusa; falha de rede devolve null, para
 * não derrubar ninguém por instabilidade.
 */
export async function validarSessao(): Promise<{ valida: boolean | null; error?: string; config?: ConfigUsuario; id_plano?: number }> {
  try {
    const res = await fetch('/api/app/sessao', { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { valida: false, error: data?.error };
    return res.ok ? { valida: true, config: data.config, id_plano: data.id_plano } : { valida: null, error: data?.error };
  } catch {
    return { valida: null };
  }
}

// ------------------------------------------------------------
// Conta, plano e configuração
// ------------------------------------------------------------
export async function lerMeusDados(): Promise<any> {
  return parseOrThrow(await fetch('/api/app/meus-dados', { headers: headers() }));
}

export async function gravarMeusDados(dados: { nome: string; cpfcnpj: string; senha?: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/app/meus-dados', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function lerPlanos(): Promise<{
  planos: { id: number; nome: string; valor: number; limite: number; descricao: string }[];
  id_plano: number;
  cpfcnpj: string;
  lancamentosNoMes: number;
}> {
  return parseOrThrow(await fetch('/api/app/planos', { headers: headers() }));
}

export async function gravarPlano(id_plano: number, cpfcnpj: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/app/planos', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id_plano, cpfcnpj }),
  });
  return parseOrThrow(res);
}

export async function lerConfigUsuario(): Promise<ConfigUsuario> {
  return parseOrThrow(await fetch('/api/app/config', { headers: headers() }));
}

export async function gravarConfigUsuario(config: ConfigUsuario): Promise<{ success: boolean; config: ConfigUsuario }> {
  const res = await fetch('/api/app/config', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(config),
  });
  return parseOrThrow(res);
}

export async function enviarSenhaDoUsuario(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/app/usuarios/${encodeURIComponent(id)}/enviar-senha`, {
    method: 'POST',
    headers: headers(),
  });
  return parseOrThrow(res);
}

/** Preferências das listas (larguras e ordem das colunas) */
export async function fetchConfigListas(): Promise<Record<string, unknown>> {
  return parseOrThrow(await fetch('/api/app/config-listas', { headers: headers() }));
}

/**
 * Grava as preferências. Devolve `guardado: false` quando a sessão é a do dono
 * da conta, que não tem linha em usuarios — nesse caso nada é gravado.
 */
export async function saveConfigListas(
  config: Record<string, unknown>,
): Promise<{ guardado: boolean; motivo?: string }> {
  const res = await fetch('/api/app/config-listas', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(config),
  });
  const dados = await parseOrThrow(res);
  return { guardado: dados?.guardado !== false, motivo: dados?.motivo };
}

// ------------------------------------------------------------
// Metadados e painel
// ------------------------------------------------------------
export async function fetchResources(): Promise<ResourceDef[]> {
  return parseOrThrow(await fetch('/api/meta/resources', { headers: headers() }));
}

export async function fetchDbStatus(): Promise<DbConnectionStatus> {
  try {
    const res = await fetch('/api/db/status', { headers: headers() });
    return await res.json();
  } catch (err: any) {
    return { connected: false, latencyMs: 0, error: err.message || 'Falha ao conectar com a API' };
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  return parseOrThrow(await fetch('/api/dashboard', { headers: headers() }));
}

// ------------------------------------------------------------
// CRUD genérico
// ------------------------------------------------------------
export async function listRecords(
  resource: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    filterField?: string;
    filterValue?: string;
    filters?: FiltroAvancado[];
  } = {},
): Promise<ListaPaginada> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.filterField && params.filterValue) {
    qs.set('filter_field', params.filterField);
    qs.set('filter_value', params.filterValue);
  }
  if (params.filters && params.filters.length) {
    qs.set('filters', JSON.stringify(params.filters));
  }

  const res = await fetch(`/api/crud/${resource}?${qs.toString()}`, { headers: headers() });
  return parseOrThrow(res);
}

export async function getRecord(resource: string, id: string): Promise<RegistroCrud> {
  return parseOrThrow(await fetch(`/api/crud/${resource}/${encodeURIComponent(id)}`, { headers: headers() }));
}

export async function createRecord(resource: string, payload: RegistroCrud): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`/api/crud/${resource}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function updateRecord(resource: string, id: string, payload: RegistroCrud): Promise<{ success: boolean }> {
  const res = await fetch(`/api/crud/${resource}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function deleteRecord(resource: string, id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/crud/${resource}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Lançamentos
// ------------------------------------------------------------
export interface CombosLancamentos {
  categorias: { Id: number; codigo: string; descricao: string; tipo: string }[];
  subcategorias: { Id: number; id_cat: number; codigo: string; descricao: string }[];
  centros: { Id: number; descricao: string }[];
  bancos: { Id: number; descricao: string; apelido: string }[];
  limites: { Id: number; descricao: string; cartao_credito: string; dia_fechamento: number; dia_vencimento: number }[];
  metas: { Id: number; descricao: string }[];
  tiposDoc: { tipo: string; descricao: string }[];
  config: ConfigUsuario;
  plano: { plano: { id: number; nome: string; limite: number }; usados: number; podeIncluir: boolean; mensagem: string };
}

export async function lerCombosLancamentos(): Promise<CombosLancamentos> {
  return parseOrThrow(await fetch('/api/lancamentos/combos', { headers: headers() }));
}

export interface FiltrosLancamentos {
  d1?: string;
  d2?: string;
  documento?: string;
  historico?: string;
  id_banco?: string;
  id_categoria?: string;
  tipo_doc?: string;
  comCartao?: boolean;
  comPrevisao?: boolean;
}

function queryLancamentos(filtros: FiltrosLancamentos): string {
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    qs.set(chave, String(valor));
  }
  return qs.toString();
}

export async function listarLancamentos(filtros: FiltrosLancamentos): Promise<{
  data: Lancamento[];
  total: number;
  /** Verdadeiro quando o servidor cortou a listagem no teto de linhas */
  limitado?: boolean;
  limite?: number;
  totais: { previsto: number; realizado: number };
}> {
  return parseOrThrow(await fetch(`/api/lancamentos?${queryLancamentos(filtros)}`, { headers: headers() }));
}

export async function lerLancamento(id: string | number): Promise<Lancamento & { id_cat: number | null }> {
  return parseOrThrow(await fetch(`/api/lancamentos/${id}`, { headers: headers() }));
}

export async function gravarLancamento(id: string | number | null, dados: Record<string, any>): Promise<{ success: boolean; id?: string }> {
  const res = await fetch(id ? `/api/lancamentos/${id}` : '/api/lancamentos', {
    method: id ? 'PUT' : 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function excluirLancamento(id: string | number): Promise<{ success: boolean }> {
  return parseOrThrow(await fetch(`/api/lancamentos/${id}`, { method: 'DELETE', headers: headers() }));
}

export async function gravarRecorrentes(dados: Record<string, any>): Promise<{ success: boolean; gerados: number; primeira: string; ultima: string }> {
  const res = await fetch('/api/lancamentos/recorrentes', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function preverDatasRecorrentes(dados: Record<string, any>): Promise<{ datas: string[]; primeira: string; ultima: string }> {
  const res = await fetch('/api/lancamentos/recorrentes/datas', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function enviarComprovante(id: string | number, arquivo: File): Promise<{ success: boolean; link: string }> {
  const res = await fetch(`/api/lancamentos/${id}/comprovante`, {
    method: 'POST',
    headers: headers({
      'Content-Type': arquivo.type || 'application/octet-stream',
      'x-nome-arquivo': arquivo.name,
    }),
    body: arquivo,
  });
  return parseOrThrow(res);
}

export async function removerComprovante(id: string | number): Promise<{ success: boolean }> {
  return parseOrThrow(await fetch(`/api/lancamentos/${id}/comprovante`, { method: 'DELETE', headers: headers() }));
}

/** Monta a URL do CSV; o navegador baixa o arquivo direto do servidor */
export function urlExportarLancamentos(filtros: FiltrosLancamentos): string {
  const qs = new URLSearchParams(queryLancamentos(filtros));
  if (idEmpAtual) qs.set('x_id_emp', idEmpAtual);
  return `/api/lancamentos-exportar?${qs.toString()}`;
}

/** Baixa o CSV passando os cabeçalhos da sessão e salva pelo navegador */
export async function baixarLancamentosCsv(filtros: FiltrosLancamentos): Promise<void> {
  const res = await fetch(`/api/lancamentos-exportar?${queryLancamentos(filtros)}`, { headers: headers() });
  if (!res.ok) throw new Error('Falha ao gerar o arquivo de exportação.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lancamentos_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// Planejamento
// ------------------------------------------------------------
export async function lerPlanejamento(ano: number): Promise<{
  ano: number;
  data: LinhaPlanejamento[];
  totalGeral: { meses: { previsto: number; realizado: number }[]; total_previsto: number; total_realizado: number };
}> {
  return parseOrThrow(await fetch(`/api/planejamento?ano=${ano}`, { headers: headers() }));
}

export async function lerDetalhePlanejamento(params: {
  ano: number;
  mes: number;
  id_subcat: number;
  coluna: 'pre' | 'rea';
}): Promise<{ data: any[]; total: number }> {
  const qs = new URLSearchParams({
    ano: String(params.ano),
    mes: String(params.mes),
    id_subcat: String(params.id_subcat),
    coluna: params.coluna,
  });
  return parseOrThrow(await fetch(`/api/planejamento/detalhe?${qs}`, { headers: headers() }));
}

// ------------------------------------------------------------
// Bancos: extrato, transferência e OFX
// ------------------------------------------------------------
export async function lerExtrato(idBanco: string | number, d1: string, d2: string): Promise<any> {
  const qs = new URLSearchParams({ d1, d2 });
  return parseOrThrow(await fetch(`/api/bancos/${idBanco}/extrato?${qs}`, { headers: headers() }));
}

export async function gravarTransferencia(dados: Record<string, any>): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/bancos/transferencia', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  });
  return parseOrThrow(res);
}

export async function lerArquivoOfx(idBanco: string | number, conteudo: string): Promise<{ data: any[] }> {
  const res = await fetch(`/api/bancos/${idBanco}/ofx/ler`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ conteudo }),
  });
  return parseOrThrow(res);
}

export async function gravarImportacaoOfx(idBanco: string | number, itens: any[]): Promise<{ success: boolean; gravados: number; message: string }> {
  const res = await fetch(`/api/bancos/${idBanco}/ofx/gravar`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itens }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Limites: fatura do cartão e análise
// ------------------------------------------------------------
export async function lerFaturaCartao(idLimite: string | number, deslocamento: number): Promise<any> {
  return parseOrThrow(
    await fetch(`/api/limites/${idLimite}/fatura?deslocamento=${deslocamento}`, { headers: headers() }),
  );
}

export async function lerAnaliseLimite(idLimite: string | number): Promise<{
  limite: { id: string; descricao: string };
  data: { ano: number; mes: number; limite: number; realizado: number }[];
}> {
  return parseOrThrow(await fetch(`/api/limites/${idLimite}/analise`, { headers: headers() }));
}

// ------------------------------------------------------------
// Consultas
// ------------------------------------------------------------
export interface ConsultaCadastrada {
  Id: number;
  grupo: string;
  titulo: string;
  descricao: string;
  arquivo: string;
  parametros: {
    Id: number;
    caption_parametro: string;
    id_parametro: string;
    tipo_parametro: string;
    valor_padrao: string;
  }[];
}

export async function listarConsultas(): Promise<{ data: ConsultaCadastrada[] }> {
  return parseOrThrow(await fetch('/api/consultas-disponiveis', { headers: headers() }));
}

export async function executarConsulta(
  id: number,
  parametros: Record<string, any>,
): Promise<{ titulo: string; colunas: string[]; data: any[]; total: number }> {
  const res = await fetch(`/api/consultas/${id}/executar`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ parametros }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Categorias padrão
// ------------------------------------------------------------
export async function lerCategoriasPadrao(): Promise<{ podeCriar: boolean; jaCadastradas: number; disponiveis: { fj: string; total: number }[] }> {
  return parseOrThrow(await fetch('/api/categorias/padroes', { headers: headers() }));
}

export async function criarCategoriasPadrao(fj: 'F' | 'J'): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/categorias/padroes', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fj }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Combos de chave estrangeira, com cache em memória
// ------------------------------------------------------------
const optionsCache = new Map<string, OpcaoRef[]>();

export async function fetchOptions(resource: string, labelField: string): Promise<OpcaoRef[]> {
  const key = `${resource}:${labelField}`;
  const cached = optionsCache.get(key);
  if (cached) return cached;

  const res = await fetch(`/api/options/${resource}?label_field=${encodeURIComponent(labelField)}`, {
    headers: headers(),
  });
  const data = await parseOrThrow(res);
  optionsCache.set(key, data);
  return data;
}

/** Invalida o cache de combos após gravações que alteram listas de referência */
export function invalidateOptions(resource?: string) {
  if (!resource) {
    optionsCache.clear();
    return;
  }
  for (const key of Array.from(optionsCache.keys())) {
    if (key.startsWith(`${resource}:`)) optionsCache.delete(key);
  }
}
