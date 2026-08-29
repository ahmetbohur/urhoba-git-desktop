# Urhoba Git Desktop

Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.
Electron + React + TypeScript ile yazıldı; Linux, Windows ve macOS hedefleniyor.

## Şu an neler çalışıyor

**Depo yönetimi** — Yerel klasörden depo ekleme, SSH/HTTPS adresinden ilerleme
göstergeli klonlama, kenar çubuğunda arama yapılabilen depo listesi.

**Değişiklikler** — Hazırlanmış/hazırlanmamış dosya ayrımı, sözdizimi
renklendirmeli diff (tek sütun veya yan yana), tek tık veya toplu stage/unstage,
onaylı geri alma (discard), commit ve son commit'i düzeltme (amend).

**Satır bazlı hazırlama** — Diff üzerinde tek tek satır seçip yalnızca onları
hazırla, hazırlıktan çıkar ya da geri al. Shift ile aralık, tek tıkla bütün blok.
Aynı dosyadaki iki ayrı değişikliği ayrı commit'lere bölmek için.

**Stash** — Değişiklikleri saklama, listeleme, uygulama ve silme; takip
edilmeyen dosyalar isteğe bağlı dahil.

**Dallar** — Aranabilir dal menüsü, yerel ve uzak dallar, dal oluşturup doğrudan
geçme, upstream'e göre ahead/behind rozetleri, merge, rebase ve dal silme.
Kaydedilmemiş değişiklik geçişi engellerse hangi dosyaların engellediğini
söyler ve tek tıkla saklayıp geçmeyi önerir.

**Çakışma çözümü** — Merge ve rebase yarıda kaldığında sabit bir şerit durumu ve
iki çıkışı (devam et / iptal et) gösterir. Çakışan dosyada her blok için
"bizimki / onlarki / ikisi" seçimi; karmaşık durumlar için "editörde aç" kaçış
kapısı.

**Komut paleti ve kısayollar** — `Ctrl/Cmd + K` ile her şey tek arama kutusundan:
depo değiştir, dal değiştir, fetch/pull/push, stash. Kısayollar paletle aynı
listeden geldiği için gösterilen tuş her zaman çalışan tuş.

**Geçmiş** — Dallanma çizgileriyle commit grafiği, sanal kaydırmalı ve sayfa
sayfa yüklenen liste, commit detayı, commit içindeki her dosyanın diff'i.
Yazara, mesaja, dosya yoluna ve tarih aralığına göre filtreleme.

**Geçmişi değiştirme** — Commit'e sağ tıkla revert (geçmişi koruyan geri alma)
veya reset (soft / mixed / hard, her birinin ne yaptığı yazılı). SHA kopyalama
ve commit'i etiketleme aynı menüde.

**Etiketler** — Açıklamalı ve hafif etiket oluşturma, listeleme, silme ve uzak
sunucuya gönderme.

**Uzak sunucular** — Fetch, pull, push; upstream yoksa push sırasında otomatik
kurulum. Remote ekleme, adres düzenleme ve kaldırma. Zorlamalı gönderim yalnızca
`--force-with-lease` ile: uzak dalda görmediğin bir commit varsa git reddeder,
yani başkasının çalışması sessizce silinmez.

**Otomatik pull** — Depo bazlı, ayarlanabilir aralıkta arka planda çalışır.
Varsayılanları bilinçli olarak temkinli: çalışma dizini kirliyken dokunmaz ve
yalnızca fast-forward yapar, yani arka planda haberin olmadan merge commit'i
üretmez.

