# Mimari ve tasarım kararları

Bu belge Urhoba Git Desktop'ın nasıl çalıştığını ve neden öyle çalıştığını
anlatıyor. Kararların gerekçeleri burada duruyor: bir şeyin neden başka türlü
yapılmadığını bilmek, onu değiştirmesi gerekeni ileride yanlış yoldan
döndürüyor.

Kullanım ve kurulum için [README](../README.md) dosyasına bak.

## Özelliklerin arkasındaki kararlar

### İkili arama

Bisect diğer yarım kalmış işlemlerden farklı: çakışma çözülüp "devam et"
denmiyor, her adımda kullanıcıdan bir yargı isteniyor. Bu yüzden işlem şeridi o
durumda başka düğmeler gösteriyor.

Arama HEAD hatalı, seçilen commit sağlam sayılarak başlıyor. İkisini birden
vermek şart — git tek uçla aramaya başlamıyor ve kullanıcıya ikinci ucu ayrıca
sormak gereksiz bir adım olurdu.

İlerleme ve sonuç git'in düz metin çıktısından okunuyor (`git/bisect.ts`);
başka bir kaynağı yok. Suçlu bulunduğunda depo hâlâ bisect kipinde kalıyor:
kullanıcı sonucu görüp "bitir" demeden durum bozulmamalı.

### Commit imzaları

"İmzalı mı" tek bir evet/hayır değil: imza var ama anahtarına güvenilmiyor
olabilir, anahtar iptal edilmiş olabilir, ya da doğrulama yapılandırması eksik
olduğu için hiç denenememiş olabilir. Hepsini yeşil bir rozete indirmek yanlış
güven verir, o yüzden dört durum ayrı ayrı gösterilir.

Süresi dolmuş, iptal edilmiş ve güvenilmeyen anahtarlar tek başlıkta toplanır —
üçü de kullanıcıya aynı şeyi söylüyor: imza var ama ona dayanarak karar verme.

İmzasız commit'te hiçbir şey gösterilmez; imzasızlık çoğu depoda olağan ve her
satıra "imzasız" yazmak gürültüden başka bir şey değil.

### Alt modüller

Git alt modül durumunu porcelain çıktısında ayrı bir alanda bildiriyor: `S`
ardından sırasıyla commit değişikliği, değişmiş içerik ve takip edilmeyen
dosya. Üçü bağımsız ve kullanıcının yapacağı şey her birinde farklı, o yüzden
"değişti" demek yerine hangisi olduğu yazılıyor.

Kurulmamış alt modül uyarısı ayrı duruyor çünkü git bunu hiçbir yerde
söylemiyor: alt modüllü bir depo klonlandığında klasörler boş geliyor ve
kullanıcı "dosyalar nerede" diye kalıyor. Kurulum `--init --recursive` ile
yapılıyor; `--init` olmadan komut kurulmamış olanları sessizce atlıyor.

### Etkileşimli rebase

Git todo listesini bir dosyaya yazıp `GIT_SEQUENCE_EDITOR` ile editörü açıyor.
Editör yerine listeyi olduğu gibi kopyalayan küçük bir betik veriliyor:
kullanıcı arayüzde ne seçtiyse git de onu görüyor, arada metin editörü
açılmıyor. Betik dosya olarak yazılıyor çünkü değişken bir kabuk komutu gibi
çalıştırılıyor ve yollarda boşluk olabiliyor.

Liste üretimi ve doğrulaması saf fonksiyon (`git/rebase-todo.ts`): yanlış bir
todo listesi commit kaybettiriyor, o yüzden git'i hiç çalıştırmadan test
edilebilmesi gerekiyor.

Mesaj değişikliği git'in `reword` komutuyla yapılmıyor: o komut mesaj editörünü
açıyor ve hangi commit için açtığını dışarıdan anlamak güvenilir değil. Bunun
yerine todo listesine `pick` satırının ardından bir `exec git commit --amend
--file=…` satırı konuyor. Editör hiç açılmıyor, hangi mesajın hangi commit'e
gittiği satırın yerinden belli oluyor ve kaç commit'in mesajı değiştirilirse
değiştirilsin belirsizlik oluşmuyor.

### Satır içi fark

