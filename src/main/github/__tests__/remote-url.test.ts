import { describe, expect, it } from 'vitest';
import { isGithubHost, parseRemoteUrl } from '../remote-url';

describe('parseRemoteUrl', () => {
  it('scp biçimindeki SSH adresini ayrıştırır', () => {
    expect(parseRemoteUrl('git@github.com:kullanici/depo.git')).toEqual({
      host: 'github.com',
      owner: 'kullanici',
      name: 'depo',
    });
  });

  it('.git uzantısı olmadan da çalışır', () => {
    expect(parseRemoteUrl('git@github.com:kullanici/depo')).toMatchObject({ name: 'depo' });
  });

  it('HTTPS adresini ayrıştırır', () => {
    expect(parseRemoteUrl('https://github.com/kullanici/depo.git')).toEqual({
      host: 'github.com',
      owner: 'kullanici',
      name: 'depo',
    });
  });

  it('HTTPS adresindeki kullanıcı adını yok sayar', () => {
    expect(parseRemoteUrl('https://token@github.com/kullanici/depo.git')).toMatchObject({
      host: 'github.com',
      owner: 'kullanici',
    });
  });

  it('ssh:// şemasını ve port numarasını ele alır', () => {
    expect(parseRemoteUrl('ssh://git@github.com:22/kullanici/depo.git')).toEqual({
      host: 'github.com',
      owner: 'kullanici',
      name: 'depo',
    });
  });

  it('sondaki eğik çizgiyi yok sayar', () => {
    expect(parseRemoteUrl('https://github.com/kullanici/depo/')).toMatchObject({ name: 'depo' });
  });

  it('alt grup içeren adreslerde sahibi tam yol olarak verir', () => {
    expect(parseRemoteUrl('git@gitlab.com:grup/altgrup/depo.git')).toEqual({
      host: 'gitlab.com',
      owner: 'grup/altgrup',
      name: 'depo',
    });
  });

  it('sunucu adını küçük harfe çevirir', () => {
    expect(parseRemoteUrl('git@GitHub.com:a/b.git')?.host).toBe('github.com');
  });

  it('yerel dosya yolunu depo kimliği saymaz', () => {
    expect(parseRemoteUrl('/home/kullanici/depolar/proje')).toBeNull();
  });

  it('eksik adreslerde null döner', () => {
    expect(parseRemoteUrl('')).toBeNull();
    expect(parseRemoteUrl('git@github.com:depo')).toBeNull();
  });
});

describe('isGithubHost', () => {
  it('yalnızca github.com’u tanır', () => {
    expect(isGithubHost('github.com')).toBe(true);
    expect(isGithubHost('www.github.com')).toBe(true);
    expect(isGithubHost('gitlab.com')).toBe(false);
    // Kurumsal GitHub Enterprise şimdilik desteklenmiyor; sessizce GitHub
    // sanmak yanlış API adresine istek atmaya yol açardı.
    expect(isGithubHost('github.sirket.com')).toBe(false);
  });
});
