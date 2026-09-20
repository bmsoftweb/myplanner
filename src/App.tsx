import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Conta, UsuarioSessao, ConfigUsuario, ResourceDef, DbConnectionStatus, DashboardData } from './types';
import {
  setSessaoApi, fetchResources, fetchDbStatus, fetchDashboard, invalidateOptions, validarSessao,
} from './services/api';
import { limparConfigListas } from './utils/configListas';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { Dashboard } from './components/Dashboard';
import { CrudView } from './components/CrudView';
import { LancamentosView } from './components/LancamentosView';
import { PlanejamentoView } from './components/PlanejamentoView';
import { ExtratoView } from './components/ExtratoView';
import { TransferenciaView } from './components/TransferenciaView';
import { FaturaCartaoView } from './components/FaturaCartaoView';
import { ConsultasView } from './components/ConsultasView';
import { ConfigView } from './components/ConfigView';
import { MeusDadosView } from './components/MeusDadosView';
import { PlanosView } from './components/PlanosView';
import { AcoesExtras } from './components/AcoesExtras';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/theme';
import { lerSessao, salvarSessao, limparSessao } from './utils/session';
import { TERMOS_DE_USO } from './utils/termos';

const CONFIG_PADRAO: ConfigUsuario = {
  usar_previsao: true,
  usar_limites: true,
  usar_bancos: true,
  usar_cc: true,
  usar_metas: true,
  usar_patrimonio: false,
  pagina_padrao: '1',
};

const NOME_PLANO: Record<number, string> = { 1: 'GRÁTIS', 2: 'PLANO 300', 3: 'PLANO FULL' };

/** Título e subtítulo de cada tela própria (as de CRUD vêm dos metadados) */
const TITULOS: Record<string, { titulo: string; subtitulo: string }> = {
  dashboard: { titulo: 'Home', subtitulo: 'O resumo da sua vida financeira' },
  lancamentos: { titulo: 'Lançamentos', subtitulo: 'Receitas e despesas, previstas e realizadas' },
  planejamento: { titulo: 'Meu Planejamento', subtitulo: 'Previsto × realizado de cada conta, mês a mês' },
  consultas: { titulo: 'Consultas', subtitulo: 'Consultas cadastradas, com parâmetros' },
  extrato: { titulo: 'Extrato Bancário', subtitulo: 'Movimento e saldo das contas, e importação de OFX' },
  transferencia: { titulo: 'Transferência', subtitulo: 'Mover dinheiro de uma conta para outra' },
  fatura: { titulo: 'Fatura do Cartão', subtitulo: 'Compras da fatura e consumo do limite' },
  config: { titulo: 'Configurações', subtitulo: 'Módulos do menu e página inicial' },
  meus_dados: { titulo: 'Meus Dados', subtitulo: 'Cadastro e senha da conta' },
  planos: { titulo: 'Meu Plano', subtitulo: 'Limite de lançamentos e valor mensal' },
  versoes: { titulo: 'Novidades e Correções', subtitulo: 'O que mudou em cada versão' },
  termos: { titulo: 'Termos de Uso', subtitulo: 'As regras de uso do sistema' },
};

/** Da configuração para a tela que abre depois do login */
const PAGINA_INICIAL: Record<string, string> = { '1': 'dashboard', '2': 'lancamentos', '3': 'planejamento' };

