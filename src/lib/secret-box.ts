/**
 * Cifrado simétrico de secrets para guardarlos en Postgres (credenciales de
 * proveedor, Fase C del módulo Proveedores — docs/spec-proveedores-admin.md).
 *
 * AES-256-GCM: autenticado (detecta manipulación del blob, no solo lo
 * descifra), con IV aleatorio por llamada. Formato de salida: un string
 * base64url de `iv(12) || authTag(16) || ciphertext`, autocontenido — no
 * hace falta guardar nada más junto al blob.
 *
 * ENCRYPTION_KEY: 64 hex chars (32 bytes) en .env, generada con
 * `openssl rand -hex 32`. Si falta o no mide 32 bytes, cifrar/descifrar
 * lanza — preferible a cifrar con una clave débil o silenciar el fallo.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY no configurada o con longitud incorrecta (esperados 64 chars hex / 32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSecret(blob: string): string {
  const key = getKey();
  const raw = Buffer.from(blob, "base64url");
  if (raw.length < IV_LEN + TAG_LEN) {
    throw new Error("Blob cifrado corrupto o truncado.");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
