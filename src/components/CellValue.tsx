import React from 'react';
import { FieldDef, OpcaoRef, RegistroCrud } from '../types';
import { formatCellValue, STATUS_COLORS, ehVerdadeiro } from '../utils/formatters';

interface CellValueProps {
  field: FieldDef;
  row: RegistroCrud;
  /** Opções já carregadas dos campos de chave estrangeira, por nome de campo */
  refOptions: Record<string, OpcaoRef[]>;
}

/**
 * Renderiza uma célula de grade conforme o tipo do campo: resolve o rótulo das
 * chaves estrangeiras e desenha selos para enumerações e booleanos.
 * Compartilhado pela listagem principal e pelas grades de detalhe.
 */
export const CellValue: React.FC<CellValueProps> = ({ field, row, refOptions }) => {
  const value = row[field.name];

  if (field.ref) {
    if (value === null || value === undefined || value === '' || Number(value) === 0) {
      return <span className="text-stone-400">—</span>;
    }
    const opt = refOptions[field.name]?.find((o) => o.value === String(value));
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="truncate">{opt ? opt.label : `#${value}`}</span>
        <span className="text-[10px] text-stone-400 font-mono shrink-0">#{value}</span>
      </span>
    );
  }

  if (field.type === 'enum' && value) {
    const badge = STATUS_COLORS[String(value)];
    const label = field.options?.find((o) => o.value === String(value))?.label || String(value);
    return (
      <span
        className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
          badge ||
          'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
        }`}
      >
        {label}
      </span>
    );
  }

  if (field.type === 'boolean') {
    const on = ehVerdadeiro(value);
    return (
      <span
        className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          on
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
            : 'bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
        }`}
      >
        {on ? 'Sim' : 'Não'}
      </span>
    );
  }

  const isNumeric = field.type === 'decimal' || field.type === 'number' || field.type === 'cnpj';
  return <span className={isNumeric ? 'font-mono' : undefined}>{formatCellValue(field, value)}</span>;
};
