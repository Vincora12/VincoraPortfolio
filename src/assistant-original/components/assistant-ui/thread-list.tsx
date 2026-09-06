"use client";

import { Button } from "@/assistant-original/components/ui/button";
import { Input } from "@/assistant-original/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/assistant-original/components/ui/popover";
import { Skeleton } from "@/assistant-original/components/ui/skeleton";
import { cn } from "@/assistant-original/lib/utils";
import {
  AuiIf,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CheckIcon,
  DumbbellIcon,
  FlameIcon,
  FolderIcon,
  HeartIcon,
  LightbulbIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  MessageCircleIcon,
  PlaneIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UtensilsIcon,
} from "lucide-react";
import {
  forwardRef,
  Fragment,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FC,
} from "react";
import { serverBackedStorage } from "@/system/serverStorage";
import {
  discardLocalSession,
} from "@/assistant-original/conversation-lifecycle-adapter";
import {
  requestManualRoomEntry,
  requestNextRoomEntry,
} from "@/assistant-original/chat-room-presence";

const THREAD_ICONS_KEY = "assistant-ui-official-chatgpt:thread-icons";
const THREAD_COLORS_KEY = "assistant-ui-official-chatgpt:thread-colors";
const ACTIVE_THREAD_KEY = "assistant-ui-official-chatgpt:active-thread";

const THREAD_COLORS = ["#42d8f4", "#ff4e68", "#ffb627", "#49d17d", "#9d7cff", "#f08bd6", "#f2f2f2"] as const;
type ThreadColor = (typeof THREAD_COLORS)[number];

const THREAD_ICONS = {
  chat: MessageCircleIcon,
  flame: FlameIcon,
  food: UtensilsIcon,
  sport: DumbbellIcon,
  travel: PlaneIcon,
  work: BriefcaseBusinessIcon,
  heart: HeartIcon,
  idea: LightbulbIcon,
  study: BookOpenIcon,
  folder: FolderIcon,
} as const;

type ThreadIconName = keyof typeof THREAD_ICONS;
type ThreadIconMap = Record<string, ThreadIconName>;

function readLocalThreadIcons(): ThreadIconMap {
  try {
    return JSON.parse(localStorage.getItem(THREAD_ICONS_KEY) ?? "{}") as ThreadIconMap;
  } catch {
    return {};
  }
}

function readLocalThreadColors(): Record<string, ThreadColor> {
  try {
    return JSON.parse(localStorage.getItem(THREAD_COLORS_KEY) ?? "{}") as Record<string, ThreadColor>;
  } catch {
    return {};
  }
}

function useThreadIcon(threadId: string) {
  const [name, setName] = useState<ThreadIconName>(() => readLocalThreadIcons()[threadId] ?? "chat");
  const [color, setColor] = useState<ThreadColor | null>(() => readLocalThreadColors()[threadId] ?? null);

  useEffect(() => {
    void serverBackedStorage.getItem(THREAD_ICONS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const remote = JSON.parse(raw) as ThreadIconMap;
        if (remote[threadId]) setName(remote[threadId]);
      } catch { /* La scelta locale resta valida. */ }
    });
  }, [threadId]);

  useEffect(() => {
    void serverBackedStorage.getItem(THREAD_COLORS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const remote = JSON.parse(raw) as Record<string, ThreadColor>;
        if (remote[threadId]) setColor(remote[threadId]);
      } catch { /* La scelta locale resta valida. */ }
    });
  }, [threadId]);

  const choose = (next: ThreadIconName) => {
    setName(next);
    const map = { ...readLocalThreadIcons(), [threadId]: next };
    void serverBackedStorage.setItem(THREAD_ICONS_KEY, JSON.stringify(map));
  };

  const chooseColor = (next: ThreadColor) => {
    setColor(next);
    const map = { ...readLocalThreadColors(), [threadId]: next };
    void serverBackedStorage.setItem(THREAD_COLORS_KEY, JSON.stringify(map));
  };

  return { name, choose, color, chooseColor, Icon: THREAD_ICONS[name] };
}

