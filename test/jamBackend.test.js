import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  jamRooms,
  roomSubscribers,
  handleJamRoomRequest,
  handleJamRoomSseStream,
  sanitizeRoom
} from '../api/lib/jam.js';

function createReq(method, url, body = null) {
  return {
    method,
    url,
    headers: { host: 'localhost:3000' },
    body,
    on() {}
  };
}

function createSseMockReq() {
  const closeHandlers = new Set();
  return {
    on(ev, fn) {
      if (ev === 'close') closeHandlers.add(fn);
    },
    close() {
      for (const fn of closeHandlers) fn();
      closeHandlers.clear();
    }
  };
}

function createSseMockRes() {
  const written = [];
  let ended = false;
  return {
    headers: {},
    written,
    get ended() {
      return ended;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    flushHeaders() {},
    write(chunk) {
      written.push(chunk);
      return true;
    },
    end() {
      ended = true;
    }
  };
}

function parseSsePayloads(written) {
  return written
    .filter((chunk) => typeof chunk === 'string' && chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length).trim()));
}

describe('WaveJam Real Backend Auth, Sync & SSE Protocol Tests (api/lib/jam.js)', () => {
  beforeEach(() => {
    jamRooms.clear();
    roomSubscribers.clear();
  });

  it('issues hostSecret only to creator, strips hostId/hostSecret publicly, and sets members[].isHost', async () => {
    const roomCode = 'WAVE-AUTH1';
    const trackA = { id: 't1', title: 'Midnight Glass', artist: 'WaveCraft' };
    const hostUrl = new URL(`http://localhost/api/music?action=jam&op=sync&room=${roomCode}`);
    const hostRes = await handleJamRoomRequest(
      createReq('POST', hostUrl.pathname + hostUrl.search, {
        userId: 'host-u1',
        userName: 'DJ Host',
        hostName: 'DJ Host',
        isHost: true,
        currentTrack: trackA,
        isPlaying: true,
        currentTime: 12.5,
        queue: [trackA]
      }),
      hostUrl,
      roomCode
    );

    assert.ok(hostRes.hostSecret && typeof hostRes.hostSecret === 'string', 'hostSecret issued on room claim');
    assert.equal('hostId' in hostRes, false, 'raw hostId must never be exposed');
    assert.equal(hostRes.members.length, 1);
    assert.equal(hostRes.members[0].isHost, true);

    // Public op=get response must not leak hostSecret or hostId
    const guestGetUrl = new URL(`http://localhost/api/music?action=jam&op=get&room=${roomCode}&userId=guest-1&userName=Alice`);
    const guestGet = await handleJamRoomRequest(
      createReq('GET', guestGetUrl.pathname + guestGetUrl.search),
      guestGetUrl,
      roomCode
    );
    assert.equal('hostSecret' in guestGet, false);
    assert.equal('hostToken' in guestGet, false);
    assert.equal('hostId' in guestGet, false);
    assert.equal(guestGet.members.find((m) => m.id === 'host-u1')?.isHost, true);
    assert.equal(guestGet.members.find((m) => m.id === 'guest-1')?.isHost, false);

    // Initial SSE snapshot must also strip secrets/hostId
    const sseRes = createSseMockRes();
    const sseReq = createSseMockReq();
    try {
      handleJamRoomSseStream(sseReq, sseRes, roomCode);
      const sseEvents = parseSsePayloads(sseRes.written);
      assert.equal(sseEvents.length, 1);
      assert.equal('hostSecret' in sseEvents[0], false);
      assert.equal('hostId' in sseEvents[0], false);
    } finally {
      sseReq.close();
    }

    // Direct sanitizeRoom check
    const sanitized = sanitizeRoom({ roomCode, hostId: 'secret-id', hostSecret: 'sec', guestTracks: [], members: [{ id: 'secret-id', name: 'Host' }] });
    assert.equal('hostId' in sanitized, false);
    assert.equal('hostSecret' in sanitized, false);
    assert.equal('guestTracks' in sanitized, false);
    assert.equal(sanitized.members[0].isHost, true);
  });

  it('blocks empty userId, missing hostSecret, and hostId spoofing from hijacking room state', async () => {
    const roomCode = 'WAVE-SEC2';
    const origTrack = { id: 'orig-1', title: 'Host Track', artist: 'Real DJ' };
    const createUrl = new URL(`http://localhost/api/music?action=jam&op=sync&room=${roomCode}`);
    const created = await handleJamRoomRequest(
      createReq('POST', createUrl.pathname + createUrl.search, {
        userId: 'real-host-99',
        userName: 'RealDJ',
        hostName: 'RealDJ',
        isHost: true,
        currentTrack: origTrack,
        isPlaying: true,
        currentTime: 40,
        queue: [origTrack]
      }),
      createUrl,
      roomCode
    );

    const sseRes = createSseMockRes();
    const sseReq = createSseMockReq();
    handleJamRoomSseStream(sseReq, sseRes, roomCode);
    const initialCount = sseRes.written.length;

    try {
      // 1. Empty userId hijack attempt
      const noUserUrl = new URL(`http://localhost/api/music?action=jam&op=sync&room=${roomCode}`);
      const noUserRes = await handleJamRoomRequest(
        createReq('POST', noUserUrl.pathname + noUserUrl.search, {
          isHost: true,
          currentTrack: { id: 'evil', title: 'Hijacked' },
          isPlaying: false
        }),
        noUserUrl,
        roomCode
      );
      assert.equal(noUserRes.rejected, true);
      assert.equal(jamRooms.get(roomCode).currentTrack.id, 'orig-1');

      // 2. Spoofing host userId without hostSecret
      const spoofUrl = new URL(`http://localhost/api/music?action=jam&op=play-track&room=${roomCode}`);
      const spoofRes = await handleJamRoomRequest(
        createReq('POST', spoofUrl.pathname + spoofUrl.search, {
          userId: 'real-host-99',
          isHost: true,
          track: { id: 'evil-2', title: 'Spoofed Track' }
        }),
        spoofUrl,
        roomCode
      );
      assert.equal(spoofRes.rejected, true);
      assert.equal(jamRooms.get(roomCode).currentTrack.id, 'orig-1');

      // 3. Guest sending add-track with playNow: true cannot hijack playback
      const addUrl = new URL(`http://localhost/api/music?action=jam&op=add-track&room=${roomCode}`);
      const addRes = await handleJamRoomRequest(
        createReq('POST', addUrl.pathname + addUrl.search, {
          userId: 'guest-bob',
          userName: 'Bob',
          isHost: false,
          playNow: true,
          track: { id: 'guest-q', title: 'Guest Song' }
        }),
        addUrl,
        roomCode
      );
      assert.equal(addRes.playNow, false);
      assert.equal(jamRooms.get(roomCode).currentTrack.id, 'orig-1');

      // Unauthorized rejections must not emit SSE events; legitimate add-track does
      const emitted = parseSsePayloads(sseRes.written.slice(initialCount));
      assert.equal(emitted.length, 1);
      assert.equal(emitted[0].eventType, 'add-track');
      assert.equal(emitted[0].addedTrack.id, 'guest-q');

      // 4. Real host WITH valid hostSecret can execute toggle-play
      const toggleUrl = new URL(`http://localhost/api/music?action=jam&op=toggle-play&room=${roomCode}`);
      const toggleRes = await handleJamRoomRequest(
        createReq('POST', toggleUrl.pathname + toggleUrl.search, {
          userId: 'real-host-99',
          isHost: true,
          hostSecret: created.hostSecret,
          isPlaying: false,
          currentTime: 44
        }),
        toggleUrl,
        roomCode
      );
      assert.equal(toggleRes.isPlaying, false);
      assert.equal(jamRooms.get(roomCode).isPlaying, false);
    } finally {
      sseReq.close();
    }
  });

  it('does not resurrect host-deleted guest tracks on subsequent op=sync', async () => {
    const roomCode = 'WAVE-QUEUE3';
    const track1 = { id: 't1', title: 'Track 1' };
    const track2 = { id: 't2', title: 'Guest Added' };

    const syncUrl = new URL(`http://localhost/api/music?action=jam&op=sync&room=${roomCode}`);
    const hostCreate = await handleJamRoomRequest(
      createReq('POST', syncUrl.pathname + syncUrl.search, {
        userId: 'host-1',
        userName: 'Host',
        isHost: true,
        queue: [track1],
        currentTrack: track1
      }),
      syncUrl,
      roomCode
    );

    const addUrl = new URL(`http://localhost/api/music?action=jam&op=add-track&room=${roomCode}`);
    await handleJamRoomRequest(
      createReq('POST', addUrl.pathname + addUrl.search, {
        userId: 'guest-1',
        userName: 'Guest',
        track: track2
      }),
      addUrl,
      roomCode
    );
    assert.equal(jamRooms.get(roomCode).queue.length, 2);

    // Host removes track2 and syncs authoritative queue [track1]
    const hostSyncRes = await handleJamRoomRequest(
      createReq('POST', syncUrl.pathname + syncUrl.search, {
        userId: 'host-1',
        userName: 'Host',
        isHost: true,
        hostSecret: hostCreate.hostSecret,
        queue: [track1]
      }),
      syncUrl,
      roomCode
    );
    assert.deepEqual(
      hostSyncRes.queue.map((t) => t.id),
      ['t1']
    );
  });

  it('broadcasts leave & member-seat events, suppresses op=get broadcasts, and preserves sync-* eventTypes', async () => {
    const roomCode = 'WAVE-EVENTS4';
    const syncUrl = new URL(`http://localhost/api/music?action=jam&op=sync&room=${roomCode}`);
    const created = await handleJamRoomRequest(
      createReq('POST', syncUrl.pathname + syncUrl.search, {
        userId: 'host-1',
        userName: 'Host',
        isHost: true
      }),
      syncUrl,
      roomCode
    );

    // Guest joins
    const seatUrl = new URL(`http://localhost/api/music?action=jam&op=seat&room=${roomCode}`);
    const sseRes = createSseMockRes();
    const sseReq = createSseMockReq();
    handleJamRoomSseStream(sseReq, sseRes, roomCode);
    const baseline = sseRes.written.length;

    try {
      // 1. op=get must NOT broadcast to SSE subscribers
      const getUrl = new URL(`http://localhost/api/music?action=jam&op=get&room=${roomCode}&userId=guest-1&userName=Guest`);
      await handleJamRoomRequest(createReq('GET', getUrl.pathname + getUrl.search), getUrl, roomCode);
      assert.equal(sseRes.written.length, baseline, 'op=get must not spam SSE subscribers');

      // 2. op=seat must broadcast eventType: 'member-seat' with clamped pan and top-level userId/seat fields
      const seatRes = await handleJamRoomRequest(
        createReq('POST', seatUrl.pathname + seatUrl.search, {
          eventType: 'member-seat',
          userId: 'guest-1',
          userName: 'Guest',
          seatId: 'stage-right',
          seatX: 82,
          seatY: 40,
          seatPan: 1.5 // intentionally out of [-0.85, 0.85]
        }),
        seatUrl,
        roomCode
      );
      assert.equal(seatRes.eventType, 'member-seat');
      assert.equal(seatRes.userId, 'guest-1');
      assert.equal(seatRes.seatId, 'stage-right');
      assert.equal(seatRes.seatPan, 0.85);

      // 3. sync-ping preserves eventType; sync-anchor requires host
      await handleJamRoomRequest(
        createReq('POST', syncUrl.pathname + syncUrl.search, {
          eventType: 'sync-ping',
          userId: 'guest-1',
          guestId: 'guest-1',
          clientSendEpoch: 12345
        }),
        syncUrl,
        roomCode
      );
      await handleJamRoomRequest(
        createReq('POST', syncUrl.pathname + syncUrl.search, {
          eventType: 'sync-anchor',
          userId: 'host-1',
          isHost: true,
          hostSecret: created.hostSecret,
          syncAnchor: { trackId: 't1', position: 10, hostEpoch: 5000, playbackRate: 1, isPlaying: true, syncVersion: 2 }
        }),
        syncUrl,
        roomCode
      );

      // 4. op=leave broadcasts member removal
      const leaveUrl = new URL(`http://localhost/api/music?action=jam&op=leave&room=${roomCode}&userId=guest-1`);
      await handleJamRoomRequest(createReq('POST', leaveUrl.pathname + leaveUrl.search, {}), leaveUrl, roomCode);

      const events = parseSsePayloads(sseRes.written.slice(baseline));
      assert.deepEqual(
        events.map((e) => e.eventType),
        ['member-seat', 'sync-ping', 'sync-anchor', 'leave']
      );
      assert.equal(events[0].seatPan, 0.85);
      assert.equal(events[1].clientSendEpoch, 12345);
      assert.equal(events[2].syncAnchor.position, 10);
      assert.equal(events[3].members.some((m) => m.id === 'guest-1'), false);
    } finally {
      sseReq.close();
    }
  });
});
