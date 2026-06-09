'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  Home,
  LayoutGrid,
  Moon,
  Sun,
  Volume2,
  VolumeOff,
  Zap,
  ZapOff,
  Wrench,
  Puzzle,
  Settings,
  TableProperties,
  FolderKanban,
  KanbanSquare,
  MessageCircleQuestion,
  ShieldCheck,
  ShieldAlert,
  Bot,
  GraduationCap,
  Brain,
  Users,
  Bug,
  Package,
  Sparkles,
  ClipboardCheck,
  Gauge,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarNavItem } from '@/components/common/sidebar-nav-item';
import { SidebarNavGroup } from '@/components/common/sidebar-nav-group/sidebar-nav-group';
import { SidebarCollapseToggle } from '@/components/common/sidebar-collapse-toggle';
import { ShepLogo } from '@/components/common/shep-logo';
import { VersionBadge } from '@/components/common/version-badge';
import { FeatureListItem } from '@/components/common/feature-list-item';
import { useSoundEnabled } from '@/hooks/use-sound-enabled';
import { useAnimationsEnabled } from '@/hooks/use-animations-enabled';
import { useTheme } from '@/hooks/useTheme';
import { useSoundAction } from '@/hooks/use-sound-action';
import { FeatureStatusGroup } from '@/components/common/feature-status-group';
import { RepoGroup } from '@/components/common/repo-group';
import { SidebarSectionHeader } from '@/components/common/sidebar-section-header';
import { featureStatusConfig, featureStatusOrder } from '@/components/common/feature-status-config';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeferredMount } from '@/hooks/use-deferred-mount';
import { useVersion } from '@/hooks/use-version';
import { useOptionalAgentEventsContext } from '@/hooks/agent-events-provider';
import { AgentQuestionKind, AgentQuestionStatus } from '@shepai/core/domain/generated/output';
import type { FeatureFlagsState } from '@/lib/feature-flags';

export interface FeatureItem {
  featureId: string;
  name: string;
  status: FeatureStatus;
  startedAt?: number;
  duration?: string;
  agentType?: string;
  modelId?: string;
  repositoryPath: string;
  repositoryName: string;
}

export interface AppSidebarProps {
  features: FeatureItem[];
  featureFlags: FeatureFlagsState;

  onFeatureClick?: (featureId: string) => void;
  /** Called when the user clicks the + button on a repo group to create a feature */
  onAddFeature?: (repositoryPath: string) => void;
}

