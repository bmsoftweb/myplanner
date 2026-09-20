import { Conta, UsuarioSessao } from '../types';

/**
 * Sessão e a opção "Lembrar-me neste computador".
 *
 * - Marcada: a sessão fica no localStorage (sobrevive ao fechar o navegador) e o
 *   e-mail é guardado para vir preenchido no próximo acesso.
 * - Desmarcada: a sessão fica no sessionStorage (termina ao fechar o navegador)
 *   e nenhum dado de acesso é guardado.
 *
 * A senha nunca é armazenada.
 */

const SESSAO_USUARIO = 'myplanner_sessao_usuario';
const SESSAO_CONTA = 'myplanner_sessao_conta';
const LEMBRETE = 'myplanner_lembrar_dispositivo';

/** O acesso ao storage pode lançar exceção (modo privado, bloqueio de cookies) */
function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

function lerJson<T>(chave: string): T | null {
  return seguro(() => {
    const bruto = localStorage.getItem(chave) ?? sessionStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  }, null);
}

export function lerSessao(): { usuario: UsuarioSessao | null; conta: Conta | null } {
  return {
    usuario: lerJson<UsuarioSessao>(SESSAO_USUARIO),
    conta: lerJson<Conta>(SESSAO_CONTA),
  };
}

export function salvarSessao(usuario: UsuarioSessao, conta: Conta, lembrar: boolean) {
  seguro(() => {
    const destino = lembrar ? localStorage : sessionStorage;
    const outro = lembrar ? sessionStorage : localStorage;
    destino.setItem(SESSAO_USUARIO, JSON.stringify(usuario));
    destino.setItem(SESSAO_CONTA, JSON.stringify(conta));
    // Evita que sobre uma cópia no armazenamento que não foi escolhido
    outro.removeItem(SESSAO_USUARIO);
    outro.removeItem(SESSAO_CONTA);
  }, undefined);
}

export function limparSessao() {
  seguro(() => {
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(SESSAO_USUARIO);
      s.removeItem(SESSAO_CONTA);
    }
  }, undefined);
}

/** E-mail do último acesso com "Lembrar-me neste computador" marcado */
export function lerLembrete(): { email: string } | null {
  return seguro(() => {
    const bruto = localStorage.getItem(LEMBRETE);
    return bruto ? (JSON.parse(bruto) as { email: string }) : null;
  }, null);
}

export function salvarLembrete(email: string) {
  seguro(() => localStorage.setItem(LEMBRETE, JSON.stringify({ email })), undefined);
}

export function limparLembrete() {
  seguro(() => localStorage.removeItem(LEMBRETE), undefined);
}
