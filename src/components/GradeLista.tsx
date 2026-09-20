import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { ConfigLista, Grade, ModoLargura, lerConfigLista, salvarConfigLista } from '../utils/configListas';

/**
 * Mecânica compartilhada das listas: coluna indicadora com o menu de contexto,
 * coluna de sobra, coluna de Ações fixa, redimensionar, reordenar, linhas de
 * grade e a gravação das preferências em usuarios.config_listas.
 *
 * Fica aqui para que a tela de Lançamentos e as telas de CRUD tenham exatamente
 * o mesmo comportamento, em vez de duas cópias que vão divergindo.
 */

/** O mínimo que uma coluna precisa ter para participar da grade */
export interface ColunaGrade {
  name: string;
  label: string;
  /** Largura sugerida enquanto o usuário não arrastar a divisa */
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export const WIDTH_CLASS: Record<string, string> = {
  xs: 'w-16',
  sm: 'w-32',
  md: 'w-48',
  lg: 'w-80',
};

/** Larguras mínimas: 50px ao arrastar, 60px no "melhor largura" */
const MIN_ARRASTE = 50;
const MIN_CONTEUDO = 60;

interface OpcoesGrade<T extends ColunaGrade> {
  /** Chave desta lista dentro do JSON de config_listas */
  recurso: string;
  /** Colunas visíveis, na ordem base (antes do que o usuário arrastou) */
  colunas: T[];
  onToast: (msg: string) => void;
  /** O que o chamador também quer gravar junto (colunas visíveis, busca, formulário…) */
  configExtra?: () => Partial<ConfigLista>;
  /** Devolve a configuração lida, para o chamador pegar as chaves dele */
  aoCarregar?: (cfg: ConfigLista) => void;
  /** Recalcula as larguras automáticas quando isto muda (ex.: as linhas chegaram) */
  recalcularCom?: unknown;
  /** Reordenar colunas arrastando o cabeçalho. Desligado onde a ordem é fixa (meses). */
  permitirReordenar?: boolean;
}

export function useGradeLista<T extends ColunaGrade>({
  recurso,
  colunas: colunasBase,
  onToast,
  configExtra,
  aoCarregar,
  recalcularCom,
  permitirReordenar = true,
}: OpcoesGrade<T>) {
  const [ordem, setOrdem] = useState<string[]>([]);
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const [grade, setGrade] = useState<Grade>('horizontais');
  const [comSobra, setComSobra] = useState(true);
  const [modoLargura, setModoLargura] = useState<ModoLargura>('manual');
  const [menuAberto, setMenuAberto] = useState(false);

  const tabelaRef = useRef<HTMLTableElement>(null);
  const arrastando = useRef<string | null>(null);

  /** As colunas na ordem em que o usuário as deixou */
  const colunas = useMemo(() => {
    if (!ordem.length) return colunasBase;
    const posicao = (nome: string) => {
      const i = ordem.indexOf(nome);
      return i < 0 ? ordem.length : i;
    };
    return [...colunasBase].sort((a, b) => posicao(a.name) - posicao(b.name));
  }, [colunasBase, ordem]);

  // A borda existe sempre (só fica transparente), senão a altura da linha muda junto com a grade
  const bordasCelula = `border-b border-r ${
    grade === 'ambas' || grade === 'horizontais'
      ? 'border-b-stone-100 dark:border-b-stone-800/60'
      : 'border-b-transparent'
  } ${
    grade === 'ambas' || grade === 'verticais'
      ? 'border-r-stone-100 dark:border-r-stone-800/60'
      : 'border-r-transparent'
  }`;

  // ----------------------------------------------------------
  // Preferências: vêm de usuarios.config_listas e voltam para lá
  // ----------------------------------------------------------
  useEffect(() => {
    let vivo = true;
    lerConfigLista(recurso).then((cfg) => {
      if (!vivo) return;
      setLarguras(cfg.larguras || {});
      setOrdem(cfg.ordem || []);
      setGrade(cfg.grade || 'horizontais');
      setComSobra(cfg.sobra !== false);
      setModoLargura(cfg.modo || 'manual');
      aoCarregar?.(cfg);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurso]);

  const salvarConfiguracao = () => {
    setMenuAberto(false);
    salvarConfigLista(
      recurso,
      {
        ...configExtra?.(),
        // Nos modos automáticos a largura é recalculada ao abrir, então não vale
        // guardá-la: a mesma lista pode abrir em outro monitor, com outra largura.
        larguras: modoLargura === 'manual' ? larguras : undefined,
        ordem,
        grade,
        sobra: comSobra,
        modo: modoLargura,
      },
      // O aviso só sai depois da resposta do servidor: sem onde gravar, ele diz isso
      ({ guardado, motivo }) =>
        onToast(guardado ? 'Configuração salva.' : motivo || 'Não foi possível salvar a configuração.'),
    );
  };

  // ----------------------------------------------------------
  // Larguras
  // ----------------------------------------------------------
  /**
   * As colunas são achadas pelo atributo data-coluna, e não pela posição: assim
   * a mesma mecânica serve para a grade simples (uma linha de cabeçalho) e para
   * o planejamento, que agrupa os meses em duas linhas de cabeçalho.
   * As colunas que não se redimensionam (indicadora, Conta, Ações) levam data-fixa.
   */
  const cabecalhosDeColuna = (): HTMLElement[] =>
    Array.from(tabelaRef.current?.querySelectorAll('thead [data-coluna]') || []) as HTMLElement[];

  /**
   * Mede a largura que cada coluna teria só pelo conteúdo, ignorando as larguras
   * já aplicadas e o esticamento do w-full.
   */
  const medirColunas = (): Record<string, number> | null => {
    const tabela = tabelaRef.current;
    if (!tabela) return null;
    const cabecalhos = cabecalhosDeColuna();
    // Todas as linhas, e não só a primeira: uma largura já aplicada numa linha de
    // baixo seguraria a coluna, e a cada recálculo ela encolheria mais um pouco,
    // até sobrar só a largura do título.
    const celulas = Array.from(tabela.querySelectorAll('tbody [data-coluna]')) as HTMLElement[];

    const anteriores = [...cabecalhos, ...celulas].map((c) => c.style.width);
    [...cabecalhos, ...celulas].forEach((c) => {
      c.style.width = '';
      c.style.maxWidth = '';
    });
    const larguraTabela = tabela.style.width;
    tabela.style.width = 'max-content';
    const medidas = Object.fromEntries(
      cabecalhos.map((th) => [th.dataset.coluna as string, th.offsetWidth]),
    );
    tabela.style.width = larguraTabela;
    [...cabecalhos, ...celulas].forEach((c, i) => {
      c.style.width = anteriores[i];
    });
    return medidas;
  };

  /** Cada coluna com a largura do seu conteúdo (as fixas ficam como estão) */
  const aplicarMelhorLargura = useCallback(() => {
    setComSobra(true);
    const medidas = medirColunas();
    if (!medidas) return;
    setLarguras(
      Object.fromEntries(
        colunas
          .filter((f) => medidas[f.name] !== undefined)
          .map((f) => [f.name, Math.max(MIN_CONTEUDO, medidas[f.name])]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colunas]);

  /**
   * Divide todo o espaço livre entre as colunas, na proporção do que cada uma ocupa hoje:
   * lista com poucas colunas fica com colunas largas; com muitas, colunas estreitas.
   * Mede como está na tela (e não o conteúdo), porque a sobra vive na coluna vazia do fim.
   */
  const aplicarAjustarLargura = useCallback(() => {
    setComSobra(false);
    const tabela = tabelaRef.current;
    const area = tabela?.parentElement;
    if (!tabela || !area) return;

    const cabecalhos = cabecalhosDeColuna();
    const atuais = cabecalhos.map((th) => th.offsetWidth);
    const soma = atuais.reduce((a, b) => a + b, 0);
    const fixas = (Array.from(tabela.querySelectorAll('thead [data-fixa]')) as HTMLElement[]).reduce(
      (total, th) => total + th.offsetWidth,
      0,
    );
    const disponivel = area.clientWidth - fixas - 1;
    if (soma <= 0 || disponivel <= 0) return;

    const fator = disponivel / soma;
    const finais = atuais.map((largura) => Math.max(MIN_ARRASTE, Math.floor(largura * fator)));
    const resto = disponivel - finais.reduce((a, b) => a + b, 0);
    if (resto > 0) finais[finais.length - 1] += resto;
    setLarguras(
      Object.fromEntries(cabecalhos.map((th, i) => [th.dataset.coluna as string, finais[i]])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colunas]);

  // Nos modos automáticos a largura é recalculada: ao abrir a lista, quando as linhas
  // chegam e quando a janela muda de tamanho (outro monitor, por exemplo).
  useEffect(() => {
    if (modoLargura === 'manual') return;
    const aplicar = () => (modoLargura === 'ajustar' ? aplicarAjustarLargura() : aplicarMelhorLargura());
    const id = requestAnimationFrame(aplicar);
    window.addEventListener('resize', aplicar);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', aplicar);
    };
  }, [modoLargura, aplicarAjustarLargura, aplicarMelhorLargura, recalcularCom]);

  const iniciarRedimensionamento = (e: React.PointerEvent, campo: string) => {
    e.preventDefault();
    e.stopPropagation();
    setModoLargura('manual');

    if (!tabelaRef.current) return;
    const cabecalhos = cabecalhosDeColuna();
    // Congela as larguras atuais: sem isso o navegador redistribui a sobra e o arraste "escorrega"
    const base = cabecalhos.map((th) => th.offsetWidth);
    const nomes = cabecalhos.map((th) => th.dataset.coluna as string);
    const indice = nomes.indexOf(campo);
    if (indice < 0) return;
    const xInicial = e.clientX;

    const mover = (ev: PointerEvent) => {
      const finais = [...base];
      finais[indice] = Math.max(MIN_ARRASTE, base[indice] + ev.clientX - xInicial);
      // Sem coluna de sobra, quem cede espaço é a coluna seguinte, para o total não mudar
      if (!comSobra && indice < finais.length - 1) {
        finais[indice + 1] = Math.max(MIN_ARRASTE, base[indice + 1] - (finais[indice] - base[indice]));
      }
      setLarguras(Object.fromEntries(nomes.map((nome, i) => [nome, finais[i]])));
    };

    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  // ----------------------------------------------------------
  // Reordenar (arraste nativo do HTML5), guardado por nome de campo
  // ----------------------------------------------------------
  const propsArraste = (nome: string) =>
    permitirReordenar
      ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      arrastando.current = nome;
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const origem = arrastando.current;
      arrastando.current = null;
      if (!origem || origem === nome) return;
      const nomes = colunas.map((f) => f.name).filter((n) => n !== origem);
      nomes.splice(nomes.indexOf(nome), 0, origem);
      setOrdem(nomes);
    },
        }
      : {};

  /** Estilo e classe de largura de uma coluna do cabeçalho ou do corpo */
  const estiloColuna = (coluna: T, ehCelula = false) => ({
    style: larguras[coluna.name]
      ? ehCelula
        ? { width: larguras[coluna.name], maxWidth: larguras[coluna.name] }
        : { width: larguras[coluna.name] }
      : undefined,
    className: larguras[coluna.name] ? '' : coluna.width ? WIDTH_CLASS[coluna.width] : '',
  });

  return {
    colunas,
    larguras,
    grade,
    setGrade,
    comSobra,
    modoLargura,
    setModoLargura,
    menuAberto,
    setMenuAberto,
    tabelaRef,
    bordasCelula,
    estiloColuna,
    propsArraste,
    iniciarRedimensionamento,
    aplicarAjustarLargura,
    aplicarMelhorLargura,
    salvarConfiguracao,
  };
}

// ------------------------------------------------------------
// Peças de markup compartilhadas
// ------------------------------------------------------------

type GradeApi = ReturnType<typeof useGradeLista<ColunaGrade>>;

/**
 * Cabeçalho da coluna indicadora: 30px, fixa à esquerda, com o ícone de três
 * traços que abre o menu de contexto da lista.
 */
export const ThIndicador: React.FC<{ grade: GradeApi; rowSpan?: number }> = ({ grade: g, rowSpan }) => (
  <th data-fixa rowSpan={rowSpan} className="sticky left-0 z-20 w-[30px] min-w-[30px] max-w-[30px] px-0 text-center border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
    <div className="relative">
      <button
        type="button"
        onClick={() => g.setMenuAberto(!g.menuAberto)}
        title="Opções das colunas"
        className="p-1 mx-auto block text-stone-400 hover:text-blue-600 dark:text-stone-500 dark:hover:text-blue-400 cursor-pointer"
      >
        <Menu className="w-3.5 h-3.5" />
      </button>

      {g.menuAberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => g.setMenuAberto(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-44 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1 text-left font-normal">
            <button
              type="button"
              onClick={() => {
                g.setMenuAberto(false);
                g.setModoLargura('ajustar');
                g.aplicarAjustarLargura();
              }}
              className="w-full px-3 py-2 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer text-left"
            >
              Ajustar largura
            </button>
            <button
              type="button"
              onClick={() => {
                g.setMenuAberto(false);
                g.setModoLargura('melhor');
                g.aplicarMelhorLargura();
              }}
              className="w-full px-3 py-2 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer text-left"
            >
              Melhor largura
            </button>

            <div className="my-1 border-t border-stone-200 dark:border-stone-700" />

            {(
              [
                ['ambas', 'Mostrar linhas da grade'],
                ['horizontais', 'Mostrar linhas horizontais'],
                ['verticais', 'Mostrar linhas verticais'],
                ['nenhuma', 'Não mostrar linhas da grade'],
              ] as [Grade, string][]
            ).map(([valor, rotulo]) => (
              <button
                type="button"
                key={valor}
                onClick={() => {
                  g.setGrade(valor);
                  g.setMenuAberto(false);
                }}
                className={`w-full px-3 py-2 text-xs hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer text-left ${
                  g.grade === valor
                    ? 'text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-stone-700 dark:text-stone-200'
                }`}
              >
                {rotulo}
              </button>
            ))}

            <div className="my-1 border-t border-stone-200 dark:border-stone-700" />

            {/* Sempre o último: é o único momento em que algo é gravado */}
            <button
              type="button"
              onClick={g.salvarConfiguracao}
              className="w-full px-3 py-2 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer text-left"
            >
              Salvar Configuração
            </button>
          </div>
        </>
      )}
    </div>
  </th>
);

/**
 * Célula da coluna indicadora: seta azul na linha selecionada (ou aberta em
 * aba), cinza só no hover da linha.
 */
export const TdIndicador: React.FC<{ grade: GradeApi; ativa: boolean }> = ({ grade: g, ativa }) => (
  <td
    className={`sticky left-0 z-[5] w-[30px] min-w-[30px] max-w-[30px] px-0 text-center align-middle bg-inherit border-r border-stone-200 dark:border-stone-800 ${g.bordasCelula}`}
  >
    <ChevronRight
      className={`w-3.5 h-3.5 mx-auto ${
        ativa
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-stone-300 opacity-0 group-hover:opacity-100 dark:text-stone-600'
      }`}
    />
  </td>
);

/** Alça de redimensionar, encostada na divisa direita do cabeçalho */
export const AlcaRedimensionar: React.FC<{ grade: GradeApi; coluna: ColunaGrade }> = ({
  grade: g,
  coluna,
}) => (
  <span
    draggable={false}
    onDragStart={(e) => e.preventDefault()}
    onPointerDown={(e) => g.iniciarRedimensionamento(e, coluna.name)}
    onClick={(e) => e.stopPropagation()}
    title={`Arrastar para redimensionar ${coluna.label}`}
    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/60"
  />
);

/** Coluna de sobra: absorve o espaço livre para que redimensionar funcione mesmo com poucas colunas */
export const ThSobra: React.FC<{ rowSpan?: number }> = ({ rowSpan }) => (
  <th rowSpan={rowSpan} className="w-full border-b border-stone-200 dark:border-stone-800" />
);

export const TdSobra: React.FC<{ grade: GradeApi }> = ({ grade: g }) => (
  <td className={`w-full ${g.bordasCelula}`} />
);

/** Cabeçalho da coluna de Ações, fixa à direita */
export const ThAcoes: React.FC<{ largura?: string }> = ({ largura = 'w-24 min-w-24 max-w-24' }) => (
  <th
    data-fixa
    className={`sticky right-0 z-20 px-3 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 ${largura} border-b border-l border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950`}
  >
    Ações
  </th>
);

export const TdAcoes: React.FC<{ grade: GradeApi; largura?: string; children: React.ReactNode }> = ({
  grade: g,
  largura = 'w-24 min-w-24 max-w-24',
  children,
}) => (
  <td
    className={`sticky right-0 z-[5] ${largura} px-3 py-[7.5px] text-center whitespace-nowrap bg-inherit border-l border-stone-200 dark:border-stone-800 ${g.bordasCelula}`}
  >
    <div className="inline-flex items-center gap-1">{children}</div>
  </td>
);
