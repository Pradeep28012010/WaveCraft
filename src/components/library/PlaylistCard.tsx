import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
import { useLibraryStore } from '../../stores/libraryStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { isPlaylistFullyOffline, getPlaylistOfflineCount } from '../../services/offlineVault';
import GlassCard from '../ui/GlassCard';

interface PlaylistCardProps {
  playlist: Playlist;
  onPlay?: () => void;
  showFolderBadge?: boolean;
}

export function getHighResPlaylistCover(playlist: Playlist): string {
  const raw =
    playlist.coverUrl ||
    playlist.tracks?.[0]?.thumbnailLarge ||
    playlist.tracks?.[0]?.thumbnail ||
    '';
  if (!raw) return '';
  return raw
    .replace('ab67706f00000001', 'ab67706f00000003')
    .replace('ab67706f00000002', 'ab67706f00000003')
    .replace('ab67616d00004851', 'ab67616d0000b273')
    .replace('ab67616d00001e02', 'ab67616d0000b273')
    .replace('150x150', '500x500')
    .replace('50x50', '500x500')
    .replace('100x100bb', '600x600bb');
}

const PlaylistCard = memo(function PlaylistCard({
  playlist,
  onPlay,
  showFolderBadge = true
}: PlaylistCardProps) {
  const hdCoverUrl = getHighResPlaylistCover(playlist);
  const isSyncing = useLibraryStore((s) => Boolean(s.syncingPlaylistIds[playlist.id]));
  const togglePin = useLibraryStore((s) => s.togglePinPlaylist);
  const folder = useLibraryStore((s) =>
    playlist.folderId ? s.folders.find((f) => f.id === playlist.folderId) : undefined
  );

  const activeDownloadJob = useDownloadStore((s) => s.activeJob);
  const startBatchDownload = useDownloadStore((s) => s.startBatchDownload);

  const isCurrentDownloading = Boolean(
    activeDownloadJob && activeDownloadJob.id === playlist.id && activeDownloadJob.isDownloading
  );

  const isFullyOffline = useMemo(
    () => isPlaylistFullyOffline(playlist.tracks),
    [playlist.tracks, activeDownloadJob]
  );
  const offlineCount = useMemo(
    () => getPlaylistOfflineCount(playlist.tracks),
    [playlist.tracks, activeDownloadJob]
  );

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (playlist.tracks.length > 0 && !isCurrentDownloading) {
      startBatchDownload(playlist.id, playlist.name, playlist.tracks);
    }
  };

  return (
    <Link to={`/playlist/${playlist.id}`} className="block group">
      <GlassCard
        className={`contain-card p-3.5 sm:p-4 h-full transition-all hover:bg-white/10 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 relative ${
          playlist.isPinned ? 'ring-1 ring-amber-400/30' : ''
        }`}
      >
        <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5">
          {hdCoverUrl ? (
            <img
              src={hdCoverUrl}
              alt={playlist.name}
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500/80 to-purple-600/80 flex items-center justify-center text-4xl font-bold text-white">
              {playlist.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Live Auto-Sync Badge */}
          {playlist.isLiveSync && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border-0 flex items-center gap-1.5 shadow-lg z-10">
              <span
                className={`w-2 h-2 rounded-full bg-emerald-400 ${
                  isSyncing ? 'animate-spin' : 'animate-pulse'
                }`}
              />
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wide whitespace-nowrap">
                {isSyncing ? 'SYNCING...' : 'LIVE SYNC'}
              </span>
            </div>
          )}

          {/* Pinned Badge / Quick Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePin(playlist.id);
            }}
            title={playlist.isPinned ? 'Unpin playlist' : 'Pin to top of library'}
            className={`absolute top-2.5 right-2.5 w-7 h-7 rounded-full backdrop-blur-md border-0 flex items-center justify-center text-xs transition-all z-10 cursor-pointer ${
              playlist.isPinned
                ? 'bg-amber-500/80 text-white shadow-lg'
                : 'bg-black/40 text-white/70 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white hover:bg-black/60'
            }`}
          >
            📌
          </button>

          {onPlay && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onPlay();
                }}
                className="w-13 h-13 p-0 rounded-full glass-button-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer shadow-xl"
              >
                <svg className="w-6 h-6 block" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                </svg>
              </button>
            </div>
          )}

          {/* 1-Tap Offline Vault Download Action / Status Pill */}
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={playlist.tracks.length === 0 || isCurrentDownloading}
            title={
              isFullyOffline
                ? `Offline Ready (${offlineCount} tracks cached)`
                : isCurrentDownloading
                ? `Downloading ${activeDownloadJob?.completed}/${activeDownloadJob?.total}`
                : `1-Tap Download "${playlist.name}" to Offline Audio Vault`
            }
            className={`absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full backdrop-blur-md border-0 text-[10px] font-bold flex items-center gap-1.5 transition-all z-10 cursor-pointer ${
              isCurrentDownloading
                ? 'bg-cyan-500/85 text-white shadow-lg'
                : isFullyOffline
                ? 'bg-emerald-500/80 text-white shadow-lg'
                : 'bg-black/60 text-white/90 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white hover:bg-black/80 hover:scale-105'
            }`}
          >
            {isCurrentDownloading && activeDownloadJob ? (
              <>
                <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="font-mono">
                  {Math.round(
                    (activeDownloadJob.completed / Math.max(1, activeDownloadJob.total)) * 100
                  )}
                  %
                </span>
              </>
            ) : isFullyOffline ? (
              <>
                <span className="text-emerald-200">✓</span>
                <span>Offline</span>
              </>
            ) : (
              <>
                <span className="text-cyan-300">⬇</span>
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        {/* Title and Folder Badge */}
        <div className="flex items-start justify-between gap-1.5">
          <h3 className="font-bold text-sm sm:text-base text-white truncate flex-1" title={playlist.name}>
            {playlist.name}
          </h3>
          {showFolderBadge && folder && (
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border-0 truncate flex-shrink-0 flex items-center gap-1 max-w-[100px]"
              style={{
                backgroundColor: `${folder.color || '#6366f1'}20`,
                color: folder.color || '#a5b4fc'
              }}
              title={`In folder: ${folder.name}`}
            >
              <span>{folder.icon || '📁'}</span>
              <span className="truncate">{folder.name}</span>
            </span>
          )}
        </div>

        {/* Track count & sync delta */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-xs text-white/60 whitespace-nowrap">
            {playlist.tracks.length} tracks
            {playlist.isLiveSync ? ' • Live' : ''}
          </p>
          {playlist.isLiveSync && (playlist.lastSyncDelta || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold whitespace-nowrap flex-shrink-0">
              +{playlist.lastSyncDelta} new
            </span>
          )}
        </div>

        {/* Smart Tag Chips */}
        {playlist.tags && playlist.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-0">
            {playlist.tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-white/[0.07] border-0 text-[10px] font-medium text-white/75 truncate max-w-[110px]"
              >
                #{t}
              </span>
            ))}
            {playlist.tags.length > 2 && (
              <span className="text-[10px] text-white/40 font-bold">
                +{playlist.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </GlassCard>
    </Link>
  );
});

PlaylistCard.displayName = 'PlaylistCard';

export default PlaylistCard;
