'use client';

import { useRef, useEffect } from 'react';
import { XIcon, Play, Square } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ActionButton } from '@/components/common/action-button';
import { DeploymentStatusBadge } from '@/components/common/deployment-status-badge';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerOverlay,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { useDeployAction, type DeployActionInput } from '@/hooks/use-deploy-action';
import { isDeploymentActive } from '@/hooks/deployment-status-store';
import { useFeatureFlags } from '@/hooks/feature-flags-context';

const drawerVariants = cva('', {
  variants: {
    size: {
      sm: 'w-96',
      md: 'w-2xl',
      lg: 'w-[772px]',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

export interface BaseDrawerProps extends VariantProps<typeof drawerVariants> {
  open: boolean;
  onClose: () => void;
  modal?: boolean;
  /** When true, clicking anywhere outside the drawer closes it, ignoring `data-no-drawer-close` guards. */
  dismissOnOutsideClick?: boolean;
  title?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
  deployTarget?: DeployActionInput;
}

export function BaseDrawer({
  open,
  onClose,
  modal = false,
  dismissOnOutsideClick = false,
  title = 'Drawer',
  size,
  header,
  children,
  footer,
  className,
  'data-testid': testId,
  deployTarget,
}: BaseDrawerProps) {
  const { i18n } = useTranslation();
  const featureFlags = useFeatureFlags();
  const contentRef = useRef<HTMLDivElement>(null);
  const drawerDirection = i18n.dir() === 'rtl' ? 'left' : 'right';

  // Close when clicking outside the drawer panel (no overlay needed — canvas stays draggable).
  // Uses `click` (not `pointerdown`) so canvas drags don't trigger this.
  useEffect(() => {
    if (!open || modal) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      // If the clicked element was unmounted by React before the event reached
      // the document (e.g. a "Next" button removed on the last step), it is no
      // longer in the DOM tree — treat it as an internal click, not an outside one.
      if (!document.body.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      // Don't close when clicking inside Radix overlays.
      // When dismissOnOutsideClick is false (default), also respect data-no-drawer-close guards.
      const ignoreSelector = dismissOnOutsideClick
        ? '[role="alertdialog"], [role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'
        : '[data-no-drawer-close], [role="alertdialog"], [role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';
      if (target.closest(ignoreSelector)) return;
      onClose();
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open, modal, onClose, dismissOnOutsideClick]);

  return (
    <Drawer
      direction={drawerDirection}
      modal={modal}
      handleOnly
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      {modal ? <DrawerOverlay /> : null}
      <DrawerContent
        ref={contentRef}
        direction={drawerDirection}
        showCloseButton={false}
        className={cn(
          drawerVariants({ size }),
          'bg-white/85 backdrop-blur-xl dark:bg-neutral-800/85',
          className
        )}
        data-testid={testId}
        onInteractOutside={modal ? undefined : (e) => e.preventDefault()}
      >
        {/* Visually hidden title & description required by Radix Dialog for accessibility */}
        <DrawerTitle asChild>
          <span className="sr-only">{title}</span>
        </DrawerTitle>
        <DrawerDescription asChild>
          <span className="sr-only">{title}</span>
        </DrawerDescription>

        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ring-offset-background focus:ring-ring absolute end-3 top-2 z-50 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
          data-testid={testId ? `${testId}-close-button` : undefined}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Header slot */}
        {header ? <DrawerHeader className="shrink-0">{header}</DrawerHeader> : null}

        {/* Separator between header and content — matches review drawer style */}
        {header ? <Separator /> : null}

        {/* Dev server bar — rendered when deployTarget is provided and env deploy is enabled */}
        {featureFlags.envDeploy && deployTarget ? <DeployBar deployTarget={deployTarget} /> : null}

        {/* Scrollable content area. Consumers should add p-4 for consistent spacing. */}
        {/* Footer components like DrawerActionBar typically include border-t. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        {/* Footer slot */}
        {footer ? <DrawerFooter className="shrink-0">{footer}</DrawerFooter> : null}
      </DrawerContent>
    </Drawer>
  );
}

function DeployBar({ deployTarget }: { deployTarget: DeployActionInput }) {
  const deployAction = useDeployAction(deployTarget);
  const deploymentActive = isDeploymentActive(deployAction.status);

  return (
    <div data-testid="base-drawer-deploy-bar" className="flex items-center gap-2 px-4 pt-3 pb-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ActionButton
                label={deploymentActive ? 'Stop Dev Server' : 'Start Dev Server'}
                onClick={deploymentActive ? deployAction.stop : deployAction.deploy}
                loading={deployAction.deployLoading || deployAction.stopLoading}
                error={!!deployAction.deployError}
                icon={deploymentActive ? Square : Play}
                iconOnly
                variant="outline"
                size="icon-sm"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {deploymentActive ? 'Stop Dev Server' : 'Start Dev Server'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {deploymentActive ? (
        <DeploymentStatusBadge
          status={deployAction.status}
          url={deployAction.url}
          targetId={deployTarget.targetId}
        />
      ) : null}
    </div>
  );
}
