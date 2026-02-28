import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { userInfo } from "node:os";
import { JsonFileStore } from "../storage/json-file-store";

interface EncryptedSecretRecord {
  iv: string;
  authTag: string;
  ciphertext: string;
}

type EncryptedSecretsMap = Record<string, EncryptedSecretRecord>;

const SECRET_KEY_ENV = "VIDEO_AGENT_MASTER_KEY";
const ALGORITHM = "aes-256-gcm";

export class SecretVault {
  private readonly store = new JsonFileStore<EncryptedSecretsMap>(
    "secrets.json",
    {}
  );

  private deriveEncryptionKey() {
    const secretFromEnv = process.env[SECRET_KEY_ENV];
    if (secretFromEnv) {
      return createHash("sha256").update(secretFromEnv).digest();
    }

    const machineDerivedSeed = `${process.platform}:${userInfo().username}:${process.cwd()}`;
    return scryptSync(machineDerivedSeed, "video-agent-salt", 32);
  }

  private encrypt(plainText: string): EncryptedSecretRecord {
    const key = this.deriveEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };
  }

  private decrypt(record: EncryptedSecretRecord): string {
    const key = this.deriveEncryptionKey();
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(record.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf-8");
  }

  async setSecret(scope: string, id: string, value: string) {
    const storageKey = `${scope}:${id}`;
    const encrypted = this.encrypt(value);
    await this.store.update((prev) => ({
      ...prev,
      [storageKey]: encrypted,
    }));
  }

  async getSecret(scope: string, id: string): Promise<string | undefined> {
    const storageKey = `${scope}:${id}`;
    const all = await this.store.read();
    const record = all[storageKey];
    if (!record) {
      return undefined;
    }

    try {
      return this.decrypt(record);
    } catch {
      return undefined;
    }
  }

  async deleteSecret(scope: string, id: string) {
    const storageKey = `${scope}:${id}`;
    await this.store.update((prev) => {
      const next = { ...prev };
      delete next[storageKey];
      return next;
    });
  }
}
