import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';
import { PASTA_UPLOAD } from './server/lancamentos.js';

const PORT = Number(process.env.PORT) || 3000;

/** Entrada para execução local. Na Vercel quem serve as rotas é api/index.ts. */
async function startServer() {
  // Só aqui: na Vercel o disco é somente leitura e não há o que criar
  fs.mkdirSync(PASTA_UPLOAD, { recursive: true });

  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`myPlanner rodando em http://0.0.0.0:${PORT}`);
    console.log(`MySQL: ${process.env.MYSQL_HOST || '45.224.130.145'} / ${process.env.MYSQL_DATABASE || 'myplanner'}`);
    if (!process.env.SMTP_HOST) {
      console.log('SMTP não configurado: a chave de ativação aparece na própria tela.');
    }
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});
