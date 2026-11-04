import "server-only";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(pw: string, salt: Buffer, len: number, opts: typeof PARAMS): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    _scrypt(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Hash de contraseña con scrypt + sal aleatoria. Nunca se guarda la contraseña en claro. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { ...PARAMS, N: Number(n) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
