import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { tenantId } from './auth.js';

/**
 * "Meu Planejamento": previsto × realizado de cada sub-categoria, mês a mês,
 * no ano escolhido.
 *
 * O sistema original montava isso com cinco tabelas temporárias encadeadas.
 * Em MySQL o mesmo resultado sai de uma consulta só, com agregação condicional:
 * cada mês vira um par de SUM(CASE WHEN ...), o que evita as temporárias e
 * funciona em réplicas somente-leitura.
 *
 * Entram apenas os lançamentos marcados como "entra na análise" (analise = 'S'),
 * e o previsto é datado pela data_prevista enquanto o realizado usa a
 * data_realizado — as duas podem cair em meses diferentes.
 */

/** SUM condicional de um mês, somando previsto e realizado separadamente */
function colunasDosMeses(): string {
  const partes: string[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    partes.push(`COALESCE(SUM(CASE WHEN m.mes = ${mes} THEN m.previsto END), 0) AS pre_${mes}`);
    partes.push(`COALESCE(SUM(CASE WHEN m.mes = ${mes} THEN m.realizado END), 0) AS rea_${mes}`);
  }
  return partes.join(',\n         ');
}

const SQL_PLANEJAMENTO = `
  SELECT
    cat.descricao AS grupo,
    cat.Id        AS id,
    cat.codigo    AS codigo_grupo,
    cat.tipo      AS tiporb,
    sub.Id        AS id_subcat,
    sub.codigo    AS codigo,
    sub.descricao AS descricao,
    ${colunasDosMeses()}
  FROM categorias_sub sub
  JOIN categorias cat ON cat.Id = sub.id_cat
  LEFT JOIN (
      SELECT id_categoria,
             MONTH(data_prevista) AS mes,
             SUM(COALESCE(valor_previsto, 0)) AS previsto,
             0 AS realizado
        FROM lancamentos
       WHERE id_emp = ? AND analise = 'S'
         AND COALESCE(valor_previsto, 0) > 0
         AND YEAR(data_prevista) = ?
       GROUP BY id_categoria, MONTH(data_prevista)

      UNION ALL

      SELECT id_categoria,
             MONTH(data_realizado) AS mes,
             0 AS previsto,
             SUM(COALESCE(valor_realizado, 0)) AS realizado
        FROM lancamentos
       WHERE id_emp = ? AND analise = 'S'
         AND COALESCE(valor_realizado, 0) > 0
         AND YEAR(data_realizado) = ?
       GROUP BY id_categoria, MONTH(data_realizado)
  ) m ON m.id_categoria = sub.Id
  WHERE sub.id_emp = ?
  GROUP BY sub.Id, sub.codigo, sub.descricao, cat.Id, cat.codigo, cat.descricao, cat.tipo
  ORDER BY cat.codigo, cat.descricao, sub.codigo, sub.descricao`;

export function createPlanejamentoRouter() {
  const router = Router();

  // --------------------------------------------------------
  // A grade do ano
  // --------------------------------------------------------
  router.get('/planejamento', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const ano = Number(req.query.ano) || new Date().getFullYear();
      if (ano < 1900 || ano > 2999) return res.status(400).json({ error: 'Ano inválido.' });

      const [linhas] = await pool.query<any[]>(SQL_PLANEJAMENTO, [idEmp, ano, idEmp, ano, idEmp]);

      const dados = linhas.map((l) => {
        const meses = [];
        let totalPrevisto = 0;
        let totalRealizado = 0;
        for (let mes = 1; mes <= 12; mes++) {
          const previsto = Number(l[`pre_${mes}`] || 0);
          const realizado = Number(l[`rea_${mes}`] || 0);
          totalPrevisto += previsto;
          totalRealizado += realizado;
          meses.push({ previsto, realizado });
        }
        return {
          grupo: l.grupo,
          id: Number(l.id),
          id_subcat: Number(l.id_subcat),
          codigo: l.codigo || '',
          descricao: l.descricao || '',
          tiporb: l.tiporb || 'D',
          meses,
          total_previsto: totalPrevisto,
          total_realizado: totalRealizado,
        };
      });

      // Totais do rodapé: receita entra positiva, despesa entra negativa
      const totalGeral = { meses: Array.from({ length: 12 }, () => ({ previsto: 0, realizado: 0 })), total_previsto: 0, total_realizado: 0 };
      for (const linha of dados) {
        const sinal = linha.tiporb === 'R' ? 1 : -1;
        for (let i = 0; i < 12; i++) {
          totalGeral.meses[i].previsto += sinal * linha.meses[i].previsto;
          totalGeral.meses[i].realizado += sinal * linha.meses[i].realizado;
        }
        totalGeral.total_previsto += sinal * linha.total_previsto;
        totalGeral.total_realizado += sinal * linha.total_realizado;
      }

      res.json({ ano, data: dados, totalGeral });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Detalhe de uma célula: os lançamentos daquela sub-categoria naquele mês
  // --------------------------------------------------------
  router.get('/planejamento/detalhe', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const ano = Number(req.query.ano) || new Date().getFullYear();
      const mes = Number(req.query.mes) || 0;
      const idSubCat = Number(req.query.id_subcat) || 0;
      // 'pre' olha a data prevista, 'rea' a data realizada
      const coluna = String(req.query.coluna) === 'rea' ? 'rea' : 'pre';

      if (!idSubCat) return res.status(400).json({ error: 'Sub-categoria não informada.' });

      const campoData = coluna === 'rea' ? 'data_realizado' : 'data_prevista';
      const campoValor = coluna === 'rea' ? 'valor_realizado' : 'valor_previsto';

      // Mês 0 = a coluna de total: o ano inteiro
      const filtroMes = mes >= 1 && mes <= 12 ? `AND MONTH(a.${campoData}) = ?` : '';
      const params: any[] = [idEmp, idSubCat, ano];
      if (filtroMes) params.push(mes);

      const [linhas] = await pool.query<any[]>(
        `SELECT a.Id, a.${campoData} AS data, a.${campoValor} AS valor,
                a.historico, a.documento, a.status,
                d.descricao AS descricao_tipo,
                e.descricao AS descricao_banco,
                f.descricao AS descricao_centro_custos
           FROM lancamentos a
           LEFT JOIN tipos_doc     d ON d.tipo = a.tipo_doc
           LEFT JOIN bancos        e ON e.Id   = a.id_banco
           LEFT JOIN centroscustos f ON f.Id   = a.id_cc
          WHERE a.id_emp = ? AND a.id_categoria = ? AND a.analise = 'S'
            AND COALESCE(a.${campoValor}, 0) > 0
            AND YEAR(a.${campoData}) = ? ${filtroMes}
          ORDER BY a.${campoData}, a.Id`,
        params,
      );

      const total = linhas.reduce((soma, l) => soma + Number(l.valor || 0), 0);
      res.json({ data: linhas, total });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
