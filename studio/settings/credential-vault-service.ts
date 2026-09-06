import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { ProjectError } from '../project/project-types.ts';

export type CredentialSummary = {
  id: string;
  provider: string;
  label: string;
  configuration: Record<string, string>;
  configuredSecretFields: string[];
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCredentialProfile = {
  id: string;
  provider: string;
  label: string;
  configuration: Record<string, string>;
  secrets: Record<string, string>;
};

type StoredCredential = Omit<CredentialSummary, 'configuredSecretFields'> & {
  encryptedSecrets: Record<string, string>;
  encryptedValue?: string;
};

export type CredentialVaultCipher = {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
};

export class CredentialVaultService {
  readonly #path: string;
  readonly #cipher: CredentialVaultCipher;

  constructor(path: string, cipher: CredentialVaultCipher) {
    this.#path = path;
    this.#cipher = cipher;
  }

  list(): CredentialSummary[] {
    return this.#read().map((credential) => this.#summary(credential));
  }

  set(input: {
    id?: string;
    provider: string;
    label: string;
    configuration?: Record<string, string>;
    secrets?: Record<string, string>;
    /** Compatibility with pre-profile callers. */
    value?: string;
  }): CredentialSummary {
    if (!this.#cipher.available()) {
      throw new ProjectError(
        'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
        '操作系统安全存储当前不可用，Studio 不会降级为明文保存。',
      );
    }
    const provider = input.provider.trim();
    const label = input.label.trim();
    if (!provider || !label) {
      throw new ProjectError(
        'CREDENTIAL_INPUT_INVALID',
        '凭据需要 provider 和 label。',
      );
    }
    const credentials = this.#read();
    const id = input.id?.trim() || randomUUID();
    const previous = credentials.find((item) => item.id === id);
    const suppliedSecrets: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries({
      ...(input.value ? { apiKey: input.value } : {}),
      ...input.secrets,
    })) {
      const key = rawKey.trim();
      if (key && typeof value === 'string' && value) {
        suppliedSecrets[key] = value;
      }
    }
    const encryptedSecrets = {
      ...previous?.encryptedSecrets,
      ...Object.fromEntries(
        Object.entries(suppliedSecrets).map(([key, value]) => [
          key,
          this.#cipher.encrypt(value).toString('base64'),
        ]),
      ),
    };
    if (Object.keys(encryptedSecrets).length === 0) {
      throw new ProjectError(
        'CREDENTIAL_INPUT_INVALID',
        '新凭据至少需要一个非空 secret。',
      );
    }
    const now = new Date().toISOString();
    const next: StoredCredential = {
      id,
      provider,
      label,
      configuration: this.#configuration(
        input.configuration ?? previous?.configuration,
      ),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      encryptedSecrets,
    };
    const updated = previous
      ? credentials.map((item) => (item.id === id ? next : item))
      : [...credentials, next];
    this.#write(updated);
    return this.#summary(next);
  }

  remove(id: string): boolean {
    const credentials = this.#read();
    const updated = credentials.filter((item) => item.id !== id);
    if (updated.length === credentials.length) return false;
    this.#write(updated);
    return true;
  }

  mergeConfiguration(
    id: string,
    provider: string,
    patch: Record<string, string>,
  ): CredentialSummary {
    const credentials = this.#read();
    const credential = credentials.find((item) => item.id === id);
    if (!credential) {
      throw new ProjectError('CREDENTIAL_NOT_FOUND', `未找到凭据引用：${id}`);
    }
    if (credential.provider !== provider) {
      throw new ProjectError(
        'CREDENTIAL_PROVIDER_MISMATCH',
        `凭据 ${id} 不属于供应商 ${provider}。`,
      );
    }
    const inherited = this.#configuration(patch);
    const configuration = {
      ...inherited,
      ...credential.configuration,
    };
    if (
      JSON.stringify(configuration) === JSON.stringify(credential.configuration)
    ) {
      return this.#summary(credential);
    }
    const next: StoredCredential = {
      ...credential,
      configuration,
      updatedAt: new Date().toISOString(),
    };
    this.#write(
      credentials.map((item) => (item.id === credential.id ? next : item)),
    );
    return this.#summary(next);
  }

  resolve(id: string): string {
    const profile = this.resolveProfile(id);
    return profile.secrets.apiKey ?? Object.values(profile.secrets)[0] ?? '';
  }

  resolveProfile(id: string): ResolvedCredentialProfile {
    if (!this.#cipher.available()) {
      throw new ProjectError(
        'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
        '操作系统安全存储当前不可用。',
      );
    }
    const credential = this.#read().find((item) => item.id === id);
    if (!credential) {
      throw new ProjectError('CREDENTIAL_NOT_FOUND', `未找到凭据引用：${id}`);
    }
    try {
      return {
        id: credential.id,
        provider: credential.provider,
        label: credential.label,
        configuration: structuredClone(credential.configuration),
        secrets: Object.fromEntries(
          Object.entries(credential.encryptedSecrets).map(([key, value]) => [
            key,
            this.#cipher.decrypt(Buffer.from(value, 'base64')),
          ]),
        ),
      };
    } catch (error) {
      throw new ProjectError(
        'CREDENTIAL_DECRYPT_FAILED',
        `无法解密凭据引用：${id}`,
        { cause: error },
      );
    }
  }

  #read(): StoredCredential[] {
    if (!existsSync(this.#path)) return [];
    try {
      const value = JSON.parse(readFileSync(this.#path, 'utf8')) as unknown;
      if (!Array.isArray(value))
        throw new Error('credential vault must be an array');
      return value
        .filter((item): item is Record<string, unknown> =>
          Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).id === 'string',
          ),
        )
        .map((item) => {
          const encryptedSecrets =
            item.encryptedSecrets &&
            typeof item.encryptedSecrets === 'object' &&
            !Array.isArray(item.encryptedSecrets)
              ? Object.fromEntries(
                  Object.entries(item.encryptedSecrets).filter(
                    (entry): entry is [string, string] =>
                      typeof entry[1] === 'string',
                  ),
                )
              : typeof item.encryptedValue === 'string'
                ? { apiKey: item.encryptedValue }
                : {};
          return {
            id: String(item.id),
            provider: typeof item.provider === 'string' ? item.provider : '',
            label: typeof item.label === 'string' ? item.label : '',
            configuration: this.#configuration(
              item.configuration as Record<string, string> | undefined,
            ),
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
            encryptedSecrets,
          } satisfies StoredCredential;
        })
        .filter(
          (item) =>
            Boolean(item.provider && item.label) &&
            Object.keys(item.encryptedSecrets).length > 0,
        );
    } catch (error) {
      throw new ProjectError(
        'CREDENTIAL_VAULT_INVALID',
        '系统凭据索引损坏；原文件被保留，未尝试明文恢复。',
        { cause: error },
      );
    }
  }

  #write(credentials: StoredCredential[]): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(credentials, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporary, this.#path);
  }

  #configuration(value?: Record<string, string>): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          (entry): entry is [string, string] =>
            Boolean(entry[0].trim()) && typeof entry[1] === 'string',
        )
        .map(([key, child]) => [key.trim(), child.trim()]),
    );
  }

  #summary(credential: StoredCredential): CredentialSummary {
    return structuredClone({
      id: credential.id,
      provider: credential.provider,
      label: credential.label,
      configuration: credential.configuration,
      configuredSecretFields: Object.keys(credential.encryptedSecrets).sort(),
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  }
}
