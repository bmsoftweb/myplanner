import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { tenantId } from './auth.js';

/**
 * Painel (Home) — reproduz os quatro blocos do sistema original:
 *  1. quanto do previsto do mês já foi realizado (medidor);
 *  2. receitas × despesas realizadas nos últimos 12 meses (barras);
 *  3. o que vence hoje e ainda está pendente (lista + totais);
 *  4. as cinco maiores despesas por sub-categoria, mais "Outros" (rosca).
 *
 * Acrescenta ainda o saldo de cada banco e o consumo dos limites do mês, que no
 * sistema original ficavam espalhados pelas telas de Bancos e de Limites.
 */
export function createDashboardRouter() {
  const router = Router();

  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);

      // As consultas abaixo são independentes: numa conexão remota, rodar em
      // paralelo troca a soma das latências pela maior delas.
      const [
        [contagens],
        [medidor],
        [porMes],
        [hojeTotais],
        [hojeItens],
        [despesas],
        [saldos],
        [limites],
      ] = await Promise.all([
      // ---- Contagens dos cadastros, usadas nos selos da barra lateral ----
      pool.query<any[]>(
        `SELECT
           (SELECT COUNT(*) FROM lancamentos    WHERE id_emp = ?) AS lancamentos,
           (SELECT COUNT(*) FROM categorias     WHERE id_emp = ?) AS categorias,
           (SELECT COUNT(*) FROM categorias_sub WHERE id_emp = ?) AS categorias_sub,
           (SELECT COUNT(*) FROM bancos         WHERE id_emp = ?) AS bancos,
           (SELECT COUNT(*) FROM centroscustos  WHERE id_emp = ?) AS centroscustos,
           (SELECT COUNT(*) FROM limites        WHERE id_emp = ?) AS limites,
           (SELECT COUNT(*) FROM metas          WHERE id_emp = ?) AS metas,
           (SELECT COUNT(*) FROM moedas         WHERE id_emp = ?) AS moedas,
           (SELECT COUNT(*) FROM patrimonio     WHERE id_emp = ?) AS patrimonio,
           (SELECT COUNT(*) FROM usuarios       WHERE id_emp = ?) AS usuarios,
           (SELECT COUNT(*) FROM tipos_doc)                       AS tipos_doc`,
        Array(10).fill(idEmp),
      ),

      // ---- 1. Previsto × realizado das despesas do mês corrente ----
      pool.query<any[]>(
        `SELECT COALESCE(SUM(COALESCE(a.valor_previsto, 0)), 0)  AS previsto,
                COALESCE(SUM(COALESCE(a.valor_realizado, 0)), 0) AS realizado
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND a.analise = 'S' AND c.tipo = 'D'
            AND a.data_sort >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
            AND a.data_sort <  DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') + INTERVAL 1 MONTH`,
        [idEmp],
      ),

      // ---- 2. Receitas × despesas realizadas nos últimos 12 meses ----
      pool.query<any[]>(
        `SELECT DATE_FORMAT(a.data_sort, '%m/%Y') AS anomes,
                EXTRACT(YEAR_MONTH FROM a.data_sort) AS ordem,
                COALESCE(SUM(IF(c.tipo = 'R', COALESCE(a.valor_realizado, 0), 0)), 0) AS receitas,
                COALESCE(SUM(IF(c.tipo = 'D', COALESCE(a.valor_realizado, 0), 0)), 0) AS despesas
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ?
            AND a.data_sort >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 11 MONTH)
            AND a.data_sort < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
          GROUP BY ordem, anomes
          ORDER BY ordem`,
        [idEmp],
      ),

      // ---- 3. O que está pendente com data de hoje ----
      pool.query<any[]>(
        `SELECT COALESCE(SUM(IF(c.tipo = 'R', COALESCE(a.valor_realizado, 0), 0)), 0) AS receitas,
                COALESCE(SUM(IF(c.tipo = 'D', COALESCE(a.valor_realizado, 0), 0)), 0) AS despesas
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND a.data_realizado = CURRENT_DATE AND a.status = 'P'`,
        [idEmp],
      ),

      pool.query<any[]>(
        `SELECT b.descricao AS categoria,
                a.historico,
                c.descricao AS tipo_documento,
                COALESCE(a.valor_realizado, 0) AS valor,
                d.tipo AS rd
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id   = a.id_categoria
           LEFT JOIN categorias     d ON d.Id   = b.id_cat
           LEFT JOIN tipos_doc      c ON c.tipo = a.tipo_doc
          WHERE a.id_emp = ? AND a.data_realizado = CURRENT_DATE AND a.status = 'P'
          ORDER BY d.tipo DESC, d.codigo, b.codigo`,
        [idEmp],
      ),

      // ---- 4. As cinco maiores despesas por sub-categoria, mais "Outros" ----
      // Soma primeiro os lançamentos por sub-categoria e só então junta os nomes.
      // Filtrando pelas tabelas de apoio, o otimizador começava por elas e varria
      // os lançamentos uma vez por sub-categoria (264 varreduras, ~4 s).
      pool.query<any[]>(
        `SELECT b.descricao, t.valor
           FROM (
                 SELECT a.id_categoria, SUM(COALESCE(a.valor_realizado, 0)) AS valor
                   FROM lancamentos a
                  WHERE a.id_emp = ?
                  GROUP BY a.id_categoria
                ) t
           JOIN categorias_sub b ON b.Id  = t.id_categoria AND b.relatorio = 'S'
           JOIN categorias     c ON c.Id  = b.id_cat       AND c.tipo = 'D'
          ORDER BY t.valor DESC`,
        [idEmp],
      ),

      // ---- Saldo de cada banco: saldo inicial mais o realizado conciliado ----
      pool.query<any[]>(
        `SELECT bc.Id, bc.descricao, COALESCE(bc.apelido, '') AS apelido,
                COALESCE(bc.saldo_inicial, 0) + COALESCE((
                  SELECT SUM(IF(c.tipo = 'R', COALESCE(a.valor_realizado, 0), -COALESCE(a.valor_realizado, 0)))
                    FROM lancamentos a
                    LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
                    LEFT JOIN categorias     c ON c.Id = b.id_cat
                   WHERE a.id_banco = bc.Id AND a.id_emp = bc.id_emp
                     AND a.data_realizado IS NOT NULL
                ), 0) AS saldo
           FROM bancos bc
          WHERE bc.id_emp = ?
          ORDER BY bc.descricao`,
        [idEmp],
      ),

      // ---- Consumo dos limites no mês corrente ----
      pool.query<any[]>(
        `SELECT l.Id, l.descricao,
                COALESCE(lm.valor, l.limite_mensal, 0) AS limite,
                UPPER(COALESCE(l.cartao_credito, 'N')) AS cartao,
                COALESCE((
                  SELECT SUM(COALESCE(a.valor_realizado, 0))
                    FROM lancamentos a
                   WHERE a.id_limite = l.Id AND a.id_emp = l.id_emp
                     AND a.data_realizado >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
                     AND a.data_realizado <  DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') + INTERVAL 1 MONTH
                ), 0) AS usado
           FROM limites l
           LEFT JOIN limites_mensais lm
                  ON lm.id_limite = l.Id
                 AND lm.ano_mes = DATE_FORMAT(CURRENT_DATE, '%Y%m')
          WHERE l.id_emp = ?
          ORDER BY l.descricao`,
        [idEmp],
      ),
      ]);

      const counts: Record<string, number> = Object.fromEntries(
        Object.entries(contagens[0] || {}).map(([chave, valor]) => [chave, Number(valor || 0)]),
      );

      const previstoMes = Number(medidor[0]?.previsto || 0);
      const realizadoMes = Number(medidor[0]?.realizado || 0);

      const maioresDespesas = despesas.slice(0, 5).map((d) => ({
        descricao: d.descricao || '(sem sub-categoria)',
        valor: Number(d.valor || 0),
      }));
      const outros = despesas.slice(5).reduce((soma, d) => soma + Number(d.valor || 0), 0);
      if (outros > 0) maioresDespesas.push({ descricao: 'Outros', valor: outros });

      res.json({
        counts,
        realizadoDoMes: {
          previsto: previstoMes,
          realizado: realizadoMes,
          percentual: previstoMes > 0 ? Math.round((realizadoMes / previstoMes) * 100) : 0,
        },
        porMes: porMes.map((m) => ({
          anomes: m.anomes,
          receitas: Number(m.receitas || 0),
          despesas: Number(m.despesas || 0),
        })),
        hoje: {
          receitas: Number(hojeTotais[0]?.receitas || 0),
          despesas: Number(hojeTotais[0]?.despesas || 0),
          itens: hojeItens.map((i) => ({
            categoria: i.categoria || '—',
            historico: i.historico || '',
            tipo_documento: i.tipo_documento || '',
            valor: Number(i.valor || 0),
            rd: i.rd || 'D',
          })),
        },
        maioresDespesas,
        saldosBancos: saldos.map((b) => ({
          id: String(b.Id),
          descricao: b.descricao,
          apelido: b.apelido,
          saldo: Number(b.saldo || 0),
        })),
        limites: limites.map((l) => ({
          id: String(l.Id),
          descricao: l.descricao,
          limite: Number(l.limite || 0),
          usado: Number(l.usado || 0),
          cartao: l.cartao === 'S',
        })),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
