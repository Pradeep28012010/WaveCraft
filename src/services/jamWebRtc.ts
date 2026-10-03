/**
 * WaveCraft WebRTC Peer-to-Peer DataChannel Engine
 * 
 * Establishes direct P2P UDP/SCTP connections between devices in the same Jam room.
 * When devices are on the same Wi-Fi / Local Network, latency is 1ms - 4ms.
 * Provides instant micro-NTP clock sync and high-frequency audio anchor streaming.
 */

export interface WebRtcSignalPayload {
  type: 'offer' | 'answer' | 'candidate';
  from: string;
  target?: string;
  sdp?: any;
  candidate?: any;
}

type MessageHandler = (data: any) => void;
type StatusHandler = (status: 'disconnected' | 'connecting' | 'connected') => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

class JamWebRtcManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private isHost = false;
  private selfId = '';
  private onMessageCallback: MessageHandler | null = null;
  private onStatusCallback: StatusHandler | null = null;
  private signalSender: ((signal: WebRtcSignalPayload) => void) | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private pendingCandidates: RTCIceCandidateInit[] = [];

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

    try {
      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      this.pc.onicecandidate = (event) => {
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            from: this.selfId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        if (this.pc.connectionState === 'connected') {
          // Channel will set status on open
        } else if (
          this.pc.connectionState === 'disconnected' ||
          this.pc.connectionState === 'failed' ||
          this.pc.connectionState === 'closed'
        ) {
          this.setStatus('disconnected');
        }
      };

      if (this.isHost) {
        // Host creates the unreliable (UDP mode) DataChannel for lowest latency
        const dc = this.pc.createDataChannel('waveJamP2P', {
          ordered: false,
          maxRetransmits: 0
        });
        this.setupDataChannel(dc);
        this.createHostOffer();
      } else {
        // Guest listens for the DataChannel
        this.pc.ondatachannel = (event) => {
          this.setupDataChannel(event.channel);
        };
      }
    } catch (err) {
      console.warn('WebRTC initialization skipped:', err);
      this.setStatus('disconnected');
    }
  }

  private async createHostOffer(): Promise<void> {
    if (!this.pc || !this.signalSender) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.signalSender({
        type: 'offer',
        from: this.selfId,
        sdp: this.pc.localDescription
      });
    } catch (err) {
      console.warn('WebRTC offer failed:', err);
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    this.dc.binaryType = 'arraybuffer';

    this.dc.onopen = () => {
      this.setStatus('connected');
    };

    this.dc.onclose = () => {
      this.setStatus('disconnected');
    };

    this.dc.onerror = () => {
      this.setStatus('disconnected');
    };

    this.dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (this.onMessageCallback) {
            this.onMessageCallback(parsed);
          }
        } catch {}
      }
    };
  }

  public async handleRemoteSignal(signal: WebRtcSignalPayload): Promise<void> {
    if (!this.pc || signal.from === this.selfId) return;

    try {
      if (signal.type === 'offer' && !this.isHost) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        // Flush any candidates received before remote description was set
        while (this.pendingCandidates.length > 0) {
          const cand = this.pendingCandidates.shift();
          if (cand) await this.pc.addIceCandidate(cand);
        }
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        if (this.signalSender) {
          this.signalSender({
            type: 'answer',
            from: this.selfId,
            target: signal.from,
            sdp: this.pc.localDescription
          });
        }
      } else if (signal.type === 'answer' && this.isHost) {
        if (this.pc.signalingState !== 'stable') {
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          while (this.pendingCandidates.length > 0) {
            const cand = this.pendingCandidates.shift();
            if (cand) await this.pc.addIceCandidate(cand);
          }
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        const iceCandidate = new RTCIceCandidate(signal.candidate);
        if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
          await this.pc.addIceCandidate(iceCandidate);
        } else {
          this.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      console.warn('WebRTC signal processing warning:', err);
    }
  }

  public send(payload: any): boolean {
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public isConnected(): boolean {
    return this.connectionStatus === 'connected' && this.dc?.readyState === 'open';
  }

  public getStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  private setStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      if (this.onStatusCallback) {
        this.onStatusCallback(status);
      }
    }
  }

  public cleanup(): void {
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.setStatus('disconnected');
  }
}

export const jamWebRtc = new JamWebRtcManager();
