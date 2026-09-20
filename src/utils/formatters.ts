import { FieldDef } from '../types';

/**
 * Um campo sim/não pode chegar como 1/0 (coluna numérica) ou como 'S'/'N'
 * (coluna char(1), que é o padrão deste banco). As duas formas são aceitas.
 */
export function ehVerdadeiro(valor: any): boolean {
  if (valor === true || valor === 1) return true;
  const texto = String(valor ?? '').trim().toUpperCase();
  return texto === '1' || texto === 'S' || texto === 'TRUE' || texto === 'SIM';
}

/** Máscara de CPF (11 dígitos) ou CNPJ (14 dígitos), conforme o que foi digitado */
export function mascaraCpfCnpj(valor: string): string {
  const n = String(valor || '').replace(/\D/g, '').slice(0, 14);
  if (n.length <= 11) {
    if (n.length > 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
    if (n.length > 6) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    if (n.length > 3) return `${n.slice(0, 3)}.${n.slice(3)}`;
    return n;
  }
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export function limparCpfCnpj(valor: string): string {
  return String(valor || '').replace(/\D/g, '');
}

/** Mantido para os campos de tipo cnpj do registro de metadados */
export function formatCNPJ(cnpj: string): string {
  return mascaraCpfCnpj(cnpj);
}

export function cleanCNPJ(cnpj: string): string {
  return limparCpfCnpj(cnpj);
}

export function maskCNPJ(value: string): string {
  return mascaraCpfCnpj(value);
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

/** Valor com duas casas e sem o símbolo da moeda — o padrão das grades */
export function formatValor(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatNumberBR(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split(' ')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export function formatDateTimeBR(dateStr: string): string {
  if (!dateStr) return '—';
  const normalized = String(dateStr).replace(' ', 'T');
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Converte o valor do MySQL para o formato aceito pelos campos de data */
export function toInputDate(value: any): string {
  if (!value) return '';
  return String(value).replace(' ', 'T').slice(0, 10);
}

export function toInputDateTime(value: any): string {
  if (!value) return '';
  return String(value).replace(' ', 'T').slice(0, 16);
}

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ------------------------------------------------------------
// Datas no horário de Brasília (o sistema nunca trabalha em UTC)
// ------------------------------------------------------------
function local(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export function hoje(): string {
  return local(new Date());
}

export function primeiroDiaDoMes(referencia = new Date()): string {
  return local(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
}

export function ultimoDiaDoMes(referencia = new Date()): string {
  return local(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0));
}

export function inicioDaSemana(referencia = new Date()): string {
  const d = new Date(referencia);
  d.setDate(d.getDate() - d.getDay());
  return local(d);
}

export function fimDaSemana(referencia = new Date()): string {
  const d = new Date(referencia);
  d.setDate(d.getDate() - d.getDay() + 6);
  return local(d);
}

export function primeiroDiaDoAno(ano: number): string {
  return `${ano}-01-01`;
}

export function ultimoDiaDoAno(ano: number): string {
  return `${ano}-12-31`;
}

/** Renderização de uma célula da grade conforme o tipo do campo */
export function formatCellValue(field: FieldDef, value: any): string {
  if (value === null || value === undefined || value === '') return '—';

  switch (field.type) {
    case 'cnpj':
      return mascaraCpfCnpj(String(value));
    case 'boolean':
      return ehVerdadeiro(value) ? 'Sim' : 'Não';
    case 'date':
      return formatDateBR(String(value));
    case 'datetime':
      return formatDateTimeBR(String(value));
    case 'decimal': {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: field.scale ?? 2,
        maximumFractionDigits: field.scale ?? 2,
      }).format(n);
    }
    case 'number':
      // Número que não é quantidade (um ano) sai sem o ponto de milhar
      return field.semAgrupamento
        ? String(Math.trunc(Number(value)))
        : formatNumberBR(Number(value));
    case 'enum': {
      const opt = field.options?.find((o) => o.value === String(value));
      return opt ? opt.label : String(value);
    }
    case 'password':
      return '••••••••';
    default: {
      const text = String(value);
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
  }
}

/** Cores de destaque por valor de enumeração, usadas nas grades */
export const STATUS_COLORS: Record<string, string> = {
  // Lançamentos
  P: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  O: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  // Categorias
  R: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  D: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  // Contas
  C: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  A: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800',
};

export const GROUP_LABELS: Record<string, string> = {
  planejamento: 'Planejamento',
  cadastros: 'Cadastros',
  acesso: 'Acesso',
  sistema: 'Sistema',
};
