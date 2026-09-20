import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, AlertCircle, Loader2, Eye, EyeOff, X, Columns3, Search, Move, Scaling, RotateCcw } from 'lucide-react';
import { FieldDef, OpcaoRef, RegistroCrud, ResourceDef } from '../types';
import { maskCNPJ, cleanCNPJ, toInputDate, toInputDateTime, ehVerdadeiro } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import type { TamanhoCampo } from '../utils/configListas';

interface RecordFormProps {
  resource: ResourceDef;
  /** Registro em edição; `null` indica inclusão */
  record: RegistroCrud | null;
  refOptions: Record<string, OpcaoRef[]>;
  onCancel: () => void;
  onSave: (payload: RegistroCrud) => Promise<void>;
  /** Campos que hoje aparecem como coluna na lista */
  colunasVisiveis?: string[];
  /** Mostra/oculta o campo como coluna da lista */
  onAlternarColuna?: (campo: string) => void;
  /** Campos que hoje aparecem na busca avançada */
  camposBusca?: string[];
  /** Mostra/oculta o campo na busca avançada */
  onAlternarBusca?: (campo: string) => void;
  /** Ordem dos campos escolhida pelo usuário (arrastando pelo ícone de mover) */
  ordemCampos?: string[];
  onReordenarCampos?: (ordem: string[]) => void;
  /** Largura (colunas de 4) e altura escolhidas em "Customizar layout" */
  tamanhosCampos?: Record<string, TamanhoCampo>;
  onRedimensionarCampo?: (campo: string, tamanho: TamanhoCampo) => void;
  /** Volta tamanhos e posições dos campos ao padrão do app */
  onRestaurarPadrao?: () => void;
  /** Grava as preferências (usuarios.config_listas) ao concluir a customização */
  onSalvarLayout?: () => void;
}

/** Colunas do formulário no desktop (tem que bater com lg:grid-cols-4 do grid) */
const COLUNAS_FORM = 4;

/**
 * Alças de redimensionamento: 4 cantos + 4 meios. Ficam por fora do campo, cobrindo a borda
 * (outline a 4px) e passando 2px dela.
 */
