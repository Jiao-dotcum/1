# VISION.md — PokerPandey

## The north star

You walk into a casino. Not a lobby with a list of tables — a *room*. Somewhere to your
left a hand just went to showdown and you can hear the table react. To your right, quieter,
two people are chatting between hands. You drift toward the noise. As you get closer the
table gets louder and the voices resolve from a murmur into a conversation you could join.
You take the open seat. Now you're *in* — in the game and in the conversation, the same
act, the same instant. When you've had enough you stand up, the table fades behind you, and
you wander off to find another one.

That is the whole product. A social space you can hear, with poker happening inside it.

## Core principle: MOVEMENT, VOICE, POKER are ONE system

These are not three features bolted together. They are one interlocking mechanic:

- **Position drives spatial audio.** Where your avatar stands determines what you hear and
  how loud and from which direction. Voice is a function of geometry.
- **Sitting joins seat + voice zone together.** You don't "join voice" and "join the game"
  separately. Sitting at a seat puts you in that table's hand *and* its conversation zone in
  one action. Standing leaves both.
- **Spectators are first-class.** Standing near a table, you hear and watch the game in
  progress. When a seat opens, you take it. There is no hard wall between watching and
  playing — proximity is the on-ramp.

If a change makes these three drift apart into separate systems, it's wrong.

## What it feels like (sensory targets)

- Roaming the floor feels *alive* — you always hear something, tables overlap at the edges.
- Walking toward a table audibly and directionally raises its volume; walking away lowers it.
- Sitting down snaps you into clean, full-volume tablemate audio.
- The cards are tactile and legible but the room is the star. Social space first, cards second.

## Definition of Done

A newcomer can:

1. **Roam and hear** — load in, move around, and within seconds hear tables as ambient,
   directional, distance-attenuated sound.
2. **Approach** — walking toward a table audibly *and directionally* raises its volume.
3. **Play real poker** — sit and play correct, concurrent Texas Hold'em across multiple
   tables with **no card leaks** (you only ever see your own hole cards) and **correct side
   pots** on all-ins.
4. **Persist** — identity and chip balances survive across sessions.
5. **Be safe** — moderation works: mute, block, report, server-side kick, and a global voice
   kill switch.

## Non-goals

- Real money. Ever. Play chips only.
- A "metaverse." This is a casino floor, not an open world.
- Hand-rolled poker math. We lean on `pokersolver` for ranking and own only the
  pot/side-pot/betting orchestration.

## Design guardrails

- The server is the only authority on game state. The client is a renderer with intentions.
- Never sacrifice the "one system" principle for a feature that's easier to build decoupled.
- Moderation is not a phase-4 nicety; open mics ship with kill switches or they don't ship.