export function AppSidebar({
  features,
  featureFlags,

  onFeatureClick,
  onAddFeature,
}: AppSidebarProps) {
  const { t, i18n } = useTranslation('web');
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { mounted: showExpanded, visible: expandedVisible } = useDeferredMount(collapsed, 200);
  const versionData = useVersion();
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundEnabled();
  const { enabled: animationsEnabled, toggle: toggleAnimations } = useAnimationsEnabled();
  const { resolvedTheme, theme, setTheme } = useTheme();
  const toggleOnSound = useSoundAction('toggle-on');
  const toggleOffSound = useSoundAction('toggle-off');
  const clickSound = useSoundAction('navigate');

  const eventsCtx = useOptionalAgentEventsContext();
  const pendingQuestionCount = useMemo(() => {
    if (!featureFlags.collaboration || !eventsCtx) return 0;
    return eventsCtx.agentQuestions.filter(
      (q) =>
        q.status === AgentQuestionStatus.pending &&
        (q.questionKind === AgentQuestionKind.blocking ||
          q.questionKind === AgentQuestionKind.question)
    ).length;
  }, [featureFlags.collaboration, eventsCtx]);

  // Group features by repository, then by status within each repo
  const repoGroups = useMemo(() => {
    const byRepo = new Map<string, { repoName: string; features: FeatureItem[] }>();
    for (const feature of features) {
      const key = feature.repositoryPath;
      let group = byRepo.get(key);
      if (!group) {
        group = { repoName: feature.repositoryName, features: [] };
        byRepo.set(key, group);
      }
      group.features.push(feature);
    }
    return Array.from(byRepo.entries()).map(([repoPath, { repoName, features: repoFeatures }]) => ({
      repoPath,
      repoName,
      featureCount: repoFeatures.length,
      statusGroups: featureStatusOrder
        .map((statusKey) => ({
          statusKey,
          label: t(featureStatusConfig[statusKey].labelKey),
          items: repoFeatures.filter((f) => f.status === statusKey),
        }))
        .filter((g) => g.items.length > 0),
    }));
  }, [features, t]);

  return (
    <Sidebar
      data-testid="app-sidebar"
      data-no-drawer-close
      collapsible="icon"
      side={i18n.dir() === 'rtl' ? 'right' : 'left'}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-8 items-center group-data-[collapsible=icon]:justify-center">
              {showExpanded ? (
                <div
                  className={[
                    'flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2',
                    'transition-opacity duration-200 ease-out',
                    expandedVisible ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden={!expandedVisible}
                >
                  <ShepLogo
                    className="shrink-0"
                    size={20}
                    variant={versionData.isDev ? 'dev' : 'default'}
                  />
                  <span className="truncate text-sm font-semibold tracking-tight">Shep</span>
                  <VersionBadge
                    version={versionData.version}
                    branch={versionData.branch || undefined}
                    commitHash={versionData.commitHash || undefined}
                    isDev={versionData.isDev}
                    packageName={versionData.packageName}
                    description={versionData.description}
                    instancePath={versionData.instancePath || undefined}
                  />
                </div>
              ) : null}
              <SidebarCollapseToggle className="shrink-0 transition-all duration-200" />
            </div>
          </SidebarMenuItem>

          <SidebarNavItem
            icon={Home}
            label={t('navigation.applications')}
            href="/applications"
            active={pathname === '/applications'}
          />
          <SidebarNavItem
            icon={LayoutGrid}
            label={t('navigation.controlCenter')}
            href="/control-center"
            active={pathname === '/control-center'}
          />
          <SidebarNavItem
            icon={TableProperties}
            label={t('navigation.inventory')}
            href="/features"
            active={pathname === '/features'}
          />
          <SidebarNavItem
            icon={KanbanSquare}
            label="SDLC Board"
            href="/sdlc"
            active={pathname?.startsWith('/sdlc') ?? false}
          />
          <SidebarNavItem
            icon={Brain}
            label={t('navigation.projectMemory')}
            href="/memory"
            active={pathname?.startsWith('/memory') ?? false}
          />
          <SidebarNavItem
            icon={Wrench}
            label={t('navigation.tools')}
            href="/tools"
            active={pathname === '/tools'}
          />
          {featureFlags.projects ? (
            <SidebarNavItem
              icon={FolderKanban}
              label="Projects"
              href="/projects"
              active={pathname?.startsWith('/projects') ?? false}
            />
          ) : null}
          <SidebarNavItem
            icon={Puzzle}
            label={t('navigation.skills')}
            href="/skills"
            active={pathname === '/skills'}
          />
          {featureFlags.collaboration ? (
            <SidebarNavGroup
              icon={Users}
              label={t('navigation.collaboration')}
              badge={pendingQuestionCount}
              items={[
                {
                  icon: MessageCircleQuestion,
                  label: t('navigation.agentQuestions'),
                  href: '/agent-questions',
                  active: pathname === '/agent-questions',
                  badge: pendingQuestionCount,
                },
                {
                  icon: ShieldCheck,
                  label: 'Supervisor',
                  href: '/supervisor',
                  active: pathname?.startsWith('/supervisor') ?? false,
                },
                {
                  icon: Bot,
                  label: 'Agents',
                  href: '/agents',
                  active: pathname?.startsWith('/agents') ?? false,
                },
                {
                  icon: GraduationCap,
                  label: 'Get started',
                  href: '/onboarding',
                  active: pathname?.startsWith('/onboarding') ?? false,
                },
              ]}
            />
          ) : null}
          {featureFlags.aspm ? (
            <SidebarNavGroup
              icon={ShieldAlert}
              label={t('navigation.aspm')}
              items={[
                {
                  icon: Gauge,
                  label: t('navigation.aspmDashboard'),
                  href: '/aspm',
                  active: pathname === '/aspm',
                },
                {
                  icon: Bug,
                  label: t('navigation.aspmFindings'),
                  href: '/aspm/findings',
                  active: pathname?.startsWith('/aspm/findings') ?? false,
                },
                {
                  icon: Package,
                  label: t('navigation.aspmInventory'),
                  href: '/aspm/inventory',
                  active: pathname?.startsWith('/aspm/inventory') ?? false,
                },
                {
                  icon: Users,
                  label: t('navigation.aspmOwners'),
                  href: '/aspm/owners',
                  active: pathname?.startsWith('/aspm/owners') ?? false,
                },
                {
                  icon: Sparkles,
                  label: t('navigation.aspmAiReview'),
                  href: '/aspm/ai-review',
                  active: pathname?.startsWith('/aspm/ai-review') ?? false,
                },
                {
                  icon: ClipboardCheck,
                  label: t('navigation.aspmCompliance'),
                  href: '/aspm/compliance',
                  active: pathname?.startsWith('/aspm/compliance') ?? false,
                },
              ]}
            />
          ) : null}
          <SidebarNavItem
            icon={Settings}
            label={t('navigation.settings')}
            href="/settings"
            active={pathname === '/settings'}
          />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {showExpanded ? (
          <div
            className={[
              'flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity duration-200 ease-out',
              '[&_[data-sidebar=group-label]]:!mt-0 [&_[data-sidebar=group-label]]:!opacity-100 [&_[data-sidebar=group-label]]:!transition-none',
              expandedVisible ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            <SidebarSectionHeader label={t('sidebar.features')} />
            <ScrollArea className="min-h-0 flex-1">
              {repoGroups.map(({ repoPath, repoName, featureCount, statusGroups }) => (
                <RepoGroup
                  key={repoPath}
                  repoName={repoName}
                  featureCount={featureCount}
                  onAddFeature={onAddFeature ? () => onAddFeature(repoPath) : undefined}
                >
                  {statusGroups.map(({ statusKey, label, items }) => (
                    <FeatureStatusGroup key={statusKey} label={label} count={items.length}>
                      {items.map((feature) => (
                        <FeatureListItem
                          key={feature.featureId}
                          name={feature.name}
                          status={feature.status}
                          startedAt={feature.startedAt}
                          duration={feature.duration}
                          agentType={feature.agentType}
                          modelId={feature.modelId}
                          onClick={
                            onFeatureClick ? () => onFeatureClick(feature.featureId) : undefined
                          }
                        />
                      ))}
                    </FeatureStatusGroup>
                  ))}
                </RepoGroup>
              ))}
            </ScrollArea>
          </div>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      className="w-auto flex-none"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        const currentResolved = theme === 'system' ? resolvedTheme : theme;
                        const goingToDark = currentResolved !== 'dark';
                        const newTheme =
                          theme === 'system'
                            ? resolvedTheme === 'dark'
                              ? 'light'
                              : 'dark'
                            : theme === 'dark'
                              ? 'light'
                              : 'dark';
                        if (goingToDark) {
                          toggleOnSound.play();
                        } else {
                          toggleOffSound.play();
                        }
                        const prefersReducedMotion =
                          typeof window !== 'undefined' &&
                          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        if (!('startViewTransition' in document) || prefersReducedMotion) {
                          setTheme(newTheme);
                          return;
                        }
                        document.documentElement.style.setProperty('--x', `${e.clientX}px`);
                        document.documentElement.style.setProperty('--y', `${e.clientY}px`);
                        (
                          document as unknown as { startViewTransition: (cb: () => void) => void }
                        ).startViewTransition(() => {
                          setTheme(newTheme);
                        });
                      }}
                      aria-label={
                        resolvedTheme === 'dark'
                          ? t('sidebar.switchToLight')
                          : t('sidebar.switchToDark')
                      }
                    >
                      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {resolvedTheme === 'dark'
                      ? t('sidebar.switchToLight')
                      : t('sidebar.switchToDark')}
                  </TooltipContent>
                </Tooltip>
                {!collapsed && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="w-auto flex-none"
                        onClick={() => {
                          clickSound.play();
                          toggleSound();
                        }}
                        aria-label={
                          soundEnabled ? t('sidebar.muteSounds') : t('sidebar.unmuteSounds')
                        }
                      >
                        {soundEnabled ? (
                          <Volume2 className="h-4 w-4" />
                        ) : (
                          <VolumeOff className="h-4 w-4" />
                        )}
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {soundEnabled ? t('sidebar.muteSounds') : t('sidebar.unmuteSounds')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {!collapsed && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="w-auto flex-none"
                        onClick={() => {
                          clickSound.play();
                          toggleAnimations();
                        }}
                        aria-label={animationsEnabled ? 'Disable animations' : 'Enable animations'}
                      >
                        {animationsEnabled ? (
                          <Zap className="h-4 w-4" />
                        ) : (
                          <ZapOff className="h-4 w-4" />
                        )}
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {animationsEnabled ? 'Disable animations' : 'Enable animations'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </TooltipProvider>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
