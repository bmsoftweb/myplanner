import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { del, get } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { pool, agoraBrasilia } from './db.js';
import { tenantId } from './auth.js';

/**
 * Anexos dos lançamentos (comprovantes e outros documentos) no Vercel Blob privado.
 *
 * O navegador envia o arquivo direto para o Blob (sem o limite de 4,5 MB de uma
 * requisição na Vercel) depois que ./upload confere o lançamento e libera o envio;
 * em seguida grava o registro em lancamentos_anexos. Como o store é privado, o
 * arquivo só é lido por aqui (GET /anexos/:id), depois de conferir a conta.
 * Precisa de BLOB_READ_WRITE_TOKEN.
 */

export const MAX_ANEXO = 20 * 1024 * 1024;

const TIPOS_ANEXO = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'text/xml', 'application/xml',
  'application/zip', 'application/x-zip-compressed',
];

/** Pasta de um lançamento no Blob (o Id é único entre as contas): o envio só é liberado dentro dela */
export const pastaDoLancamento = (idLanc: number) => `lancamentos/${idLanc}/`;

async function lancamentoDaConta(idLanc: number, idEmp: number) {
  const [linhas] = await pool.query<any[]>('SELECT Id FROM lancamentos WHERE Id = ? AND id_emp = ?', [idLanc, idEmp]);
  return linhas.length > 0;
}

/** Apaga do Blob; falha aqui não desfaz a exclusão, só deixa o arquivo órfão */
export async function apagarDoBlob(urls: string[]) {
  if (!urls.length) return;
  await del(urls).catch((e) => console.error(`Anexos: não apagou do Blob: ${e.message}`));
}

export function createAnexosRouter() {
  const router = Router();

  const semStorage = (res: Response) =>
    res.status(503).json({
      error: 'Armazenamento de anexos não configurado (BLOB_READ_WRITE_TOKEN).',
    });

  // Libera o envio direto do navegador para a pasta do lançamento
  router.post('/lancamentos/:id/anexos/upload', async (req: Request, res: Response) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return semStorage(res);
    try {
      const idEmp = tenantId(req);
      const idLanc = Number(req.params.id);
      if (!(await lancamentoDaConta(idLanc, idEmp))) {
        return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });
      }
      const r = await handleUpload({
        request: req,
        body: req.body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(pastaDoLancamento(idLanc))) throw new Error('Caminho do arquivo inválido.');
          return { allowedContentTypes: TIPOS_ANEXO, maximumSizeInBytes: MAX_ANEXO, addRandomSuffix: true };
        },
      });
      res.json(r);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Envio não liberado.' });
    }
  });

  // Lista
  router.get('/lancamentos/:id/anexos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        `SELECT id, nome, tipo, tamanho, datahora_inclusao
           FROM lancamentos_anexos
          WHERE id_emp = ? AND id_lancamento = ?
          ORDER BY id`,
        [idEmp, Number(req.params.id)],
      );
      res.json({ data: linhas });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // Grava o registro de um arquivo já enviado ao Blob
  router.post('/lancamentos/:id/anexos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const idLanc = Number(req.params.id);
      if (!(await lancamentoDaConta(idLanc, idEmp))) {
        return res.status(404).json({ error: 'Lançamento não encontrado nesta conta.' });
      }
      const url = String(req.body?.url || '');
      const pathname = String(req.body?.pathname || '');
      // O endereço tem de ser do Blob e da pasta deste lançamento
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {}
      if (!host.endsWith('.blob.vercel-storage.com') || !pathname.startsWith(pastaDoLancamento(idLanc))) {
        return res.status(400).json({ error: 'Endereço do arquivo inválido.' });
      }
      const [r] = await pool.query<any>(
        `INSERT INTO lancamentos_anexos (id_emp, id_lancamento, nome, tipo, tamanho, url, pathname, datahora_inclusao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idEmp,
          idLanc,
          String(req.body?.nome || 'arquivo').slice(0, 150),
          String(req.body?.tipo || '').slice(0, 100),
          Math.max(0, Math.trunc(Number(req.body?.tamanho) || 0)),
          url.slice(0, 500),
          pathname.slice(0, 300),
          agoraBrasilia(),
        ],
      );
      res.json({ success: true, id: r.insertId });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // Abre um arquivo: confere a conta e repassa o conteúdo do Blob privado
  router.get('/anexos/:id', async (req: Request, res: Response) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return semStorage(res);
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        'SELECT nome, url FROM lancamentos_anexos WHERE id = ? AND id_emp = ?',
        [Number(req.params.id), idEmp],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Arquivo não encontrado.' });

      const arquivo = await get(linhas[0].url, { access: 'private' });
      if (!arquivo || arquivo.statusCode !== 200) return res.status(404).json({ error: 'Arquivo não encontrado no armazenamento.' });

      res.setHeader('Content-Type', arquivo.blob.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(arquivo.blob.size));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(linhas[0].nome)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      Readable.fromWeb(arquivo.stream as any).pipe(res);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Remove um arquivo
  router.delete('/anexos/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        'SELECT url FROM lancamentos_anexos WHERE id = ? AND id_emp = ?',
        [Number(req.params.id), idEmp],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      await pool.query('DELETE FROM lancamentos_anexos WHERE id = ? AND id_emp = ?', [Number(req.params.id), idEmp]);
      await apagarDoBlob([linhas[0].url]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
