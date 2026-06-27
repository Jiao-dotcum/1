import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CasinoRoom } from "./CasinoRoom.js";
import { voiceConfigured } from "./voice.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

// Lightweight health/info endpoint (also tells the client if voice is available).
app.get("/health", (_req, res) => {
  res.json({ ok: true, voice: voiceConfigured() });
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("casino", CasinoRoom);

gameServer
  .listen(PORT)
  .then(() => {
    console.log(`🐼 PokerPandey server listening on :${PORT}`);
    console.log(`   voice: ${voiceConfigured() ? "configured" : "NOT configured (silent mode)"}`);
  })
  .catch((err: unknown) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
