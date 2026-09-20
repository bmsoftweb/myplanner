import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool, hojeBrasilia, agoraBrasilia } from './db';
import { enviarEmail, corpoEmail, smtpConfigurado } from './mail';

/**
 * Contas, login e configuração.
 *
 * Uma conta é uma linha da tabela "empresas": nela ficam o e-mail principal, a
 * senha, o plano contratado e a chave de ativação. Dentro da conta podem existir
 * outros acessos na tabela "usuarios". Os dois entram pela mesma tela de login, e
 * em ambos os casos a sessão carrega o id_emp — a coluna que isola os dados.
 */

export const PLANOS = [
  { id: 1, nome: 'GRÁTIS', valor: 0, limite: 100, descricao: 'até 100 lançamentos por mês' },
  { id: 2, nome: 'PLANO 300', valor: 19.9, limite: 300, descricao: 'até 300 lançamentos por mês' },
  { id: 3, nome: 'PLANO FULL', valor: 29.9, limite: 0, descricao: 'lançamentos ilimitados' },
];

export function planoPorId(id: number) {
  return PLANOS.find((p) => p.id === Number(id)) || PLANOS[0];
}

/** Chave de ativação curta, no formato do sistema original (15 caracteres) */
function gerarChaveAtivacao(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 15);
}

/**
 * Confere a senha digitada contra o que está gravado.
 * A coluna senha é varchar(20) e guarda texto puro (herança do sistema Delphi);
 * os formatos de hash abaixo são aceitos para o caso de a coluna ser ampliada.
 */
export function senhaConfere(digitada: string, gravada: string): boolean {
  if (gravada === null || gravada === undefined) return false;
  const alvo = String(gravada);
  if (alvo.trim() === '') return false;
  if (digitada === alvo) return true;

  for (const algoritmo of ['md5', 'sha1', 'sha256']) {
    const hash = crypto.createHash(algoritmo).update(digitada).digest('hex');
    if (hash.toLowerCase() === alvo.toLowerCase()) return true;
  }
  return false;
}

const SN = (v: any) => String(v || '').toUpperCase() === 'S';

/** Converte a linha da tabela config no objeto usado pela interface */
export function configDaLinha(linha: any) {
  return {
    usar_previsao: SN(linha?.usar_previsao),
    usar_limites: SN(linha?.usar_limites),
    usar_bancos: SN(linha?.usar_bancos),
    usar_cc: SN(linha?.usar_cc),
    usar_metas: SN(linha?.usar_metas),
    usar_patrimonio: SN(linha?.usar_patrimonio),
    pagina_padrao: String(linha?.pagina_padrao || '1'),
  };
}

/** Lê (criando se faltar) a configuração da conta */
export async function lerConfig(idEmp: number) {
  const [linhas] = await pool.query<any[]>(
    'SELECT * FROM config WHERE id_emp = ? ORDER BY Id LIMIT 1',
    [idEmp],
  );
  if (linhas.length) return configDaLinha(linhas[0]);

  await pool.query(
    `INSERT INTO config (id_emp, usar_previsao, usar_limites, usar_bancos, usar_cc, usar_metas, usar_patrimonio, pagina_padrao)
     VALUES (?, 'S', 'S', 'S', 'S', 'S', 'N', '1')`,
    [idEmp],
  );
  return configDaLinha({
    usar_previsao: 'S', usar_limites: 'S', usar_bancos: 'S',
    usar_cc: 'S', usar_metas: 'S', usar_patrimonio: 'N', pagina_padrao: '1',
  });
}

/** Dados da sessão lidos dos cabeçalhos enviados pelo frontend */
export function sessaoDaRequisicao(req: Request): { idEmp: number; idUsuario: number } | null {
  const idEmp = Number(req.header('x-id-emp'));
  const idUsuario = Number(req.header('x-id-usuario'));
  if (!Number.isFinite(idEmp) || idEmp <= 0) return null;
  return { idEmp, idUsuario: Number.isFinite(idUsuario) ? idUsuario : 0 };
}

/** O id_emp da sessão; lança quando não há sessão válida */
export function tenantId(req: Request): number {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) throw new Error('Sessão inválida: conta não identificada. Entre novamente.');
  return sessao.idEmp;
}

