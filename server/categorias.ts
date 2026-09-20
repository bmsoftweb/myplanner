import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { tenantId } from './auth.js';

/**
 * "Criar Padrões": copia para a conta o plano de categorias e sub-categorias
 * que vem de fábrica (tabelas categorias_padrao e categorias_sub_padrao),
 * na variante de pessoa física ou de pessoa jurídica.
 *
 * Só funciona com o cadastro vazio: a operação não mistura o padrão com o que
 * o usuário já montou.
 */
export function createCategoriasRouter() {
  const router = Router();

  router.get('/categorias/padroes', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [contagem] = await pool.query<any[]>(
        `SELECT (SELECT COUNT(*) FROM categorias WHERE id_emp = ?) AS categorias,
                (SELECT COUNT(*) FROM categorias_sub WHERE id_emp = ?) AS subcategorias`,
        [idEmp, idEmp],
      );
      const [amostra] = await pool.query<any[]>(
        `SELECT FJ, COUNT(*) AS total FROM categorias_padrao GROUP BY FJ`,
      );

      res.json({
        podeCriar: Number(contagem[0]?.categorias || 0) === 0 && Number(contagem[0]?.subcategorias || 0) === 0,
        jaCadastradas: Number(contagem[0]?.categorias || 0),
        disponiveis: amostra.map((a) => ({ fj: a.FJ, total: Number(a.total) })),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  router.post('/categorias/padroes', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      // 'F' pessoa física, 'J' pessoa jurídica
      const fj = String(req.body?.fj || 'F').toUpperCase() === 'J' ? 'J' : 'F';

      const [contagem] = await pool.query<any[]>(
        'SELECT COUNT(*) AS c FROM categorias WHERE id_emp = ?',
        [idEmp],
      );
      if (Number(contagem[0]?.c || 0) > 0) {
        return res.status(400).json({
          error: 'Existem registros na tabela de categorias. Você não pode continuar com esta operação!',
        });
      }

      const [categoriasPadrao] = await pool.query<any[]>(
        'SELECT Id, codigo, descricao, tipo FROM categorias_padrao WHERE FJ = ? ORDER BY codigo',
        [fj],
      );
      if (!categoriasPadrao.length) {
        return res.status(400).json({ error: 'Não há categorias padrão cadastradas para esta opção.' });
      }

      const conexao = await pool.getConnection();
      let criadasCategorias = 0;
      let criadasSub = 0;
      try {
        await conexao.beginTransaction();

        for (const cat of categoriasPadrao) {
          const [r] = await conexao.query<any>(
            'INSERT INTO categorias (id_emp, codigo, descricao, tipo) VALUES (?, ?, ?, ?)',
            [idEmp, cat.codigo, cat.descricao, cat.tipo],
          );
          const novoIdCat = Number(r.insertId);
          criadasCategorias++;

          const [subs] = await conexao.query<any[]>(
            'SELECT codigo, descricao FROM categorias_sub_padrao WHERE id_cat = ? AND FJ = ? ORDER BY codigo',
            [cat.Id, fj],
          );
          for (const sub of subs) {
            await conexao.query(
              "INSERT INTO categorias_sub (id_emp, id_cat, codigo, descricao, relatorio) VALUES (?, ?, ?, ?, 'S')",
              [idEmp, novoIdCat, sub.codigo, sub.descricao],
            );
            criadasSub++;
          }
        }

        await conexao.commit();
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }

      res.json({
        success: true,
        criadasCategorias,
        criadasSub,
        message: `Foram criadas ${criadasCategorias} categorias e ${criadasSub} sub-categorias.`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
