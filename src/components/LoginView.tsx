import React, { useState } from 'react';
import {
  Lock, ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle, Mail, User, FileText,
  KeyRound, ArrowLeft, PieChart, IdCard,
} from 'lucide-react';
import { Conta, UsuarioSessao, ConfigUsuario } from '../types';
import { mascaraCpfCnpj, limparCpfCnpj, formatCurrencyBRL } from '../utils/formatters';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';
import { Toggle } from './Toggle';
import { entrar, cadastrar, ativarConta, reenviarChave, recuperarSenha } from '../services/api';
import { INPUT_CLASS_LG, LABEL_CLASS } from '../utils/formStyles';
import { lerLembrete, salvarLembrete, limparLembrete } from '../utils/session';
import { TERMOS_DE_USO } from '../utils/termos';

/** As telas de acesso do sistema original, numeradas na mesma ordem */
type Etapa = 'login' | 'cadastro' | 'ativar' | 'recuperar' | 'termos';

const PLANOS_CADASTRO = [
  { id: 1, nome: 'GRÁTIS', valor: 0, descricao: 'até 100 lançamentos por mês' },
  { id: 2, nome: 'PLANO 300', valor: 19.9, descricao: 'até 300 lançamentos por mês' },
  { id: 3, nome: 'PLANO FULL', valor: 29.9, descricao: 'lançamentos ilimitados' },
];

interface LoginViewProps {
  /** Mensagem mostrada ao abrir a tela, ex.: sessão recusada pelo servidor */
  avisoInicial?: string | null;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  /** lembrar = "Lembrar-me neste computador" marcado */
  onLoginSuccess: (usuario: UsuarioSessao, conta: Conta, config: ConfigUsuario, lembrar: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  avisoInicial,
  theme = 'light',
  onToggleTheme,
  onLoginSuccess,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('login');
  const [lembrete] = useState(() => lerLembrete());

  // Login
  const [email, setEmail] = useState(() => lembrete?.email ?? '');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(() => Boolean(lembrete));
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Cadastro
  const [nome, setNome] = useState('');
  const [emailCadastro, setEmailCadastro] = useState('');
  const [cpfcnpj, setCpfcnpj] = useState('');
  const [senha1, setSenha1] = useState('');
  const [senha2, setSenha2] = useState('');
  const [idPlano, setIdPlano] = useState(1);
  const [aceitouTermos, setAceitouTermos] = useState(false);

  // Ativação e recuperação
  const [chave, setChave] = useState('');
  const [emailRecuperar, setEmailRecuperar] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(avisoInicial ?? null);
  const [aviso, setAviso] = useState<string | null>(null);

  const irPara = (proxima: Etapa) => {
    setEtapa(proxima);
    setErro(null);
    setAviso(null);
  };

  // ----------------------------------------------------------
  // Entrar
  // ----------------------------------------------------------
  const fazerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo) return setErro('Informe o seu e-mail.');
    if (!senha) return setErro('Informe a sua senha.');

    setCarregando(true);
    setErro(null);
    try {
      const dados = await entrar(emailLimpo, senha);
      if (lembrar) salvarLembrete(emailLimpo);
      else limparLembrete();
      onLoginSuccess(dados.usuario, dados.conta, dados.config, lembrar);
    } catch (err: any) {
      // Conta criada mas ainda não ativada: o próprio servidor manda para a ativação
      if (err?.dados?.precisaAtivar) {
        setEtapa('ativar');
        setAviso(err.message);
        setCarregando(false);
        return;
      }
      setErro(err.message || 'Não foi possível validar o acesso. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  // ----------------------------------------------------------
  // Cadastrar
  // ----------------------------------------------------------
  const fazerCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await cadastrar({
        nome: nome.trim(),
        email: emailCadastro.trim().toLowerCase(),
        cpfcnpj: limparCpfCnpj(cpfcnpj),
        senha: senha1,
        senha2,
        id_plano: idPlano,
        termos: aceitouTermos,
      });
      setEmail(emailCadastro.trim().toLowerCase());
      setEtapa('ativar');
      // Sem SMTP configurado, a chave vem na resposta e é mostrada na tela
      setChave(resposta.chave || '');
      setAviso(
        resposta.chave
          ? `${resposta.message} Chave: ${resposta.chave}`
          : resposta.message,
      );
    } catch (err: any) {
      setErro(err.message || 'Não foi possível concluir o cadastro.');
    } finally {
      setCarregando(false);
    }
  };

