import { Router, Request, Response } from 'express';
import { pool } from './db';
import { tenantId } from './auth';

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

      // ---- Contagens dos cadastros, usadas nos selos da barra lateral ----
      const contagens: Record<string, string> = {
        lancamentos: 'SELECT COUNT(*) c FROM lancamentos WHERE id_emp = ?',
        categorias: 'SELECT COUNT(*) c FROM categorias WHERE id_emp = ?',
        categorias_sub: 'SELECT COUNT(*) c FROM categorias_sub WHERE id_emp = ?',
        bancos: 'SELECT COUNT(*) c FROM bancos WHERE id_emp = ?',
        centroscustos: 'SELECT COUNT(*) c FROM centroscustos WHERE id_emp = ?',
        limites: 'SELECT COUNT(*) c FROM limites WHERE id_emp = ?',
        metas: 'SELECT COUNT(*) c FROM metas WHERE id_emp = ?',
        moedas: 'SELECT COUNT(*) c FROM moedas WHERE id_emp = ?',
        patrimonio: 'SELECT COUNT(*) c FROM patrimonio WHERE id_emp = ?',
        usuarios: 'SELECT COUNT(*) c FROM usuarios WHERE id_emp = ?',
        tipos_doc: 'SELECT COUNT(*) c FROM tipos_doc WHERE ? > 0',
      };

      const counts: Record<string, number> = {};
      for (const [chave, sql] of Object.entries(contagens)) {
        try {
          const [linhas] = await pool.query<any[]>(sql, [idEmp]);
          counts[chave] = Number(linhas[0]?.c || 0);
        } catch {
          counts[chave] = 0;
        }
      }

      // ---- 1. Previsto × realizado das despesas do mês corrente ----
      const [medidor] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(COALESCE(a.valor_previsto, 0)), 0)  AS previsto,
                COALESCE(SUM(COALESCE(a.valor_realizado, 0)), 0) AS realizado
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND a.analise = 'S' AND c.tipo = 'D'
            AND EXTRACT(YEAR_MONTH FROM a.data_sort) = EXTRACT(YEAR_MONTH FROM CURRENT_DATE)`,
        [idEmp],
      );
      const previstoMes = Number(medidor[0]?.previsto || 0);
      const realizadoMes = Number(medidor[0]?.realizado || 0);

      // ---- 2. Receitas × despesas realizadas nos últimos 12 meses ----
      const [porMes] = await pool.query<any[]>(
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
      );

      // ---- 3. O que está pendente com data de hoje ----
      const [hojeTotais] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(IF(c.tipo = 'R', COALESCE(a.valor_realizado, 0), 0)), 0) AS receitas,
                COALESCE(SUM(IF(c.tipo = 'D', COALESCE(a.valor_realizado, 0), 0)), 0) AS despesas
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND a.data_realizado = CURRENT_DATE AND a.status = 'P'`,
        [idEmp],
      );

      const [hojeItens] = await pool.query<any[]>(
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
      );

      // ---- 4. As cinco maiores despesas por sub-categoria, mais "Outros" ----
      const [despesas] = await pool.query<any[]>(
        `SELECT b.descricao,
                COALESCE(SUM(COALESCE(a.valor_realizado, 0)), 0) AS valor
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND b.relatorio = 'S' AND c.tipo = 'D'
          GROUP BY a.id_categoria, b.descricao
          ORDER BY valor DESC`,
        [idEmp],
      );
      const maioresDespesas = despesas.slice(0, 5).map((d) => ({
        descricao: d.descricao || '(sem sub-categoria)',
        valor: Number(d.valor || 0),
      }));
      const outros = despesas.slice(5).reduce((soma, d) => soma + Number(d.valor || 0), 0);
      if (outros > 0) maioresDespesas.push({ descricao: 'Outros', valor: outros });

      // ---- Saldo de cada banco: saldo inicial mais o realizado conciliado ----
      const [saldos] = await pool.query<any[]>(
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
      );

      // ---- Consumo dos limites no mês corrente ----
      const [limites] = await pool.query<any[]>(
        `SELECT l.Id, l.descricao,
                COALESCE(lm.valor, l.limite_mensal, 0) AS limite,
                UPPER(COALESCE(l.cartao_credito, 'N')) AS cartao,
                COALESCE((
                  SELECT SUM(COALESCE(a.valor_realizado, 0))
                    FROM lancamentos a
                   WHERE a.id_limite = l.Id AND a.id_emp = l.id_emp
                     AND EXTRACT(YEAR_MONTH FROM a.data_realizado) = EXTRACT(YEAR_MONTH FROM CURRENT_DATE)
                ), 0) AS usado
           FROM limites l
           LEFT JOIN limites_mensais lm
                  ON lm.id_limite = l.Id
                 AND lm.ano_mes = DATE_FORMAT(CURRENT_DATE, '%Y%m')
          WHERE l.id_emp = ?
          ORDER BY l.descricao`,
        [idEmp],
      );

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