export default function App() {
  // ----------------------------------------------------------
  // Tema claro / escuro
  // ----------------------------------------------------------
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const alternarTema = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // ----------------------------------------------------------
  // Sessão (persistida no navegador)
  // ----------------------------------------------------------
  const [conta, setConta] = useState<Conta | null>(() => lerSessao().conta);
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(() => lerSessao().usuario);
  const [config, setConfig] = useState<ConfigUsuario>(CONFIG_PADRAO);

  // Os cabeçalhos da API precisam acompanhar toda requisição
  useEffect(() => {
    setSessaoApi(conta?.id ?? null, usuario?.id ?? null);
  }, [conta?.id, usuario?.id]);

  // ----------------------------------------------------------
  // Navegação e estado geral
  // ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [resources, setResources] = useState<ResourceDef[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardCarregando, setDashboardCarregando] = useState(false);
  const [dashboardErro, setDashboardErro] = useState<string | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [createToken, setCreateToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  /** Motivo exibido na tela de login quando uma sessão salva é recusada */
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  const mostrarToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Metadados dos recursos e saúde do banco
  useEffect(() => {
    if (!conta) return;
    let vivo = true;

    (async () => {
      try {
        const lista = await fetchResources();
        if (vivo) setResources(lista);
      } catch (err) {
        console.warn('Falha ao carregar os metadados dos recursos:', err);
      }
      const status = await fetchDbStatus();
      if (vivo) setDbStatus(status);
    })();

    return () => {
      vivo = false;
    };
  }, [conta?.id]);

  // Indicadores do painel
  const carregarDashboard = useCallback(async () => {
    if (!conta) return;
    setDashboardCarregando(true);
    setDashboardErro(null);
    try {
      const dados = await fetchDashboard();
      setDashboard(dados);
      setRecordCounts((prev) => ({ ...prev, ...dados.counts }));
    } catch (err: any) {
      setDashboardErro(err.message || 'Falha ao carregar os indicadores.');
    } finally {
      setDashboardCarregando(false);
    }
  }, [conta?.id]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      carregarDashboard();
      fetchDbStatus().then(setDbStatus);
    }
  }, [activeTab, carregarDashboard, refreshToken]);

  const aoMudarContagem = useCallback((recurso: string, total: number) => {
    setRecordCounts((prev) => (prev[recurso] === total ? prev : { ...prev, [recurso]: total }));
  }, []);

  const sair = useCallback(() => {
    setUsuario(null);
    setConta(null);
    setResources([]);
    setDashboard(null);
    setRecordCounts({});
    setConfig(CONFIG_PADRAO);
    setActiveTab('dashboard');
    invalidateOptions();
    setSessaoApi(null, null);
    limparConfigListas();
    limparSessao();
  }, []);

  // Uma sessão guardada no navegador é conferida ao abrir o sistema: a conta
  // pode ter sido desativada, ou o usuário removido de dentro dela.
  useEffect(() => {
    if (!usuario || !conta) return;
    let vivo = true;
    setSessaoApi(conta.id, usuario.id);
    validarSessao().then((r) => {
      if (!vivo) return;
      if (r.valida === false) {
        sair();
        setAvisoLogin(r.error || 'Sua sessão expirou. Entre novamente.');
      } else if (r.config) {
        setConfig(r.config);
      }
    });
    return () => {
      vivo = false;
    };
  }, [usuario?.id, conta?.id, sair]);

  /**
   * Recursos que também existem como tela própria: nessas a tela desenhada à mão
   * tem prioridade sobre a listagem genérica de CRUD.
   */
  const TELAS_PROPRIAS = useMemo(() => new Set(['lancamentos', 'consultas']), []);

  const recursoAtivo = useMemo(
    () => (TELAS_PROPRIAS.has(activeTab) ? null : resources.find((r) => r.name === activeTab) || null),
    [resources, activeTab, TELAS_PROPRIAS],
  );

  // ----------------------------------------------------------
  // 1. Tela de acesso
  // ----------------------------------------------------------
  if (!usuario || !conta) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={alternarTema}
        onLoginSuccess={(novoUsuario, novaConta, novaConfig, lembrar) => {
          setSessaoApi(novaConta.id, novoUsuario.id);
          setUsuario(novoUsuario);
          setConta(novaConta);
          setConfig(novaConfig);
          setActiveTab(PAGINA_INICIAL[novaConfig.pagina_padrao] || 'dashboard');
          salvarSessao(novoUsuario, novaConta, lembrar);
          setAvisoLogin(null);
          mostrarToast(`Bem-vindo, ${novoUsuario.nome}!`);
        }}
      />
    );
  }

  // ----------------------------------------------------------
  // 2. Sistema
  // ----------------------------------------------------------
  const cabecalho = recursoAtivo
    ? { titulo: recursoAtivo.label, subtitulo: recursoAtivo.description }
    : TITULOS[activeTab] || { titulo: 'Meu Planejamento Financeiro', subtitulo: '' };

  /** Telas próprias ocupam toda a área útil, sem contêiner centralizado */
  const telaCheia = ['lancamentos', 'planejamento', 'extrato', 'transferencia', 'fatura', 'consultas', 'config', 'meus_dados', 'planos'];

  const conteudo = () => {
    if (recursoAtivo) {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          <AcoesExtras
            recurso={recursoAtivo.name}
            onToast={mostrarToast}
            onAtualizar={() => setRefreshToken((t) => t + 1)}
          />
          <CrudView
            key={recursoAtivo.name}
            resource={recursoAtivo}
            allResources={resources}
            refreshToken={refreshToken}
            createToken={createToken}
            onToast={mostrarToast}
            onCountChange={aoMudarContagem}
            onNavigate={setActiveTab}
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'lancamentos':
        return (
          <LancamentosView
            refreshToken={refreshToken}
            createToken={createToken}
            onToast={mostrarToast}
            onCountChange={(total) => aoMudarContagem('lancamentos', total)}
          />
        );
      case 'planejamento':
        return <PlanejamentoView refreshToken={refreshToken} onToast={mostrarToast} />;
      case 'extrato':
        return <ExtratoView refreshToken={refreshToken} onToast={mostrarToast} />;
      case 'transferencia':
        return <TransferenciaView refreshToken={refreshToken} onToast={mostrarToast} />;
      case 'fatura':
        return <FaturaCartaoView refreshToken={refreshToken} onToast={mostrarToast} />;
      case 'consultas':
        return <ConsultasView refreshToken={refreshToken} onToast={mostrarToast} />;
      case 'config':
        return <ConfigView config={config} onConfigChange={setConfig} onToast={mostrarToast} />;
      case 'meus_dados':
        return (
          <MeusDadosView
            refreshToken={refreshToken}
            onToast={mostrarToast}
            onNomeAlterado={(nome) => setConta((c) => (c ? { ...c, nome } : c))}
          />
        );
      case 'planos':
        return (
          <PlanosView
            refreshToken={refreshToken}
            onToast={mostrarToast}
            onPlanoAlterado={(idPlano) => setConta((c) => (c ? { ...c, id_plano: idPlano } : c))}
          />
        );
      case 'termos':
        return (
          <div className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-stone-900">
            <div className="max-w-3xl mx-auto px-5 py-6">
              <h3 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-stone-100 mb-4">
                <FileText className="w-4 h-4 text-blue-600" />
                Termos de Uso
              </h3>
              <div className="text-xs leading-relaxed text-stone-600 dark:text-stone-300 whitespace-pre-line">
                {TERMOS_DE_USO}
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
              <Dashboard
                conta={conta}
                data={dashboard}
                dbStatus={dbStatus}
                isLoading={dashboardCarregando}
                error={dashboardErro}
                onNavigate={setActiveTab}
              />
            </div>
          </div>
        );
    }
  };

  const ehTelaCheia = Boolean(recursoAtivo) || telaCheia.includes(activeTab);

  return (
    <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        resources={resources}
        recordCounts={recordCounts}
        usuario={usuario}
        config={config}
        nomeConta={conta.nome}
        onLogout={sair}
        isOpenMobile={menuMobileAberto}
        onCloseMobile={() => setMenuMobileAberto(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          title={cabecalho.titulo}
          subtitle={cabecalho.subtitulo}
          conta={conta}
          nomePlano={NOME_PLANO[conta.id_plano] || 'GRÁTIS'}
          dbStatus={dbStatus}
          onOpenMobileSidebar={() => setMenuMobileAberto(true)}
          onRefresh={() => setRefreshToken((t) => t + 1)}
          onCreate={
            recursoAtivo?.canCreate || activeTab === 'lancamentos'
              ? () => setCreateToken((t) => t + 1)
              : undefined
          }
          createLabel={recursoAtivo ? `Novo ${recursoAtivo.labelSingular}` : 'Novo Lançamento'}
          onAbrirPlano={usuario.principal ? () => setActiveTab('planos') : undefined}
          theme={theme}
          onToggleTheme={alternarTema}
        />

        <main className={`flex-1 flex flex-col min-h-0 w-full ${ehTelaCheia ? '' : 'overflow-y-auto'}`}>
          {conteudo()}
        </main>
      </div>
    </div>
  );
}
