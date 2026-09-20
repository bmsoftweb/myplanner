import { Router, Request, Response } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { pool, hojeBrasilia } from './db.js';
import { tenantId, lerConfig, planoPorId } from './auth.js';

/** Teto de linhas devolvidas pela listagem, para a resposta não crescer sem limite */
const MAX_LINHAS_LISTA = 5000;

/** Pasta dos comprovantes anexados aos lançamentos */
export const PASTA_UPLOAD = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

/**
 * Tela de Lançamentos: listagem filtrada, gravação com as regras de cartão de
 * crédito, geração de lançamentos recorrentes, comprovantes e exportação.
 *
 * Observação sobre o modelo: lancamentos.id_categoria aponta para a
 * SUB-categoria (categorias_sub). A categoria "pai" — e com ela o sinal de
 * receita ou despesa — vem de categorias_sub.id_cat.
 */

const SELECT_LANCAMENTO = `
  SELECT
    a.Id,
    a.status,
    a.id_categoria,
    b.descricao  AS categoria,
    c.descricao  AS categoria_pai,
    IF(c.tipo = 'R', '+', '-') AS mais_ou_menos,
    a.data_sort,
    a.data_prevista,
    a.data_compra,
    a.valor_previsto,
    a.data_realizado,
    a.valor_realizado,
    a.analise,
    a.historico,
    a.tipo_doc,
    d.descricao  AS descricao_tipo,
    a.documento,
    a.id_banco,
    e.descricao  AS descricao_banco,
    a.id_cc,
    f.descricao  AS descricao_centro_custos,
    a.id_limite,
    g.descricao  AS descricao_limite,
    a.id_meta,
    h.descricao  AS descricao_meta,
    COALESCE(a.comprovante_link, '') AS comprovante_link,
    IF(a.recorrente = 'S', 'S', '') AS recorrente
  FROM lancamentos a
  LEFT JOIN categorias_sub b ON b.Id   = a.id_categoria
  LEFT JOIN categorias     c ON c.Id   = b.id_cat
  LEFT JOIN tipos_doc      d ON d.tipo = a.tipo_doc
  LEFT JOIN bancos         e ON e.Id   = a.id_banco
  LEFT JOIN centroscustos  f ON f.Id   = a.id_cc
  LEFT JOIN limites        g ON g.Id   = a.id_limite
  LEFT JOIN metas          h ON h.id   = a.id_meta`;

/** Monta o WHERE da listagem a partir dos filtros da barra superior */
function montarFiltro(req: Request, idEmp: number): { sql: string; params: any[] } {
  const q = req.query;
  const where = ['a.id_emp = ?'];
  const params: any[] = [idEmp];

  const d1 = String(q.d1 || '').slice(0, 10);
  const d2 = String(q.d2 || '').slice(0, 10);
  if (d1 && d2) {
    where.push('a.data_sort BETWEEN ? AND ?');
    params.push(d1, d2);
  }

  const documento = String(q.documento || '').trim();
  if (documento) {
    where.push("COALESCE(a.documento, '') LIKE ?");
    params.push(`%${documento}%`);
  }

  const idBanco = Number(q.id_banco || 0);
  if (idBanco > 0) {
    where.push('a.id_banco = ?');
    params.push(idBanco);
  }

  const idCategoria = Number(q.id_categoria || 0);
  if (idCategoria > 0) {
    where.push('a.id_categoria = ?');
    params.push(idCategoria);
  }

  const tipoDoc = String(q.tipo_doc || '').trim();
  if (tipoDoc && tipoDoc !== 'XX') {
    where.push('a.tipo_doc = ?');
    params.push(tipoDoc);
  }

  const historico = String(q.historico || '').trim();
  if (historico) {
    where.push("COALESCE(a.historico, '') LIKE ?");
    params.push(`%${historico}%`);
  }

  // As duas caixas "Com Cartão de Crédito" e "Com Previsão" da barra de filtros:
  // desmarcar uma delas tira do resultado os lançamentos daquele tipo.
  const comCartao = String(q.comCartao ?? 'true') === 'true';
  const comPrevisao = String(q.comPrevisao ?? 'true') === 'true';
  if (!comCartao) where.push("COALESCE(a.tipo_doc, '') <> 'CC'");
  if (!comPrevisao) where.push("COALESCE(a.tipo_doc, '') <> 'P'");

  return { sql: where.join(' AND '), params };
}

