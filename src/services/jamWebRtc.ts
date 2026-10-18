/**
 * WaveCraft WebRTC Peer-to-Peer DataChannel Engine (Star Topology)
 * 
 * Supports N-device multi-peer connections in a Live Jam Room.
 * The Host acts as the star hub, managing independent RTCPeerConnections with each guest.
 * Each Guest connects directly to the Host.
 * When devices are on the same Wi-Fi / Local Network, latency is 1ms - 4ms.
 * Broadcasts from Host are dispatched across all active guest DataChannels.
 */

export interface WebRtcSignalPayload {
  type: 'offer' | 'answer' | 'candidate';
  from: string;
  target?: string;
  sdp?: RTCSessionDescriptionInit | RTCSessionDescription | null | string;
  candidate?: RTCIceCandidateInit;
}

type MessageHandler = (data: unknown) => void;
type StatusHandler = (status: 'disconnected' | 'connecting' | 'connected') => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

interface HostPeerEntry {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
}

class JamWebRtcManager {
  private isHost = false;
  private selfId = '';
  private onMessageCallback: MessageHandler | null = null;
  private onStatusCallback: StatusHandler | null = null;
  private signalSender: ((signal: WebRtcSignalPayload) => void) | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  // Host: Map of guestId -> HostPeerEntry
  private hostPeers = new Map<string, HostPeerEntry>();

  // Guest: Single connection to the Host
  private guestPc: RTCPeerConnection | null = null;
  private guestDc: RTCDataChannel | null = null;
  private guestPendingCandidates: RTCIceCandidateInit[] = [];

  public init(
    selfId: string,
    isHost: boolean,
    onMessage: MessageHandler,
    onStatus: StatusHandler,
    signalSender: (signal: WebRtcSignalPayload) => void
  ): void {
    this.cleanup();
    this.selfId = selfId;
    this.isHost = isHost;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
    this.signalSender = signalSender;
    this.setStatus('connecting');

    if (this.isHost) {
      // Host waits for guest offers to arrive; peer connections are created on-demand per guest.
      this.setStatus('disconnected');
    } else {
      // Guest initiates connection to Host
      this.initGuestPeer();
    }
  }

