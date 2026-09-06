"use client";

import {
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from "@/assistant-original/components/assistant-ui/thread-list";
import { TooltipIconButton } from "@/assistant-original/components/assistant-ui/tooltip-icon-button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/assistant-original/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/assistant-original/components/ui/tooltip";
import { cn } from "@/assistant-original/lib/utils";
import { useAuiState } from "@assistant-ui/react";
import { PanelLeftIcon } from "lucide-react";
import { useRef, useState, type FC, type MouseEvent, type ReactNode, type TouchEvent } from "react";

type CloneThreadShellProps = {
  children: ReactNode;
  sidebarContent?: ReactNode;
  railClassName?: string | undefined;
  collapsed?: boolean | undefined;
  onCollapsedChange?: ((value: boolean) => void) | undefined;
  mobileSidebarOpen?: boolean | undefined;
  onMobileSidebarOpenChange?: ((value: boolean) => void) | undefined;
  headerContent?: ReactNode | undefined;
  sheetTitle?: ReactNode | undefined;
  showSearch?: boolean | undefined;
  wrapNewThreadTooltip?: boolean | undefined;
  showThreadList?: boolean | undefined;
};

export const CloneThreadShell: FC<CloneThreadShellProps> = ({
  children,
  sidebarContent,
  railClassName,
  collapsed,
  onCollapsedChange,
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  headerContent,
  sheetTitle,
  showSearch = true,
  wrapNewThreadTooltip = false,
  showThreadList = true,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const touchStart = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  // A controlled value means the caller renders the chrome that drives it, so
  // the shell omits its own toggle / trigger and forwards changes instead.
  const collapsedControlled = collapsed !== undefined;
  const mobileControlled = mobileSidebarOpen !== undefined;

  const sidebarCollapsed = collapsed ?? internalCollapsed;
  const mobileOpen = mobileSidebarOpen ?? internalMobileOpen;

  const setSidebarCollapsed = (value: boolean) => {
    if (!collapsedControlled) setInternalCollapsed(value);
    onCollapsedChange?.(value);
  };
  const setMobileOpen = (open: boolean) => {
    if (!mobileControlled) setInternalMobileOpen(open);
    onMobileSidebarOpenChange?.(open);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY, target: event.target } : null;
  };
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || mobileOpen || !(window.matchMedia?.('(max-width: 767px)').matches ?? true)) return;
    if (start.target instanceof Element && start.target.closest('.vinz-conversation-tabs')) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) setMobileOpen(true);
  };

  const closeMobileSidebarAfterNavigation = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(
        '[data-slot="aui_thread-list-item-trigger"], [data-slot="aui_thread-list-new"], [data-open-workspace]',
      )
    ) {
      setMobileOpen(false);
    }
  };

  const newThread = (
    <ThreadListNew
      className={cn(
        "overflow-hidden transition-all duration-200",
        sidebarCollapsed
          ? "w-8 gap-0 px-2 has-[>svg]:px-2"
          : "w-full gap-2 px-2.5 has-[>svg]:px-2.5",
      )}
      labelClassName={cn(
        "overflow-hidden transition-all duration-200",
        sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100",
      )}
    />
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <aside
        className={cn(
          "bg-muted/30 hidden h-full shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 md:flex",
          railClassName,
          sidebarCollapsed ? "w-12" : "w-65",
        )}
      >
        <div className="flex h-12 shrink-0 items-center overflow-hidden px-2">
          {!collapsedControlled && (
            <TooltipIconButton
              variant="ghost"
              size="icon"
              tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              side="right"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="size-8"
            >
              <PanelLeftIcon className="size-4" />
            </TooltipIconButton>
          )}
          {headerContent !== undefined
            ? headerContent
            : !sidebarCollapsed && (
                <span className="ml-2 truncate text-sm font-medium">Chats</span>
              )}
        </div>
        {!sidebarCollapsed && sidebarContent}
        {showThreadList && <ThreadListRoot
          className={cn(
            "relative flex-1 transition-[padding,width] duration-200",
            sidebarCollapsed
              ? "w-12 overflow-hidden px-2 pt-1"
              : "w-65 overflow-y-auto p-3",
          )}
        >
          {wrapNewThreadTooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={newThread} />
                {sidebarCollapsed && (
                  <TooltipContent side="right">New Thread</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          ) : (
            newThread
          )}
          {showSearch && hasThreads && (
            <div
              aria-hidden={sidebarCollapsed}
              inert={sidebarCollapsed}
              className={cn(
                "transition-opacity duration-150",
                sidebarCollapsed && "pointer-events-none opacity-0",
              )}
            >
              <ThreadListSearch value={search} onValueChange={setSearch} />
            </div>
          )}
          <ThreadListItems
            searchQuery={showSearch && hasThreads ? search : ""}
            aria-hidden={sidebarCollapsed}
            inert={sidebarCollapsed}
            className={cn(
              "transition-[opacity,transform] duration-150",
              sidebarCollapsed
                ? "pointer-events-none opacity-0"
                : "translate-x-0 opacity-100",
            )}
          />
        </ThreadListRoot>}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        {!mobileControlled && <SheetTrigger className="sr-only">Apri progetti</SheetTrigger>}
        <SheetContent side="left" className="vinz-thread-drawer flex flex-col gap-0 p-0">
          <SheetTitle className="vinz-thread-drawer__title flex shrink-0 items-center px-5 text-2xl font-semibold">
            {sheetTitle ?? "VINZ.MON"}
          </SheetTitle>
          <div
            className="vinz-thread-drawer__body relative flex min-h-0 flex-1 flex-col overflow-hidden px-4"
            onClick={closeMobileSidebarAfterNavigation}
          >
            {sidebarContent}
            {showThreadList && hasThreads && (
              <ThreadListSearch value={search} onValueChange={setSearch} />
            )}
            {showThreadList && <>
              <div className="vinz-thread-drawer__section">Recenti</div>
              <ThreadListRoot className="min-h-0 flex-1 overflow-y-auto pb-4">
                <ThreadListItems searchQuery={hasThreads ? search : ""} />
              </ThreadListRoot>
            </>}
          </div>
          <div className="vinz-thread-drawer__footer shrink-0 px-4">
            <ThreadListNew className="vinz-thread-drawer__new h-12 w-full justify-center rounded-full text-base font-semibold" />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
};
