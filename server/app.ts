import express from 'express';
import fs from 'fs';
import { checkDbHealth } from './db.js';
import { createAuthRouter } from './auth.js';
import { createCrudRouter } from './crud.js';
import { createDashboardRouter } from './dashboard.js';
import { createLancamentosRouter, PASTA_UPLOAD } from './lancamentos.js';
import { createPlanejamentoRouter } from './planejamento.js';
import { createBancosRouter } from './bancos.js';
import { createLimitesRouter } from './limites.js';
import { createConsultasRouter } from './consultas.js';
import { createCategoriasRouter } from './categorias.js';

/**
 * Monta o app Express com todas as rotas /api, sem listen e sem Vite:
 *   local     -> server.ts acrescenta o Vite (ou o dist) e dá listen numa porta
 *   produção  -> api/index.ts exporta este app como função serverless da Vercel
 */
export function createApp() {
  const app = express();

  // Atrás do proxy da Vercel: req.protocol/host vêm dos cabeçalhos X-Forwarded-*
  app.set('trust proxy', true);

  // O envio de comprovante usa o corpo cru e é tratado na própria rota;
  // todo o resto do sistema troca JSON. O limite acomoda um arquivo OFX inteiro.
  app.use(express.json({ limit: '15mb' }));

  // Comprovantes já gravados. A pasta é criada por quem roda o servidor local:
  // na Vercel o disco é somente leitura e ela simplesmente não existe.
  if (fs.existsSync(PASTA_UPLOAD)) {
    app.use('/uploads', express.static(PASTA_UPLOAD));
  }

  // Saúde da conexão com o MySQL
  app.get('/api/db/status', async (_req, res) => {
    res.json(await checkDbHealth());
  });

  // Contas, login, configuração e preferências das listas
  app.use('/api/app', createAuthRouter());

  // Telas próprias
  app.use('/api', createDashboardRouter());
  app.use('/api', createLancamentosRouter());
  app.use('/api', createPlanejamentoRouter());
  app.use('/api', createBancosRouter());
  app.use('/api', createLimitesRouter());
  app.use('/api', createConsultasRouter());
  app.use('/api', createCategoriasRouter());

  // CRUD genérico dirigido pelo registro de metadados (por último: tem rota curinga)
  app.use('/api', createCrudRouter());

  // Rota /api desconhecida responde JSON, e não a página do front
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  return app;
}
