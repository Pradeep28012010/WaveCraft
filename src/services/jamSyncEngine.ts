export type JamTransportMode = 'webrtc-p2p' | 'server-sse' | 'relay' | 'broadcast' | 'offline';

export interface JamAudioAnchor {
  trackId: string;
  isPlaying: boolean;
  anchorPositionSec: number;
  anchorHostEpochMs: number;
  playbackSpeed: number;
  sequence: number;
  rendezvousAt?: number | null;
}

export interface JamSyncTelemetry {
  transport: JamTransportMode;
  clockOffsetMs: number;
  rttMs: number;
  driftMs: number;
  samplesCount: number;
}

class JamSyncEngine {
  private transport: JamTransportMode = 'offline';
  private clockOffsetMs = 0;
  private rttMs = 0;
  private driftMs = 0;
  private rttSamples: Array<{ offset: number; rtt: number }> = [];
  private activeAnchor: JamAudioAnchor | null = null;
  private listeners = new Set<(t: JamSyncTelemetry) => void>();

  setTransport(mode: JamTransportMode): void {
    if (this.transport !== mode) {
      this.transport = mode;
      this.notify();
    }
  }

  getTransport(): JamTransportMode {
    return this.transport;
  }

  handlePingPongResponse(t0ClientMs: number, t1HostMs: number, t3ClientMs: number): void {
    const rtt = Math.max(0, t3ClientMs - t0ClientMs);
    if (rtt > 5000) return;
    const offset = t1HostMs - (t0ClientMs + rtt / 2);
    this.rttSamples.push({ offset, rtt });
    if (this.rttSamples.length > 8) {
      this.rttSamples.shift();
    }
    const sorted = [...this.rttSamples].sort((a, b) => a.rtt - b.rtt);
    const best = sorted[0];
    if (best) {
      this.clockOffsetMs =
        this.rttSamples.length === 1
          ? best.offset
          : this.clockOffsetMs * 0.6 + best.offset * 0.4;
      this.rttMs = best.rtt;
      this.notify();
    }
  }

  getSynchronizedHostEpoch(): number {
    return Date.now() + this.clockOffsetMs;
  }

  updateAnchor(anchor: JamAudioAnchor | null): void {
    if (!anchor) {
      this.activeAnchor = null;
      return;
    }
    if (
      this.activeAnchor &&
      this.activeAnchor.trackId === anchor.trackId &&
      anchor.sequence < this.activeAnchor.sequence
    ) {
      return;
    }
    this.activeAnchor = { ...anchor };
  }

  getActiveAnchor(): JamAudioAnchor | null {
    return this.activeAnchor;
  }

  clearRendezvous(): void {
    if (this.activeAnchor) {
      this.activeAnchor.rendezvousAt = null;
    }
  }

  getExpectedPositionSec(anchor: JamAudioAnchor | null = this.activeAnchor): number {
    if (!anchor) return 0;
    if (!anchor.isPlaying) return Math.max(0, anchor.anchorPositionSec);
    const elapsedSec = Math.max(
      0,
      (this.getSynchronizedHostEpoch() - anchor.anchorHostEpochMs) / 1000
    );
    return Math.max(0, anchor.anchorPositionSec + elapsedSec * (anchor.playbackSpeed || 1));
  }

  recordDrift(localPositionSec: number, expectedPositionSec: number): number {
    const drift = (localPositionSec - expectedPositionSec) * 1000;
    this.driftMs = Math.round(drift);
    this.notify();
    return this.driftMs;
  }

  getTelemetry(): JamSyncTelemetry {
    return {
      transport: this.transport,
      clockOffsetMs: Math.round(this.clockOffsetMs),
      rttMs: Math.round(this.rttMs),
      driftMs: this.driftMs,
      samplesCount: this.rttSamples.length
    };
  }

  subscribeTelemetry(fn: (t: JamSyncTelemetry) => void): () => void {
    this.listeners.add(fn);
    fn(this.getTelemetry());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    const snapshot = this.getTelemetry();
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch {}
    }
  }

  reset(): void {
    this.transport = 'offline';
    this.clockOffsetMs = 0;
    this.rttMs = 0;
    this.driftMs = 0;
    this.rttSamples = [];
    this.activeAnchor = null;
    this.notify();
  }
}

export const jamSyncEngine = new JamSyncEngine();
