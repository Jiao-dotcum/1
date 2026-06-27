// End-to-end smoke test: drives two real Colyseus clients through
// join -> walk -> sit -> hand start, asserting blinds, private hole-card
// delivery, and no card leaks. Run a server first, then: `node smoke.mjs`.
import { Client } from "colyseus.js";

const URL = process.env.SMOKE_URL ?? "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeClient(name) {
  const client = new Client(URL);
  const room = await client.joinOrCreate("casino", { name });
  const hole = [];
  room.onMessage("hole_cards", (m) => hole.push(m));
  room.onMessage("notice", () => {}); // server sends a "voice not configured" notice
  return { room, hole, name };
}

async function main() {
  const a = await makeClient("Alice");
  const b = await makeClient("Bob");
  await sleep(300);

  // Walk both to table-1 at (-8,-8).
  a.room.send("move", { x: -8, z: -8, heading: 0 });
  b.room.send("move", { x: -8, z: -8, heading: 0 });
  await sleep(300);

  a.room.send("sit", { tableId: "table-1", seatIndex: 0 });
  b.room.send("sit", { tableId: "table-1", seatIndex: 1 });
  await sleep(800);

  const table = a.room.state.tables.find((t) => t.id === "table-1");
  console.log("phase:", table.phase);
  console.log("totalPot:", table.totalPot, "(expect 15 = SB5 + BB10)");
  console.log("seated:", table.seats.length, "players");
  console.log("Alice hole msgs:", a.hole.length, a.hole[0]?.cards);
  console.log("Bob hole msgs:", b.hole.length, b.hole[0]?.cards);

  // ── Assertions ──
  let ok = true;
  const assert = (cond, msg) => {
    console.log(cond ? "  ✓" : "  ✗", msg);
    if (!cond) ok = false;
  };
  assert(table.phase === "preflop", "hand started (preflop)");
  assert(table.totalPot === 15, "blinds posted (pot = 15)");
  assert(table.seats.length === 2, "two players seated");
  assert(a.hole.length === 1 && a.hole[0].cards.length === 2, "Alice got exactly 2 hole cards");
  assert(b.hole.length === 1 && b.hole[0].cards.length === 2, "Bob got exactly 2 hole cards");
  // No leak: the public state JSON must not contain anyone's hole cards.
  const pub = JSON.stringify(a.room.state.toJSON());
  const leaked = [...a.hole[0].cards, ...b.hole[0].cards].some((c) => pub.includes(c));
  assert(!leaked, "no hole cards leaked into public state");
  assert(table.activeSeat >= 0, "an active seat is set");

  a.room.leave();
  b.room.leave();
  console.log(ok ? "\nSMOKE PASS" : "\nSMOKE FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke error:", e);
  process.exit(1);
});