**GitHub** — Kişisel erişim jetonuyla bağlanma, açık pull request listesi, PR
dalına geçme (fork'tan gelenler dahil), mevcut daldan PR açma ve GitHub
depolarını arayıp klonlama.

**SSH kurulumu** — Sistemdeki anahtarları listeler, ssh-agent durumunu gösterir,
yeni ed25519 anahtarı üretir, public key'i panoya kopyalar ve GitHub bağlantısını
sınar. Uygulama hiçbir özel anahtarı kendi saklamaz.

**Git komut günlüğü** — Çalışan her git komutu, süresi ve hatası görünür.

## Geliştirme

```bash
npm install
npm start          # geliştirme modunda başlat
npm run typecheck  # tip denetimi
npm run lint       # ESLint
npm test           # birim + entegrasyon testleri
npm run package    # platform için paketle
npm run make       # kurulum dosyası üret
```

Gereksinim: Node.js 20+ ve sistemde kurulu `git`.

## Mimari

```
src/
├── main/        Electron ana süreci — git komutları, dosya izleme, ayarlar
│   ├── git/     git katmanı: client (süreç), parse ve patch (saf mantık), komutlar
│   ├── github/  API istemcisi, jeton saklama, PR işlemleri, sağlayıcı sözleşmesi
│   ├── ipc/     kanal işleyicileri
│   └── services/depo kayıtları, otomatik pull, SSH, dosya izleyici
├── preload/     güven sınırı — contextBridge ile window.urhoba
├── shared/      iki tarafın da kullandığı tipler ve IPC sözleşmesi
└── renderer/    React arayüzü
```

Üç kural mimarinin bel kemiği:

1. **Renderer'ın Node erişimi yok.** `contextIsolation`, `sandbox` açık,
   `nodeIntegration` kapalı. Tek geçiş yolu preload'daki tipli sözleşme; sözleşmede
   olmayan bir kanal ana sürece hiç ulaşmaz.

2. **Sözleşme tek kaynaktan.** Kanal adları `shared/ipc-channels.ts`, girdi
   şemaları ve çıktı tipleri `shared/ipc-contract.ts` içinde. İkisinin ayrılması
   derleme zamanında hata veriyor, dolayısıyla bir kanalı eklemeyi ya da
   işleyicisini yazmayı unutmak mümkün değil.

3. **Depo başına komut sırası.** Git aynı depoda eşzamanlı iki yazma komutunu
   kaldırmaz; arka plandaki otomatik pull kullanıcının commit'iyle çakışırsa
   `index.lock` hatası çıkar. Her deponun komutları tek bir sıraya diziliyor.

### Git çıktısını ayrıştırma

`main/git/parse.ts` içindeki fonksiyonlar saf: girdi metin, çıktı veri. Süreç
çalıştırma ve dosya sistemi erişimi dışarıda. Git'in çıktı biçimleri projenin en
kırılgan yeri olduğu için bu fonksiyonlar Electron'a hiç ihtiyaç duymadan test
ediliyor; ayrıca `__tests__/integration.test.ts` her çalıştığında geçici depolar
kurup komutları gerçekten çalıştırıyor.

### GitHub jetonu

Jeton yalnızca ana süreçte tutuluyor; arayüze hiçbir zaman gönderilmiyor ve
bütün API çağrıları oradan çıkıyor — bu sayede renderer'ın `connect-src` politikası
kapalı kalabiliyor. Diske yazarken Electron'un `safeStorage` API'si kullanılıyor,
yani işletim sisteminin anahtarlığıyla şifreleniyor. Anahtarlık yoksa jeton düz
metin olarak yazılmıyor: yalnızca o oturum boyunca bellekte tutuluyor ve durum
kullanıcıya söyleniyor.

OAuth cihaz akışı yerine kişisel erişim jetonu tercih edildi; cihaz akışı
uygulamaya ait bir OAuth App kaydı gerektiriyor.

### Commit grafiği

`renderer/lib/commit-graph.ts` şerit düzenini tek geçişte hesaplıyor: her an
açık olan şeritleri "hangi commit'i bekliyor" bilgisiyle tutup, sıradaki commit'i
bekleyen şeride oturtuyor. `git log --graph` çıktısını ayrıştırmak yerine bunu
yazdık, çünkü o çıktı ASCII sanatı ve tıklanabilir bir arayüz için zaten satır
satır koordinat gerekiyor. Her satır kendi SVG'sini çiziyor — liste
sanallaştırıldığı için tek büyük SVG mümkün değil.

### Yama üretimi

Satır bazlı hazırlama `main/git/patch.ts` içinde: seçilen satırlardan yeni bir
unified diff kurup `git apply` ile uyguluyoruz — `git add -p` ile aynı yöntem.
Üç mod tek mekanizmaya indirgendi. Hazırlama, hazırlanmamış diff'i olduğu gibi
index'e uygular; hazırlıktan çıkarma ve geri alma ise diff'i ters çevirip
uygular. Ters çevirme sayesinde seçim kuralı üçünde de aynı kalıyor: seçilmeyen
silme satırı bağlama dönüşür, seçilmeyen ekleme satırı yamadan tamamen çıkar.

## Klavye kısayolları

| Kısayol | Ne yapar |
| --- | --- |
| `Ctrl/Cmd + K` | Komut paleti |
| `Ctrl/Cmd + 1` / `2` / `3` | Değişiklikler / Geçmiş / Pull request'ler |
| `Ctrl/Cmd + Shift + F` | Fetch |
| `Ctrl/Cmd + Shift + L` | Pull |
| `Ctrl/Cmd + Shift + P` | Push |
| `Ctrl/Cmd + Shift + S` | Değişiklikleri sakla |
| `Ctrl/Cmd + Shift + G` | Git komut günlüğü |
| `Ctrl/Cmd + Enter` | Commit (mesaj alanındayken) |

## Yol haritası

Faz 0 (zemin), Faz 1 (MVP commit döngüsü), Faz 2 (günlük kullanım), Faz 3
(geçmiş ve grafik) ve Faz 4 (GitHub) tamamlandı; otomatik pull ile SSH yardımcısı
da planın dışında eklendi. Sıradaki adım:

- **Faz 5** — gömülü git (dugite), i18n, erişilebilirlik denetimi, uçtan uca
  testler, kod imzalama ve otomatik güncelleme
