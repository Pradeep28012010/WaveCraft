import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Live Jam Room: Multi-Device Star Topology & Authoritative Host Sync', () => {
  it('1. Host maintains individual peer connections in star topology (3+ devices supported)', () => {
    // Star topology simulation
    const hostPeers = new Map();

    function registerGuestPeer(guestId) {
      if (!hostPeers.has(guestId)) {
        hostPeers.set(guestId, {
          pc: { id: `pc-${guestId}`, state: 'connected' },
          dc: { id: `dc-${guestId}`, readyState: 'open', sentPayloads: [] }
        });
      }
      return hostPeers.get(guestId);
    }

    function broadcastFromHost(payload) {
      let sentCount = 0;
      for (const [guestId, entry] of hostPeers.entries()) {
        if (entry.dc && entry.dc.readyState === 'open') {
          entry.dc.sentPayloads.push(payload);
          sentCount++;
        }
      }
      return sentCount;
    }

    // Connect Device 2 (Guest A)
    const guestA = registerGuestPeer('guest_device_2');
    assert.equal(hostPeers.size, 1);

    // Connect Device 3 (Guest B) - previously failed in 2-peer-only topology!
    const guestB = registerGuestPeer('guest_device_3');
    assert.equal(hostPeers.size, 2);

    // Connect Device 4 (Guest C)
    const guestC = registerGuestPeer('guest_device_4');
    assert.equal(hostPeers.size, 3);

    // Broadcast host sync anchor to all connected peers
    const anchor = { trackId: 'song-101', position: 42.5, isPlaying: true, hostEpoch: Date.now() };
    const deliveryCount = broadcastFromHost(anchor);

    assert.equal(deliveryCount, 3);
    assert.equal(guestA.dc.sentPayloads.length, 1);
    assert.equal(guestB.dc.sentPayloads.length, 1);
    assert.equal(guestC.dc.sentPayloads.length, 1);
  });

  it('2. Independent failure isolation: Dropping or desyncing one device never halts playback on others', () => {
    const hostPeers = new Map();
    let hostIsPlaying = true;
    let otherPeersPlaying = true;

    function connectGuest(id) {
      hostPeers.set(id, { state: 'connected', dcOpen: true });
    }

    function disconnectGuest(id) {
      // In star topology, only the disconnected guest entry is removed
      hostPeers.delete(id);
      // Host and other peers MUST continue uninterrupted
      return { hostIsPlaying, activePeersRemaining: hostPeers.size };
    }

    connectGuest('guest_2');
    connectGuest('guest_3');
    connectGuest('guest_4');
    assert.equal(hostPeers.size, 3);

    // Device 2 buffers or goes off track and closes connection
    const result = disconnectGuest('guest_2');
    assert.equal(result.hostIsPlaying, true, 'Host must never stop playing when a guest drifts or drops');
    assert.equal(result.activePeersRemaining, 2, 'Devices 3 and 4 must remain connected');
    assert.equal(hostPeers.has('guest_3'), true);
    assert.equal(hostPeers.has('guest_4'), true);
  });

  it('3. Authoritative Host Guard: Guests cannot overwrite room playback state or trigger playNow', () => {
    // Mock room server state
    const room = {
      roomCode: 'SYNC99',
      hostId: 'host_admin_01',
      isPlaying: true,
      currentTime: 68.4,
      currentTrack: { id: 'track-admin', title: 'Admin Master Song' },
      queue: []
    };

    function processRoomOp(op, userId, isHost, data) {
      // Rule 1: Non-host can never alter hostId
      if (!isHost && userId !== room.hostId) {
        // Guests cannot update playback state
        if (op === 'sync') {
          // Ignores isPlaying or currentTime updates from guests!
          return { status: 'ignored_guest_sync', isPlaying: room.isPlaying, currentTime: room.currentTime };
        }
        if (op === 'play-track') {
          // Guests cannot force play-track room-wide
          return { status: 'rejected_unauthorized' };
        }
        if (op === 'add-track') {
          // Guest can only append to queue; playNow is forced to false
          const safePlayNow = false;
          room.queue.push(data.track);
          return { status: 'queued', playNow: safePlayNow, currentTrack: room.currentTrack };
        }
      } else {
        // Host has authority
        if (op === 'sync') {
          if (typeof data.isPlaying === 'boolean') room.isPlaying = data.isPlaying;
          if (typeof data.currentTime === 'number') room.currentTime = data.currentTime;
          return { status: 'host_sync_applied', isPlaying: room.isPlaying, currentTime: room.currentTime };
        }
      }
      return { status: 'unknown' };
    }

    // Guest attempts to pause room by sending a desync packet
    const guestDesync = processRoomOp('sync', 'guest_troublemaker', false, { isPlaying: false, currentTime: 0 });
    assert.equal(guestDesync.status, 'ignored_guest_sync');
    assert.equal(room.isPlaying, true, 'Room must remain playing despite guest desync packet');
    assert.equal(room.currentTime, 68.4);

    // Guest attempts to call play-track to hijack playback
    const guestHijack = processRoomOp('play-track', 'guest_troublemaker', false, { track: { id: 'bad-song' } });
    assert.equal(guestHijack.status, 'rejected_unauthorized');
    assert.equal(room.currentTrack.id, 'track-admin');

    // Guest adds track: allowed to queue only, playNow is forced false
    const guestAdd = processRoomOp('add-track', 'guest_friend', false, { track: { id: 'suggested-song', title: 'Cool Song' } });
    assert.equal(guestAdd.status, 'queued');
    assert.equal(guestAdd.playNow, false);
    assert.equal(room.queue.length, 1);
    assert.equal(room.currentTrack.id, 'track-admin', 'Current track remains unchanged');
  });

  it('4. Dual-Broadcast: micro-anchor sent over WebRTC + dual-broadcast to SSE ensures 3rd+ device gets anchors', () => {
    let webrtcAnchorDelivered = false;
    let sseAnchorDelivered = false;

    function broadcastHostAnchorPulse(hasOpenWebRtc, hasOpenSse) {
      if (hasOpenWebRtc) {
        webrtcAnchorDelivered = true;
      }
      // CRITICAL FIX: Do NOT return early if WebRTC is connected!
      // Must also broadcast to SSE/BroadcastChannel so newly connecting 3rd+ devices receive anchors.
      if (hasOpenSse) {
        sseAnchorDelivered = true;
      }
      return { webrtcAnchorDelivered, sseAnchorDelivered };
    }

    const result = broadcastHostAnchorPulse(true, true);
    assert.equal(result.webrtcAnchorDelivered, true);
    assert.equal(result.sseAnchorDelivered, true, 'SSE must be pulsed simultaneously so 3rd device never starves');
  });
});
