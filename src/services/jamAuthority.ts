import type { Track } from '../types';

export type JamAction = 'play' | 'pause' | 'skip' | 'seek';

export interface JamGuard {
  isGuestBlocked: (action: JamAction) => boolean;
  onGuestPlayTrack?: (track: Track) => boolean;
  isRemoteApplying: () => boolean;
}

let activeGuard: JamGuard = {
  isGuestBlocked: () => false,
  isRemoteApplying: () => false
};

export function registerJamGuard(guard: JamGuard): void {
  activeGuard = guard;
}

export function isJamGuestBlocked(action: JamAction): boolean {
  return activeGuard.isGuestBlocked(action);
}

export function handleJamGuestPlayTrack(track: Track): boolean {
  return activeGuard.onGuestPlayTrack ? activeGuard.onGuestPlayTrack(track) : false;
}

export function isJamRemoteApplying(): boolean {
  return activeGuard.isRemoteApplying ? activeGuard.isRemoteApplying() : false;
}
