import crypto from 'crypto';
import type { Request, Response } from 'express';

/**
 * Sessão assinada em cookie: é ela que diz de qual conta a requisição pode ler e
 * gravar. Antes isso vinha dos cabeçalhos x-id-emp / x-id-usuario, que qualquer
 * pessoa podia forjar para enxergar e alterar os dados de outra conta.
 */
export interface Sessao {
  /** empresas.Id — a conta, e o id_emp que isola os dados */
  idEmp: number;
  /** usuarios.Id, ou 0 quando é o dono da conta (o e-mail principal) */
  idUsuario: number;
  /** Expiração, em segundos desde 1970 */
  exp: number;
}

export const COOKIE_SESSAO = 'myplanner_sessao';

/** Tempo de inatividade que desconecta o usuário (a sessão desliza a cada requisição) */
const VALIDADE_SEGUNDOS = 60 * 60 * 24 * 7;
/** Quanto do prazo precisa ter sido consumido para valer a pena renovar o cookie */
const RENOVAR_APOS_SEGUNDOS = 60 * 60 * 24;

const COMO_GERAR =
  'Gere um com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

// Em produção a variável é obrigatória, e a falta dela derruba o carregamento do
// módulo de propósito: em hospedagem que roda várias instâncias (Vercel), cada
// uma sortearia a sua chave, e o cookie assinado pela instância que atendeu o
// login seria recusado por qualquer outra — o usuário cairia sozinho. Falhando já
// na publicação, o problema aparece na hora, e não como relato de usuário.
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    '[sessao] SESSION_SECRET não definido. É obrigatório em produção: sem ele cada instância ' +
      'assina o cookie com uma chave própria e os usuários são desconectados sozinhos. Defina a ' +
      'variável na hospedagem (Vercel: Settings > Environment Variables) e publique de novo. ' +
      COMO_GERAR,
  );
}

// Sem a variável, sorteia-se um segredo: as sessões caem a cada reinício, mas
// nunca se assina com uma chave conhecida.
const segredo = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[sessao] SESSION_SECRET não definido: todos os usuários caem a cada reinício do servidor. ' +
      'Defina SESSION_SECRET no .env. ' +
      COMO_GERAR,
  );
}

function assinar(corpo: string) {
  return crypto.createHmac('sha256', segredo).update(corpo).digest('base64url');
}

export function criarToken(dados: Omit<Sessao, 'exp'>): string {
  const sessao: Sessao = { ...dados, exp: Math.floor(Date.now() / 1000) + VALIDADE_SEGUNDOS };
  const corpo = Buffer.from(JSON.stringify(sessao)).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

/**
 * Por que um token foi recusado. Existe porque "sessão inválida" é a mesma
 * mensagem para causas bem diferentes — cookie que nem chegou, assinatura que não
 * confere (SESSION_SECRET diferente entre instâncias ou entre publicações) e
 * prazo vencido —, e sem distinguir não dá para investigar um relato.
 */
export type MotivoSemSessao = 'ausente' | 'malformado' | 'assinatura' | 'expirada' | 'sem_conta';

export function lerToken(token: string | undefined): { sessao: Sessao | null; motivo?: MotivoSemSessao } {
  if (!token) return { sessao: null, motivo: 'ausente' };

  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return { sessao: null, motivo: 'malformado' };

  const esperada = assinar(corpo);
  if (
    assinatura.length !== esperada.length ||
    !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))
  ) {
    return { sessao: null, motivo: 'assinatura' };
  }

  try {
    const sessao = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as Sessao;
    if (!sessao.idEmp) return { sessao: null, motivo: 'sem_conta' };
    if (sessao.exp * 1000 < Date.now()) return { sessao: null, motivo: 'expirada' };
    return { sessao };
  } catch {
    return { sessao: null, motivo: 'malformado' };
  }
}

/** Lê um cookie do cabeçalho, sem depender de cookie-parser */
function lerCookie(req: Request, nome: string): string | undefined {
  const bruto = req.headers.cookie;
  if (!bruto) return undefined;
  for (const parte of bruto.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() === nome) {
      return decodeURIComponent(parte.slice(igual + 1).trim());
    }
  }
  return undefined;
}

/**
 * Opções do cookie.
 *
 * O "secure" sai do protocolo REAL da requisição, e não de NODE_ENV: marcado como
 * secure fora de HTTPS, o navegador descarta o cookie em silêncio, e quem rodasse
 * a versão de produção em http://ip:3000 não conseguiria entrar. Atrás de proxy
 * (Vercel), quem diz o protocolo é o x-forwarded-proto, que o Express já lê por
 * causa do trust proxy.
 */
function opcoesCookie(req: Request, lembrar: boolean) {
  return {
    path: '/',
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: 'lax' as const,
    // Sem "lembrar", o cookie morre quando o navegador fecha
    ...(lembrar ? { maxAge: VALIDADE_SEGUNDOS * 1000 } : {}),
  };
}

export function gravarSessao(req: Request, res: Response, dados: Omit<Sessao, 'exp'>, lembrar: boolean) {
  res.cookie(COOKIE_SESSAO, criarToken(dados), opcoesCookie(req, lembrar));
}

export function apagarSessao(req: Request, res: Response) {
  res.clearCookie(COOKIE_SESSAO, { path: '/', httpOnly: true, secure: req.protocol === 'https', sameSite: 'lax' });
}

/**
 * Sessão da requisição, ou null quando não há cookie válido.
 *
 * A sessão é deslizante: cada requisição autenticada empurra o prazo para frente,
 * então o que desconecta é ficar uma semana sem usar, e não o tempo corrido desde
 * o login. A renovação só acontece depois que um dia do prazo foi consumido, para
 * não mandar um Set-Cookie em toda resposta.
 */
export function sessaoDaRequisicao(
  req: Request,
  res?: Response,
): { sessao: Sessao | null; motivo?: MotivoSemSessao } {
  const resultado = lerToken(lerCookie(req, COOKIE_SESSAO));
  const { sessao, motivo } = resultado;
  if (!sessao) return resultado;

  if (res && !res.headersSent) {
    const restante = sessao.exp - Math.floor(Date.now() / 1000);
    if (restante < VALIDADE_SEGUNDOS - RENOVAR_APOS_SEGUNDOS) {
      // Renova mantendo o tipo do cookie: o navegador já não diz se era "lembrar",
      // então mantém-se persistente, que é o caso de quem fica uma semana logado.
      gravarSessao(req, res, { idEmp: sessao.idEmp, idUsuario: sessao.idUsuario }, true);
    }
  }
  return { sessao, motivo };
}

export class SemSessao extends Error {
  readonly motivo: MotivoSemSessao;

  constructor(motivo: MotivoSemSessao = 'ausente') {
    super(
      motivo === 'assinatura'
        ? 'Sessão inválida para este servidor. Entre novamente.'
        : 'Sua sessão expirou. Entre novamente.',
    );
    this.motivo = motivo;
  }
}
