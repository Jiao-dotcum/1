import { AccessToken } from "livekit-server-sdk";

/**
 * Mint a short-lived LiveKit join token for a player.
 *
 * Returns null if LiveKit isn't configured — voice then degrades gracefully
 * (the client runs silent; movement, floor, and poker still work).
 */
export async function mintVoiceToken(
  identity: string,
  name: string,
  room: string,
): Promise<{ url: string; token: string; room: string; identity: string } | null> {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !secret) {
    return null;
  }

  const at = new AccessToken(key, secret, {
    identity,
    name,
    // Short TTL; clients reconnect/refresh as needed.
    ttl: "1h",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    // canPublishData lets us send lightweight presence/metadata if needed later.
    canPublishData: true,
  });

  const token = await at.toJwt();
  return { url, token, room, identity };
}

/** True if LiveKit credentials are present. */
export function voiceConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}