  private initGuestPeer(): void {
    try {
      this.guestPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.guestPendingCandidates = [];

      this.guestPc.onicecandidate = (event) => {
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            from: this.selfId,
            target: 'host',
            candidate: event.candidate.toJSON()
          });
        }
      };

      this.guestPc.onconnectionstatechange = () => {
        if (!this.guestPc) return;
        const state = this.guestPc.connectionState;
        if (state === 'failed' || state === 'closed') {
          this.setStatus('disconnected');
        }
      };

      // Guest creates the DataChannel before offer for low-latency P2P sync
      const dc = this.guestPc.createDataChannel('waveJamP2P', {
        ordered: false,
        maxRetransmits: 0
      });
      this.setupGuestDataChannel(dc);

      this.createGuestOffer();
    } catch (err) {
      console.warn('[WebRTC] Guest initialization skipped:', err);
      this.setStatus('disconnected');
    }
  }

  private async createGuestOffer(): Promise<void> {
    if (!this.guestPc || !this.signalSender) return;
    try {
      const offer = await this.guestPc.createOffer();
      await this.guestPc.setLocalDescription(offer);
      this.signalSender({
        type: 'offer',
        from: this.selfId,
        target: 'host',
        sdp: this.guestPc.localDescription
      });
    } catch (err) {
      console.warn('[WebRTC] Guest offer failed:', err);
    }
  }

  private setupGuestDataChannel(channel: RTCDataChannel): void {
    this.guestDc = channel;
    this.guestDc.binaryType = 'arraybuffer';

    this.guestDc.onopen = () => {
      this.setStatus('connected');
    };

    this.guestDc.onclose = () => {
      this.setStatus('disconnected');
    };

    this.guestDc.onerror = () => {
      this.setStatus('disconnected');
    };

    this.guestDc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessageCallback?.(parsed);
        } catch {}
      }
    };
  }

  private async handleGuestOfferOnHost(signal: WebRtcSignalPayload): Promise<void> {
    const guestId = signal.from;
    if (!guestId || guestId === this.selfId || !signal.sdp) return;

    // Clean up existing peer entry for this guest if any
    const existing = this.hostPeers.get(guestId);
    if (existing) {
      try { existing.dc?.close(); } catch {}
      try { existing.pc?.close(); } catch {}
      this.hostPeers.delete(guestId);
    }

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peerEntry: HostPeerEntry = {
        peerId: guestId,
        pc,
        dc: null,
        pendingCandidates: []
      };
      this.hostPeers.set(guestId, peerEntry);

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            from: this.selfId,
            target: guestId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.ondatachannel = (event) => {
        this.setupHostDataChannel(guestId, event.channel);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          this.cleanupHostPeer(guestId);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));

      // Flush any queued candidates
      while (peerEntry.pendingCandidates.length > 0) {
        const cand = peerEntry.pendingCandidates.shift();
        if (cand) await pc.addIceCandidate(cand);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.signalSender?.({
        type: 'answer',
        from: this.selfId,
        target: guestId,
        sdp: pc.localDescription
      });
    } catch (err) {
      console.warn(`[WebRTC] Host failed to handle offer from ${guestId}:`, err);
    }
  }

  private setupHostDataChannel(guestId: string, channel: RTCDataChannel): void {
    const peer = this.hostPeers.get(guestId);
    if (!peer) return;

    peer.dc = channel;
    peer.dc.binaryType = 'arraybuffer';

    peer.dc.onopen = () => {
      this.updateHostStatus();
    };

    peer.dc.onclose = () => {
      this.cleanupHostPeer(guestId);
    };

    peer.dc.onerror = () => {
      this.cleanupHostPeer(guestId);
    };

    peer.dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessageCallback?.(parsed);
        } catch {}
      }
    };
  }

  private cleanupHostPeer(guestId: string): void {
    const peer = this.hostPeers.get(guestId);
    if (peer) {
      try { peer.dc?.close(); } catch {}
      try { peer.pc?.close(); } catch {}
      this.hostPeers.delete(guestId);
    }
    this.updateHostStatus();
  }

  private updateHostStatus(): void {
    let anyOpen = false;
    for (const peer of this.hostPeers.values()) {
      if (peer.dc?.readyState === 'open') {
        anyOpen = true;
        break;
      }
    }
    this.setStatus(anyOpen ? 'connected' : this.hostPeers.size > 0 ? 'connecting' : 'disconnected');
  }

  public async handleRemoteSignal(signal: WebRtcSignalPayload): Promise<void> {
    if (!signal || signal.from === this.selfId) return;

    if (this.isHost) {
      // Host handles offers and candidates from guests
      if (signal.type === 'offer') {
        await this.handleGuestOfferOnHost(signal);
      } else if (signal.type === 'candidate' && signal.candidate) {
        const peer = this.hostPeers.get(signal.from);
        if (peer) {
          if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
            try {
              await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch {}
          } else {
            peer.pendingCandidates.push(signal.candidate);
          }
        }
      }
    } else {
      // Guest handles answers and candidates from host
      if (signal.type === 'answer') {
        if (!this.guestPc) return;
        if (signal.target && signal.target !== this.selfId && signal.target !== 'guest') return;
        try {
          if (signal.sdp) {
            await this.guestPc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
            while (this.guestPendingCandidates.length > 0) {
              const cand = this.guestPendingCandidates.shift();
              if (cand) await this.guestPc.addIceCandidate(cand);
            }
          }
        } catch (err) {
          console.warn('[WebRTC] Guest setRemoteDescription error:', err);
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (!this.guestPc) return;
        if (signal.target && signal.target !== this.selfId && signal.target !== 'guest') return;
        try {
          if (this.guestPc.remoteDescription && this.guestPc.remoteDescription.type) {
            await this.guestPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            this.guestPendingCandidates.push(signal.candidate);
          }
        } catch {}
      }
    }
  }

  public send(payload: unknown): boolean {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (this.isHost) {
      let sentCount = 0;
      for (const peer of this.hostPeers.values()) {
        if (peer.dc && peer.dc.readyState === 'open') {
          try {
            peer.dc.send(str);
            sentCount++;
          } catch {}
        }
      }
      return sentCount > 0;
    } else {
      if (this.guestDc && this.guestDc.readyState === 'open') {
        try {
          this.guestDc.send(str);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  public isConnected(): boolean {
    if (this.isHost) {
      for (const peer of this.hostPeers.values()) {
        if (peer.dc?.readyState === 'open') return true;
      }
      return false;
    } else {
      return this.guestDc?.readyState === 'open';
    }
  }

  public getConnectedPeerCount(): number {
    if (this.isHost) {
      let count = 0;
      for (const peer of this.hostPeers.values()) {
        if (peer.dc?.readyState === 'open') count++;
      }
      return count;
    } else {
      return this.guestDc?.readyState === 'open' ? 1 : 0;
    }
  }

  public getStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  private setStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.onStatusCallback?.(status);
    }
  }

  public cleanup(): void {
    if (this.isHost) {
      for (const peer of this.hostPeers.values()) {
        try { peer.dc?.close(); } catch {}
        try { peer.pc?.close(); } catch {}
      }
      this.hostPeers.clear();
    } else {
      if (this.guestDc) {
        try { this.guestDc.close(); } catch {}
        this.guestDc = null;
      }
      if (this.guestPc) {
        try { this.guestPc.close(); } catch {}
        this.guestPc = null;
      }
      this.guestPendingCandidates = [];
    }
    this.setStatus('disconnected');
  }
}

export const jamWebRtc = new JamWebRtcManager();