export const ThreadList: FC = () => {
  const [search, setSearch] = useState("");
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  return (
    <ThreadListRoot>
      <ThreadListNew />
      {hasThreads && (
        <ThreadListSearch value={search} onValueChange={setSearch} />
      )}
      <ThreadListItems searchQuery={hasThreads ? search : ""} />
    </ThreadListRoot>
  );
};

export const ThreadListSearch = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
  }
>(({ className, value, onValueChange, ...props }, ref) => {
  return (
    <div data-slot="aui_thread-list-search" className="relative px-0.5 py-1">
      <SearchIcon
        data-slot="aui_thread-list-search-icon"
        className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label="Search threads"
        placeholder="Cerca nelle chat"
        className={cn("h-8 ps-8 text-sm", className)}
        {...props}
      />
    </div>
  );
});

ThreadListSearch.displayName = "ThreadListSearch";

export const ThreadListRoot: FC<
  ComponentPropsWithoutRef<typeof ThreadListPrimitive.Root>
> = ({ className, ...props }) => {
  return (
    <ThreadListPrimitive.Root
      data-slot="aui_thread-list-root"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
};

export const ThreadListItems: FC<
  ComponentPropsWithoutRef<"div"> & { searchQuery?: string }
> = ({ className, searchQuery = "", ...props }) => {
  const aui = useAui();
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => threadIds.includes(id))));
  }, [threadIds]);

  const cancelSelection = () => {
    setSelected(new Set());
    setSelecting(false);
  };

  const deleteSelected = async () => {
    if (!selected.size || deleting) return;
    if (!window.confirm(`Eliminare ${selected.size} chat selezionate?`)) return;
    setDeleting(true);
    const ids = [...selected];
    const remaining = threadIds.filter((id) => !selected.has(id));
    try {
      if (selected.has(mainThreadId) && remaining[0]) {
        await aui.threads.switchToThread(remaining[0]);
      }
      const ordered = ids.sort((a, b) => Number(a === mainThreadId) - Number(b === mainThreadId));
      for (const id of ordered) await aui.threads.item({ id }).delete();
      await removeThreadPresentation(ids);
      if (remaining.length === 0) {
        await serverBackedStorage.removeItem(ACTIVE_THREAD_KEY);
      }
      cancelSelection();
    } finally {
      setDeleting(false);
    }
  };

  const selection = useMemo<ThreadSelectionContextValue>(() => ({
    selecting,
    selected,
    toggle: (id) => setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
  }), [selecting, selected]);

  return (
    <ThreadSelectionContext.Provider value={selection}>
      <div
        data-slot="aui_thread-list-items"
        className={cn("flex flex-col gap-0.5", className)}
        {...props}
      >
        {threadIds.length > 0 && (
          <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-1 text-xs">
            {selecting ? (
              <>
                <span className="text-muted-foreground">{selected.size} selezionate</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelected(new Set(threadIds))} className="hover:text-foreground text-muted-foreground">Tutte</button>
                  <button type="button" disabled={!selected.size || deleting} onClick={() => void deleteSelected()} className="text-destructive disabled:opacity-40">Elimina ({selected.size})</button>
                  <button type="button" onClick={cancelSelection} className="hover:text-foreground text-muted-foreground">Annulla</button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setSelecting(true)} className="text-muted-foreground hover:text-foreground ms-auto">Seleziona</button>
            )}
          </div>
        )}
        <AuiIf condition={(s) => s.threads.isLoading}>
          <ThreadListSkeleton />
        </AuiIf>
        <AuiIf condition={(s) => !s.threads.isLoading}>
          <ThreadListItemGroups searchQuery={searchQuery} />
        </AuiIf>
      </div>
    </ThreadSelectionContext.Provider>
  );
};

type ThreadSelectionContextValue = {
  selecting: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
};

const ThreadSelectionContext = createContext<ThreadSelectionContextValue>({
  selecting: false,
  selected: new Set(),
  toggle: () => undefined,
});