export function createAuthRouter() {
  const router = Router();

  // --------------------------------------------------------
  // Entrar
  // --------------------------------------------------------
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const senha = String(req.body?.senha ?? '');

      if (!email) return res.status(400).json({ success: false, error: 'Informe o seu e-mail.' });
      if (!senha) return res.status(400).json({ success: false, error: 'Informe a sua senha.' });

      // 1. O dono da conta (tabela empresas)
      const [contas] = await pool.query<any[]>(
        `SELECT Id, nome, email, cpfcnpj, senha, chave, id_plano, ativado, data_validade, ativo
           FROM empresas WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
        [email],
      );

      let conta = contas[0] || null;
      let usuarioNome = conta?.nome || '';
      let usuarioId = 0;
      let principal = true;

      // 2. Um usuário cadastrado dentro de alguma conta
      if (!conta || !senhaConfere(senha, conta.senha)) {
        const [usuarios] = await pool.query<any[]>(
          `SELECT u.Id AS usuario_id, u.nome AS usuario_nome, u.senha AS usuario_senha,
                  e.Id, e.nome, e.email, e.cpfcnpj, e.chave, e.id_plano, e.ativado, e.data_validade, e.ativo
             FROM usuarios u
             JOIN empresas e ON e.Id = u.id_emp
            WHERE LOWER(TRIM(u.email)) = ? LIMIT 1`,
          [email],
        );
        const achado = usuarios[0];
        if (!achado || !senhaConfere(senha, achado.usuario_senha)) {
          return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos!' });
        }
        conta = achado;
        usuarioNome = achado.usuario_nome;
        usuarioId = Number(achado.usuario_id);
        principal = false;
      }

      if (String(conta.ativo || 'S').toUpperCase() === 'N') {
        return res.status(403).json({ success: false, error: 'Esta conta está inativa.' });
      }

      // Conta ainda não ativada: o frontend abre a tela da chave de ativação
      if (String(conta.ativado || '').toUpperCase() !== 'S') {
        return res.status(403).json({
          success: false,
          precisaAtivar: true,
          email: conta.email,
          nome: conta.nome,
          error: 'A sua conta ainda não foi ativada. Informe a chave de ativação que enviamos por e-mail.',
        });
      }

      await pool
        .query('UPDATE empresas SET ultima_atividade = ? WHERE Id = ?', [agoraBrasilia(), conta.Id])
        .catch(() => {});

      const config = await lerConfig(Number(conta.Id));

      res.json({
        success: true,
        conta: {
          id: String(conta.Id),
          nome: conta.nome || '',
          email: conta.email || '',
          cpfcnpj: conta.cpfcnpj || '',
          chave: conta.chave || '',
          id_plano: Number(conta.id_plano || 1),
          ativado: conta.ativado || 'N',
          data_validade: conta.data_validade || '',
        },
        usuario: {
          id: String(usuarioId),
          id_emp: String(conta.Id),
          nome: usuarioNome || conta.nome || '',
          email,
          principal,
        },
        config,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --------------------------------------------------------
  // Revalidação da sessão guardada no navegador
  // --------------------------------------------------------
  router.get('/sessao', async (req: Request, res: Response) => {
    try {
      const sessao = sessaoDaRequisicao(req);
      if (!sessao) return res.status(401).json({ valida: false, error: 'Sessão incompleta.' });

      const [linhas] = await pool.query<any[]>(
        `SELECT Id, id_plano, ativado, ativo FROM empresas WHERE Id = ? LIMIT 1`,
        [sessao.idEmp],
      );
      const conta = linhas[0];
      if (!conta || String(conta.ativo || 'S').toUpperCase() === 'N' || String(conta.ativado).toUpperCase() !== 'S') {
        return res.status(401).json({ valida: false, error: 'Sua sessão não é mais válida. Entre novamente.' });
      }

      // Um usuário secundário pode ter sido excluído depois do login
      if (sessao.idUsuario > 0) {
        const [us] = await pool.query<any[]>(
          'SELECT Id FROM usuarios WHERE Id = ? AND id_emp = ? LIMIT 1',
          [sessao.idUsuario, sessao.idEmp],
        );
        if (!us.length) {
          return res.status(401).json({ valida: false, error: 'O seu acesso foi removido desta conta.' });
        }
      }

      res.json({ valida: true, config: await lerConfig(sessao.idEmp), id_plano: Number(conta.id_plano || 1) });
    } catch (err: any) {
      res.status(503).json({ valida: null, error: err.message });
    }
  });

  // --------------------------------------------------------
  // Cadastro de conta nova
  // --------------------------------------------------------
  router.post('/cadastro', async (req: Request, res: Response) => {
    try {
      const nome = String(req.body?.nome || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const cpfcnpj = String(req.body?.cpfcnpj || '').replace(/\D/g, '');
      const senha = String(req.body?.senha ?? '');
      const senha2 = String(req.body?.senha2 ?? '');
      const idPlano = Number(req.body?.id_plano || 1);
      const aceitouTermos = req.body?.termos === true;

      if (!nome) return res.status(400).json({ error: 'Digite o seu nome por favor!' });
      if (!email) return res.status(400).json({ error: 'Digite o seu e-mail por favor!' });
      if (!senha) return res.status(400).json({ error: 'Digite uma senha por favor!' });
      if (senha.length < 6) return res.status(400).json({ error: 'Digite uma senha de 6 dígitos ou mais por favor!' });
      if (senha !== senha2) return res.status(400).json({ error: 'Senhas não conferem. Redigite por favor.' });
      if (!aceitouTermos) return res.status(400).json({ error: 'Você deve ler e aceitar os termos de uso, por favor!' });
      if (!PLANOS.some((p) => p.id === idPlano)) return res.status(400).json({ error: 'Plano inválido.' });

      const [jaExiste] = await pool.query<any[]>(
        'SELECT Id FROM empresas WHERE LOWER(TRIM(email)) = ? LIMIT 1',
        [email],
      );
      if (jaExiste.length) return res.status(400).json({ error: 'E-mail já cadastrado!' });

      const chave = gerarChaveAtivacao();
      // Período de avaliação de 10 dias, como no sistema original
      const validade = new Date(`${hojeBrasilia()}T12:00:00`);
      validade.setDate(validade.getDate() + 10);

      const [resultado] = await pool.query<any>(
        `INSERT INTO empresas (email, nome, cpfcnpj, senha, chave, id_plano, ativado, data_cadastro, data_validade, status, ativo)
         VALUES (?, ?, ?, ?, ?, ?, 'N', ?, ?, 'A', 'S')`,
        [email, nome, cpfcnpj, senha.slice(0, 20), chave, idPlano, hojeBrasilia(), validade.toISOString().slice(0, 10)],
      );
      const idEmp = Number(resultado.insertId);

      // A conta já nasce com a moeda Real e com a configuração padrão
      await pool.query("INSERT INTO moedas (id_emp, descricao) VALUES (?, 'Real')", [idEmp]);
      await lerConfig(idEmp);

      const enviado = await enviarEmail(
        email,
        'Meu Planejamento Financeiro - Chave de Ativação',
        corpoEmail(
          `Olá, ${nome}!`,
          `<p>A sua conta foi criada. Use a chave abaixo para ativá-la:</p>
           <p style="font-size:22px;font-weight:700;letter-spacing:.15em;background:#f5f5f4;padding:12px 16px;border-radius:8px;text-align:center">${chave}</p>
           <p style="color:#78716c;font-size:13px">Se você não fez este cadastro, ignore esta mensagem.</p>`,
        ),
      );

      res.json({
        success: true,
        email,
        // Sem SMTP configurado a chave volta na resposta para a tela mostrar
        chave: enviado ? undefined : chave,
        enviado,
        message: enviado
          ? 'Usuário cadastrado com sucesso. Abra o seu e-mail e copie a chave de ativação!'
          : 'Usuário cadastrado com sucesso. Anote a chave de ativação abaixo.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Ativar a conta com a chave recebida
  // --------------------------------------------------------
  router.post('/ativar', async (req: Request, res: Response) => {
    try {
      const chave = String(req.body?.chave || '').trim();
      if (!chave) return res.status(400).json({ error: 'Informe a chave de ativação.' });

      const [linhas] = await pool.query<any[]>(
        'SELECT Id, ativado FROM empresas WHERE chave = ? LIMIT 1',
        [chave],
      );
      if (!linhas.length) return res.status(400).json({ error: 'Chave inválida!' });
      if (String(linhas[0].ativado).toUpperCase() === 'S') {
        return res.status(400).json({ error: 'Chave já ativada!' });
      }

      await pool.query("UPDATE empresas SET ativado = 'S', data_alteracao = ? WHERE chave = ?", [
        hojeBrasilia(),
        chave,
      ]);
      res.json({ success: true, message: 'Sua conta foi ativada com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Reenviar a chave de ativação
  // --------------------------------------------------------
  router.post('/reenviar-chave', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const [linhas] = await pool.query<any[]>(
        'SELECT nome, email, chave, ativado FROM empresas WHERE LOWER(TRIM(email)) = ? LIMIT 1',
        [email],
      );
      if (!linhas.length) return res.status(400).json({ error: 'E-mail não cadastrado!' });
      const conta = linhas[0];
      if (String(conta.ativado).toUpperCase() === 'S') {
        return res.status(400).json({ error: 'Esta conta já está ativada. Entre normalmente.' });
      }

      const enviado = await enviarEmail(
        conta.email,
        'Meu Planejamento Financeiro - Chave de Ativação',
        corpoEmail(
          `Olá, ${conta.nome}!`,
          `<p>Esta é a chave de ativação da sua conta:</p>
           <p style="font-size:22px;font-weight:700;letter-spacing:.15em;background:#f5f5f4;padding:12px 16px;border-radius:8px;text-align:center">${conta.chave}</p>`,
        ),
      );

      res.json({
        success: true,
        enviado,
        chave: enviado ? undefined : conta.chave,
        message: enviado ? 'Enviamos a chave para o seu e-mail. Verifique!' : 'Esta é a sua chave de ativação.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Recuperar a senha
  // --------------------------------------------------------
  router.post('/recuperar-senha', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const [linhas] = await pool.query<any[]>(
        'SELECT nome, email, senha FROM empresas WHERE LOWER(TRIM(email)) = ? LIMIT 1',
        [email],
      );

      let conta = linhas[0];
      if (!conta) {
        const [us] = await pool.query<any[]>(
          'SELECT nome, email, senha FROM usuarios WHERE LOWER(TRIM(email)) = ? LIMIT 1',
          [email],
        );
        conta = us[0];
      }
      if (!conta) return res.status(400).json({ error: 'E-mail não cadastrado!' });

      if (!smtpConfigurado()) {
        return res.status(503).json({
          error: 'O envio de e-mail não está configurado neste servidor. Peça a redefinição da senha ao responsável pela conta.',
        });
      }

      await enviarEmail(
        conta.email,
        'Meu Planejamento Financeiro - Recuperação de Senha',
        corpoEmail(
          `Olá, ${conta.nome}!`,
          `<p>A senha de acesso da sua conta é:</p>
           <p style="font-size:20px;font-weight:700;background:#f5f5f4;padding:12px 16px;border-radius:8px;text-align:center">${conta.senha}</p>
           <p style="color:#78716c;font-size:13px">Recomendamos trocá-la depois de entrar.</p>`,
        ),
      );

      res.json({ success: true, message: 'Um e-mail foi enviado com a sua senha. Verifique!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Meus Dados — alteração do cadastro da conta
  // --------------------------------------------------------
  router.get('/meus-dados', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        `SELECT Id, nome, email, cpfcnpj, id_plano, ativado, data_cadastro, data_validade, ultima_atividade
           FROM empresas WHERE Id = ? LIMIT 1`,
        [idEmp],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Conta não encontrada.' });
      res.json({ ...linhas[0], plano: planoPorId(linhas[0].id_plano) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/meus-dados', async (req: Request, res: Response) => {
    try {
      const sessao = sessaoDaRequisicao(req);
      if (!sessao) return res.status(401).json({ error: 'Sessão inválida.' });
      // Só o dono da conta altera o cadastro dela
      if (sessao.idUsuario > 0) {
        return res.status(403).json({ error: 'Somente o e-mail principal da conta pode alterar estes dados.' });
      }

      const nome = String(req.body?.nome || '').trim();
      const cpfcnpj = String(req.body?.cpfcnpj || '').replace(/\D/g, '');
      const senha = String(req.body?.senha ?? '');
      if (!nome) return res.status(400).json({ error: 'Digite o seu nome por favor!' });
      if (senha && senha.length < 6) {
        return res.status(400).json({ error: 'Digite uma senha de 6 dígitos ou mais por favor!' });
      }

      const campos = ['nome = ?', 'cpfcnpj = ?', 'data_alteracao = ?'];
      const valores: any[] = [nome, cpfcnpj, hojeBrasilia()];
      if (senha) {
        campos.push('senha = ?');
        valores.push(senha.slice(0, 20));
      }
      valores.push(sessao.idEmp);

      await pool.query(`UPDATE empresas SET ${campos.join(', ')} WHERE Id = ?`, valores);
      res.json({ success: true, message: 'Dados alterados com sucesso!' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Planos
  // --------------------------------------------------------
  router.get('/planos', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>('SELECT id_plano, cpfcnpj FROM empresas WHERE Id = ?', [idEmp]);
      // Lançamentos já feitos no mês, para mostrar quanto do plano foi usado
      const [uso] = await pool.query<any[]>(
        `SELECT COUNT(*) AS c FROM lancamentos
          WHERE id_emp = ? AND EXTRACT(YEAR_MONTH FROM datahora_inclusao) = EXTRACT(YEAR_MONTH FROM CURRENT_DATE)`,
        [idEmp],
      );
      res.json({
        planos: PLANOS,
        id_plano: Number(linhas[0]?.id_plano || 1),
        cpfcnpj: linhas[0]?.cpfcnpj || '',
        lancamentosNoMes: Number(uso[0]?.c || 0),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/planos', async (req: Request, res: Response) => {
    try {
      const sessao = sessaoDaRequisicao(req);
      if (!sessao) return res.status(401).json({ error: 'Sessão inválida.' });
      if (sessao.idUsuario > 0) {
        return res.status(403).json({ error: 'Somente o e-mail principal da conta pode trocar o plano.' });
      }

      const idPlano = Number(req.body?.id_plano);
      const cpfcnpj = String(req.body?.cpfcnpj || '').replace(/\D/g, '');
      const plano = PLANOS.find((p) => p.id === idPlano);
      if (!plano) return res.status(400).json({ error: 'Plano inválido.' });
      if (plano.valor > 0 && cpfcnpj.length < 11) {
        return res.status(400).json({ error: 'Informe o CPF/CNPJ: é por ele que identificamos o seu pagamento.' });
      }

      await pool.query('UPDATE empresas SET id_plano = ?, cpfcnpj = ?, data_alteracao = ? WHERE Id = ?', [
        idPlano,
        cpfcnpj,
        hojeBrasilia(),
        sessao.idEmp,
      ]);
      res.json({ success: true, plano, message: `Plano alterado para ${plano.nome}.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Configurações (tabela config)
  // --------------------------------------------------------
  router.get('/config', async (req: Request, res: Response) => {
    try {
      res.json(await lerConfig(tenantId(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/config', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const c = req.body || {};
      const sn = (v: any) => (v === true || v === 'S' || v === 1 ? 'S' : 'N');
      const pagina = ['1', '2', '3'].includes(String(c.pagina_padrao)) ? String(c.pagina_padrao) : '1';

      await lerConfig(idEmp); // garante que a linha existe
      await pool.query(
        `UPDATE config SET usar_previsao = ?, usar_limites = ?, usar_bancos = ?,
                           usar_cc = ?, usar_metas = ?, usar_patrimonio = ?, pagina_padrao = ?
          WHERE id_emp = ?`,
        [
          sn(c.usar_previsao), sn(c.usar_limites), sn(c.usar_bancos),
          sn(c.usar_cc), sn(c.usar_metas), sn(c.usar_patrimonio), pagina, idEmp,
        ],
      );
      res.json({ success: true, config: await lerConfig(idEmp) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Enviar a senha por e-mail a um usuário da conta
  // --------------------------------------------------------
  router.post('/usuarios/:id/enviar-senha', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const [linhas] = await pool.query<any[]>(
        'SELECT nome, email, senha FROM usuarios WHERE Id = ? AND id_emp = ? LIMIT 1',
        [Number(req.params.id), idEmp],
      );
      if (!linhas.length) return res.status(404).json({ error: 'Usuário não encontrado nesta conta.' });
      const usuario = linhas[0];
      if (!usuario.senha) return res.status(400).json({ error: 'Este usuário ainda não tem senha cadastrada.' });
      if (!smtpConfigurado()) {
        return res.status(503).json({ error: 'O envio de e-mail não está configurado neste servidor.' });
      }

      await enviarEmail(
        usuario.email,
        'Meu Planejamento Financeiro - Sua senha de acesso',
        corpoEmail(
          `Olá, ${usuario.nome}!`,
          `<p>A sua senha de acesso é:</p>
           <p style="font-size:20px;font-weight:700;background:#f5f5f4;padding:12px 16px;border-radius:8px;text-align:center">${usuario.senha}</p>`,
        ),
      );
      res.json({ success: true, message: `Senha enviada para ${usuario.email}.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Preferências das listas (larguras, ordem e colunas visíveis).
  //
  // Ficam em usuarios.config_listas, uma por pessoa. O dono da conta entra pela
  // tabela empresas e não tem linha em usuarios, então para ele as listas abrem
  // sempre no formato padrão — é o combinado, e o PUT avisa isso em "guardado".
  // --------------------------------------------------------
  router.get('/config-listas', async (req: Request, res: Response) => {
    try {
      const sessao = sessaoDaRequisicao(req);
      if (!sessao) return res.status(401).json({ error: 'Sessão incompleta.' });
      if (!sessao.idUsuario) return res.json({});

      const [linhas] = await pool.query<any[]>(
        'SELECT config_listas FROM usuarios WHERE Id = ? AND id_emp = ? LIMIT 1',
        [sessao.idUsuario, sessao.idEmp],
      );
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(linhas[0]?.config_listas || '{}') || {};
      } catch {
        // conteúdo inválido no banco não impede a tela de abrir
      }
      res.json(config);
    } catch (err: any) {
      // A coluna config_listas é opcional: sem ela as listas usam o padrão
      if (err?.code === 'ER_BAD_FIELD_ERROR') return res.json({});
      res.status(503).json({ error: err.message });
    }
  });

  router.put('/config-listas', async (req: Request, res: Response) => {
    try {
      const sessao = sessaoDaRequisicao(req);
      if (!sessao) return res.status(401).json({ error: 'Sessão incompleta.' });

      const corpo = req.body;
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
        return res.status(400).json({ error: 'Configuração inválida.' });
      }
      const texto = JSON.stringify(corpo);
      if (texto.length > 60000) return res.status(413).json({ error: 'Configuração muito grande.' });

      if (!sessao.idUsuario) {
        return res.json({
          success: true,
          guardado: false,
          motivo:
            'O formato das listas é guardado por usuário, na tabela usuarios. ' +
            'O e-mail principal da conta não tem cadastro de usuário, então as listas abrem sempre no padrão.',
        });
      }

      const [r] = await pool.query<any>(
        'UPDATE usuarios SET config_listas = ? WHERE Id = ? AND id_emp = ?',
        [texto, sessao.idUsuario, sessao.idEmp],
      );
      if (!r.affectedRows) return res.status(404).json({ error: 'Usuário da sessão não encontrado.' });
      res.json({ success: true, guardado: true });
    } catch (err: any) {
      if (err?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(501).json({
          error:
            'A coluna usuarios.config_listas ainda não existe no banco. ' +
            'Crie-a para guardar o formato das listas: ALTER TABLE usuarios ADD COLUMN config_listas MEDIUMTEXT NULL;',
        });
      }
      res.status(503).json({ error: err.message });
    }
  });

  return router;
}
