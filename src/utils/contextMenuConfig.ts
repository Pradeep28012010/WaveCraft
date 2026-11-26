import type {
  ContextMenuActionItem,
  ContextMenuConfig,
  ContextMenuDensity,
  ContextMenuPageActionId,
  ContextMenuTrackActionId
} from '../types';

export type ContextMenuScope = 'track' | 'page';

export interface ContextMenuActionMeta<T extends string = string> {
  id: T;
  label: string;
  description: string;
}

export interface ContextMenuDensityTokens {
  id: ContextMenuDensity;
  label: string;
  widthPx: number;
  widthClass: string;
  containerPadding: string;
  containerRadius: string;
  listGap: string;
  rowPadding: string;
  rowRadius: string;
  rowGap: string;
  textSize: string;
  iconSize: string;
  rowHeightPx: number;
  headerHeightPx: number;
  mobileRowPadding: string;
  mobileListGap: string;
  mobileTextSize: string;
  mobileIconSize: string;
}

export const TRACK_CONTEXT_ACTIONS: readonly ContextMenuActionMeta<ContextMenuTrackActionId>[] = [
  { id: 'playNow', label: 'Play / Pause', description: 'Play, pause, or resume this track' },
  { id: 'playNext', label: 'Play Next', description: 'Insert track immediately after current song' },
  { id: 'addToQueue', label: 'Add to Queue', description: 'Append track to the end of the queue' },
  { id: 'toggleLike', label: 'Like / Unlike', description: 'Save or remove from Liked Songs' },
  { id: 'addToPlaylist', label: 'Add to Playlist', description: 'Choose or create a playlist for this track' },
  { id: 'chorusPreview', label: '15s Preview', description: 'Audition a 15-second chorus highlight' },
  { id: 'toggleOffline', label: 'Save Offline', description: 'Save or remove from Offline Vault' },
  { id: 'viewLyrics', label: 'Lyrics', description: 'Open synchronized lyrics for this track' },
  { id: 'studioFx', label: 'Studio FX', description: 'Open 8D audio and concert acoustics rack' },
  { id: 'share', label: 'Share', description: 'Share track or copy link to clipboard' }
] as const;

export const PAGE_CONTEXT_ACTIONS: readonly ContextMenuActionMeta<ContextMenuPageActionId>[] = [
  { id: 'togglePlay', label: 'Play / Pause', description: 'Toggle playback of current track' },
  { id: 'nextTrack', label: 'Next Track', description: 'Skip to the next song in queue' },
  { id: 'prevTrack', label: 'Previous Track', description: 'Return to previous song or restart' },
  { id: 'toggleShuffle', label: 'Shuffle', description: 'Toggle queue shuffle mode' },
  { id: 'cycleRepeat', label: 'Repeat', description: 'Cycle repeat mode (Off, All, One)' },
  { id: 'toggleMute', label: 'Mute / Unmute', description: 'Mute or restore audio output' },
  { id: 'studioFx', label: 'Studio FX', description: 'Open 8D audio and concert acoustics rack' },
  { id: 'commandPalette', label: 'Command Palette', description: 'Open quick command search overlay' },
  { id: 'smartDj', label: 'Smart DJ', description: 'Open Smart DJ console' },
  { id: 'nightstand', label: 'Nightstand', description: 'Open OLED bedside clock mode' }
] as const;

const TRACK_ACTION_IDS: readonly ContextMenuTrackActionId[] = TRACK_CONTEXT_ACTIONS.map((a) => a.id);
const PAGE_ACTION_IDS: readonly ContextMenuPageActionId[] = PAGE_CONTEXT_ACTIONS.map((a) => a.id);

export const TRACK_ACTION_META_MAP: Record<ContextMenuTrackActionId, ContextMenuActionMeta<ContextMenuTrackActionId>> =
  TRACK_CONTEXT_ACTIONS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<ContextMenuTrackActionId, ContextMenuActionMeta<ContextMenuTrackActionId>>
  );

export const PAGE_ACTION_META_MAP: Record<ContextMenuPageActionId, ContextMenuActionMeta<ContextMenuPageActionId>> =
  PAGE_CONTEXT_ACTIONS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<ContextMenuPageActionId, ContextMenuActionMeta<ContextMenuPageActionId>>
  );