async function removeThreadPresentation(ids: readonly string[]): Promise<void> {
  const [iconsRaw, colorsRaw] = await Promise.all([
    serverBackedStorage.getItem(THREAD_ICONS_KEY),
    serverBackedStorage.getItem(THREAD_COLORS_KEY),
  ]);
  let icons = readLocalThreadIcons();
  let colors = readLocalThreadColors();
  try {
    if (iconsRaw) icons = JSON.parse(iconsRaw) as ThreadIconMap;
  } catch { /* I metadati corrotti non devono impedire l'eliminazione. */ }
  try {
    if (colorsRaw) colors = JSON.parse(colorsRaw) as Record<string, ThreadColor>;
  } catch { /* I metadati corrotti non devono impedire l'eliminazione. */ }
  for (const id of ids) {
    delete icons[id];
    delete colors[id];
  }
  await Promise.all([
    serverBackedStorage.setItem(THREAD_ICONS_KEY, JSON.stringify(icons)),
    serverBackedStorage.setItem(THREAD_COLORS_KEY, JSON.stringify(colors)),
  ]);
}

const DAY_IN_MS = 86_400_000;

const dateGroupLabel = (
  date: Date | undefined,
  startOfToday: number,
): string => {
  if (!date || date.getTime() >= startOfToday) return "Oggi";
  if (date.getTime() >= startOfToday - DAY_IN_MS) return "Ieri";
  return "Precedenti";
};

type ThreadListGroup = { label: string; indices: number[] };

const ThreadListItemGroups: FC<{ searchQuery?: string }> = ({
  searchQuery = "",
}) => {
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const threadItems = useAuiState((s) => s.threads.threadItems);

  const query = searchQuery.trim().toLowerCase();

  const { filteredIndices, groups } = useMemo(() => {
    const itemsById = new Map(threadItems.map((item) => [item.id, item]));
    const dates = threadIds.map((id) => itemsById.get(id)?.lastMessageAt);
    const filteredIndices = threadIds
      .map((id, index) => ({ id, index }))
      .filter(
        ({ id }) =>
          !query ||
          (itemsById.get(id)?.title || "New Chat")
            .toLowerCase()
            .includes(query),
      )
      .map(({ index }) => index);
    if (!filteredIndices.some((index) => dates[index])) {
      return { filteredIndices, groups: null };
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const time = (index: number) =>
      dates[index]?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const sorted = [...filteredIndices].sort((a, b) => time(b) - time(a));

    const result: ThreadListGroup[] = [];
    for (const index of sorted) {
      const label = dateGroupLabel(dates[index], startOfToday);
      const lastGroup = result[result.length - 1];
      if (lastGroup?.label === label) {
        lastGroup.indices.push(index);
      } else {
        result.push({ label, indices: [index] });
      }
    }
    return { filteredIndices, groups: result };
  }, [threadIds, threadItems, query]);

  if (query && filteredIndices.length === 0) {
    return (
      <div
        data-slot="aui_thread-list-empty"
        className="text-muted-foreground px-2.5 py-4 text-sm"
      >
        Nessuna chat trovata
      </div>
    );
  }

  if (!groups) {
    return filteredIndices.map((index) => (
      <ThreadListPrimitive.ItemByIndex
        key={threadIds[index]}
        index={index}
        components={{ ThreadListItem }}
      />
    ));
  }

  return groups.map((group) => (
    <Fragment key={group.label}>
      <div
        data-slot="aui_thread-list-group-label"
        className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium"
      >
        {group.label}
      </div>
      {group.indices.map((index) => (
        <ThreadListPrimitive.ItemByIndex
          key={threadIds[index]}
          index={index}
          components={{ ThreadListItem }}
        />
      ))}
    </Fragment>
  ));
};

export const ThreadListNew = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & { labelClassName?: string; onCreated?: (threadId: string) => void }
>(({ className, labelClassName, children, onCreated, ...props }, ref) => {
  const aui = useAui();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const createThread = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const currentThreadId = aui.threads.item("main").getState().id;
      discardLocalSession(currentThreadId);
      await aui.threads.switchToNewThread();
      const threadId = aui.threads.item("main").getState().id;
      discardLocalSession(threadId);
      aui.thread.reset();
      onCreated?.(threadId);
      requestNextRoomEntry();
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  return (
      <Button
        ref={ref}
        type="button"
        disabled={creating}
        onClick={() => void createThread()}
        variant="ghost"
        data-slot="aui_thread-list-new"
        className={cn(
          "hover:bg-muted data-active:bg-muted h-8 justify-start gap-2 rounded-md px-2.5 text-sm font-normal",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <PlusIcon
              data-slot="aui_thread-list-new-icon"
              className="size-4 shrink-0"
            />
            <span
              data-slot="aui_thread-list-new-label"
              className={cn("whitespace-nowrap", labelClassName)}
            >
              Nuova chat
            </span>
          </>
        )}
      </Button>
  );
});

ThreadListNew.displayName = "ThreadListNew";

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          data-slot="aui_thread-list-skeleton-wrapper"
          className="flex h-8 items-center px-2.5"
        >
          <Skeleton
            data-slot="aui_thread-list-skeleton"
            className="h-3.5 w-full"
          />
        </div>
      ))}
    </div>
  );
};

