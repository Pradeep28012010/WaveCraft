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

  // Host: Map of guestId -> HostPeerEntry and pre-offer ICE candidates
  private hostPeers = new Map<string, HostPeerEntry>();
  private hostPreOfferCandidates = new Map<string, RTCIceCandidateInit[]>();
  private sessionSeq = 0;

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
    if (typeof RTCPeerConnection === 'undefined') {
      this.onStatusCallback = onStatus;
      this.setStatus('disconnected');
      return;
    }
    this.sessionSeq += 1;
    this.selfId = selfId;
    this.isHost = isHost;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
    this.signalSender = signalSender;

    if (this.isHost) {
      // Host waits for guest offers to arrive; peer connections are created on-demand per guest.
      this.setStatus('disconnected');
    } else {
      // Guest initiates connection to Host
      this.setStatus('connecting');
      this.initGuestPeer();
    }
  }

  private initGuestPeer(): void {
    const seq = this.sessionSeq;
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.guestPc = pc;
      this.guestPendingCandidates = [];

      pc.onicecandidate = (event) => {
        if (this.sessionSeq !== seq || this.guestPc !== pc) return;
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            from: this.selfId,
            target: 'host',
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (this.sessionSeq !== seq || this.guestPc !== pc) return;
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed') {
          this.setStatus('disconnected');
        }
      };

      // Guest creates the DataChannel before offer for low-latency P2P sync
      const dc = pc.createDataChannel('waveJamP2P', {
        ordered: false,
        maxRetransmits: 0
      });
      this.setupGuestDataChannel(dc, seq);

      this.createGuestOffer(pc, seq);
    } catch (err) {
      console.warn('[WebRTC] Guest initialization skipped:', err);
      this.setStatus('disconnected');
    }
  }

  private async createGuestOffer(pc: RTCPeerConnection, seq: number): Promise<void> {
    if (this.sessionSeq !== seq || this.guestPc !== pc || !this.signalSender) return;
    try {
      const offer = await pc.createOffer();
      if (this.sessionSeq !== seq || this.guestPc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.sessionSeq !== seq || this.guestPc !== pc || !this.signalSender) return;
      this.signalSender({
        type: 'offer',
        from: this.selfId,
        target: 'host',
        sdp: pc.localDescription
      });
    } catch (err) {
      console.warn('[WebRTC] Guest offer failed:', err);
    }
  }

  private setupGuestDataChannel(channel: RTCDataChannel, seq: number): void {
    this.guestDc = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      if (this.sessionSeq !== seq || this.guestDc !== channel) return;
      this.setStatus('connected');
    };

    channel.onclose = () => {
      if (this.sessionSeq !== seq || this.guestDc !== channel) return;
      this.setStatus('disconnected');
    };

    channel.onerror = () => {
      if (this.sessionSeq !== seq || this.guestDc !== channel) return;
      this.setStatus('disconnected');
    };

    channel.onmessage = (event) => {
      if (this.sessionSeq !== seq || this.guestDc !== channel) return;
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

    const seq = this.sessionSeq;

    // Clean up existing peer entry for this guest if any
    const existing = this.hostPeers.get(guestId);
    if (existing) {
      try { existing.dc?.close(); } catch {}
      try { existing.pc?.close(); } catch {}
      this.hostPeers.delete(guestId);
    }

    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peerEntry: HostPeerEntry = {
        peerId: guestId,
        pc,
        dc: null,
        pendingCandidates: []
      };
      this.hostPeers.set(guestId, peerEntry);

      pc.onicecandidate = (event) => {
        if (this.sessionSeq !== seq || this.hostPeers.get(guestId) !== peerEntry) return;
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
        if (this.sessionSeq !== seq || this.hostPeers.get(guestId) !== peerEntry) return;
        this.setupHostDataChannel(guestId, peerEntry, event.channel, seq);
      };

      // Ignore transient ICE 'disconnected' hiccups; only tear down on terminal 'failed' or 'closed'
      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
          this.cleanupHostPeer(guestId, peerEntry);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
      if (this.sessionSeq !== seq || !this.isHost || this.hostPeers.get(guestId) !== peerEntry) {
        try { pc.close(); } catch {}
        return;
      }

      // Flush any ICE candidates buffered before the offer arrived, plus candidates queued during setRemoteDescription
      const preOffer = this.hostPreOfferCandidates.get(guestId);
      if (preOffer) {
        this.hostPreOfferCandidates.delete(guestId);
        for (const cand of preOffer) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
      }
      while (peerEntry.pendingCandidates.length > 0) {
        const cand = peerEntry.pendingCandidates.shift();
        if (cand) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
      }
      if (this.sessionSeq !== seq || !this.isHost || this.hostPeers.get(guestId) !== peerEntry) {
        try { pc.close(); } catch {}
        return;
      }

      const answer = await pc.createAnswer();
      if (this.sessionSeq !== seq || !this.isHost || this.hostPeers.get(guestId) !== peerEntry) {
        try { pc.close(); } catch {}
        return;
      }
      await pc.setLocalDescription(answer);
      if (this.sessionSeq !== seq || !this.isHost || this.hostPeers.get(guestId) !== peerEntry) {
        try { pc.close(); } catch {}
        return;
      }

      this.signalSender?.({
        type: 'answer',
        from: this.selfId,
        target: guestId,
        sdp: pc.localDescription
      });
    } catch (err) {
      if (pc) {
        try { pc.close(); } catch {}
      }
      console.warn(`[WebRTC] Host failed to handle offer from ${guestId}:`, err);
    }
  }

  private setupHostDataChannel(
    guestId: string,
    peerEntry: HostPeerEntry,
    channel: RTCDataChannel,
    seq: number
  ): void {
    if (this.sessionSeq !== seq || this.hostPeers.get(guestId) !== peerEntry) return;

    peerEntry.dc = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      if (this.sessionSeq !== seq || this.hostPeers.get(guestId) !== peerEntry) return;
      this.updateHostStatus();
    };

    channel.onclose = () => {
      this.cleanupHostPeer(guestId, peerEntry);
    };

    channel.onerror = () => {
      this.cleanupHostPeer(guestId, peerEntry);
    };

    channel.onmessage = (event) => {
      if (this.sessionSeq !== seq || this.hostPeers.get(guestId) !== peerEntry) return;
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessageCallback?.(parsed);
        } catch {}
      }
    };
  }

  private cleanupHostPeer(guestId: string, expectedPeer?: HostPeerEntry): void {
    const peer = this.hostPeers.get(guestId);
    if (!peer || (expectedPeer && peer !== expectedPeer)) {
      return;
    }
    try { peer.dc?.close(); } catch {}
    try { peer.pc?.close(); } catch {}
    this.hostPeers.delete(guestId);
    this.hostPreOfferCandidates.delete(guestId);
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
      } else if (signal.type === 'candidate' && signal.candidate && signal.from) {
        const peer = this.hostPeers.get(signal.from);
        if (peer) {
          if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
            try {
              await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch {}
          } else {
            peer.pendingCandidates.push(signal.candidate);
          }
        } else {
          // Buffer ICE candidates that arrive over parallel HTTP/SSE before the SDP offer
          const buffered = this.hostPreOfferCandidates.get(signal.from) || [];
          if (buffered.length < 32) {
            buffered.push(signal.candidate);
            this.hostPreOfferCandidates.set(signal.from, buffered);
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
              if (cand) {
                try {
                  await this.guestPc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
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
    this.sessionSeq += 1;
    for (const peer of this.hostPeers.values()) {
      try { peer.dc?.close(); } catch {}
      try { peer.pc?.close(); } catch {}
    }
    this.hostPeers.clear();
    this.hostPreOfferCandidates.clear();

    if (this.guestDc) {
      try { this.guestDc.close(); } catch {}
      this.guestDc = null;
    }
    if (this.guestPc) {
      try { this.guestPc.close(); } catch {}
      this.guestPc = null;
    }
    this.guestPendingCandidates = [];
    this.setStatus('disconnected');
    this.onMessageCallback = null;
    this.onStatusCallback = null;
    this.signalSender = null;
  }
}

export const jamWebRtc = new JamWebRtcManager();
