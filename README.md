# Urhoba Git Desktop

Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.
Electron + React + TypeScript ile yazıldı; Linux, Windows ve macOS hedefleniyor.

## Şu an neler çalışıyor

**Depo yönetimi** — Yerel klasörden depo ekleme, bir klasör ağacını tarayıp
içindeki bütün depoları toplu ekleme, SSH/HTTPS adresinden ilerleme göstergeli
klonlama.

**Düzen** — Depolar klasör yapısından çıkarılan gruplara ayrılır; gruplar
katlanabilir, elle yeniden adlandırılabilir ve depolar gruplar arasında
taşınabilir. Sık kullanılanlar üste sabitlenir, etiketlerle süzülür. Grup
başlığında o gruptaki kaydedilmemiş değişiklik sayısı görünür.

**Değişiklikler** — Hazırlanmış/hazırlanmamış dosya ayrımı, sözdizimi
renklendirmeli diff (tek sütun veya yan yana), tek tık veya toplu stage/unstage,
onaylı geri alma (discard), commit ve son commit'i düzeltme (amend).

**Satır bazlı hazırlama** — Diff üzerinde tek tek satır seçip yalnızca onları
hazırla, hazırlıktan çıkar ya da geri al. Shift ile aralık, tek tıkla bütün blok.
Aynı dosyadaki iki ayrı değişikliği ayrı commit'lere bölmek için.

**Stash** — Değişiklikleri saklama, listeleme, uygulama ve silme; takip
edilmeyen dosyalar isteğe bağlı dahil.

**Dallar** — Aranabilir dal menüsü, yerel ve uzak dallar, dal oluşturup doğrudan
geçme, upstream'e göre ahead/behind rozetleri, merge, rebase, yeniden adlandırma
ve silme.
Kaydedilmemiş değişiklik geçişi engellerse hangi dosyaların engellediğini
söyler ve tek tıkla saklayıp geçmeyi önerir.

**Çakışma çözümü** — Merge ve rebase yarıda kaldığında sabit bir şerit durumu ve
iki çıkışı (devam et / iptal et) gösterir. Çakışan dosyada her blok için
"bizimki / onlarki / ikisi" seçimi; karmaşık durumlar için "editörde aç" kaçış
kapısı.

**Türkçe ve İngilizce arayüz** — Ayarlardan tek tıkla değişir; tarih ve sayı
biçimleri ile uygulama menüsü de dile uyar.

**Komut paleti ve kısayollar** — `Ctrl/Cmd + K` ile her şey tek arama kutusundan:
depo değiştir, dal değiştir, fetch/pull/push, stash. Kısayollar paletle aynı
listeden geldiği için gösterilen tuş her zaman çalışan tuş.

**Geçmiş** — Dallanma çizgileriyle commit grafiği, sanal kaydırmalı ve sayfa
sayfa yüklenen liste, commit detayı, commit içindeki her dosyanın diff'i.
Yazara, mesaja, dosya yoluna ve tarih aralığına göre filtreleme.

**Geçmişi değiştirme** — Commit'e sağ tıkla revert (geçmişi koruyan geri alma),
reset (soft / mixed / hard, her birinin ne yaptığı yazılı) veya cherry-pick.
SHA kopyalama ve commit'i etiketleme aynı menüde.

**Satır geçmişi (blame)** — Bir dosyanın her satırını kimin, hangi commit'te
yazdığını gösterir. Aynı commit'ten gelen ardışık satırlarda bilgi
tekrarlanmaz; bir satıra tıklayınca o commit geçmişte açılır.

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

**GitHub'da yayınlama** — Uzak sunucusu olmayan bir depoyu tek pencereden
GitHub'da açar: hesap ya da organizasyon seçilir, ad klasör adından doldurulur,
görünürlük (özel/herkese açık) seçilir; depo oluşturulur, `origin` kurulur ve
mevcut dal gönderilir.

**Genel ve depo bazlı ayarlar** — Ayarlar penceresi iki sekme: *Genel* bütün
depoları, *Bu depo* yalnızca açık olanı etkiler. Arka planda fetch, otomatik pull
(aralık ve koşullar dahil), AI yardımı ve bulut AI izni her iki kapsamda da
ayarlanabilir; geçersiz kılınmayan ayar genel varsayılanı izlemeye devam eder.