export const ThreadListItem: FC = () => {
  const isRunning = useAuiState((s) => s.threadListItem.isRunning);
  const threadId = useAuiState((s) => s.threadListItem.id);
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
  const threadIcon = useThreadIcon(threadId);
  const selection = useContext(ThreadSelectionContext);
  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (isRenaming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);

  return (
    <ThreadListItemPrimitive.Root
      data-slot="aui_thread-list-item"
      className="group hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted has-data-[state=open]:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none"
    >
      {selection.selecting ? (
        <button
          type="button"
          data-slot="aui_thread-list-item-select"
          aria-pressed={selection.selected.has(threadId)}
          onClick={() => selection.toggle(threadId)}
          className="flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm"
        >
          <span className={cn("me-2 flex size-4 shrink-0 items-center justify-center rounded border", selection.selected.has(threadId) && "border-[var(--char-accent-on-dark)] bg-[var(--char-accent-on-dark)] text-black")}>
            {selection.selected.has(threadId) ? <CheckIcon className="size-3" /> : null}
          </span>
          <threadIcon.Icon aria-hidden className="me-2 size-4 shrink-0" style={threadIcon.color ? { color: threadIcon.color } : undefined} />
          <span className="min-w-0 flex-1 truncate"><ThreadListItemPrimitive.Title fallback="New Chat" /></span>
        </button>
      ) : isRenaming ? (
        <ThreadListItemRename
          onDone={(restoreFocus) => {
            restoreFocusRef.current = restoreFocus;
            setIsRenaming(false);
          }}
        />
      ) : (
        <ThreadListItemPrimitive.Trigger
          ref={triggerRef}
          onClick={() => {
            if (threadId !== mainThreadId) requestManualRoomEntry(threadId);
          }}
          data-slot="aui_thread-list-item-trigger"
          className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-9 group-has-focus-visible:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9 focus-visible:ring-1"
        >
          <threadIcon.Icon
            aria-hidden
            className="aui-thread-icon me-2 size-4 shrink-0"
            style={threadIcon.color ? { color: threadIcon.color } : undefined}
          />
          {isRunning && (
            <Loader2Icon
              aria-hidden
              data-slot="aui_thread-list-item-running"
              className="text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin"
            />
          )}
          <span
            data-slot="aui_thread-list-item-title"
            className="min-w-0 flex-1 truncate"
          >
            <ThreadListItemPrimitive.Title fallback="New Chat" />
          </span>
          {isRunning && <span className="sr-only">Running</span>}
        </ThreadListItemPrimitive.Trigger>
      )}
      {!selection.selecting && <ThreadListItemMore
        icon={threadIcon.name}
        color={threadIcon.color}
        onIconChange={threadIcon.choose}
        onColorChange={threadIcon.chooseColor}
        onRename={() => setIsRenaming(true)}
      />}
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemRename: FC<{
  onDone: (restoreFocus: boolean) => void;
}> = ({ onDone }) => {
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title) ?? "";
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = (restoreFocus: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;

    const next = value.trim();
    if (!next || next === title) {
      onDone(restoreFocus);
      return;
    }

    // Deferred so a synchronous throw lands on the rejection path too.
    Promise.resolve()
      .then(() => aui.threadListItem.rename(next))
      .then(
        () => onDone(restoreFocus),
        () => {
          settledRef.current = false;
          if (restoreFocus) inputRef.current?.focus();
        },
      );
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone(true);
  };

  return (
    <Input
      ref={inputRef}
      autoFocus
      data-slot="aui_thread-list-item-rename"
      aria-label="Rename thread"
      value={value}
      className="h-7 min-w-0 flex-1 ps-2.5 pe-9 text-sm"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
};

const ThreadListItemMore: FC<{
  icon: ThreadIconName;
  color: ThreadColor | null;
  onIconChange: (icon: ThreadIconName) => void;
  onColorChange: (color: ThreadColor) => void;
  onRename: () => void;
}> = ({ icon, color, onIconChange, onColorChange, onRename }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            aria-label="More options"
            variant="ghost"
            size="icon"
            data-slot="aui_thread-list-item-more"
            className="data-[state=open]:bg-accent absolute end-1.5 top-1/2 z-10 size-8 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 group-data-active:opacity-100 data-[state=open]:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon className="size-3.5" />
        <span className="sr-only">More options</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        data-slot="aui_thread-list-item-more-content"
        className="bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[10002] w-52 gap-0.5 overflow-hidden rounded-xl border p-1 shadow-xl"
      >
        <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-[#a9a9a9]">Icona</div>
        <div className="grid grid-cols-5 gap-1 px-1.5 pb-2">
          {(Object.entries(THREAD_ICONS) as [ThreadIconName, typeof MessageCircleIcon][]).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              aria-label={`Scegli icona ${name}`}
              aria-pressed={icon === name}
              className="flex size-9 items-center justify-center rounded-lg text-[#b9b9b9] transition-colors hover:bg-[#343434] aria-pressed:bg-[#343434] aria-pressed:text-[var(--char-accent-on-dark)]"
              onClick={() => {
                onIconChange(name);
                setOpen(false);
              }}
            >
              <Icon className="size-4.5" />
            </button>
          ))}
        </div>
        <div className="px-2.5 pt-1 pb-1 text-xs font-medium text-[#a9a9a9]">Colore</div>
        <div className="flex gap-1.5 px-2 pb-2">
          {THREAD_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Scegli colore ${value}`}
              aria-pressed={color === value}
              className="size-6 rounded-full border-2 border-transparent transition-transform active:scale-90 aria-pressed:border-white"
              style={{ backgroundColor: value }}
              onClick={() => onColorChange(value)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          data-slot="aui_thread-list-item-more-item"
          className="h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-sm font-normal"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
        >
          <PencilIcon className="size-4" />
          Rinomina
        </Button>
        <ThreadListItemPrimitive.Archive asChild>
          <Button
            type="button"
            variant="ghost"
            data-slot="aui_thread-list-item-more-item"
            className="h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-sm font-normal"
            onClick={() => setOpen(false)}
          >
            <ArchiveIcon className="size-4" />
            Archivia
          </Button>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <Button
            type="button"
            variant="ghost"
            data-slot="aui_thread-list-item-more-item"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-sm font-normal"
            onClick={() => setOpen(false)}
          >
            <TrashIcon className="size-4" />
            Elimina
          </Button>
        </ThreadListItemPrimitive.Delete>
      </PopoverContent>
    </Popover>
  );
};