  // ----------------------------------------------------------
  // Ativar
  // ----------------------------------------------------------
  const fazerAtivacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const r = await ativarConta(chave.trim());
      setEtapa('login');
      setAviso(r.message);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  const fazerReenvio = async () => {
    const alvo = (email || emailCadastro).trim().toLowerCase();
    if (!alvo) return setErro('Informe o e-mail do cadastro para reenviarmos a chave.');
    setCarregando(true);
    setErro(null);
    try {
      const r = await reenviarChave(alvo);
      if (r.chave) setChave(r.chave);
      setAviso(r.chave ? `${r.message} Chave: ${r.chave}` : r.message);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  // ----------------------------------------------------------
  // Recuperar a senha
  // ----------------------------------------------------------
  const fazerRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const r = await recuperarSenha(emailRecuperar.trim().toLowerCase());
      setEtapa('login');
      setAviso(r.message);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  // ----------------------------------------------------------
  // Peças compartilhadas
  // ----------------------------------------------------------
  const campo = (
    id: string,
    rotulo: string,
    Icone: typeof Mail,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    extra?: React.ReactNode,
  ) => (
    <div>
      <label htmlFor={id} className={`block ${LABEL_CLASS} mb-1.5`}>
        {rotulo}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
          <Icone className="w-4 h-4" />
        </div>
        <input id={id} {...props} className={`${INPUT_CLASS_LG} w-full pl-10 ${props.className || ''}`} />
        {extra}
      </div>
    </div>
  );

  const botaoPrincipal = (texto: string) => (
    <button
      type="submit"
      disabled={carregando}
      className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-700/20 disabled:opacity-50 cursor-pointer"
    >
      {carregando ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          <span>{texto}</span>
          <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );

  const voltar = (para: Etapa = 'login') => (
    <button
      type="button"
      onClick={() => irPara(para)}
      className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 py-2 cursor-pointer"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Voltar
    </button>
  );

  // ----------------------------------------------------------
  // Conteúdo de cada etapa
  // ----------------------------------------------------------
  const conteudo = () => {
    switch (etapa) {
      case 'cadastro':
        return (
          <form onSubmit={fazerCadastro} className="space-y-4">
            <div className="mb-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Cadastro de Usuário</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Será enviado um e-mail com a chave de ativação da conta
              </p>
            </div>

            {campo('input-cad-nome', 'Nome', User, {
              type: 'text',
              value: nome,
              onChange: (e) => setNome(e.target.value),
              placeholder: 'Seu nome completo',
              maxLength: 80,
              required: true,
            })}

            {campo('input-cad-email', 'e-Mail', Mail, {
              type: 'email',
              value: emailCadastro,
              onChange: (e) => setEmailCadastro(e.target.value),
              placeholder: 'voce@exemplo.com.br',
              maxLength: 120,
              autoComplete: 'email',
              required: true,
            })}

            {campo('input-cad-cpfcnpj', 'CPF / CNPJ', IdCard, {
              type: 'text',
              value: cpfcnpj,
              onChange: (e) => setCpfcnpj(mascaraCpfCnpj(e.target.value)),
              placeholder: '000.000.000-00',
              maxLength: 18,
              className: 'font-mono',
            })}

            {campo('input-cad-senha1', 'Senha', Lock, {
              type: 'password',
              value: senha1,
              onChange: (e) => setSenha1(e.target.value),
              placeholder: 'Mínimo de 6 caracteres',
              maxLength: 20,
              autoComplete: 'new-password',
              required: true,
            })}

            {campo('input-cad-senha2', 'Redigite a senha', Lock, {
              type: 'password',
              value: senha2,
              onChange: (e) => setSenha2(e.target.value),
              placeholder: 'Repita a senha',
              maxLength: 20,
              autoComplete: 'new-password',
              required: true,
            })}

            <div>
              <span className={`block ${LABEL_CLASS} mb-1.5`}>Escolha o seu plano</span>
              <div className="grid gap-2">
                {PLANOS_CADASTRO.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setIdPlano(p.id)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      idPlano === p.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                        : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-800 dark:text-stone-100">{p.nome}</div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400">{p.descricao}</div>
                    </div>
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
                      {p.valor === 0 ? 'R$ 0,00 / mês' : `${formatCurrencyBRL(p.valor)} / mês`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Toggle
                id="input-cad-termos"
                checked={aceitouTermos}
                onChange={setAceitouTermos}
                size="sm"
                label="Confirmo que li e concordo com os Termos de Uso"
              />
              <button
                type="button"
                onClick={() => irPara('termos')}
                className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Ler os Termos de Uso
              </button>
            </div>

            {botaoPrincipal('Cadastrar')}
            {voltar()}
          </form>
        );

      case 'ativar':
        return (
          <form onSubmit={fazerAtivacao} className="space-y-4">
            <div className="mb-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Ative a sua conta</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Informe a chave de ativação que enviamos por e-mail
              </p>
            </div>

            {campo('input-ativar-chave', 'Chave de Ativação', KeyRound, {
              type: 'text',
              value: chave,
              onChange: (e) => setChave(e.target.value.toUpperCase()),
              placeholder: 'Cole aqui a chave recebida',
              maxLength: 15,
              required: true,
              className: 'font-mono tracking-widest',
            })}

            {botaoPrincipal('Ativar')}

            <button
              type="button"
              onClick={fazerReenvio}
              disabled={carregando}
              className="w-full text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline py-1 cursor-pointer disabled:opacity-50"
            >
              Reenviar chave de ativação
            </button>
            {voltar()}
          </form>
        );

      case 'recuperar':
        return (
          <form onSubmit={fazerRecuperacao} className="space-y-4">
            <div className="mb-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Recupere a sua senha</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Enviaremos a sua senha para o e-mail cadastrado
              </p>
            </div>

            {campo('input-rec-email', 'Confirme o seu e-mail', Mail, {
              type: 'email',
              value: emailRecuperar,
              onChange: (e) => setEmailRecuperar(e.target.value),
              placeholder: 'voce@exemplo.com.br',
              required: true,
            })}

            {botaoPrincipal('Enviar')}
            {voltar()}
          </form>
        );

      case 'termos':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Termos de Uso</h2>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 p-4 text-xs leading-relaxed text-stone-600 dark:text-stone-300 whitespace-pre-line">
              {TERMOS_DE_USO}
            </div>
            <button
              type="button"
              onClick={() => {
                setAceitouTermos(true);
                irPara('cadastro');
              }}
              className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all cursor-pointer"
            >
              Confirmo a leitura dos Termos de Uso
            </button>
            {voltar('cadastro')}
          </div>
        );

      default:
        return (
          <form onSubmit={fazerLogin} className="space-y-4">
            <div className="mb-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Entrar</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Use o e-mail e a senha do seu cadastro
              </p>
            </div>

            {campo('input-login-email', 'e-Mail', Mail, {
              type: 'email',
              value: email,
              onChange: (e) => {
                setEmail(e.target.value);
                setErro(null);
              },
              placeholder: 'voce@exemplo.com.br',
              autoComplete: 'email',
              required: true,
            })}

            {campo(
              'input-login-senha',
              'Senha',
              Lock,
              {
                type: mostrarSenha ? 'text' : 'password',
                value: senha,
                onChange: (e) => {
                  setSenha(e.target.value);
                  setErro(null);
                },
                placeholder: 'Digite sua senha de acesso',
                autoComplete: 'current-password',
                required: true,
                className: 'pr-10',
              },
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                tabIndex={-1}
              >
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>,
            )}

            <Toggle
              id="input-login-lembrar"
              checked={lembrar}
              onChange={setLembrar}
              size="sm"
              label="Lembrar-me neste computador"
              title="Mantém a sessão ativa ao fechar o navegador e preenche o e-mail no próximo acesso. A senha nunca é guardada."
            />

            {botaoPrincipal('Entrar')}

            <div className="pt-2 space-y-2 text-center">
              <div className="text-xs text-stone-500 dark:text-stone-400">
                Esqueceu sua senha?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setEmailRecuperar(email);
                    irPara('recuperar');
                  }}
                  className="font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Clique aqui para recuperar
                </button>
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400">
                Você é novo por aqui?{' '}
                <button
                  type="button"
                  onClick={() => irPara('cadastro')}
                  className="font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Clique aqui para se cadastrar
                </button>
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400">
                Já tem a chave de ativação?{' '}
                <button
                  type="button"
                  onClick={() => irPara('ativar')}
                  className="font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Ative a sua conta
                </button>
              </div>
            </div>
          </form>
        );
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col items-center p-4 sm:p-6 select-none relative">
      {onToggleTheme && (
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
        </div>
      )}

      <div className="w-full max-w-md my-auto">
        {/* Identidade visual */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20 mb-3 border border-blue-600">
            <PieChart className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Meu Planejamento Financeiro
          </h1>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-6 sm:p-8">
          {erro && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{erro}</span>
            </div>
          )}

          {aviso && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{aviso}</span>
            </div>
          )}

          {conteudo()}
        </div>
      </div>
    </div>
  );
};
