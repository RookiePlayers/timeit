import * as vscode from 'vscode';

/**
 * A thin wrapper around VS Code SecretStorage that also exposes
 * utilities for listing, clearing, and filtering stored credentials.
 */
export class SecretStore {
  constructor(private secrets: vscode.SecretStorage) {}

  async get(key: string) {
    return this.secrets.get(key);
  }

  async set(key: string, value: string) {
    await this.secrets.store(key, value);
  }

  async delete(key: string) {
    await this.secrets.delete(key);
  }

  /**
   * ⚡ Added: return all known keys, if supported by the API.
   * VS Code SecretStorage does not expose keys() officially,
   * so we simulate this by storing an internal key registry.
   */
  async keys(): Promise<string[]> {
    const registryKey = '__clockit_secret_keys__';
    const raw = await this.secrets.get(registryKey);
    if (!raw) {return [];}
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * ⚡ Added: ensure registry is updated whenever a key changes.
   */
  private async updateRegistry(key: string, remove = false) {
    const registryKey = '__clockit_secret_keys__';
    const existing = new Set(await this.keys());
    if (remove) {existing.delete(key);}
    else {existing.add(key);}
    await this.secrets.store(registryKey, JSON.stringify([...existing]));
  }

  /** Override set/delete to update registry */
  async store(key: string, value: string) {
    await this.secrets.store(key, value);
    await this.updateRegistry(key);
  }

  async remove(key: string) {
    await this.secrets.delete(key);
    await this.updateRegistry(key, true);
  }

  /** Alias for delete() but also updates registry */
  async safeDelete(key: string) {
    await this.remove(key);
  }

  /** Clear all Clockit-related secrets */
  async clearAll() {
    const all = await this.keys();
    for (const key of all.filter(k => k.startsWith('clockit.'))) {
      await this.remove(key);
    }
  }
}

/** Create a global instance tied to the extension context */
export function globalSecretStore(ctx: vscode.ExtensionContext) {
  return new SecretStore(ctx.secrets);
}