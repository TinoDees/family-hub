// Minimal Web Push sender (RFC 8291 aes128gcm encryption + RFC 8292 VAPID).
// Dependency-free on purpose — runs on Vercel's Node runtime with node:crypto only.
// Server only: uses VAPID_PRIVATE_KEY.

import crypto from "crypto";

const b64uDec = (s: string) => Buffer.from(s, "base64url");
const b64uEnc = (b: Buffer) => b.toString("base64url");

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string; // browser public key, base64url (65-byte uncompressed point)
  auth: string; // browser auth secret, base64url (16 bytes)
};

export type PushPayload = {
  title: string;
  body: string;
  url: string; // where a tap should take the user
  tag?: string; // notifications with the same tag replace each other
};

/** Signed VAPID JWT for the push service at `audience` (scheme://host). */
function vapidAuthHeader(audience: string): string {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const pub = b64uDec(publicKey); // 0x04 || x || y
  const key = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64uEnc(pub.subarray(1, 33)),
      y: b64uEnc(pub.subarray(33, 65)),
      d: process.env.VAPID_PRIVATE_KEY!,
    },
    format: "jwk",
  });
  const header = b64uEnc(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEnc(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: process.env.VAPID_SUBJECT ?? "mailto:tino.dees@germanbutchery.com.au",
      })
    )
  );
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363", // JOSE wants raw r||s, not DER
  });
  return `vapid t=${header}.${claims}.${b64uEnc(signature)}, k=${publicKey}`;
}

/** RFC 8291 encryption: payload -> aes128gcm body the push service accepts. */
function encryptPayload(plaintext: Buffer, sub: PushSubscriptionRow): Buffer {
  const uaPublic = b64uDec(sub.p256dh);
  const authSecret = b64uDec(sub.auth);

  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));

  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), // 0x02 = last-record delimiter
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // aes128gcm content header: salt(16) | record size uint32 | keyid length | keyid (our public key)
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

/**
 * Send one push. Returns the push service's HTTP status.
 * 404/410 mean the subscription is dead and should be deleted.
 */
export async function sendWebPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<number> {
  const endpoint = new URL(sub.endpoint);
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      Authorization: vapidAuthHeader(`${endpoint.protocol}//${endpoint.host}`),
    },
    body: new Uint8Array(body),
  });
  // drain so the connection can be reused
  await res.arrayBuffer().catch(() => undefined);
  return res.status;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
