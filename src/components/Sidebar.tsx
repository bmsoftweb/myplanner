import React from 'react';
import {
  Home,
  PencilLine,
  PieChart,
  Tags,
  Tag,
  Landmark,
  MapPin,
  StepForward,
  QrCode,
  Ship,
  Users,
  Coins,
  FileType,
  History,
  Settings,
  UserCog,
  CreditCard,
  ArrowLeftRight,
  Receipt,
  FileSearch,
  ListChecks,
  CalendarRange,
  CalendarCheck,
  TrendingUp,
  SlidersHorizontal,
  Database,
  LogOut,
  X,
  User,
  type LucideIcon,
} from 'lucide-react';
import { UsuarioSessao, ResourceDef, ResourceGroup, ConfigUsuario } from '../types';
import { GROUP_LABELS } from '../utils/formatters';

/** Mapa dos ícones declarados no registro de metadados do servidor */
const ICONS: Record<string, LucideIcon> = {
  Home, PencilLine, PieChart, Tags, Tag, Landmark, MapPin, StepForward, QrCode,
  Ship, Users, Coins, FileType, History, Settings, UserCog, CreditCard,
  ArrowLeftRight, Receipt, FileSearch, ListChecks, CalendarRange, CalendarCheck,
  TrendingUp, SlidersHorizontal, Database,
};

const ORDEM_GRUPOS: ResourceGroup[] = ['cadastros', 'acesso', 'sistema'];

/** Telas próprias, fora do CRUD genérico */
interface ItemFixo {
  id: string;
  label: string;
  icone: LucideIcon;
  /** Chave da configuração que liga/desliga a tela */
  configKey?: keyof ConfigUsuario;
  /** Só o dono da conta vê */
  somentePrincipal?: boolean;
}

const TELAS_PLANEJAMENTO: ItemFixo[] = [
  { id: 'lancamentos', label: 'Lançamentos', icone: PencilLine },
  { id: 'planejamento', label: 'Meu Planejamento', icone: PieChart },
  { id: 'consultas', label: 'Consultas', icone: FileSearch },
  { id: 'extrato', label: 'Extrato Bancário', icone: Receipt, configKey: 'usar_bancos' },
  { id: 'transferencia', label: 'Transferência', icone: ArrowLeftRight, configKey: 'usar_bancos' },
  { id: 'fatura', label: 'Fatura do Cartão', icone: CreditCard, configKey: 'usar_limites' },
];

const TELAS_SISTEMA: ItemFixo[] = [
  { id: 'config', label: 'Configurações', icone: Settings },
  { id: 'meus_dados', label: 'Meus Dados', icone: UserCog, somentePrincipal: true },
  { id: 'planos', label: 'Meu Plano', icone: CreditCard, somentePrincipal: true },
  { id: 'versoes', label: 'Novidades e Correções', icone: History },
  { id: 'termos', label: 'Termos de Uso', icone: ListChecks },
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  resources: ResourceDef[];
  recordCounts: Record<string, number>;
  usuario: UsuarioSessao | null;
  config: ConfigUsuario;
  nomeConta: string;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  resources,
  recordCounts,
  usuario,
  config,
  nomeConta,
  onLogout,
  isOpenMobile,
  onCloseMobile,
}) => {
  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    onCloseMobile();
  };

  /** Um item só aparece quando o módulo está ligado na configuração */
  const moduloLigado = (chave?: string) => !chave || Boolean((config as any)[chave]);
  const podeVer = (item: ItemFixo) =>
    moduloLigado(item.configKey) && (!item.somentePrincipal || Boolean(usuario?.principal));

  const renderNavButton = (id: string, label: string, Icon: LucideIcon, badge?: number) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        id={`sidebar-nav-${id}`}
        onClick={() => handleNavClick(id)}
        className={`w-full flex items-center justify-between px-4 py-[11px] text-left transition-colors cursor-pointer group border-l-2 ${
          isActive
            ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300'
            : 'border-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
              isActive
                ? 'text-blue-600 dark:text-blue-300'
                : 'text-stone-400 group-hover:text-blue-600 dark:text-stone-400 dark:group-hover:text-blue-400'
            }`}
          />
          <div className="min-w-0">
            <div className="text-xs truncate">{label}</div>
          </div>
        </div>

        {badge !== undefined && badge > 0 && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
              isActive
                ? 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300 group-hover:bg-stone-300 dark:group-hover:bg-stone-700'
            }`}
          >
            {badge > 9999 ? '9999+' : badge}
          </span>
        )}
      </button>
    );
  };

  const tituloGrupo = (texto: string) => (
    <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-400">
      {texto}
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border-r border-stone-200 dark:border-stone-800 select-none">
      {/* Marca — mesma altura do header da área de trabalho */}
      <div className="h-[var(--altura-topo)] shrink-0 px-4 border-b border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-3 bg-stone-50/50 dark:bg-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
            <PieChart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-stone-900 dark:text-white leading-tight truncate">myPlanner</h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{nomeConta || 'Planejamento Financeiro'}</p>
          </div>
        </div>

        <button
          onClick={onCloseMobile}
          id="btn-close-sidebar-mobile"
          title="Fechar menu lateral"
          className="lg:hidden p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegação */}
      <div className="flex-1 overflow-y-auto py-4">
        {tituloGrupo('Início')}
        {renderNavButton('dashboard', 'Home', Home)}

        <div className="pt-3">
          {tituloGrupo(GROUP_LABELS.planejamento)}
          {TELAS_PLANEJAMENTO.filter(podeVer).map((t) =>
            renderNavButton(t.id, t.label, t.icone, recordCounts[t.id]),
          )}
        </div>

        {ORDEM_GRUPOS.map((grupo) => {
          const doGrupo = resources.filter(
            (r) =>
              r.group === grupo &&
              !r.hidden &&
              moduloLigado(r.configKey) &&
              (!r.somentePrincipal || Boolean(usuario?.principal)),
          );
          if (!doGrupo.length) return null;

          return (
            <div key={grupo} className="pt-3">
              {tituloGrupo(GROUP_LABELS[grupo] || grupo)}
              {doGrupo.map((r) =>
                renderNavButton(r.name, r.label, ICONS[r.icon] || Database, recordCounts[r.name]),
              )}
            </div>
          );
        })}

        <div className="pt-3 pb-2">
          {tituloGrupo('Sistema')}
          {TELAS_SISTEMA.filter(podeVer).map((t) => renderNavButton(t.id, t.label, t.icone))}
        </div>
      </div>

      {/* Usuário & sair */}
      <div className="p-3 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-2 bg-stone-50 dark:bg-stone-950/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center font-semibold text-xs shrink-0">
            {usuario?.nome ? usuario.nome.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 dark:text-white truncate leading-tight">
              {usuario?.nome || 'Usuário'}
            </div>
            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {usuario?.email || ''}
            </div>
          </div>
        </div>

        <button
          id="sidebar-btn-logout"
          onClick={onLogout}
          title="Sair do sistema"
          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar fixa no desktop */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 z-30">{sidebarContent}</aside>

      {/* Drawer no mobile */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full h-full shadow-2xl z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