const ALCAS: { dir: string; className: string }[] = [
  { dir: 'nw', className: 'top-0 left-0 -translate-x-full -translate-y-full cursor-nwse-resize' },
  { dir: 'n', className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full cursor-ns-resize' },
  { dir: 'ne', className: 'top-0 right-0 translate-x-full -translate-y-full cursor-nesw-resize' },
  { dir: 'e', className: 'top-1/2 right-0 translate-x-full -translate-y-1/2 cursor-ew-resize' },
  { dir: 'se', className: 'bottom-0 right-0 translate-x-full translate-y-full cursor-nwse-resize' },
  { dir: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full cursor-ns-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 -translate-x-full translate-y-full cursor-nesw-resize' },
  { dir: 'w', className: 'top-1/2 left-0 -translate-x-full -translate-y-1/2 cursor-ew-resize' },
];

/** Valor inicial de cada campo ao abrir o formulário */
function initialValue(field: FieldDef, record: RegistroCrud | null): any {
  if (record) {
    const raw = record[field.name];
    if (raw === null || raw === undefined) return '';
    if (field.type === 'boolean') return ehVerdadeiro(raw);
    if (field.type === 'date') return toInputDate(raw);
    if (field.type === 'datetime') return toInputDateTime(raw);
    if (field.type === 'cnpj') return maskCNPJ(String(raw));
    if (field.type === 'password') return '';
    if (field.type === 'json') return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    return String(raw);
  }

  // Padrões sensatos para um registro novo
  switch (field.type) {
    case 'boolean':
      // Lançamento novo já entra na análise; os demais sim/não começam desligados
      return field.name === 'analise' || field.name === 'relatorio' || field.name === 'ativo';
    case 'number':
      return '';
    case 'decimal':
      return '';
    case 'enum':
      return field.required ? field.options?.[0]?.value ?? '' : '';
    default:
      return '';
  }
}

export const RecordForm: React.FC<RecordFormProps> = ({
  resource,
  record,
  refOptions,
  onCancel,
  onSave,
  colunasVisiveis,
  onAlternarColuna,
  camposBusca,
  onAlternarBusca,
  ordemCampos = [],
  onReordenarCampos,
  tamanhosCampos = {},
  onRedimensionarCampo,
  onRestaurarPadrao,
  onSalvarLayout,
}) => {
  const isEdit = Boolean(record);
  // Ícones de customização dos rótulos (coluna, lupa, mover) começam escondidos
  const [mostrarIcones, setMostrarIcones] = useState(false);

  /** Rótulo do campo + botão que mostra/oculta o campo como coluna da lista */
  const rotulo = (f: FieldDef) => {
    const naLista = colunasVisiveis?.includes(f.name) ?? false;
    const naBusca = camposBusca?.includes(f.name) ?? false;
    return (
      <div className="flex items-center gap-1.5 min-h-[18px]">
        <label htmlFor={`form-${resource.name}-${f.name}`} className={LABEL_CLASS}>
          {f.label}
          {f.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        {mostrarIcones && onAlternarColuna && f.type !== 'password' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAlternarColuna(f.name)}
            title={naLista ? 'Ocultar esta coluna da lista' : 'Mostrar esta coluna na lista'}
            aria-pressed={naLista}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              naLista
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
        )}
        {mostrarIcones && onAlternarBusca && f.type !== 'password' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAlternarBusca(f.name)}
            title={naBusca ? 'Tirar este campo da busca avançada' : 'Usar este campo na busca avançada'}
            aria-pressed={naBusca}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              naBusca
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
        {mostrarIcones && onReordenarCampos && (
          <span
            draggable
            onDragStart={(e) => {
              arrastando.current = f;
              e.dataTransfer.effectAllowed = 'move';
              // A "fotografia" arrastada é o campo inteiro, não só o ícone
              const campo = (e.currentTarget as HTMLElement).closest('[data-campo]');
              if (campo) e.dataTransfer.setDragImage(campo, 12, 12);
            }}
            onDragEnd={() => {
              arrastando.current = null;
              setAlvo(null);
            }}
            title="Arraste para reposicionar o campo"
            className="ml-auto p-0.5 rounded cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
          >
            <Move className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  };

  const editableFields = useMemo(
    () =>
      resource.fields.filter((f) => {
        if (f.readOnly) return false;
        if (resource.autoIncrement && resource.pk.includes(f.name)) return false;
        // A chave composta não pode ser alterada depois de criada
        if (isEdit && !resource.autoIncrement && resource.pk.includes(f.name)) return false;
        return true;
      })
      .sort((a, b) => {
        const pos = (nome: string) => {
          const i = ordemCampos.indexOf(nome);
          return i < 0 ? ordemCampos.length : i;
        };
        return pos(a.name) - pos(b.name);
      }),
    [resource, isEdit, ordemCampos],
  );

  // Arraste de campos: todos os campos deste formulário dividem o mesmo contêiner
  const arrastando = useRef<FieldDef | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const conteiner = (_f: FieldDef) => 'principal';

  const propsArraste = (f: FieldDef) =>
    onReordenarCampos
      ? {
          'data-campo': f.name,
          onDragOver: (e: React.DragEvent) => {
            const origem = arrastando.current;
            if (!origem || conteiner(origem) !== conteiner(f)) return; // fora do contêiner: não aceita
            e.preventDefault();
            if (alvo !== f.name) setAlvo(f.name);
          },
          onDragLeave: () => setAlvo((atual) => (atual === f.name ? null : atual)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const origem = arrastando.current;
            arrastando.current = null;
            setAlvo(null);
            if (!origem || origem.name === f.name || conteiner(origem) !== conteiner(f)) return;
            const nomes = editableFields.map((c) => c.name).filter((n) => n !== origem.name);
            nomes.splice(nomes.indexOf(f.name), 0, origem.name);
            onReordenarCampos(nomes);
          },
        }
      : {};

  const readOnlyFields = useMemo(
    () => resource.fields.filter((f) => f.readOnly && record && record[f.name] != null),
    [resource, record],
  );

  const [values, setValues] = useState<Record<string, any>>(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    return next;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);

  // Recarrega o formulário quando a aba passa a apontar para outro registro
  useEffect(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    setValues(next);
    setError(null);
    setRevealPassword(false);
  }, [record, editableFields]);

  /** Campo desabilitado pela regra disabledWhen do metadado (ex.: grupo de um admin) */
  const estaDesabilitado = (field: FieldDef, vals: Record<string, any> = values) =>
    Boolean(field.disabledWhen && String(vals[field.disabledWhen.field] ?? '') === field.disabledWhen.equals);

  const setValue = (name: string, value: any) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      // Campos que ficaram desabilitados por esta mudança perdem o valor
      for (const f of editableFields) {
        if (f.disabledWhen?.field === name && estaDesabilitado(f, next)) next[f.name] = '';
      }
      return next;
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Só o próprio formulário salva. Formulários de janelas abertas a partir daqui
    // (renderizadas em portal) também disparam este evento pela árvore do React.
    if (e.target !== e.currentTarget) return;
    setIsSaving(true);
    setError(null);

    try {
      const payload: RegistroCrud = {};
      for (const f of editableFields) {
        let v = values[f.name];
        if (f.type === 'cnpj') v = cleanCNPJ(String(v ?? ''));
        if (f.type === 'boolean') v = f.sn ? (v ? 'S' : 'N') : v ? 1 : 0;
        if (f.type === 'password' && String(v ?? '').trim() === '') continue;
        payload[f.name] = v === '' ? null : v;
      }
      await onSave(payload);
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = `${INPUT_CLASS} w-full`;

  const renderField = (field: FieldDef) => {
    const value = values[field.name] ?? '';
    const inputId = `form-${resource.name}-${field.name}`;

    // Chave estrangeira: combo alimentado pelo recurso referenciado
    if (field.ref) {
      const options = refOptions[field.name] || [];
      return (
        <select
          id={inputId}
          value={String(value ?? '')}
          onChange={(e) => setValue(field.name, e.target.value)}
          required={Boolean(field.required)}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">{field.required ? '— Selecione —' : '— Nenhum —'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} (#{o.value})
            </option>
          ))}
        </select>
      );
    }

    switch (field.type) {
      case 'boolean':
        return <Toggle id={inputId} checked={Boolean(value)} onChange={(v) => setValue(field.name, v)} />;

      case 'enum':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            required={Boolean(field.required)}
            className={`${inputClass} cursor-pointer`}
          >
            {!field.required && <option value="">— Nenhum —</option>}
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            rows={3}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={`${inputClass} resize-y`}
          />
        );

      case 'json':
        return (
          <textarea
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder='{"chave": "valor"}'
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        );

      case 'password':
        return (
          <div className="relative">
            <input
              id={inputId}
              type={revealPassword ? 'text' : 'password'}
              value={String(value ?? '')}
              onChange={(e) => setValue(field.name, e.target.value)}
              autoComplete="new-password"
              placeholder={isEdit ? 'Deixe em branco para manter a senha atual' : 'Defina a senha inicial'}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setRevealPassword((p) => !p)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
            >
              {revealPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );

      case 'cnpj':
        return (
          <input
            id={inputId}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, maskCNPJ(e.target.value))}
            maxLength={18}
            placeholder="00.000.000/0000-00"
            required={Boolean(field.required)}
            className={`${inputClass} font-mono`}
          />
        );

      case 'number':
      case 'decimal':
        return (
          <NumberField
            id={inputId}
            value={value}
            onChange={(v) => setValue(field.name, v)}
            scale={field.type === 'decimal' ? field.scale ?? 2 : 0}
            allowNegative={field.allowNegative}
            semAgrupamento={field.semAgrupamento}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );

      case 'date':
        return (
          <DateField
            id={inputId}
            value={String(value ?? '')}
            onChange={(v) => setValue(field.name, v)}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );

      case 'datetime':
        return (
          <DateField
            id={inputId}
            value={String(value ?? '')}
            onChange={(v) => setValue(field.name, v)}
            required={Boolean(field.required)}
            withTime
            className={inputClass}
          />
        );

      default:
        return (
          <input
            id={inputId}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );
    }
  };

  /** Campos longos ocupam a linha inteira do grid */
  const isWide = (f: FieldDef) => f.type === 'textarea' || f.type === 'json' || f.maxLength === 255;

  // "Customizar layout": cada campo ganha borda e alças; a largura anda em colunas de um grid
  // de 4 (no desktop) e a altura é a do controle, em px.
  const [customizando, setCustomizando] = useState(false);
  const gradeRef = useRef<HTMLDivElement>(null);
  const spanPadrao = (f: FieldDef) => (isWide(f) ? COLUNAS_FORM : 1);

  const iniciarRedimensionamentoCampo = (e: React.PointerEvent, f: FieldDef, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const grade = gradeRef.current;
    const campo = (e.currentTarget as HTMLElement).closest('[data-campo]') as HTMLElement | null;
    if (!grade || !campo || !onRedimensionarCampo) return;

    const estilo = getComputedStyle(grade);
    const gap = parseFloat(estilo.columnGap) || 0;
    const colunas = estilo.gridTemplateColumns.split(' ').length;
    const larguraColuna = (grade.clientWidth - gap * (colunas - 1)) / colunas;
    const controle = campo.querySelector('input:not([type=file]), select, textarea') as HTMLElement | null;
    const larguraInicial = campo.offsetWidth;
    const alturaInicial = controle?.offsetHeight || 0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const sinalX = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
    const sinalY = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;

    const mover = (ev: PointerEvent) => {
      const tamanho: TamanhoCampo = {};
      // A largura só existe no grid de COLUNAS_FORM colunas (desktop)
      if (sinalX && colunas === COLUNAS_FORM) {
        const largura = larguraInicial + sinalX * (ev.clientX - x0);
        tamanho.span = Math.min(COLUNAS_FORM, Math.max(1, Math.round((largura + gap) / (larguraColuna + gap))));
      }
      if (sinalY && controle) {
        tamanho.altura = Math.max(24, Math.round(alturaInicial + sinalY * (ev.clientY - y0)));
      }
      if (tamanho.span !== undefined || tamanho.altura !== undefined) onRedimensionarCampo(f.name, tamanho);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = getComputedStyle(e.currentTarget as Element).cursor;
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  /** Variáveis e classes que aplicam o tamanho escolhido ao contêiner do campo */
  const estiloTamanho = (f: FieldDef): React.CSSProperties => {
    const t = tamanhosCampos[f.name] || {};
    return {
      // span gravado no grid antigo (12) é limitado às colunas atuais
      ['--span' as string]: Math.min(t.span ?? spanPadrao(f), COLUNAS_FORM),
      ...(t.altura ? { ['--altura' as string]: `${t.altura}px` } : {}),
    } as React.CSSProperties;
  };
  const classeTamanho = (f: FieldDef) =>
    `campo-span ${tamanhosCampos[f.name]?.altura ? 'campo-altura' : ''} ${
      customizando ? 'relative outline outline-1 outline-blue-400 outline-offset-4' : ''
    }`;

  const alcas = (f: FieldDef) =>
    customizando &&
    onRedimensionarCampo &&
    ALCAS.map((alca) => (
      <span
        key={alca.dir}
        onPointerDown={(e) => iniciarRedimensionamentoCampo(e, f, alca.dir)}
        className={`absolute z-10 w-[7px] h-[7px] bg-blue-500 ${alca.className}`}
      />
    ));

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Corpo rolável */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-5 py-5 space-y-4">
          {onRedimensionarCampo && (
            <div className="flex justify-end gap-1 -mt-3 mb-1">
              {onRestaurarPadrao && (
                <button
                  type="button"
                  onClick={onRestaurarPadrao}
                  title="Voltar tamanhos e posições dos campos ao padrão do app"
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Padrão
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (customizando) onSalvarLayout?.(); // "Concluir" grava
                  setCustomizando(!customizando);
                }}
                title={customizando ? 'Concluir a customização do layout' : 'Customizar o tamanho dos campos'}
                aria-pressed={customizando}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                  customizando
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                }`}
              >
                <Scaling className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mostrarIcones) onSalvarLayout?.(); // esconder os ícones grava o que foi mudado
                  setMostrarIcones(!mostrarIcones);
                }}
                title={mostrarIcones ? 'Esconder os ícones de customização dos campos' : 'Mostrar os ícones de customização dos campos'}
                aria-pressed={mostrarIcones}
                className={`flex items-center px-2 py-1 rounded cursor-pointer transition-colors ${
                  mostrarIcones
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                }`}
              >
                {mostrarIcones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div ref={gradeRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {editableFields.map((field) => {
              return (
                <div
                  key={field.name}
                  {...propsArraste(field)}
                  style={estiloTamanho(field)}
                  className={`${FIELD_CLASS} ${isWide(field) ? 'sm:col-span-2' : ''} ${classeTamanho(field)} ${
                    alvo === field.name ? 'outline-2 outline-dashed outline-blue-400 outline-offset-2' : ''
                  }`}
                >
                  {alcas(field)}
                  {rotulo(field)}
                  {/* fieldset desabilitado propaga o disabled para o controle, qualquer que seja o tipo */}
                  <fieldset
                    disabled={estaDesabilitado(field)}
                    className={`min-w-0 border-0 p-0 m-0 ${estaDesabilitado(field) ? 'opacity-50' : ''}`}
                  >
                    {renderField(field)}
                  </fieldset>
                  {field.hint && <p className={HINT_CLASS}>{field.hint}</p>}
                </div>
              );
            })}
          </div>

          {/* Metadados gerados pelo banco */}
          {readOnlyFields.length > 0 && (
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Dados gerados pelo banco
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {readOnlyFields.map((f) => (
                  <div
                    key={f.name}
                    className="bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-700/60"
                  >
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">{f.label}</div>
                    <div className="text-xs font-mono text-stone-800 dark:text-stone-200 truncate">
                      {String(record?.[f.name] ?? '—')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações fixa ao pé da tela */}
      <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2.5 bg-stone-50 dark:bg-stone-950/40 shrink-0">
        <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {isEdit
            ? `Registro #${resource.pk.map((c) => record?.[c]).join(' / ')} • tabela ${resource.table}`
            : `Inclusão na tabela ${resource.table}`}
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancelar</span>
          </button>
          <button
            type="submit"
            id="btn-salvar-registro"
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Salvando…' : 'Salvar'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
