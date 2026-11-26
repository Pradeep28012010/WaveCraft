import { useMemo, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { LiquidGlassToggle } from '../ui/LiquidGlassToggle';
import ReactBitsReorderList from '../ui/ReactBitsReorderList';
import {
  CONTEXT_MENU_DENSITY_TOKENS,
  PAGE_ACTION_META_MAP,
  TRACK_ACTION_META_MAP,
  normalizeContextMenuConfig,
  type ContextMenuScope
} from '../../utils/contextMenuConfig';
import type {
  ContextMenuActionItem,
  ContextMenuDensity,
  ContextMenuPageActionId,
  ContextMenuTrackActionId
} from '../../types';

interface ContextMenuSettingsSectionProps {
  onNotify?: (message: string) => void;
}

type ScopedActionItem = ContextMenuActionItem<
  ContextMenuTrackActionId | ContextMenuPageActionId
>;

export default function ContextMenuSettingsSection({
  onNotify
}: ContextMenuSettingsSectionProps) {
  const [activeScope, setActiveScope] = useState<ContextMenuScope>('track');

  const rawContextMenu = useSettingsStore((s) => s.contextMenu);
  const setContextMenuDensity = useSettingsStore((s) => s.setContextMenuDensity);
  const toggleContextMenuAction = useSettingsStore((s) => s.toggleContextMenuAction);
  const reorderContextMenuActions = useSettingsStore((s) => s.reorderContextMenuActions);
  const moveContextMenuAction = useSettingsStore((s) => s.moveContextMenuAction);
  const resetContextMenuConfig = useSettingsStore((s) => s.resetContextMenuConfig);

  const config = useMemo(
    () => normalizeContextMenuConfig(rawContextMenu),
    [rawContextMenu]
  );

  const currentActions: ScopedActionItem[] =
    activeScope === 'track' ? config.trackActions : config.pageActions;

  const trackEnabledCount = config.trackActions.filter((a) => a.enabled).length;
  const pageEnabledCount = config.pageActions.filter((a) => a.enabled).length;

  const getActionMeta = (id: ContextMenuTrackActionId | ContextMenuPageActionId) => {
    if (activeScope === 'track') {
      return TRACK_ACTION_META_MAP[id as ContextMenuTrackActionId];
    }
    return PAGE_ACTION_META_MAP[id as ContextMenuPageActionId];
  };

  const handleReset = () => {
    triggerAndroidHaptic('medium');
    resetContextMenuConfig();
    onNotify?.('Right-click context menu reset to default.');
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Right-Click Context Menu Settings">
      <div className="px-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Right-Click Context Menu</span>
          </h2>
          <p className="text-xs text-white/50">
            Configure compact glass density, visible Track &amp; Page actions, and row order
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="px-3.5 py-1.5 rounded-full glass-button text-xs font-semibold text-white/85 hover:text-white cursor-pointer"
        >
          Reset to Default
        </button>
      </div>

      <div className="rounded-[22px] glass-bloom-menu p-3 sm:p-4 flex flex-col gap-4 shadow-md">
        {/* Density Preset Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-white/[0.03]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Menu Density Preset</p>
            <p className="text-xs text-white/50">
              {config.density === 'compact'
                ? 'Balanced compact glass spacing with subtle track thumbnail'
                : 'Ultra-compact high-density rows for minimal footprint'}
            </p>
          </div>

          <div className="flex gap-1.5 p-1 rounded-full bg-white/[0.04] relative self-start sm:self-auto flex-shrink-0">
            <LayoutGroup id="settings-context-menu-density">
              {(['compact', 'ultra-compact'] as ContextMenuDensity[]).map((preset) => {
                const isSelected = config.density === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setContextMenuDensity(preset);
                    }}
                    className="relative px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer select-none whitespace-nowrap"
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="settings-context-menu-density-pill"
                        layout="position"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.5 }}
                        className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                      />
                    )}
                    <span
                      className={`relative z-10 transition-colors duration-150 ${
                        isSelected
                          ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {CONTEXT_MENU_DENSITY_TOKENS[preset].label}
                    </span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        </div>

        {/* Scope Tabs: Track Actions vs Page Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex gap-1.5 p-1 rounded-full bg-white/[0.04] relative">
            <LayoutGroup id="settings-context-menu-scope">
              {(
                [
                  {
                    id: 'track' as ContextMenuScope,
                    label: `Track Menu (${trackEnabledCount}/${config.trackActions.length})`
                  },
                  {
                    id: 'page' as ContextMenuScope,
                    label: `Page Menu (${pageEnabledCount}/${config.pageActions.length})`
                  }
                ] as const
              ).map((tab) => {
                const isSelected = activeScope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setActiveScope(tab.id);
                    }}
                    className="relative px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer select-none whitespace-nowrap"
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="settings-context-menu-scope-pill"
                        layout="position"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.5 }}
                        className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                      />
                    )}
                    <span
                      className={`relative z-10 transition-colors duration-150 ${
                        isSelected
                          ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>

          <span className="text-[11px] text-white/45">
            Drag rows or use arrows to reorder
          </span>
        </div>

        {/* Reorderable & Toggleable Action List */}
        <ReactBitsReorderList
          items={currentActions}
          gap={6}
          onReorder={(fromIndex, toIndex) =>
            reorderContextMenuActions(activeScope, fromIndex, toIndex)
          }
          renderItem={(item, index, isDragging) => {
            const meta = getActionMeta(item.id);
            return (
              <div
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-colors ${
                  isDragging
                    ? 'bg-white/[0.14] border-white/25 shadow-lg'
                    : item.enabled
                    ? 'bg-white/[0.045] border-white/[0.08] hover:bg-white/[0.07]'
                    : 'bg-white/[0.02] border-white/[0.05] opacity-65'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className="text-white/35 flex-shrink-0 cursor-grab active:cursor-grabbing"
                    aria-hidden="true"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{meta.label}</p>
                    <p className="text-[11px] text-white/45 truncate">{meta.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0" data-no-drag="true">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      moveContextMenuAction(activeScope, item.id, 'up');
                    }}
                    aria-label={`Move ${meta.label} up`}
                    className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white/75 hover:text-white transition-colors cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    disabled={index === currentActions.length - 1}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      moveContextMenuAction(activeScope, item.id, 'down');
                    }}
                    aria-label={`Move ${meta.label} down`}
                    className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white/75 hover:text-white transition-colors cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  <LiquidGlassToggle
                    checked={item.enabled}
                    onChange={(checked) => toggleContextMenuAction(activeScope, item.id, checked)}
                    size="sm"
                    activeColor="emerald"
                    aria-label={`Toggle ${meta.label}`}
                  />
                </div>
              </div>
            );
          }}
        />
      </div>
    </section>
  );
}