**AI yardımı (isteğe bağlı)** — Commit mesajı, depo tanıtımı ve gruplama
önerisi; Ollama (yerel), OpenAI veya Claude ile. Varsayılan olarak kapalı ve
yerel.

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

```bash
npm run test:e2e    # paketleyip uçtan uca testleri çalıştırır
npm run test:all    # birim + uçtan uca
npm run test:ai     # AI akışlarını gerçek bir Ollama sunucusuyla dener
npm run screenshots # arayüz görüntüleri üretir (inceleme aracı)
```

`test:ai` ve `screenshots` varsayılan koşunun dışında: ilki makinede çalışan bir
Ollama sunucusu ve yüklü bir model gerektiriyor, ikincisi doğrulama yapmıyor.

Geliştirme için Node.js 20+ yeterli. **Uygulamayı kullanmak için sistemde git
kurulu olması gerekmiyor** — kendi git sürümünü taşıyor.

`npm run make` RPM'i yalnızca `rpmbuild` kuruluysa üretiyor; yoksa .deb üretimi
engellenmeden devam ediyor. Hedef seçerken Forge üreticiyi kendi adıyla arıyor
(`--targets deb`), paket adıyla değil: `--targets @electron-forge/maker-deb`
yapılandırmayı yok sayıp varsayılanlarla paket üretiyor.

Gömülü git'ten kullanılmayan parçalar paketleme sonrası çıkarılıyor
(`forge.config.ts` → `TRIMMED_GIT_PATHS`): HTTPS kimlik yöneticisi, arayüz
kütüphaneleri, git'in çevirileri ve gitweb. Kurulu boyut 431 MB'tan 329 MB'a,
`.deb` 135 MB'tan 101 MB'a iniyor.

### İkon

Kaynak logo `assets/icon-512.png`. Windows `.ico`, macOS `.icns` ve Linux `.png`
bekliyor; üçü de `python3 assets/make-icon.py` ile buradan türetiliyor, elle
tutulan tek dosya kaynak logo.

Betik `.ico`, `.icns` ve Linux paketlerinin hicolor teması için 16'dan 512'ye
kadar ayrı boyutlar üretiyor. Tek bir büyük ikonu masaüstüne ölçeklettirmek
küçük boyutlarda bulanık görünüyor.

Türetme sırasında dış beyaz saydama çevriliyor. Kaynağın arka planı opak beyaz
ve masaüstü ikonunda bu beyaz bir kare olarak görünüyor — özellikle macOS
dock'unda. Kenarlardan taşma yöntemi kullanılıyor, yani yalnızca dışarıya bağlı
olan beyaz siliniyor; yön tuşu ve düğmeler gövdenin içinde kaldığı için onlara
dokunulmuyor.

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

### Çeviri

Çeviri anahtarı olarak Türkçe metnin kendisi kullanılıyor: `t('Vazgeç')`. Böylece
her metin için ayrı bir anahtar icat etmek gerekmiyor ve sözlükte karşılığı
olmayan bir cümle boş dize yerine anlamlı Türkçe hâliyle görünüyor — eksik çeviri
bozuk arayüz üretmiyor.

`src/renderer/i18n/__tests__/coverage.test.ts` kaynak koddaki bütün `t()`
çağrılarını tarayıp sözlükte karşılığı olmayanları isim isim rapor ediyor; ayrıca
`{ad}` yer tutucularının çeviride korunduğunu doğruluyor. Yeni bir metin ekleyip
çevirisini unutmak bu yüzden testte kırmızı veriyor, üretimde sessiz kalmıyor.

### Genel ve depo ayarları

Bir depo için geçerli ayar, genel varsayılanların üstüne o deponun kendi seçtiği
alanların binmesiyle çözülür. Depo kaydında yalnızca **genel ayardan ayrılan
alanlar** tutulur: dokunulmamış bir alan genel ayarı izlemeye devam eder ve genel
ayar değiştiğinde o depo da kendiliğinden güncellenir.

Çözülmüş değeri kaydetseydik depo genel ayardan sessizce kopardı — kullanıcı
genel ayarı değiştirip "ama bu depo eskisi gibi davranıyor" derdi. Arayüzde her
depo ayarı üç durumlu: *Genel (açık/kapalı)*, *Açık*, *Kapalı*.

