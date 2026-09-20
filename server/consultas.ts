import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { tenantId } from './auth.js';

/**
 * Tela de Consultas: executa as consultas em SQL cadastradas na tabela
 * "consultas", pedindo antes os parâmetros de "consultas_parametros".
 *
 * Segurança: o texto da consulta é do próprio sistema, mas ainda assim
 *  - só consultas de leitura são aceitas (SELECT ou WITH);
 *  - não é permitido mais de um comando na mesma execução;
 *  - :ID_EMP é trocado pelo id da conta da sessão, sempre um inteiro validado;
 *  - os demais parâmetros viram "?" e vão como valores, nunca concatenados.
 */

/** Recusa o que não for uma leitura simples */
function conferirConsultaDeLeitura(sql: string) {
  const limpo = sql
    // tira comentários, para que não escondam um segundo comando
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .trim()
    .replace(/;+\s*$/, '');

  if (!/^(select|with)\b/i.test(limpo)) {
    throw new Error('Só é possível executar consultas de leitura (SELECT).');
  }
  if (limpo.includes(';')) {
    throw new Error('A consulta não pode conter mais de um comando.');
  }
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|replace|call|load_file|into\s+outfile|into\s+dumpfile)\b/i.test(limpo)) {
    throw new Error('A consulta contém um comando que não é permitido aqui.');
  }
  return limpo;
}

/**
 * Troca os :PARAMETROS por "?" na ordem em que aparecem e devolve os valores.
 * Um parâmetro pode aparecer mais de uma vez: o valor é repetido.
 */
export function prepararConsulta(
  sql: string,
  idEmp: number,
  valores: Record<string, any>,
): { texto: string; params: any[] } {
  const params: any[] = [];
  const texto = sql.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_todo, nome: string) => {
    const chave = String(nome).toUpperCase();
    if (chave === 'ID_EMP') return String(idEmp);
    params.push(valores[chave] ?? null);
    return '?';
  });
  return { texto, params };
}

export function createConsultasRouter() {
  const router = Router();

  // --------------------------------------------------------
  // As consultas disponíveis, com os seus parâmetros
  // --------------------------------------------------------
  router.get('/consultas-disponiveis', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [consultas] = await pool.query<any[]>(
        `SELECT Id, COALESCE(grupo, '') AS grupo, titulo, COALESCE(descricao, '') AS descricao, COALESCE(arquivo, '') AS arquivo
           FROM consultas
          WHERE id_emp = ? OR id_emp IS NULL OR id_emp = 0
          ORDER BY grupo, titulo`,
        [idEmp],
      );
      if (!consultas.length) return res.json({ data: [] });

      const [parametros] = await pool.query<any[]>(
        `SELECT Id, id_consulta, caption_parametro, id_parametro, tipo_parametro,
                COALESCE(valor_padrao, '') AS valor_padrao
           FROM consultas_parametros
          WHERE id_consulta IN (?)
          ORDER BY Id`,
        [consultas.map((c) => c.Id)],
      );

      res.json({
        data: consultas.map((c) => ({
          ...c,
          parametros: parametros.filter((p) => Number(p.id_consulta) === Number(c.Id)),
        })),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Executar uma consulta
  // --------------------------------------------------------
  router.post('/consultas/:id/executar', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idConsulta = Number(req.params.id);

      const [consultas] = await pool.query<any[]>(
        `SELECT Id, titulo, \`sql\` FROM consultas
          WHERE Id = ? AND (id_emp = ? OR id_emp IS NULL OR id_emp = 0) LIMIT 1`,
        [idConsulta, idEmp],
      );
      if (!consultas.length) return res.status(404).json({ error: 'Consulta não encontrada.' });

      const texto = conferirConsultaDeLeitura(String(consultas[0].sql || ''));

      // Só os parâmetros cadastrados são aceitos, com o tipo declarado
      const [definicoes] = await pool.query<any[]>(
        'SELECT id_parametro, tipo_parametro, valor_padrao FROM consultas_parametros WHERE id_consulta = ?',
        [idConsulta],
      );

      const recebidos = (req.body?.parametros || {}) as Record<string, any>;
      const valores: Record<string, any> = {};
      for (const d of definicoes) {
        const chave = String(d.id_parametro || '').toUpperCase();
        if (!chave) continue;
        const bruto = recebidos[chave] ?? recebidos[d.id_parametro] ?? d.valor_padrao ?? '';
        if (d.tipo_parametro === 'N') {
          const n = Number(String(bruto).replace(',', '.'));
          valores[chave] = Number.isFinite(n) ? n : 0;
        } else if (d.tipo_parametro === 'D') {
          valores[chave] = String(bruto).slice(0, 10);
        } else {
          valores[chave] = String(bruto);
        }
      }

      const preparada = prepararConsulta(texto, idEmp, valores);
      // O teto vai por fora: grudar " LIMIT 5000" no fim quebraria uma consulta
      // que já tivesse o seu próprio LIMIT.
      const [linhas, campos] = await pool.query<any[]>(
        `SELECT * FROM (${preparada.texto}) AS resultado LIMIT 5000`,
        preparada.params,
      );

      res.json({
        titulo: consultas[0].titulo,
        colunas: (campos as any[])?.map((c) => c.name) || Object.keys(linhas[0] || {}),
        data: linhas,
        total: linhas.length,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
