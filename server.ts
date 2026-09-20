import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { checkDbHealth } from './server/db';
import { createAuthRouter } from './server/auth';
import { createCrudRouter } from './server/crud';
import { createDashboardRouter } from './server/dashboard';
import { createLancamentosRouter } from './server/lancamentos';
import { createPlanejamentoRouter } from './server/planejamento';
import { createBancosRouter } from './server/bancos';
import { createLimitesRouter } from './server/limites';
import { createConsultasRouter } from './server/consultas';
import { createCategoriasRouter } from './server/categorias';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  // O envio de comprovante usa o corpo cru e é tratado na própria rota;
  // todo o resto do sistema troca JSON. O limite acomoda um arquivo OFX inteiro.
  app.use(express.json({ limit: '15mb' }));

  // Comprovantes anexados aos lançamentos
  const pastaUpload = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  fs.mkdirSync(pastaUpload, { recursive: true });
  app.use('/uploads', express.static(pastaUpload));

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

  // ==========================================================
  // VITE / SPA
  // ==========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`myPlanner rodando em http://0.0.0.0:${PORT}`);
    console.log(`MySQL: ${process.env.MYSQL_HOST || '45.224.130.145'} / ${process.env.MYSQL_DATABASE || 'myplanner'}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});