/** Último dia do mês de uma data "aaaa-mm-dd" */
function ultimoDiaDoMes(iso: string): number {
  const [a, m] = iso.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** Soma meses a "aaaa-mm-dd" mantendo o dia informado (limitado ao fim do mês) */
function dataNoMes(base: string, mesesAFrente: number, dia: number): string {
  const [a, m] = base.split('-').map(Number);
  const alvo = new Date(a, m - 1 + mesesAFrente, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const diaFinal = Math.min(dia, ultimo);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;
}

/**
 * Data em que a compra no cartão vira uma saída de caixa: o vencimento da
 * fatura seguinte à compra; depois do dia de fechamento, cai uma fatura adiante.
 */
export function vencimentoDaFatura(
  dataCompra: string,
  diaFechamento: number,
  diaVencimento: number,
): string {
  const fechamento = diaFechamento === 99 ? ultimoDiaDoMes(dataCompra) : diaFechamento;
  const vencimento = diaVencimento === 99 ? ultimoDiaDoMes(dataNoMes(dataCompra, 1, 1)) : diaVencimento;
  const diaDaCompra = Number(dataCompra.slice(8, 10));
  return dataNoMes(dataCompra, diaDaCompra > fechamento ? 2 : 1, vencimento);
}

/** Dados do limite escolhido, para aplicar as regras do cartão de crédito */
async function lerLimite(idLimite: number, idEmp: number) {
  if (!idLimite) return null;
  const [linhas] = await pool.query<any[]>(
    'SELECT Id, descricao, cartao_credito, dia_fechamento, dia_vencimento FROM limites WHERE Id = ? AND id_emp = ?',
    [idLimite, idEmp],
  );
  return linhas[0] || null;
}

/** Tipo ('R' ou 'D') da categoria mãe da sub-categoria informada */
async function tipoDaSubCategoria(idSubCat: number, idEmp: number): Promise<string | null> {
  const [linhas] = await pool.query<any[]>(
    `SELECT c.tipo FROM categorias_sub s
       JOIN categorias c ON c.Id = s.id_cat
      WHERE s.Id = ? AND s.id_emp = ? LIMIT 1`,
    [idSubCat, idEmp],
  );
  return linhas[0]?.tipo || null;
}

interface DadosLancamento {
  id_categoria: number;
  id_cc: number;
  id_banco: number;
  id_limite: number;
  id_meta: number;
  tipo_doc: string;
  documento: string;
  historico: string;
  data_compra: string;
  data_prevista: string;
  valor_previsto: number;
  data_realizado: string;
  valor_realizado: number;
  analise: string;
}

function lerCorpo(body: any): DadosLancamento {
  const num = (v: any) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id_categoria: Number(body?.id_categoria || 0),
    id_cc: Number(body?.id_cc || 0),
    id_banco: Number(body?.id_banco || 0),
    id_limite: Number(body?.id_limite || 0),
    id_meta: Number(body?.id_meta || 0),
    tipo_doc: String(body?.tipo_doc || '').trim().slice(0, 2),
    documento: String(body?.documento || '').trim().slice(0, 15),
    historico: String(body?.historico || '').trim().slice(0, 40),
    data_compra: String(body?.data_compra || '').slice(0, 10),
    data_prevista: String(body?.data_prevista || '').slice(0, 10),
    valor_previsto: num(body?.valor_previsto),
    data_realizado: String(body?.data_realizado || '').slice(0, 10),
    valor_realizado: num(body?.valor_realizado),
    analise: String(body?.analise || 'S').toUpperCase() === 'N' ? 'N' : 'S',
  };
}

/**
 * Consistência do lançamento, na mesma ordem do sistema original.
 * Devolve a lista de erros encontrados (vazia quando está tudo certo).
 */
async function consistir(
  d: DadosLancamento,
  idEmp: number,
  limite: any,
  exigirCentroCusto: boolean,
): Promise<string[]> {
  const erros: string[] = [];

  if (!d.id_categoria) erros.push('Escolha a categoria e a sub-categoria.');
  if (!d.tipo_doc) erros.push('Escolha o tipo do documento.');
  if (exigirCentroCusto && !d.id_cc) erros.push('Escolha o centro de custo.');
  if (d.valor_previsto <= 0 && d.valor_realizado <= 0) erros.push('Digite um valor previsto ou realizado.');
  if (d.valor_previsto > 0 && !d.data_prevista) erros.push('Digite a data prevista.');
  if (d.valor_realizado > 0 && !d.data_realizado && !limite?.ehCartao) {
    erros.push('Digite a data do valor realizado.');
  }

  if (limite?.ehCartao) {
    if (!d.data_compra) erros.push('Compra com cartão deve ter a data da compra.');
    if (!Number(limite.dia_fechamento)) erros.push('O cartão escolhido está sem o dia de fechamento.');
    if (!Number(limite.dia_vencimento)) erros.push('O cartão escolhido está sem o dia de vencimento.');
  }

  if (d.id_limite && d.id_categoria) {
    const tipo = await tipoDaSubCategoria(d.id_categoria, idEmp);
    if (tipo === 'R') {
      erros.push('Categoria de receita não pode tirar valor de nenhum limite.');
    }
  }

  return erros;
}

/** Colunas gravadas, já com as regras de cartão e de status aplicadas */
async function montarGravacao(d: DadosLancamento, idEmp: number, limite: any) {
  let dataRealizado = d.data_realizado || null;
  // Sem valor realizado o lançamento é só uma previsão: não precisa ficar pendente
  let status = d.valor_realizado > 0 ? 'P' : 'O';

  if (limite?.ehCartao && d.valor_realizado > 0) {
    // A fatura chega depois: o lançamento já nasce conciliado e com a data do vencimento
    status = 'O';
    dataRealizado = vencimentoDaFatura(
      d.data_compra || hojeBrasilia(),
      Number(limite.dia_fechamento),
      Number(limite.dia_vencimento),
    );
  }

  const dataPrevista = d.valor_previsto > 0 ? d.data_prevista || null : null;
  if (d.valor_realizado <= 0) dataRealizado = null;

  return {
    id_emp: idEmp,
    id_categoria: d.id_categoria,
    id_cc: d.id_cc || null,
    id_banco: d.id_banco || null,
    id_limite: d.id_limite || null,
    id_meta: d.id_meta || null,
    tipo_doc: d.tipo_doc,
    documento: d.documento,
    historico: d.historico,
    data_compra: d.data_compra || null,
    data_prevista: dataPrevista,
    valor_previsto: d.valor_previsto > 0 ? d.valor_previsto : null,
    data_realizado: dataRealizado,
    valor_realizado: d.valor_realizado > 0 ? d.valor_realizado : null,
    // A data de ordenação é a realizada quando existe; senão, a prevista
    data_sort: dataRealizado || dataPrevista,
    analise: d.analise,
    status,
  };
}

/** Quantos lançamentos a conta ainda pode incluir neste mês, conforme o plano */
async function situacaoDoPlano(idEmp: number) {
  const [conta] = await pool.query<any[]>('SELECT id_plano FROM empresas WHERE Id = ?', [idEmp]);
  const plano = planoPorId(Number(conta[0]?.id_plano || 1));
  const [uso] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c FROM lancamentos
      WHERE id_emp = ? AND datahora_inclusao >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
        AND datahora_inclusao <  DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') + INTERVAL 1 MONTH`,
    [idEmp],
  );
  const usados = Number(uso[0]?.c || 0);
  const estourou = plano.limite > 0 && usados >= plano.limite;
  return {
    plano,
    usados,
    podeIncluir: !estourou,
    mensagem: estourou
      ? `Seu plano está limitado a ${plano.limite} lançamentos no mês. Para continuar lançando, atualize o seu plano.`
      : '',
  };
}

