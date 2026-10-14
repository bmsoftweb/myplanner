import express from 'express';
import { checkDbHealth } from './db.js';
import { createAuthRouter } from './auth.js';
import { createCrudRouter } from './crud.js';
import { createDashboardRouter } from './dashboard.js';
import { createLancamentosRouter } from './lancamentos.js';
import { createAnexosRouter } from './anexos.js';
import { createPlanejamentoRouter } from './planejamento.js';
import { createBancosRouter } from './bancos.js';
import { createLimitesRouter } from './limites.js';
import { createConsultasRouter } from './consultas.js';
import { createCategoriasRouter } from './categorias.js';
import { sessaoDaRequisicao, SemSessao } from './sessao.js';

/**
 * Monta o app Express com todas as rotas /api, sem listen e sem Vite:
 *   local     -> server.ts acrescenta o Vite (ou o dist) e dá listen numa porta
 *   produção  -> api/index.ts exporta este app como função serverless da Vercel
 */
export function createApp() {
  const app = express();

  // Atrás do proxy da Vercel: req.protocol/host vêm dos cabeçalhos X-Forwarded-*
  app.set('trust proxy', true);

  // Todo o sistema troca JSON. O limite acomoda um arquivo OFX inteiro.
  app.use(express.json({ limit: '15mb' }));

  // Saúde da conexão com o MySQL
  app.get('/api/db/status', async (_req, res) => {
    res.json(await checkDbHealth());
  });

  /**
   * Tudo em /api exige sessão, menos o que é usado por quem ainda não entrou.
   * A porta fica fechada por padrão: uma rota nova já nasce protegida, em vez de
   * depender de o autor lembrar de pedir a conta.
   */
  const ROTAS_PUBLICAS = new Set([
    '/db/status',
    '/app/login',
    '/app/logout',
    '/app/cadastro',
    '/app/ativar',
    '/app/reenviar-chave',
    '/app/recuperar-senha',
  ]);

  app.use('/api', (req, res, next) => {
    if (ROTAS_PUBLICAS.has(req.path)) return next();

    const { sessao, motivo } = sessaoDaRequisicao(req, res);
    if (!sessao) {
      return res.status(401).json({ error: new SemSessao(motivo).message, motivo });
    }
    next();
  });

  // Contas, login, configuração e preferências das listas
  app.use('/api/app', createAuthRouter());

  // Telas próprias
  app.use('/api', createDashboardRouter());
  app.use('/api', createLancamentosRouter());
  app.use('/api', createAnexosRouter());
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