İki kapsam ayrı sekmelerde. Tek bir listede alt alta dizildiklerinde aynı adı
taşıyan ayarlar ("Otomatik pull" hem genelde hem depoda) iki kez geçiyor ve
hangisinin neyi etkilediği ancak bölüm başlığı okunarak anlaşılıyordu.

### GitHub girişi

İki yol var: **cihaz akışı** (önerilen) ve kişisel erişim jetonu.

Cihaz akışı seçildi çünkü masaüstü uygulaması istemci sırrı saklayamaz — paketi
açan herkes onu çıkarabilir. Klasik "authorization code" akışı kodu token'a
çevirirken sırrı ister ve GitHub'ın OAuth App'leri PKCE desteklemez, yani sırrı
atlamanın yolu yoktur. Cihaz akışı yalnızca herkese açık olması normal olan bir
Client ID ister; `URHOBA_GITHUB_CLIENT_ID` ile ezilebilir.

Jeton girişi duruyor: GitHub Enterprise kullananların ve ince ayarlı jeton
tercih edenlerin tek yolu o.

Uygulamaya ait OAuth App'te **"Expire user access tokens" kapalı olmalı**. Açık
olursa token sekiz saatte dolar ve yenilemek yine istemci sırrı ister.

Çıkış yapmak yereldir: yetkiyi GitHub tarafında iptal etmek
(`DELETE /applications/{id}/grant`) sır ister. Uygulama jetonu siler, kullanıcıya
da github.com/settings/applications bağlantısı gösterilir.

### GitHub'da yayınlama

Sıra şu: depo oluştur → `origin` ekle → dalı upstream kurarak gönder. Ön koşullar
(giriş yapılmış olması, token yetkisi, uzak sunucunun olmaması, en az bir commit,
ayrık HEAD olmaması) **oluşturmadan önce** kontrol ediliyor; GitHub'ın 403/422
yanıtını alıp sonra açıklamak kullanıcıyı yarım kalmış bir durumda bırakıyordu.

Depo `auto_init: false` ile açılıyor. GitHub depoyu bir README ile açsaydı uzak
dalda bizde olmayan bir commit olurdu ve ilk push "fetch first" ile reddedilirdi.

Remote adresi SSH. Uygulama git'i `GIT_TERMINAL_PROMPT=0` ile çalıştırdığı için
HTTPS'te parola sorulamıyor ve push sessizce başarısız oluyor.

Oluşturma başarılı olup push başarısız olursa **depo silinmiyor**: silme hem ayrı
bir yetki istiyor hem de kullanıcının az önce oluşturduğu şeyi yok etmek demek.
Durum olduğu gibi bildiriliyor ve kullanıcı push düğmesiyle devam edebiliyor.

Depo adı klasör adından türetilirken Türkçe harfler ASCII karşılıklarına
çevriliyor. GitHub yalnızca `A-Za-z0-9._-` kabul ettiği için doğrudan tireye
çevirmek `şablon` adını `-ablon` yapıyordu.

### AI ve gizlilik

AI varsayılan olarak kapalı; açılmadan hiçbir istek gitmez. Varsayılan sağlayıcı
**Ollama**, yani model kullanıcının makinesinde çalışır ve kod dışarı çıkmaz.

AI'ın açık olması ve buluta kod gönderilmesi ikisi de genel/depo ayarı: genel
varsayılan bütün depolar için geçerli, bir depo ikisini de kendisi için
değiştirebiliyor. Böylece AI çoğu depoda açıkken tek bir depoda kapatılabiliyor
— müşteri kodu, özel depo, imzalı sözleşme.

Sağlayıcı, model ve API anahtarı ise hesap düzeyinde. Depo başına ayrı model
tutmak anahtar yönetimini de ikiye bölerdi; kullanıcı aynı anahtarı her depoda
yeniden girerdi.

Gruplama önerisi bütün depoları birden ilgilendirdiği için genel ayara bakar ve
yalnızca depo adlarını gönderir; kod göndermediği için bulut izni aramaz.

Depo tanıtımı önerisi README'yi (ilk 6.000 karakter) ve üst düzey dosya
listesini gönderir. Liste `git ls-tree` ile alınır, dosya sistemi taranmaz:
takip edilmeyen `node_modules` gibi klasörler böylece hiç görünmez. README yoksa
yalnızca dosya adları gider ve kullanıcıya bu söylenir.