export function createLancamentosRouter() {
  const router = Router();

  // --------------------------------------------------------
  // Combos da tela, carregados de uma vez só
  // --------------------------------------------------------
  router.get('/lancamentos/combos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);

      // Nove consultas independentes: em paralelo, o custo é o da mais lenta
      const [
        [categorias],
        [subcategorias],
        [centros],
        [bancos],
        [limites],
        [metas],
        [tiposDoc],
        config,
        plano,
      ] = await Promise.all([
        pool.query<any[]>(
          'SELECT Id, codigo, descricao, tipo FROM categorias WHERE id_emp = ? ORDER BY codigo, descricao',
          [idEmp],
        ),
        pool.query<any[]>(
          'SELECT Id, id_cat, codigo, descricao FROM categorias_sub WHERE id_emp = ? ORDER BY codigo, descricao',
          [idEmp],
        ),
        pool.query<any[]>('SELECT Id, descricao FROM centroscustos WHERE id_emp = ? ORDER BY descricao', [idEmp]),
        pool.query<any[]>('SELECT Id, descricao, apelido FROM bancos WHERE id_emp = ? ORDER BY descricao', [idEmp]),
        pool.query<any[]>(
          'SELECT Id, descricao, cartao_credito, dia_fechamento, dia_vencimento FROM limites WHERE id_emp = ? ORDER BY descricao',
          [idEmp],
        ),
        pool.query<any[]>('SELECT id AS Id, descricao FROM metas WHERE id_emp = ? ORDER BY descricao', [idEmp]),
        pool.query<any[]>('SELECT tipo, descricao FROM tipos_doc ORDER BY descricao'),
        lerConfig(idEmp),
        situacaoDoPlano(idEmp),
      ]);

      res.json({
        categorias,
        subcategorias,
        centros,
        bancos,
        limites: limites.map((l) => ({ ...l, cartao_credito: String(l.cartao_credito || 'N').toUpperCase() })),
        metas,
        tiposDoc,
        config,
        plano,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Listagem
  // --------------------------------------------------------
  router.get('/lancamentos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const { sql, params } = montarFiltro(req, idEmp);

      // "Todos" pode pegar o histórico inteiro: sem teto, a resposta chega a
      // dezenas de MB e o navegador trava montando as linhas.
      const [linhas, [resumo]] = await Promise.all([
        pool.query<any[]>(
          `${SELECT_LANCAMENTO} WHERE ${sql} ORDER BY a.data_sort, a.Id LIMIT ?`,
          [...params, MAX_LINHAS_LISTA],
        ),
        // Os totais saem do banco, sobre o filtro inteiro: se saíssem das linhas
        // devolvidas, ficariam errados justamente quando o teto corta.
        pool.query<any[]>(
          `SELECT
             COALESCE(SUM(IF(c.tipo = 'R', 1, -1) * COALESCE(a.valor_previsto, 0)), 0)  AS previsto,
             COALESCE(SUM(IF(c.tipo = 'R', 1, -1) * COALESCE(a.valor_realizado, 0)), 0) AS realizado,
             COUNT(*) AS total
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE ${sql}`,
          params,
        ),
      ]);

      const total = Number(resumo[0]?.total || 0);

      res.json({
        data: linhas[0],
        total,
        // Avisa a tela quando houve corte, para ela não dizer que mostrou tudo
        limitado: total > MAX_LINHAS_LISTA,
        limite: MAX_LINHAS_LISTA,
        totais: {
          previsto: Number(resumo[0]?.previsto || 0),
          realizado: Number(resumo[0]?.realizado || 0),
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Um lançamento (para abrir na edição)
  // --------------------------------------------------------
  router.get('/lancamentos/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        `${SELECT_LANCAMENTO} WHERE a.id_emp = ? AND a.Id = ? LIMIT 1`,
        [idEmp, Number(req.params.id)],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Lançamento não encontrado.' });
      // A categoria mãe é o que o formulário preenche no primeiro combo
      const [pai] = await pool.query<any[]>('SELECT id_cat FROM categorias_sub WHERE Id = ?', [
        linhas[0].id_categoria,
      ]);
      res.json({ ...linhas[0], id_cat: pai[0]?.id_cat ?? null });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Incluir
  // --------------------------------------------------------
  router.post('/lancamentos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);

      const situacao = await situacaoDoPlano(idEmp);
      if (!situacao.podeIncluir) return res.status(403).json({ error: situacao.mensagem });

      const d = lerCorpo(req.body);
      const limiteBruto = await lerLimite(d.id_limite, idEmp);
      const limite = limiteBruto
        ? { ...limiteBruto, ehCartao: String(limiteBruto.cartao_credito).toUpperCase() === 'S' }
        : null;

      const config = await lerConfig(idEmp);
      const erros = await consistir(d, idEmp, limite, config.usar_cc);
      if (erros.length) return res.status(400).json({ error: `Erros encontrados. Verifique: ${erros.join(' / ')}` });

      const dados = await montarGravacao(d, idEmp, limite);
      const cols = Object.keys(dados);
      const [r] = await pool.query<any>(
        `INSERT INTO lancamentos (${cols.join(', ')}, recorrente, comprovante_link)
         VALUES (${cols.map(() => '?').join(', ')}, 'N', '')`,
        cols.map((c) => (dados as any)[c]),
      );

      res.json({ success: true, id: String(r.insertId) });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Alterar
  // --------------------------------------------------------
  router.put('/lancamentos/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const d = lerCorpo(req.body);
      const limiteBruto = await lerLimite(d.id_limite, idEmp);
      // Na alteração as regras do cartão não recalculam a data: ela já foi definida
      // na inclusão e pode ter sido ajustada quando a fatura chegou.
      const limite = limiteBruto ? { ...limiteBruto, ehCartao: false } : null;

      const config = await lerConfig(idEmp);
      const erros = await consistir(d, idEmp, limite, config.usar_cc);
      if (erros.length) return res.status(400).json({ error: `Erros encontrados. Verifique: ${erros.join(' / ')}` });

      const dados = await montarGravacao(d, idEmp, limite);
      delete (dados as any).id_emp;
      const cols = Object.keys(dados);

      const [r] = await pool.query<any>(
        `UPDATE lancamentos SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE Id = ? AND id_emp = ?`,
        [...cols.map((c) => (dados as any)[c]), Number(req.params.id), idEmp],
      );
      if (!r.affectedRows) return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Excluir
  // --------------------------------------------------------
  router.delete('/lancamentos/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [r] = await pool.query<any>('DELETE FROM lancamentos WHERE Id = ? AND id_emp = ?', [
        Number(req.params.id),
        idEmp,
      ]);
      if (!r.affectedRows) return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Lançamentos recorrentes
  // --------------------------------------------------------
  router.post('/lancamentos/recorrentes', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const d = lerCorpo(req.body);

      const intervalo = String(req.body?.intervalo || 'mensal');
      const repeticoes = Math.max(1, Math.min(500, Number(req.body?.repeticoes || 1)));
      const dataBase = String(req.body?.data_inicio || hojeBrasilia()).slice(0, 10);
      const valorParcela = Number(String(req.body?.valor_parcela ?? '').replace(',', '.')) || 0;
      const lancarComo = String(req.body?.lancar_como || 'previsto'); // previsto | realizado | ambos
      // Nos intervalos diário e semanal o usuário marca em que dias da semana repetir
      const diasSemana: number[] = Array.isArray(req.body?.dias_semana)
        ? req.body.dias_semana.map(Number).filter((n: number) => n >= 0 && n <= 6)
        : [];
      const addMeses = Math.max(1, Number(req.body?.add_meses || 1));

      if (valorParcela <= 0) return res.status(400).json({ error: 'Digite o valor de cada parcela.' });

      const situacao = await situacaoDoPlano(idEmp);
      if (!situacao.podeIncluir) return res.status(403).json({ error: situacao.mensagem });
      if (situacao.plano.limite > 0 && situacao.usados + repeticoes > situacao.plano.limite) {
        return res.status(403).json({
          error: `Seu plano permite ${situacao.plano.limite} lançamentos no mês e você já fez ${situacao.usados}. Reduza a quantidade de repetições ou atualize o plano.`,
        });
      }

      const limiteBruto = await lerLimite(d.id_limite, idEmp);
      const limite = limiteBruto
        ? { ...limiteBruto, ehCartao: String(limiteBruto.cartao_credito).toUpperCase() === 'S' }
        : null;

      const config = await lerConfig(idEmp);
      const base: DadosLancamento = {
        ...d,
        valor_previsto: lancarComo === 'realizado' ? 0 : valorParcela,
        valor_realizado: lancarComo === 'previsto' ? 0 : valorParcela,
        data_prevista: dataBase,
        data_realizado: dataBase,
      };
      const erros = await consistir(base, idEmp, limite, config.usar_cc);
      if (erros.length) return res.status(400).json({ error: `Erros encontrados. Verifique: ${erros.join(' / ')}` });

      const datas = gerarDatasRecorrentes(intervalo, dataBase, repeticoes, diasSemana, addMeses);
      if (!datas.length) {
        return res.status(400).json({ error: 'Nenhuma data foi gerada. Verifique o intervalo e os dias marcados.' });
      }

      const conexao = await pool.getConnection();
      try {
        await conexao.beginTransaction();
        for (const data of datas) {
          const dodia: DadosLancamento = { ...base, data_prevista: data, data_realizado: data };
          const dados = await montarGravacao(dodia, idEmp, limite);
          const cols = Object.keys(dados);
          await conexao.query(
            `INSERT INTO lancamentos (${cols.join(', ')}, recorrente, comprovante_link)
             VALUES (${cols.map(() => '?').join(', ')}, 'S', '')`,
            cols.map((c) => (dados as any)[c]),
          );
        }
        await conexao.commit();
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }

      res.json({ success: true, gerados: datas.length, primeira: datas[0], ultima: datas[datas.length - 1] });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Pré-visualização das datas de um recorrente, antes de gravar
  // --------------------------------------------------------
  router.post('/lancamentos/recorrentes/datas', (req: Request, res: Response) => {
    try {
      const datas = gerarDatasRecorrentes(
        String(req.body?.intervalo || 'mensal'),
        String(req.body?.data_inicio || hojeBrasilia()).slice(0, 10),
        Math.max(1, Math.min(500, Number(req.body?.repeticoes || 1))),
        Array.isArray(req.body?.dias_semana) ? req.body.dias_semana.map(Number) : [],
        Math.max(1, Number(req.body?.add_meses || 1)),
      );
      res.json({ datas, primeira: datas[0] || '', ultima: datas[datas.length - 1] || '' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Comprovante: envio e remoção
  // --------------------------------------------------------
  const pastaUpload = PASTA_UPLOAD;

  router.post(
    '/lancamentos/:id/comprovante',
    express.raw({ type: '*/*', limit: '15mb' }),
    async (req: Request, res: Response) => {
      try {
        const idEmp = tenantId(req);
        const id = Number(req.params.id);

        const [existe] = await pool.query<any[]>('SELECT Id FROM lancamentos WHERE Id = ? AND id_emp = ?', [id, idEmp]);
        if (!existe.length) return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });

        const corpo = req.body as Buffer;
        if (!Buffer.isBuffer(corpo) || !corpo.length) {
          return res.status(400).json({ error: 'Nenhum arquivo foi recebido.' });
        }

        // O nome original só entra na extensão: o arquivo gravado recebe um nome próprio
        const original = String(req.header('x-nome-arquivo') || 'comprovante');
        const extensao = (path.extname(original) || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
        const nome = `comp_${idEmp}_${id}_${Date.now()}${extensao}`;

        try {
          fs.mkdirSync(pastaUpload, { recursive: true });
          fs.writeFileSync(path.join(pastaUpload, nome), corpo);
        } catch (erroDisco: any) {
          // Em hospedagem sem disco gravável (Vercel, por exemplo) não há onde
          // guardar o arquivo: melhor dizer isso do que devolver um erro solto.
          if (['EROFS', 'EACCES', 'EPERM'].includes(erroDisco?.code)) {
            return res.status(501).json({
              error:
                'Este servidor não tem disco para guardar comprovantes. ' +
                'Rode o sistema numa máquina com disco gravável ou configure um armazenamento externo.',
            });
          }
          throw erroDisco;
        }

        const link = `/uploads/${nome}`;
        await pool.query('UPDATE lancamentos SET comprovante_link = ? WHERE Id = ? AND id_emp = ?', [link, id, idEmp]);

        res.json({ success: true, link });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  router.delete('/lancamentos/:id/comprovante', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const id = Number(req.params.id);
      const [linhas] = await pool.query<any[]>(
        'SELECT comprovante_link FROM lancamentos WHERE Id = ? AND id_emp = ?',
        [id, idEmp],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });

      const link = String(linhas[0].comprovante_link || '');
      if (link.startsWith('/uploads/')) {
        // basename evita que um valor manipulado no banco aponte para fora da pasta
        const arquivo = path.join(pastaUpload, path.basename(link));
        fs.promises.unlink(arquivo).catch(() => {});
      }
      await pool.query("UPDATE lancamentos SET comprovante_link = '' WHERE Id = ? AND id_emp = ?", [id, idEmp]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Exportar em CSV, respeitando o filtro da tela
  // --------------------------------------------------------
  router.get('/lancamentos-exportar', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const { sql, params } = montarFiltro(req, idEmp);
      const [linhas] = await pool.query<any[]>(
        `${SELECT_LANCAMENTO} WHERE ${sql} ORDER BY a.data_sort, a.Id`,
        params,
      );

      const colunas = [
        ['Id', 'Id'],
        ['categoria_pai', 'Categoria'],
        ['categoria', 'Sub-Categoria'],
        ['mais_ou_menos', 'R/D'],
        ['data_prevista', 'Data Prevista'],
        ['valor_previsto', 'Valor Previsto'],
        ['data_realizado', 'Data Realizada'],
        ['valor_realizado', 'Valor Realizado'],
        ['historico', 'Histórico'],
        ['descricao_tipo', 'Tipo'],
        ['documento', 'Documento'],
        ['descricao_banco', 'Banco'],
        ['descricao_centro_custos', 'Centro de Custo'],
        ['descricao_limite', 'Limite'],
        ['descricao_meta', 'Meta'],
        ['analise', 'Análise'],
      ];

      const escapar = (v: any) => {
        const texto = v === null || v === undefined ? '' : String(v);
        return `"${texto.replace(/"/g, '""')}"`;
      };
      const linhasCsv = [
        colunas.map(([, titulo]) => escapar(titulo)).join(';'),
        ...linhas.map((l) =>
          colunas
            .map(([campo]) => {
              const v = l[campo];
              // Números saem com vírgula decimal, como o Excel em português espera
              if (campo.startsWith('valor_')) return escapar(v === null ? '' : Number(v).toFixed(2).replace('.', ','));
              return escapar(v);
            })
            .join(';'),
        ),
      ];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lancamentos_${hojeBrasilia()}.csv"`);
      // BOM para o Excel reconhecer o UTF-8 e não quebrar os acentos
      res.send('﻿' + linhasCsv.join('\r\n'));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

/**
 * Datas de um lançamento recorrente.
 *
 * - diário e semanal: percorre dia a dia e guarda os dias da semana marcados;
 * - quinzenal, mensal, bimestral, trimestral, semestral e anual: avança de
 *   período em período a partir da data base.
 */
export function gerarDatasRecorrentes(
  intervalo: string,
  dataBase: string,
  repeticoes: number,
  diasSemana: number[],
  addMeses: number,
): string[] {
  const datas: string[] = [];
  const [a, m, d] = dataBase.split('-').map(Number);
  if (!a || !m || !d) return datas;

  const formatar = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  if (intervalo === 'diario' || intervalo === 'semanal') {
    // Sem nenhum dia marcado, o diário repete todos os dias
    const dias = diasSemana.length ? diasSemana : intervalo === 'diario' ? [0, 1, 2, 3, 4, 5, 6] : [new Date(a, m - 1, d).getDay()];
    const atual = new Date(a, m - 1, d);
    // Limite de segurança: no máximo 3 anos de varredura
    for (let i = 0; i < 1100 && datas.length < repeticoes; i++) {
      if (dias.includes(atual.getDay())) datas.push(formatar(atual));
      atual.setDate(atual.getDate() + 1);
    }
    return datas;
  }

  const passoEmMeses: Record<string, number> = {
    mensal: addMeses,
    bimestral: 2,
    trimestral: 3,
    semestral: 6,
    anual: 12,
  };

  if (intervalo === 'quinzenal') {
    const atual = new Date(a, m - 1, d);
    for (let i = 0; i < repeticoes; i++) {
      datas.push(formatar(atual));
      atual.setDate(atual.getDate() + 15);
    }
    return datas;
  }

  const passo = passoEmMeses[intervalo] ?? 1;
  for (let i = 0; i < repeticoes; i++) {
    const alvo = new Date(a, m - 1 + passo * i, 1);
    // Dia 31 em mês de 30 cai no último dia do mês, e não no mês seguinte
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(d, ultimo));
    datas.push(formatar(alvo));
  }
  return datas;
}