export const CONTEXT_MENU_DENSITY_TOKENS: Record<ContextMenuDensity, ContextMenuDensityTokens> = {
  compact: {
    id: 'compact',
    label: 'Compact',
    widthPx: 216,
    widthClass: 'w-[216px]',
    containerPadding: 'p-1.5',
    containerRadius: 'rounded-[16px]',
    listGap: 'gap-0.5',
    rowPadding: 'px-2.5 py-1.5',
    rowRadius: 'rounded-[10px]',
    rowGap: 'gap-2',
    textSize: 'text-[12px] leading-snug',
    iconSize: 'w-3.5 h-3.5',
    rowHeightPx: 30,
    headerHeightPx: 36,
    mobileRowPadding: 'px-3 py-2',
    mobileListGap: 'gap-1',
    mobileTextSize: 'text-[13px] leading-snug',
    mobileIconSize: 'w-4 h-4'
  },
  'ultra-compact': {
    id: 'ultra-compact',
    label: 'Ultra-Compact',
    widthPx: 192,
    widthClass: 'w-[192px]',
    containerPadding: 'p-1',
    containerRadius: 'rounded-[13px]',
    listGap: 'gap-px',
    rowPadding: 'px-2 py-1',
    rowRadius: 'rounded-[8px]',
    rowGap: 'gap-1.5',
    textSize: 'text-[11px] leading-tight',
    iconSize: 'w-3 h-3',
    rowHeightPx: 24,
    headerHeightPx: 24,
    mobileRowPadding: 'px-2.5 py-1.5',
    mobileListGap: 'gap-0.5',
    mobileTextSize: 'text-xs leading-tight',
    mobileIconSize: 'w-3.5 h-3.5'
  }
};

export function createDefaultContextMenuConfig(): ContextMenuConfig {
  return {
    density: 'compact',
    trackActions: TRACK_ACTION_IDS.map((id) => ({ id, enabled: true })),
    pageActions: PAGE_ACTION_IDS.map((id) => ({ id, enabled: true }))
  };
}

function normalizeActionList<T extends string>(
  rawList: unknown,
  canonicalIds: readonly T[]
): ContextMenuActionItem<T>[] {
  const validSet = new Set<string>(canonicalIds);
  const seen = new Set<T>();
  const normalized: ContextMenuActionItem<T>[] = [];

  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as { id?: unknown; enabled?: unknown };
      if (typeof candidate.id !== 'string' || !validSet.has(candidate.id)) continue;
      const typedId = candidate.id as T;
      if (seen.has(typedId)) continue;
      seen.add(typedId);
      normalized.push({
        id: typedId,
        enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true
      });
    }
  }

  for (const id of canonicalIds) {
    if (!seen.has(id)) {
      normalized.push({ id, enabled: true });
    }
  }

  return normalized;
}

export function normalizeContextMenuConfig(raw: unknown): ContextMenuConfig {
  if (!raw || typeof raw !== 'object') {
    return createDefaultContextMenuConfig();
  }

  const candidate = raw as Partial<ContextMenuConfig>;
  const density: ContextMenuDensity =
    candidate.density === 'ultra-compact' || candidate.density === 'compact'
      ? candidate.density
      : 'compact';

  return {
    density,
    trackActions: normalizeActionList(candidate.trackActions, TRACK_ACTION_IDS),
    pageActions: normalizeActionList(candidate.pageActions, PAGE_ACTION_IDS)
  };
}

export function setContextMenuDensity(
  config: ContextMenuConfig | undefined,
  density: ContextMenuDensity
): ContextMenuConfig {
  const base = normalizeContextMenuConfig(config);
  return {
    ...base,
    density: density === 'ultra-compact' ? 'ultra-compact' : 'compact'
  };
}

export function toggleContextMenuAction(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope,
  id: ContextMenuTrackActionId | ContextMenuPageActionId,
  enabled?: boolean
): ContextMenuConfig {
  const base = normalizeContextMenuConfig(config);
  if (scope === 'track') {
    return {
      ...base,
      trackActions: base.trackActions.map((item) =>
        item.id === id
          ? { ...item, enabled: typeof enabled === 'boolean' ? enabled : !item.enabled }
          : item
      )
    };
  }
  return {
    ...base,
    pageActions: base.pageActions.map((item) =>
      item.id === id
        ? { ...item, enabled: typeof enabled === 'boolean' ? enabled : !item.enabled }
        : item
    )
  };
}

