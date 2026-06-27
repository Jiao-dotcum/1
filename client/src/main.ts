import * as THREE from "three";
import { Net } from "./net.js";
import { Scene3D, type TableInfo } from "./scene.js";
import { Input } from "./input.js";
import { SpatialVoice } from "./voice.js";
import { PokerUI } from "./pokerUI.js";
import { ModerationUI } from "./moderationUI.js";
import { FLOOR_HALF, MOVE_SPEED, TABLE } from "@pokerpandey/shared";

const SIT_RANGE = TABLE.seatRadius + 2.0;
const SPECTATE_RANGE = 7;

const joinOverlay = document.getElementById("join")!;
const hud = document.getElementById("hud")!;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const joinBtn = document.getElementById("join-btn") as HTMLButtonElement;
const noticesEl = document.getElementById("notices")!;
const pokerEl = document.getElementById("poker")!;

function showNotice(text: string, level: "info" | "warn" | "error" = "info"): void {
  const n = document.createElement("div");
  n.className = `notice ${level}`;
  n.textContent = text;
  noticesEl.appendChild(n);
  setTimeout(() => n.remove(), 4500);
}

joinBtn.addEventListener("click", () => start());
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") start();
});

async function start(): Promise<void> {
  joinBtn.disabled = true;
  const name = nameInput.value.trim() || "Panda";

  const net = new Net();
  const scene = new Scene3D(document.getElementById("scene") as HTMLCanvasElement);
  const input = new Input();
  const voice = new SpatialVoice();
  const pokerUI = new PokerUI(pokerEl);
  const moderation = new ModerationUI();

  net.cb.onHoleCards = (m) => pokerUI.setHoleCards(m.tableId, m.cards);
  net.cb.onNotice = (m) => showNotice(m.text, m.level);
  net.cb.onVoiceToken = async (m) => {
    try {
      await voice.connect(m.url, m.token);
      showNotice("Voice connected — walk toward a table to hear it.", "info");
    } catch (e) {
      console.error(e);
      showNotice("Voice failed to connect (mic permission?).", "warn");
    }
  };

  try {
    await net.join(name);
  } catch (e) {
    console.error(e);
    showNotice("Could not reach the server. Is it running on :2567?", "error");
    joinBtn.disabled = false;
    return;
  }

  joinOverlay.classList.add("hidden");
  hud.classList.remove("hidden");
  scene.setLocalId(net.sessionId);

  // Moderation wiring.
  moderation.onMute = (id) => net.mute(id);
  moderation.onBlock = (id) => net.block(id);
  moderation.onReport = (id, reason) => net.report(id, reason);
  moderation.onKick = (id) => net.kick(id);
  moderation.onKillSwitch = (on) => net.voiceKillSwitch(on);

  // Poker wiring.
  pokerUI.onAction = (tableId, action) => net.pokerAction(tableId, action);
  pokerUI.onStand = () => net.stand();

  // Local predicted state.
  const localPos = new THREE.Vector3(0, 0, FLOOR_HALF - 3);
  let localHeading = Math.PI;
  let initializedPos = false;
  let tables: TableInfo[] = [];
  let lastMoveSent = 0;
  let lastKillSwitch = false;
  let lastModRender = 0;

  const clock = new THREE.Clock();

  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.05);
    const state: any = net.room.state;
    const me: any = state.players?.get(net.sessionId);

    // Build table meshes once the floor state arrives.
    if (tables.length === 0 && state.tables && state.tables.length > 0) {
      tables = Array.from(state.tables).map((t: any) => ({ id: t.id, x: t.x, z: t.z }));
      scene.syncTables(tables);
    }

    const seated = !!me && me.seatedTable !== "";

    if (me) {
      if (!initializedPos) {
        localPos.set(me.x, 0, me.z);
        localHeading = me.heading;
        initializedPos = true;
      }
      if (seated) {
        // Server owns our position while seated.
        localPos.set(me.x, 0, me.z);
        localHeading = me.heading;
      } else {
        // Client-side movement prediction.
        const v = input.moveVector();
        if (v.x !== 0 || v.z !== 0) {
          localPos.x = clamp(localPos.x + v.x * MOVE_SPEED * dt, -FLOOR_HALF, FLOOR_HALF);
          localPos.z = clamp(localPos.z + v.z * MOVE_SPEED * dt, -FLOOR_HALF, FLOOR_HALF);
          localHeading = Math.atan2(v.z, v.x);
        }
      }
    }

    // Sit / stand on E.
    if (input.consumeSit() && me) {
      if (seated) {
        net.stand();
      } else {
        trySit(net, state, tables, localPos);
      }
    }

    // Sync visuals.
    if (state.players) scene.syncPlayers(state.players as Map<string, any>);
    scene.setLocalPlayer(localPos, localHeading);
    scene.update(dt);

    // Spatial voice.
    const serverMuted = new Set<string>();
    if (state.players) {
      (state.players as Map<string, any>).forEach((p: any, id: string) => {
        if (p.voiceMuted) serverMuted.add(id);
      });
    }
    const listener = scene.listener();
    voice.update(listener.pos, listener.forward, scene.avatarPositions(), {
      localSeatedTable: me?.seatedTable ?? "",
      tableOf: (id) => state.players?.get(id)?.seatedTable ?? "",
      blocked: moderation.blocked,
      serverMuted,
      killSwitch: !!state.voiceKillSwitch,
    });

    // Reflect server kill switch on self mic + checkbox.
    if (!!state.voiceKillSwitch !== lastKillSwitch) {
      lastKillSwitch = !!state.voiceKillSwitch;
      moderation.setKillSwitch(lastKillSwitch);
      voice.setMicEnabled(!lastKillSwitch);
    }

    // Send movement at ~20Hz while roaming.
    const now = performance.now();
    if (!seated && now - lastMoveSent > 50) {
      lastMoveSent = now;
      net.move({ x: localPos.x, z: localPos.z, heading: localHeading });
    }

    // Poker UI: show seated table, else nearest table within spectate range.
    let shownTable: any = null;
    if (seated) {
      shownTable = findTable(state, me.seatedTable);
    } else {
      const near = scene.nearestTable(tables, localPos);
      if (near && near.dist <= SPECTATE_RANGE) shownTable = findTable(state, near.table.id);
    }
    if (shownTable) pokerUI.render(shownTable, net.sessionId);
    else pokerUI.hide();

    // Moderation list (refresh a few times per second).
    if (now - lastModRender > 400 && state.players) {
      lastModRender = now;
      moderation.render(state.players as Map<string, any>, net.sessionId);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function trySit(net: Net, state: any, tables: TableInfo[], pos: THREE.Vector3): void {
  let best: { table: TableInfo; dist: number } | null = null;
  for (const t of tables) {
    const d = Math.hypot(pos.x - t.x, pos.z - t.z);
    if (!best || d < best.dist) best = { table: t, dist: d };
  }
  if (!best || best.dist > SIT_RANGE) {
    showNotice("Walk closer to a table to sit.", "warn");
    return;
  }
  const table = findTable(state, best.table.id);
  const occupied = new Set<number>(Array.from(table?.seats ?? []).map((s: any) => s.seatIndex));
  let seatIndex = -1;
  for (let i = 0; i < TABLE.seats; i++) {
    if (!occupied.has(i)) {
      seatIndex = i;
      break;
    }
  }
  if (seatIndex === -1) {
    showNotice("Table is full.", "warn");
    return;
  }
  net.sit({ tableId: best.table.id, seatIndex });
}

function findTable(state: any, id: string): any {
  if (!state.tables) return null;
  for (const t of state.tables) if (t.id === id) return t;
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
