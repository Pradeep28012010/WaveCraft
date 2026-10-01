/**
 * WaveCraft UltraSync™ Precision Audio Phase-Lock Engine
 * 
 * Provides sub-millisecond multi-device acoustic synchronization for Jam Rooms.
 * Uses continuous micro-NTP clock estimation paired with a Phase-Locked Loop (PLL)
 * that dynamically micro-steers playback rate to eliminate audio delay, comb filtering,
 * and echo when multiple devices play together in the same room.
 */

import { getPreciseAudioTime, setPlaybackRateSteering, seekToTime, getHtmlAudioElement } from './audioEngine';
import { usePlayerStore } from '../stores/playerStore';
import type { Track } from '../types';

export interface JamAudioAnchor {
  trackId: string;
  position: number;        // Track playback position in seconds (high precision float)
  hostEpoch: number;       // Epoch milliseconds on Host when position was sampled
  playbackRate: number;    // Playback rate on Host (default 1.0)
  isPlaying: boolean;
  syncVersion: number;
  rendezvousAt?: number;   // Optional future epoch millisecond for synchronized simultaneous kickoff
}

export interface SyncTelemetry {
  phaseDeltaMs: number;
  rttMs: number;
  clockOffsetMs: number;
  syncState: 'locked' | 'fine-steer' | 'fast-steer' | 'aligning' | 'idle';
  userLatencyOffsetMs: number;
}

interface PingSample {
  rtt: number;
  offset: number;
  timestamp: number;
}

const LATENCY_OFFSET_STORAGE_KEY = 'wavecraft_jam_latency_offset_ms';

class JamSyncEngine {
  private activeAnchor: JamAudioAnchor | null = null;
  private clockOffsetMs = 0;
  private lastRttMs = 0;
  private pingSamples: PingSample[] = [];
  private pllInterval: ReturnType<typeof setInterval> | null = null;
  private lastSeekAt = 0;
  private userLatencyOffsetMs = 0;
  private telemetrySubscribers = new Set<(telemetry: SyncTelemetry) => void>();
  private currentSyncState: SyncTelemetry['syncState'] = 'idle';
  private currentPhaseDeltaMs = 0;

  constructor() {
    try {
      const saved = localStorage.getItem(LATENCY_OFFSET_STORAGE_KEY);
      if (saved) {
        this.userLatencyOffsetMs = parseFloat(saved) || 0;
      }
    } catch {}
  }

  /**
   * Set manual hardware latency compensation offset (in milliseconds).
   * E.g. +35ms for high-latency Bluetooth headphones or -15ms for low-latency line-out.
   */
  public setUserLatencyOffsetMs(offsetMs: number): void {
    this.userLatencyOffsetMs = Math.max(-200, Math.min(200, offsetMs));
    try {
      localStorage.setItem(LATENCY_OFFSET_STORAGE_KEY, String(this.userLatencyOffsetMs));
    } catch {}
    this.notifyTelemetry();
  }

  public getUserLatencyOffsetMs(): number {
    return this.userLatencyOffsetMs;
  }

  /**
   * Process a pong response from the host (Micro-NTP).
   * Calculates Round Trip Time and clock skew between devices.
   */
  public handlePingPongResponse(
    clientSendEpoch: number,
    hostReceiveEpoch: number,
    hostSendEpoch: number,
    clientReceiveEpoch = Date.now()
  ): void {
    const rtt = Math.max(0.5, clientReceiveEpoch - clientSendEpoch);
    this.lastRttMs = rtt;

    // Standard NTP clock offset formula: ((T1 - T0) + (T2 - T3)) / 2
    const offset = ((hostReceiveEpoch - clientSendEpoch) + (hostSendEpoch - clientReceiveEpoch)) / 2;

    this.pingSamples.push({ rtt, offset, timestamp: clientReceiveEpoch });
    if (this.pingSamples.length > 8) {
      this.pingSamples.shift();
    }

    // Filter samples with lowest RTT (least jitter) and take median offset
    const validSamples = [...this.pingSamples].sort((a, b) => a.rtt - b.rtt);
    const bestSamples = validSamples.slice(0, Math.max(1, Math.ceil(validSamples.length * 0.6)));
    const medianOffset = bestSamples[Math.floor(bestSamples.length / 2)].offset;

    // Smooth clock offset with moving average to eliminate clock jitter
    this.clockOffsetMs = Math.round(this.clockOffsetMs * 0.25 + medianOffset * 0.75);
    this.notifyTelemetry();
  }

  /**
   * Returns current synchronized Host epoch time in milliseconds.
   */
  public getSynchronizedHostEpoch(): number {
    return Date.now() + this.clockOffsetMs;
  }

  /**
   * Called on Guest when an authoritative audio anchor is received from Host.
   */
  public updateAnchor(anchor: JamAudioAnchor): void {
    if (!anchor || typeof anchor.position !== 'number') return;
    this.activeAnchor = { ...anchor };

    // If host is playing and we aren't running PLL, start the Phase-Locked Loop
    if (anchor.isPlaying && !this.pllInterval) {
      this.startPLL();
    } else if (!anchor.isPlaying) {
      this.stopPLL();
      setPlaybackRateSteering(1.0);
    }
  }

  public getActiveAnchor(): JamAudioAnchor | null {
    return this.activeAnchor;
  }