function reorderList<T extends string>(
  list: ContextMenuActionItem<T>[],
  fromIndex: number,
  toIndex: number
): ContextMenuActionItem<T>[] {
  const next = list.map((item) => ({ ...item }));
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= next.length ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderContextMenuActions(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope,
  fromIndex: number,
  toIndex: number
): ContextMenuConfig {
  const base = normalizeContextMenuConfig(config);
  if (scope === 'track') {
    return {
      ...base,
      trackActions: reorderList(base.trackActions, fromIndex, toIndex)
    };
  }
  return {
    ...base,
    pageActions: reorderList(base.pageActions, fromIndex, toIndex)
  };
}

export function moveContextMenuAction(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope,
  id: ContextMenuTrackActionId | ContextMenuPageActionId,
  direction: 'up' | 'down'
): ContextMenuConfig {
  const base = normalizeContextMenuConfig(config);
  const list = scope === 'track' ? base.trackActions : base.pageActions;
  const fromIndex = list.findIndex((item) => item.id === id);
  if (fromIndex === -1) return base;
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= list.length) return base;
  return reorderContextMenuActions(base, scope, fromIndex, toIndex);
}

export function getVisibleContextMenuActions(
  config: ContextMenuConfig | undefined,
  scope: 'track'
): ContextMenuActionItem<ContextMenuTrackActionId>[];
export function getVisibleContextMenuActions(
  config: ContextMenuConfig | undefined,
  scope: 'page'
): ContextMenuActionItem<ContextMenuPageActionId>[];
export function getVisibleContextMenuActions(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope
): ContextMenuActionItem<ContextMenuTrackActionId>[] | ContextMenuActionItem<ContextMenuPageActionId>[];
export function getVisibleContextMenuActions(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope
): ContextMenuActionItem<ContextMenuTrackActionId>[] | ContextMenuActionItem<ContextMenuPageActionId>[] {
  const normalized = normalizeContextMenuConfig(config);
  if (scope === 'track') {
    return normalized.trackActions.filter((item) => item.enabled);
  }
  return normalized.pageActions.filter((item) => item.enabled);
}

export function estimateMenuDimensions(
  config: ContextMenuConfig | undefined,
  scope: ContextMenuScope,
  options?: {
    isPlaylistView?: boolean;
    hasTrackHeader?: boolean;
    hasContextualRemove?: boolean;
  }
): { width: number; height: number } {
  const normalized = normalizeContextMenuConfig(config);
  const tokens = CONTEXT_MENU_DENSITY_TOKENS[normalized.density];
  if (options?.isPlaylistView) {
    return {
      width: Math.max(tokens.widthPx, 224),
      height: 340
    };
  }

  const visibleCount = getVisibleContextMenuActions(normalized, scope).length;
  const effectiveRows =
    visibleCount + (scope === 'track' && options?.hasContextualRemove ? 1 : 0);
  const rowCount = Math.max(1, effectiveRows);
  const paddingY = normalized.density === 'ultra-compact' ? 8 : 12;
  const gapY = (rowCount - 1) * (normalized.density === 'ultra-compact' ? 1 : 2);
  const headerH = scope === 'track' && options?.hasTrackHeader ? tokens.headerHeightPx : 0;

  return {
    width: tokens.widthPx,
    height: paddingY + headerH + rowCount * tokens.rowHeightPx + gapY
  };
}

export function computeClampedMenuPosition(params: {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}): { left: number; top: number } {
  const margin = typeof params.margin === 'number' && Number.isFinite(params.margin) ? Math.max(0, params.margin) : 12;
  const vw = Number.isFinite(params.viewportWidth) && params.viewportWidth > 0 ? params.viewportWidth : 1024;
  const vh = Number.isFinite(params.viewportHeight) && params.viewportHeight > 0 ? params.viewportHeight : 768;
  const mw = Number.isFinite(params.menuWidth) && params.menuWidth > 0 ? params.menuWidth : 216;
  const mh = Number.isFinite(params.menuHeight) && params.menuHeight > 0 ? params.menuHeight : 280;
  const rawX = Number.isFinite(params.x) ? params.x : margin;
  const rawY = Number.isFinite(params.y) ? params.y : margin;

  const maxLeft = Math.max(margin, vw - mw - margin);
  const maxTop = Math.max(margin, vh - mh - margin);

  return {
    left: Math.max(margin, Math.min(rawX, maxLeft)),
    top: Math.max(margin, Math.min(rawY, maxTop))
  };
}
