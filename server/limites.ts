import { Router, Request, Response } from 'express';
import { pool } from './db';
import { tenantId } from './auth';

/**
 * Fatura do cartão de crédito e análise mensal dos limites.
 * O cadastro de limites e de limites mensais é atendido pelo CRUD genérico.
 */

/** Último dia do mês (ano/mês em base 1) */
function ultimoDia(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Data de vencimento da fatura que está "a N meses de distância" do mês atual.
 *
 * Como na inclusão o lançamento de cartão recebe data_realizado igual ao
 * vencimento da fatura, listar a fatura é listar os lançamentos daquela data.
 */
export function vencimentoDaJanela(diaVencimento: number, deslocamentoEmMeses: number): string {
  const hoje = new Date();
  // O sistema original olha sempre para a fatura do mês seguinte ao escolhido
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamentoEmMeses + 1, 1);
  const ano = alvo.getFullYear();
  const mes = alvo.getMonth() + 1;
  const dia = diaVencimento === 99 ? ultimoDia(ano, mes) : Math.min(diaVencimento || 1, ultimoDia(ano, mes));
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function createLimitesRouter() {
  const router = Router();

  // --------------------------------------------------------
  // Fatura do cartão
  // --------------------------------------------------------
  router.get('/limites/:id/fatura', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idLimite = Number(req.params.id);
      // Quantos meses para frente (ou para trás) em relação à fatura atual
      const deslocamento = Number(req.query.deslocamento || 0) || 0;

      const [limites] = await pool.query<any[]>(
        `SELECT Id, descricao, UPPER(COALESCE(cartao_credito, 'N')) AS cartao_credito,
                COALESCE(dia_fechamento, 0) AS dia_fechamento,
                COALESCE(dia_vencimento, 0) AS dia_vencimento,
                COALESCE(limite_mensal, 0) AS limite_mensal
           FROM limites WHERE Id = ? AND id_emp = ?`,
        [idLimite, idEmp],
      );
      if (!limites.length) return res.status(404).json({ error: 'Limite não encontrado nesta conta.' });
      const limite = limites[0];
      if (limite.cartao_credito !== 'S') {
        return res.status(400).json({ error: 'Este limite não é um cartão de crédito.' });
      }

      const vencimento = vencimentoDaJanela(Number(limite.dia_vencimento), deslocamento);

      const [itens] = await pool.query<any[]>(
        `SELECT a.Id, a.data_compra, a.id_categoria,
                COALESCE(b.descricao, '') AS descricao,
                a.id_cc, COALESCE(d.descricao, '') AS descricao_cc,
                COALESCE(a.historico, '') AS historico,
                COALESCE(a.valor_realizado, 0) AS valor_realizado
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN centroscustos  d ON d.Id = a.id_cc
          WHERE a.id_emp = ? AND a.id_limite = ? AND a.data_realizado = ?
          ORDER BY a.data_compra, a.Id`,
        [idEmp, idLimite, vencimento],
      );

      const total = itens.reduce((soma, i) => soma + Number(i.valor_realizado || 0), 0);
      res.json({
        limite: { id: String(limite.Id), descricao: limite.descricao, limite_mensal: Number(limite.limite_mensal) },
        vencimento,
        deslocamento,
        total,
        data: itens,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Análise: limite × realizado, mês a mês
  // O limite do mês vem de limites_mensais quando existe; senão, do padrão.
  // --------------------------------------------------------
  router.get('/limites/:id/analise', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idLimite = Number(req.params.id);

      const [limites] = await pool.query<any[]>(
        'SELECT Id, descricao, COALESCE(limite_mensal, 0) AS limite_mensal FROM limites WHERE Id = ? AND id_emp = ?',
        [idLimite, idEmp],
      );
      if (!limites.length) return res.status(404).json({ error: 'Limite não encontrado nesta conta.' });

      const [linhas] = await pool.query<any[]>(
        `SELECT YEAR(a.data_realizado)  AS ano,
                MONTH(a.data_realizado) AS mes,
                SUM(COALESCE(a.valor_realizado, 0)) AS valor_realizado,
                COALESCE(
                  (SELECT lm.valor FROM limites_mensais lm
                    WHERE lm.id_limite = a.id_limite
                      AND lm.ano_mes = DATE_FORMAT(a.data_realizado, '%Y%m')
                    LIMIT 1),
                  ?
                ) AS limite_mensal
           FROM lancamentos a
          WHERE a.id_emp = ? AND a.id_limite = ? AND a.data_realizado IS NOT NULL
          GROUP BY ano, mes, a.id_limite
          ORDER BY ano, mes`,
        [Number(limites[0].limite_mensal), idEmp, idLimite],
      );

      res.json({
        limite: { id: String(limites[0].Id), descricao: limites[0].descricao },
        data: linhas.map((l) => ({
          ano: Number(l.ano),
          mes: Number(l.mes),
          limite: Number(l.limite_mensal || 0),
          realizado: Number(l.valor_realizado || 0),
        })),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
