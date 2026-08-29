import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * GitHub kimlik bilgisinin saklanması.
 *
 * Token yalnızca ana süreçte duruyor; arayüze hiçbir zaman gönderilmiyor.
 * Diske yazarken Electron'un `safeStorage` API'si kullanılıyor — bu, işletim
 * sisteminin anahtarlığıyla (macOS Keychain, Windows DPAPI, Linux'ta
 * libsecret/kwallet) şifreliyor.
 *
 * Anahtarlık yoksa token'ı düz metin olarak yazmıyoruz: bunun yerine sadece
 * bellekte tutup kullanıcıya durumu bildiriyoruz. Bir kimlik bilgisini
 * kullanıcının haberi olmadan korumasız diske yazmak, oturumu her açılışta
 * yeniden kurmaktan çok daha kötü.
 */

let inMemoryToken: string | null = null;

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'github-token.enc');
}

export function canPersist(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function loadToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (!canPersist()) return null;

  try {
    const file = tokenFile();
    if (!fs.existsSync(file)) return null;
    const decrypted = safeStorage.decryptString(fs.readFileSync(file));
    inMemoryToken = decrypted;
    return decrypted;
  } catch {
    // Şifre çözülemiyorsa (anahtarlık değişmiş, dosya bozulmuş) kayıt işe
    // yaramaz; sessizce temizleyip kullanıcıdan yeniden giriş istiyoruz.
    clearToken();
    return null;
  }
}

export function saveToken(token: string): { persisted: boolean } {
  inMemoryToken = token;
  if (!canPersist()) return { persisted: false };

  try {
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(tokenFile(), encrypted, { mode: 0o600 });
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

export function clearToken(): void {
  inMemoryToken = null;
  try {
    fs.rmSync(tokenFile(), { force: true });
  } catch {
    // Dosya silinemese de oturum kapatılmış sayılır.
  }
}