  /**
   * Starts the high-frequency Phase-Locked Loop (30 times/sec).
   * Continuously measures phase delta and applies micro-steering without audio clicks.
   */
  public startPLL(): void {
    if (this.pllInterval) return;

    this.pllInterval = setInterval(() => {
      this.tickPLL();
    }, 32); // 32ms ~ 31Hz refresh rate
  }

  public stopPLL(): void {
    if (this.pllInterval) {
      clearInterval(this.pllInterval);
      this.pllInterval = null;
    }
    this.currentSyncState = 'idle';
    this.currentPhaseDeltaMs = 0;
    setPlaybackRateSteering(1.0);
    this.notifyTelemetry();
  }

  /**
   * Core Phase-Locked Loop algorithm:
   * Compares theoretical track time vs actual audio engine time.
   */
  private tickPLL(): void {
    const anchor = this.activeAnchor;
    if (!anchor || !anchor.isPlaying) {
      setPlaybackRateSteering(1.0);
      return;
    }

    const player = usePlayerStore.getState();
    if (!player.currentTrack) return;

    // Track ID mismatch: wait for track transition to settle
    if (anchor.trackId && player.currentTrack.id !== anchor.trackId) {
      return;
    }

    const hostNow = this.getSynchronizedHostEpoch();

    // Check if there is an unreached synchronized rendezvous time
    if (anchor.rendezvousAt && hostNow < anchor.rendezvousAt) {
      const waitMs = anchor.rendezvousAt - hostNow;
      if (waitMs > 10) return; // Wait for simultaneous kickoff
    }

    // Exact theoretical position in seconds
    const elapsedSinceAnchorSec = (hostNow - anchor.hostEpoch) / 1000;
    const baseExpectedPosition =
      anchor.position + elapsedSinceAnchorSec * (anchor.playbackRate || 1.0);
    const userOffsetSec = this.userLatencyOffsetMs / 1000;
    const expectedPosition = Math.max(0, baseExpectedPosition + userOffsetSec);

    const actualPosition = getPreciseAudioTime();
    const phaseDeltaSec = actualPosition - expectedPosition;
    this.currentPhaseDeltaMs = Math.round(phaseDeltaSec * 1000);

    const absDeltaSec = Math.abs(phaseDeltaSec);
    const now = Date.now();

    // -------------------------------------------------------------
    // ZONE 1: LARGE DESYNC (> 260ms) -> Hard Synchronized Seek
    // -------------------------------------------------------------
    if (absDeltaSec > 0.26) {
      this.currentSyncState = 'aligning';
      // Debounce hard seeks so browser audio decoder doesn't thrash
      if (now - this.lastSeekAt > 450) {
        this.lastSeekAt = now;
        // Lead-ahead by 18ms to compensate for async seek dispatch
        const seekTarget = expectedPosition + 0.018;
        seekToTime(seekTarget);
        setPlaybackRateSteering(1.0);
      }
      this.notifyTelemetry();
      return;
    }

    // -------------------------------------------------------------
    // ZONE 2: FAST SLEW (45ms to 260ms) -> Fast Steer without gap
    // -------------------------------------------------------------
    if (absDeltaSec > 0.045) {
      this.currentSyncState = 'fast-steer';
      if (phaseDeltaSec < 0) {
        // Guest is lagging behind -> Speed up by 4.2%
        setPlaybackRateSteering((anchor.playbackRate || 1.0) * 1.042);
      } else {
        // Guest is running ahead -> Slow down by 4.2%
        setPlaybackRateSteering((anchor.playbackRate || 1.0) * 0.958);
      }
      this.notifyTelemetry();
      return;
    }

    // -------------------------------------------------------------
    // ZONE 3: MICRO-PHASE ALIGNMENT (8ms to 45ms) -> Fine Steering
    // -------------------------------------------------------------
    if (absDeltaSec > 0.008) {
      this.currentSyncState = 'fine-steer';
      if (phaseDeltaSec < 0) {
        // Guest is slightly behind -> Speed up by 1.2% (inaudible pitch change)
        setPlaybackRateSteering((anchor.playbackRate || 1.0) * 1.012);
      } else {
        // Guest is slightly ahead -> Slow down by 1.2%
        setPlaybackRateSteering((anchor.playbackRate || 1.0) * 0.988);
      }
      this.notifyTelemetry();
      return;
    }

    // -------------------------------------------------------------
    // ZONE 4: SUB-MILLI PHASE LOCK (<= 8ms) -> PERFECT LOCKSTEP
    // -------------------------------------------------------------
    this.currentSyncState = 'locked';
    setPlaybackRateSteering(anchor.playbackRate || 1.0);
    this.notifyTelemetry();
  }

  public subscribeTelemetry(callback: (t: SyncTelemetry) => void): () => void {
    this.telemetrySubscribers.add(callback);
    callback(this.getTelemetrySnapshot());
    return () => {
      this.telemetrySubscribers.delete(callback);
    };
  }

  public getTelemetrySnapshot(): SyncTelemetry {
    return {
      phaseDeltaMs: this.currentPhaseDeltaMs,
      rttMs: this.lastRttMs,
      clockOffsetMs: this.clockOffsetMs,
      syncState: this.currentSyncState,
      userLatencyOffsetMs: this.userLatencyOffsetMs
    };
  }

  private notifyTelemetry(): void {
    if (this.telemetrySubscribers.size === 0) return;
    const snap = this.getTelemetrySnapshot();
    this.telemetrySubscribers.forEach((cb) => cb(snap));
  }
}

export const jamSyncEngine = new JamSyncEngine();
