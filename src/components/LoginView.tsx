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
import { INPUT_CLASS_LG } from '../utils/formStyles';
import { lerLembrete, salvarLembrete, limparLembrete } from '../utils/session';
import { TERMOS_DE_USO } from '../utils/termos';

/** Rótulo dos campos, no padrão do login do crmWeb */
const ROTULO = 'block text-[10px] font-bold uppercase tracking-widest ml-1 mb-1.5 text-stone-400 dark:text-stone-500';

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
      const dados = await entrar(emailLimpo, senha, lembrar);
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
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <div className="relative">
        <Icone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500 pointer-events-none" />
        <input id={id} {...props} className={`${INPUT_CLASS_LG} w-full pl-11 ${props.className || ''}`} />
        {extra}
      </div>
    </div>
  );

  const botaoPrincipal = (texto: string) => (
    <button
      type="submit"
      disabled={carregando}
      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 mt-2 group disabled:opacity-70 cursor-pointer"
    >
      {carregando ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          <span className="uppercase tracking-wide">{texto}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
          <form onSubmit={fazerCadastro} className="space-y-5">
            <div className="mb-3">
              <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Cadastro de Usuário</h2>
              <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
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
              <span className={ROTULO}>Escolha o seu plano</span>
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
          <form onSubmit={fazerAtivacao} className="space-y-5">
            <div className="mb-3">
              <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Ative a sua conta</h2>
              <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
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
          <form onSubmit={fazerRecuperacao} className="space-y-5">
            <div className="mb-3">
              <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Recupere a sua senha</h2>
              <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
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
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Termos de Uso</h2>
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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Confirmo a leitura dos Termos de Uso
            </button>
            {voltar('cadastro')}
          </div>
        );

      default:
        return (
          <form onSubmit={fazerLogin} className="space-y-5">
            <div className="mb-3">
              <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Login</h2>
              <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
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
              label={<span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Lembrar neste dispositivo</span>}
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

  /** Marca: ícone + nome, usada no painel esquerdo e, no celular, acima do formulário */
  const marca = (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200/50 dark:shadow-none shrink-0">
        <PieChart className="w-5 h-5 text-white" />
      </div>
      <span className="text-sm font-black tracking-wider uppercase text-stone-800 dark:text-stone-100">myPlanner</span>
    </div>
  );

  return (
    <div className="min-h-screen flex relative bg-white dark:bg-stone-900 text-stone-900 dark:text-white">
      {/* Painel esquerdo: identidade visual (oculto em telas pequenas) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col p-12 bg-white dark:bg-stone-950 isolate">
        {/* Pano de fundo: colunas do mês crescendo e uma moeda no alto */}
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <svg
            viewBox="0 0 380 470"
            aria-hidden="true"
            className="absolute top-1/2 right-[6%] -translate-y-1/2 w-[min(440px,70%)] text-indigo-200 dark:text-indigo-400/25"
          >
            {/* Colunas mensais, cada vez mais altas */}
            <g fill="currentColor">
              <rect x="20" y="330" width="44" height="120" rx="8" opacity=".4" />
              <rect x="88" y="290" width="44" height="160" rx="8" opacity=".5" />
              <rect x="156" y="240" width="44" height="210" rx="8" opacity=".65" />
              <rect x="224" y="180" width="44" height="270" rx="8" opacity=".8" />
              <rect x="292" y="120" width="44" height="330" rx="8" opacity=".95" />
            </g>
            {/* Linha de tendência */}
            <path d="M42 300 L110 262 L178 214 L246 152 L314 92" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {/* Moeda */}
            <circle cx="314" cy="50" r="30" fill="currentColor" />
            <path d="M314 34 v32 M320 41 h-10 a5 5 0 0 0 0 10 h8 a5 5 0 0 1 0 10 h-10" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-stone-950" />
          </svg>
          <div className="absolute top-[15%] left-[10%] w-[280px] h-[280px] rounded-[40%] rotate-12 blur-3xl bg-indigo-100/70 dark:bg-indigo-500/10" />
          <div className="absolute bottom-[10%] right-[5%] w-[220px] h-[220px] rounded-[45%] -rotate-12 blur-2xl bg-blue-100/60 dark:bg-blue-500/10" />
        </div>

        {marca}

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-stone-900 dark:text-white">
            Planejamento
            <br />
            Financeiro
          </h1>
          <p className="mt-4 text-sm font-medium max-w-xs text-stone-500 dark:text-stone-400">
            Receitas, despesas, cartões e metas sob controle em um só lugar.
          </p>
        </div>
      </div>

      {/* Painel direito: formulário de acesso */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative bg-stone-50 dark:bg-stone-900">
        {onToggleTheme && (
          <div className="absolute top-6 right-6 z-20">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
          </div>
        )}

        <div className="w-full max-w-md py-10">
          {/* Marca no celular (o painel esquerdo fica oculto) */}
          <div className="flex lg:hidden mb-8">{marca}</div>

          {erro && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{erro}</span>
            </div>
          )}

          {aviso && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{aviso}</span>
            </div>
          )}

          {conteudo()}

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-stone-200 dark:border-stone-800 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            <span>myPlanner by BMsoft Sistemas</span>
            <span className="normal-case">v{__APP_VERSION__} • © {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