Büyük diff'ler katman katman daraltılır (`ai/diff-budget.ts`): tam diff, dosya
başına ilk 100 satır, yalnızca değişen satırlar, dosya listesi. Ham diff'i sondan
kesmek modele yarım kalmış bir değişiklik gösterip yanlış özet ürettiriyor. Hangi
katmanın kullanıldığı kullanıcıya bildirilir.

API anahtarları GitHub jetonunda olduğu gibi ana süreçte, `safeStorage` ile
işletim sistemi anahtarlığında şifreli tutulur ve arayüze hiç aktarılmaz.

Ollama isteklerinde düşünme modu kapatılır (`think: false`). Düşünen modellerde
(gemma4, qwen3 gibi) üretilen token'ların tamamı akıl yürütme bölümüne gidiyor ve
görünür yanıt boş dönüyor — model 400 token harcıyor, kullanıcı "boş yanıt"
hatası alıyordu. Bize gereken tek satırlık bir commit başlığı, uzun uzun akıl
yürütme değil.

### Gömülü git

Uygulama git'i kendisi taşıyor (dugite). Bunun iki faydası var: kullanıcının
makinesinde git kurulu olmasa da çalışıyor ve herkeste aynı sürüm çalıştığı için
"bende oluyor sende olmuyor" sınıfı hatalar ortadan kalkıyor.

Git ikilisi asar arşivinin dışında, `resources/git` altında duruyor;
çalıştırılabilir dosyalar arşiv içinden çalıştırılamaz. Yolu ana süreçte
`LOCAL_GIT_DIRECTORY` ile bildiriyoruz ve üç senaryoyu da deniyoruz: paketlenmiş
uygulama, `npm start` ile geliştirme, ve uçtan uca testler. Bulunamazsa sistemdeki
git'e düşülüyor ve bu durum tanılama panelinde görünüyor.

Alt sürecin ortamı özenle kuruluyor: editör ve askpass değişkenleri siliniyor,
`GIT_TERMINAL_PROMPT=0` ve SSH tarafında `BatchMode=yes` ayarlanıyor. Bunlar
olmadan bir kimlik istemi arka plandaki otomatik pull'u sonsuza kadar
askıda bırakabilir.

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

## Dağıtım

`npm run make` üç platform için kurulum dosyası üretir: Windows'ta Squirrel,
Linux'ta `.deb` ve `.rpm`, macOS'ta `.zip`. Gömülü git yüzünden paket ~430 MB
olur.

**Kod imzalama henüz yapılandırılmadı** ve bu bilinçli bir bekleme: imzasız
kurulumda Windows SmartScreen ile macOS Gatekeeper uygulamayı engeller, ama ikisi
de ücretli sertifika gerektiriyor (Apple Developer üyeliği yıllık, Windows kod
imzalama sertifikası ayrı). Bütçe ayrıldığında `forge.config.ts` içinde
`osxSign`/`osxNotarize` ve Squirrel'ın `certificateFile` alanları doldurulmalı.
O zamana kadar Linux paketleri ve imzasız taşınabilir sürüm sorunsuz dağıtılabilir.

**Otomatik güncelleme** hazır ama uykuda: `package.json` içine `repository`
alanı eklenip GitHub Releases'e yayın yapıldığında kendiliğinden devreye giriyor.
Farklı bir sunucu kullanılacaksa `URHOBA_UPDATE_FEED` ortam değişkeni yeterli.
Yayın kaynağı tanımlı değilken güncelleme hiç aranmıyor — kullanıcıya
açıklayamayacağımız ağ hataları göstermemek için.

## Yol haritası

Faz 0–5 tamamlandı. Faz 5'te gömülü git'e geçildi, tanılama ve günlük altyapısı,
uygulama ikonu, azaltılmış hareket desteği, uçtan uca testler ve dağıtım
yapılandırması eklendi.

Planın tamamı kodlandı. Kalanlar:

- **Kod imzalama** — ücretli sertifika bekliyor (yukarıya bakın)
- **GitHub akışları** — PR listeleme ve oluşturma gerçek bir jetonla denenmedi
- **Büyük depo profillemesi** — sayfalama ve sanallaştırma var ama 50.000
  commit'lik bir depoda ölçüm yapılmadı
