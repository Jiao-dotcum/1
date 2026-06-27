import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import * as THREE from "three";
import { AUDIO } from "@pokerpandey/shared";

interface VoiceSource {
  panner: PannerNode;
  gain: GainNode;
  src: MediaStreamAudioSourceNode;
  /** Muted <audio> element kept alive so Chrome keeps pulling samples (known quirk). */
  el: HTMLAudioElement;
}

export interface VoiceUpdateOpts {
  localSeatedTable: string;
  /** Given a participant id, the table they're seated at ("" if none). */
  tableOf: (id: string) => string;
  /** Locally blocked/muted participant ids. */
  blocked: Set<string>;
  /** Server-side muted ids (kill switch / per-player). */
  serverMuted: Set<string>;
  killSwitch: boolean;
}

/**
 * Routes every remote participant's mic through a Web Audio PannerNode placed
 * at their avatar's world position, giving distance falloff, a hard max-distance
 * cutoff, and stereo panning by direction. Tablemates get full-volume near-field
 * audio; passersby get natural falloff.
 *
 * Degrades gracefully: if there is no token (LiveKit unconfigured) nothing is
 * connected and the rest of the app runs silent.
 */
export class SpatialVoice {
  ctx: AudioContext;
  room: Room | null = null;
  private sources = new Map<string, VoiceSource>();
  private connected = false;

  constructor() {
    this.ctx = new AudioContext();
  }

  async connect(url: string, token: string): Promise<void> {
    await this.ctx.resume();
    this.room = new Room({ adaptiveStream: true, dynacast: true });

    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) =>
      this.onTrackSubscribed(track, participant),
    );
    this.room.on(RoomEvent.TrackUnsubscribed, (_track, pub, participant) =>
      this.onTrackUnsubscribed(pub, participant),
    );
    this.room.on(RoomEvent.ParticipantDisconnected, (p) => this.removeSource(p.identity));

    await this.room.connect(url, token);
    // Publish our mic. Moderation hooks (kill switch / self-mute) toggle this.
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      console.warn("Mic enable failed (permission?):", e);
    }
    this.connected = true;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private onTrackSubscribed(track: RemoteTrack, participant: RemoteParticipant): void {
    if (track.kind !== Track.Kind.Audio) return;
    const id = participant.identity;
    this.removeSource(id);

    const mediaTrack = track.mediaStreamTrack;
    const stream = new MediaStream([mediaTrack]);

    // Keep a muted element attached so the WebRTC stream keeps flowing to Web Audio.
    const el = track.attach();
    el.muted = true;
    el.volume = 0;
    el.style.display = "none";
    document.body.appendChild(el);

    const src = this.ctx.createMediaStreamSource(stream);
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = AUDIO.distanceModel;
    panner.refDistance = AUDIO.refDistance;
    panner.maxDistance = AUDIO.maxDistance;
    panner.rolloffFactor = AUDIO.rolloffFactor;

    const gain = this.ctx.createGain();
    src.connect(panner);
    panner.connect(gain);
    gain.connect(this.ctx.destination);

    this.sources.set(id, { panner, gain, src, el });
  }

  private onTrackUnsubscribed(pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (pub.kind !== Track.Kind.Audio) return;
    this.removeSource(participant.identity);
  }

  private removeSource(id: string): void {
    const s = this.sources.get(id);
    if (!s) return;
    try {
      s.src.disconnect();
      s.panner.disconnect();
      s.gain.disconnect();
      s.el.remove();
    } catch {
      /* ignore */
    }
    this.sources.delete(id);
  }

  /** Enable/disable our own published mic (self-mute or kill switch). */
  async setMicEnabled(on: boolean): Promise<void> {
    if (!this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(on);
    } catch {
      /* ignore */
    }
  }

  /**
   * Per-frame spatial update. Places the listener at the local avatar and each
   * source at the corresponding avatar, applying zone + moderation gain.
   */
  update(
    listenerPos: THREE.Vector3,
    listenerForward: THREE.Vector3,
    positions: Map<string, THREE.Vector3>,
    opts: VoiceUpdateOpts,
  ): void {
    if (!this.connected) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;

    // Position + orient the listener (use AudioParams where available).
    if (L.positionX) {
      L.positionX.setValueAtTime(listenerPos.x, t);
      L.positionY.setValueAtTime(0, t);
      L.positionZ.setValueAtTime(listenerPos.z, t);
      L.forwardX.setValueAtTime(listenerForward.x, t);
      L.forwardY.setValueAtTime(0, t);
      L.forwardZ.setValueAtTime(listenerForward.z, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      // Deprecated fallback for older browsers.
      (L as any).setPosition(listenerPos.x, 0, listenerPos.z);
      (L as any).setOrientation(listenerForward.x, 0, listenerForward.z, 0, 1, 0);
    }

    for (const [id, s] of this.sources) {
      const avatar = positions.get(id);
      const silenced =
        opts.killSwitch || opts.blocked.has(id) || opts.serverMuted.has(id) || !avatar;
      s.gain.gain.setTargetAtTime(silenced ? 0 : 1, t, 0.05);
      if (!avatar) continue;

      const sameTable =
        opts.localSeatedTable !== "" && opts.tableOf(id) === opts.localSeatedTable;

      let px = avatar.x;
      let pz = avatar.z;
      if (sameTable) {
        // Full-volume near-field: place at refDistance in the avatar's direction
        // so tablemates are always clearly audible regardless of seat spacing.
        const dir = new THREE.Vector3(avatar.x - listenerPos.x, 0, avatar.z - listenerPos.z);
        if (dir.lengthSq() < 1e-4) dir.copy(listenerForward);
        dir.normalize().multiplyScalar(AUDIO.refDistance);
        px = listenerPos.x + dir.x;
        pz = listenerPos.z + dir.z;
      }

      if (s.panner.positionX) {
        s.panner.positionX.setValueAtTime(px, t);
        s.panner.positionY.setValueAtTime(0, t);
        s.panner.positionZ.setValueAtTime(pz, t);
      } else {
        (s.panner as any).setPosition(px, 0, pz);
      }
    }
  }
}