Değişen satır çiftleri kelime düzeyinde karşılaştırılır ve yalnızca değişen
bölümler vurgulanır (`renderer/lib/intraline.ts`). Karakter karakter
karşılaştırmak "function" ile "func" arasında dağınık parçalar üretiyor; kelime
bütünlüğü korununca vurgu okunabilir kalıyor.

İki koruma var. Satır çok uzunsa (küçültülmüş dosyalarda tek satır on binlerce
token olabiliyor) hesaplama hiç başlamıyor. Satırın neredeyse tamamı
değiştiyse de vurgu üretilmiyor: her yeri boyamak bilgi taşımıyor.

Eşleştirme yan yana görünümdekiyle aynı kuralı izliyor — arka arkaya gelen
silinenler ve eklenenler sırayla eşleniyor. İki görünümde farklı çiftler kurmak
aynı diff'i iki türlü göstermek olurdu.

### Çalışma ağaçları

Bir depo aynı anda birden fazla klasörde açık olabiliyor ve bir dal yalnızca bir
ağaçta bulunabiliyor. Uygulama bunu bilmediğinde kullanıcı o dala geçmeye
çalışıyor ve git `'dal' is already used by worktree at '/yol'` diyordu.

Dal menüsü artık diğer ağaçlarda tutulan dalları soluk gösteriyor ve altında
hangi klasörde açık olduklarını yazıyor. Engeli baştan söylemek, hatayı sonra
çevirmekten iyi.

Ana ağaç listeye girmiyor: kendi dalımıza "başka yerde açık" demek anlamsız
olurdu.

### Git LFS

LFS ile takip edilen bir dosyanın git'teki içeriği dosyanın kendisi değil, üç
satırlık bir işaretçi metni. Bu metin git için ikili değil, düz metin —
dolayısıyla ikili dosya yolundan hiç geçmiyor ve ham hâlinde ekranda sha256
satırları görünüyordu.

İki yerde ele alınıyor: diff'te işaretçi tanınıp "5.0 MB → 7.0 MB" özeti
gösteriliyor (özet diff'in kendisinden çıkarılıyor, ayrı bir git çağrısı
gerekmiyor), önizlemede ise dosyanın çizilmeye çalışılması yerine ne olduğu
yazılıyor.

Tanıma git-lfs kurulu olmasa da çalışıyor: kullanıcı LFS'siz bir makinede
depoyu açtığında dosyanın içeriği zaten işaretçinin kendisi.

### İkili dosya önizlemesi

Diff bir görüntüde hiçbir şey anlatmıyor; git yalnızca "Binary files differ"
diyor. Bu dosyalarda içeriğin kendisi gösteriliyor.

Yalnızca tarayıcı motorunun kendiliğinden çözebildiği biçimler destekleniyor.
Dönüştürme yapılmıyor: bir kod çözücü paketlemek uygulamayı büyütür ve
desteklenmeyen bir biçimde bozuk görüntü göstermektense hiç göstermemek daha
dürüst.

Hangi uzantıların önizlenebildiği yalnızca ana süreçte tanımlı. Arayüz o
listenin kopyasını tutmuyor — iki liste zamanla ayrışıyor ve kullanıcı
"destekleniyor ama açılmıyor" durumuyla karşılaşıyor. Karar veriye bakılarak
veriliyor: iki sürüm de boş dönerse dosya önizlenemiyor demek.

İçerik ana süreçte `git show` çıktısından ikili olarak okunuyor. Normal komut
yolu çıktıyı metne çeviriyor ve ikili içeriği bozuyor, bu yüzden süreç doğrudan
başlatılıp stdout buffer olarak toplanıyor. Arayüzde blob adresine çevriliyor:
`data:` adresi birkaç megabaytlık bir dosyada DOM'a devasa bir dize gömüyor ve
serbest bırakılamıyor.

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

## Genel yapı

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

### İşlevsel doğrulama

`e2e/functional.spec.ts` uygulamanın kendisini çalıştırıp her işlemi gerçek IPC
üzerinden yaptırıyor, sonucu sonra uygulamaya değil doğrudan git'e soruyor:
commit gerçekten atıldı mı, upstream gerçekten kuruldu mu, etiket çıplak depoya
gerçekten gitti mi. Uygulama "oldu" dediği için değil, depo değiştiği için
geçiyor.

Uzak sunucu gerektiren akışlar yerel bir çıplak depoyla deneniyor: ağa
çıkmadan push, pull ve upstream kurulumu aynı kod yolundan geçiyor.

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
