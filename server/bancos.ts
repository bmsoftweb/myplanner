import { Router, Request, Response } from 'express';
import { pool, hojeBrasilia } from './db.js';
import { tenantId } from './auth.js';

/**
 * Extrato bancário, transferência entre contas e importação de arquivos OFX.
 * O cadastro de bancos em si é atendido pelo CRUD genérico (/api/crud/bancos).
 */

export function createBancosRouter() {
  const router = Router();

  // --------------------------------------------------------
  // Extrato de uma conta, com saldo acumulado linha a linha
  // --------------------------------------------------------
  router.get('/bancos/:id/extrato', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idBanco = Number(req.params.id);
      const d1 = String(req.query.d1 || '1980-01-01').slice(0, 10);
      const d2 = String(req.query.d2 || '2099-12-31').slice(0, 10);

      const [bancos] = await pool.query<any[]>(
        'SELECT Id, descricao, apelido, COALESCE(saldo_inicial, 0) AS saldo_inicial, data_saldo_inicial FROM bancos WHERE Id = ? AND id_emp = ?',
        [idBanco, idEmp],
      );
      if (!bancos.length) return res.status(404).json({ error: 'Banco não encontrado nesta conta.' });
      const banco = bancos[0];

      // O que é anterior ao período vira um número só, somado no banco: não há
      // por que trazer o histórico inteiro da conta para exibir um mês.
      const [anterior] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(IF(c.tipo = 'R', a.valor_realizado, -a.valor_realizado)), 0) AS soma
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id = a.id_categoria
           LEFT JOIN categorias     c ON c.Id = b.id_cat
          WHERE a.id_emp = ? AND a.id_banco = ?
            AND a.data_realizado IS NOT NULL AND a.data_realizado < ?`,
        [idEmp, idBanco, d1],
      );

      // Só o movimento do período pedido
      const [movimento] = await pool.query<any[]>(
        `SELECT a.Id AS id_lanc,
                a.data_realizado AS data,
                COALESCE(a.documento, '') AS documento,
                COALESCE(b.descricao, '') AS categoria,
                COALESCE(a.historico, '') AS historico,
                COALESCE(f.descricao, '') AS centro_custo,
                COALESCE(g.descricao, '') AS limite,
                COALESCE(d.descricao, '') AS tipo,
                IF(c.tipo = 'R', '+', '-') AS es,
                COALESCE(a.valor_realizado, 0) AS valor
           FROM lancamentos a
           LEFT JOIN categorias_sub b ON b.Id   = a.id_categoria
           LEFT JOIN categorias     c ON c.Id   = b.id_cat
           LEFT JOIN tipos_doc      d ON d.tipo = a.tipo_doc
           LEFT JOIN centroscustos  f ON f.Id   = a.id_cc
           LEFT JOIN limites        g ON g.Id   = a.id_limite
          WHERE a.id_emp = ? AND a.id_banco = ?
            AND a.data_realizado BETWEEN ? AND ?
          ORDER BY a.data_realizado, a.Id`,
        [idEmp, idBanco, d1, d2],
      );

      // O saldo inicial da conta entra antes de tudo, como no sistema original
      const saldoAnterior = Number(banco.saldo_inicial || 0) + Number(anterior[0]?.soma || 0);
      let saldo = saldoAnterior;

      const linhas: any[] = [];
      const dataSaldo = banco.data_saldo_inicial || '';
      if (dataSaldo && dataSaldo >= d1 && dataSaldo <= d2) {
        linhas.push({
          id_lanc: 0,
          data: dataSaldo,
          documento: '',
          categoria: 'SALDO INICIAL',
          historico: 'Saldo Inicial',
          centro_custo: '',
          limite: '',
          tipo: '',
          es: '+',
          valor: Number(banco.saldo_inicial || 0),
          saldo,
        });
      }

      for (const m of movimento) {
        saldo += Number(m.valor || 0) * (m.es === '+' ? 1 : -1);
        linhas.push({ ...m, valor: Number(m.valor || 0), saldo });
      }

      res.json({
        banco: { id: String(banco.Id), descricao: banco.descricao, apelido: banco.apelido || '' },
        periodo: { d1, d2 },
        saldoAnterior,
        saldoFinal: saldo,
        data: linhas,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Transferência entre contas
  // Gera dois lançamentos realizados: a saída na conta de débito e a entrada
  // na conta de crédito, com a mesma data, o mesmo valor e o mesmo histórico.
  // --------------------------------------------------------
  router.post('/bancos/transferencia', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idBancoDebito = Number(req.body?.id_banco_debito || 0);
      const idBancoCredito = Number(req.body?.id_banco_credito || 0);
      const idSubCatDebito = Number(req.body?.id_categoria_debito || 0);
      const idSubCatCredito = Number(req.body?.id_categoria_credito || 0);
      const idMeta = Number(req.body?.id_meta || 0);
      const valor = Number(String(req.body?.valor ?? '').replace(',', '.'));
      const data = String(req.body?.data || hojeBrasilia()).slice(0, 10);
      const historico = String(req.body?.historico || 'Transferência entre contas').slice(0, 40);

      if (!idBancoDebito || !idBancoCredito) {
        return res.status(400).json({ error: 'Escolha a conta de débito e a conta de crédito.' });
      }
      if (idBancoDebito === idBancoCredito) {
        return res.status(400).json({ error: 'As contas de débito e de crédito devem ser diferentes.' });
      }
      if (!idSubCatDebito || !idSubCatCredito) {
        return res.status(400).json({ error: 'Escolha a categoria de saída e a categoria de entrada.' });
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        return res.status(400).json({ error: 'Digite o valor a transferir.' });
      }

      // As contas e as categorias precisam ser desta conta do sistema
      const [conferencia] = await pool.query<any[]>(
        `SELECT
           (SELECT COUNT(*) FROM bancos WHERE id_emp = ? AND Id IN (?, ?)) AS bancos,
           (SELECT COUNT(*) FROM categorias_sub WHERE id_emp = ? AND Id IN (?, ?)) AS categorias`,
        [idEmp, idBancoDebito, idBancoCredito, idEmp, idSubCatDebito, idSubCatCredito],
      );
      if (Number(conferencia[0]?.bancos) !== 2 || Number(conferencia[0]?.categorias) !== 2) {
        return res.status(400).json({ error: 'Conta ou categoria não pertence a este cadastro.' });
      }

      // A saída precisa ser uma despesa e a entrada uma receita, senão o extrato
      // das duas contas anda para o mesmo lado.
      const [tipos] = await pool.query<any[]>(
        `SELECT s.Id, c.tipo FROM categorias_sub s JOIN categorias c ON c.Id = s.id_cat WHERE s.Id IN (?, ?)`,
        [idSubCatDebito, idSubCatCredito],
      );
      const tipoDe = (id: number) => tipos.find((t) => Number(t.Id) === id)?.tipo;
      if (tipoDe(idSubCatDebito) !== 'D') {
        return res.status(400).json({ error: 'A categoria da conta de débito precisa ser de despesa.' });
      }
      if (tipoDe(idSubCatCredito) !== 'R') {
        return res.status(400).json({ error: 'A categoria da conta de crédito precisa ser de receita.' });
      }

      const conexao = await pool.getConnection();
      try {
        await conexao.beginTransaction();
        const gravar = (idBanco: number, idCategoria: number) =>
          conexao.query(
            `INSERT INTO lancamentos
               (id_emp, id_categoria, id_banco, id_meta, data_realizado, data_sort, valor_realizado,
                historico, tipo_doc, documento, analise, recorrente, status, comprovante_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DB', '', 'N', 'N', 'O', '')`,
            [idEmp, idCategoria, idBanco, idMeta || null, data, data, valor, historico],
          );

        await gravar(idBancoDebito, idSubCatDebito);
        await gravar(idBancoCredito, idSubCatCredito);
        await conexao.commit();
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }

      // A transferência não é receita nem despesa do orçamento: os dois
      // lançamentos nascem fora da análise para não distorcer o planejamento.
      res.json({ success: true, message: 'Transferência gravada nas duas contas.' });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // --------------------------------------------------------
  // Importação de OFX: primeiro o arquivo é lido e conferido,
  // depois o usuário categoriza e manda gravar.
  // --------------------------------------------------------
  router.post('/bancos/:id/ofx/ler', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idBanco = Number(req.params.id);
      const conteudo = String(req.body?.conteudo || '');
      if (!conteudo.trim()) return res.status(400).json({ error: 'Envie o conteúdo do arquivo OFX.' });

      const [bancos] = await pool.query<any[]>('SELECT Id FROM bancos WHERE Id = ? AND id_emp = ?', [idBanco, idEmp]);
      if (!bancos.length) return res.status(404).json({ error: 'Banco não encontrado nesta conta.' });

      const transacoes = lerOfx(conteudo);
      if (!transacoes.length) {
        return res.status(400).json({ error: 'Nenhum lançamento foi encontrado no arquivo. Confira se o arquivo é um OFX.' });
      }

      // Lançamentos já importados antes são marcados para não duplicar
      const fitids = transacoes.map((t) => t.fitid).filter(Boolean);
      let jaImportados = new Set<string>();
      if (fitids.length) {
        const [existentes] = await pool.query<any[]>(
          'SELECT fitid FROM lancamentos WHERE id_emp = ? AND fitid IN (?)',
          [idEmp, fitids],
        );
        jaImportados = new Set(existentes.map((e) => String(e.fitid)));
      }

      res.json({
        data: transacoes.map((t) => ({
          ...t,
          ja_importado: jaImportados.has(t.fitid),
          importar: !jaImportados.has(t.fitid),
          id_categoria: 0,
          id_cc: 0,
          id_limite: 0,
          tipo_doc: t.valor >= 0 ? 'CT' : 'DB',
          complemento_historico: '',
        })),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/bancos/:id/ofx/gravar', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idBanco = Number(req.params.id);
      const itens: any[] = Array.isArray(req.body?.itens) ? req.body.itens : [];

      const [bancos] = await pool.query<any[]>('SELECT Id FROM bancos WHERE Id = ? AND id_emp = ?', [idBanco, idEmp]);
      if (!bancos.length) return res.status(404).json({ error: 'Banco não encontrado nesta conta.' });

      const aImportar = itens.filter((i) => i?.importar && !i?.ja_importado);
      if (!aImportar.length) return res.status(400).json({ error: 'Nenhum lançamento foi marcado para importar.' });
      if (aImportar.some((i) => !Number(i.id_categoria))) {
        return res.status(400).json({ error: 'Existem lançamentos sem categoria!' });
      }

      const conexao = await pool.getConnection();
      let gravados = 0;
      try {
        await conexao.beginTransaction();
        for (const item of aImportar) {
          const data = String(item.data || '').slice(0, 10);
          const valor = Math.abs(Number(item.valor || 0));
          const historico = [String(item.memo || ''), String(item.complemento_historico || '')]
            .filter(Boolean)
            .join(' / ')
            .slice(0, 40);

          await conexao.query(
            `INSERT INTO lancamentos
               (id_emp, id_categoria, id_cc, id_banco, id_limite, data_realizado, data_sort,
                valor_realizado, historico, documento, tipo_doc, analise, recorrente, status, fitid, comprovante_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'S', 'N', 'O', ?, '')`,
            [
              idEmp,
              Number(item.id_categoria),
              Number(item.id_cc) || null,
              idBanco,
              Number(item.id_limite) || null,
              data,
              data,
              valor,
              historico,
              String(item.chknum || '').slice(0, 15),
              String(item.tipo_doc || 'DB').slice(0, 2),
              String(item.fitid || '').slice(0, 20),
            ],
          );
          gravados++;
        }
        await conexao.commit();
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }

      res.json({ success: true, gravados, message: `Importação terminada: ${gravados} lançamento(s).` });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}

export interface TransacaoOfx {
  fitid: string;
  data: string;
  valor: number;
  memo: string;
  chknum: string;
}

/**
 * Lê os lançamentos de um arquivo OFX.
 *
 * OFX é SGML, não XML: as tags podem não ter fechamento. Por isso cada valor é
 * lido até o fim da linha ou até a próxima tag, e não por um par <x>...</x>.
 */
export function lerOfx(conteudo: string): TransacaoOfx[] {
  const transacoes: TransacaoOfx[] = [];
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);

  const valorDaTag = (bloco: string, tag: string): string => {
    const achado = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i').exec(bloco);
    return achado ? achado[1].trim() : '';
  };

  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0];

    // DTPOSTED vem como AAAAMMDD, às vezes seguido de hora e fuso
    const dtposted = valorDaTag(bloco, 'DTPOSTED').replace(/\D/g, '');
    if (dtposted.length < 8) continue;
    const data = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`;

    const valorTexto = valorDaTag(bloco, 'TRNAMT').replace(',', '.');
    const valor = Number(valorTexto);
    if (!Number.isFinite(valor)) continue;

    transacoes.push({
      fitid: valorDaTag(bloco, 'FITID').slice(0, 20),
      data,
      valor,
      memo: valorDaTag(bloco, 'MEMO') || valorDaTag(bloco, 'NAME'),
      chknum: valorDaTag(bloco, 'CHECKNUM'),
    });
  }

  return transacoes;
}
