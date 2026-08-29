/**
 * Git remote adresinden sunucu, sahip ve depo adını çıkarır.
 *
 * Saf fonksiyon: ağ ya da dosya sistemi yok, dolayısıyla bütün adres biçimleri
 * testle taranabiliyor. Git'in kabul ettiği biçimler şaşırtıcı derecede çeşitli
 * ve yanlış ayrıştırma "PR listesi boş görünüyor" gibi sessiz hatalara yol açar.
 */

export interface RemoteIdentity {
  /** "github.com", "gitlab.com", kurumsal kurulumda kendi alan adı. */
  host: string;
  owner: string;
  name: string;
}

export function parseRemoteUrl(url: string): RemoteIdentity | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  // scp benzeri SSH biçimi: git@github.com:sahip/depo.git
  const scpMatch = /^(?:([^@]+)@)?([^:/]+):(.+)$/.exec(trimmed);
  // Şema içeren biçimler: ssh://, https://, git://, http://
  const schemeMatch = /^([a-z+]+):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed);

  let host: string;
  let path: string;

  if (schemeMatch) {
    host = schemeMatch[2];
    path = schemeMatch[3];
  } else if (scpMatch && !trimmed.includes('://')) {
    host = scpMatch[2];
    path = scpMatch[3];
  } else {
    return null;
  }

  const segments = path
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) return null;

  return {
    host: host.toLowerCase(),
    // Kurumsal kurulumlarda yol daha derin olabilir (GitLab alt grupları gibi);
    // depo adı her zaman son parça, sahip ondan önceki her şey.
    owner: segments.slice(0, -1).join('/'),
    name: segments[segments.length - 1],
  };
}

export function isGithubHost(host: string): boolean {
  return host === 'github.com' || host === 'www.github.com';
}
