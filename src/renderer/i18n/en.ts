/**
 * İngilizce sözlük.
 *
 * Anahtarlar arayüzdeki Türkçe metinlerin kendisi. Bir anahtar burada yoksa
 * arayüz Türkçe metni gösterir — yani eksik çeviri bozuk arayüz üretmiyor,
 * yalnızca o cümle çevrilmemiş kalıyor.
 *
 * `{ad}` biçimindeki yer tutucular korunmak zorunda; çeviride cümle sırası
 * değişebilir ama yer tutucunun adı aynı kalmalı.
 */
export const en: Record<string, string> = {
  // --- Genel eylemler ---
  'Vazgeç': 'Cancel',
  'Kapat': 'Close',
  'Kaydet': 'Save',
  'Ekle': 'Add',
  'Sil': 'Delete',
  'Seç': 'Choose',
  'Aç': 'Open',
  'Açık': 'Light',
  'Koyu': 'Dark',
  'Sistem': 'System',
  'Kopyala': 'Copy',
  'Gönder': 'Push',
  'Uygula': 'Apply',
  'Uygula ve sil': 'Apply and drop',
  'Temizle': 'Clear',
  'Tekrar dene': 'Try again',
  'Tazele': 'Refresh',
  'Devam et': 'Continue',
  'İptal et': 'Abort',
  'Geri al': 'Discard',
  'Hazırla': 'Stage',
  'Hazırlıktan çıkar': 'Unstage',
  'Üret': 'Generate',
  'Bağlan': 'Connect',
  'Etiketle': 'Create tag',
  'Sıfırla': 'Reset',
  'Sakla': 'Stash',
  'Klonla': 'Clone',
  'Bu işlem geri alınamaz.': 'This cannot be undone.',
  'Bildirimi kapat': 'Dismiss notification',
  'İçeriğe atla': 'Skip to content',

  // --- Kenar çubuğu ve depolar ---
  'Depolar': 'Repositories',
  'Sabitlenenler': 'Pinned',
  'AI yardımı': 'AI assistance',
  'Commit’leri yeniden düzenle': 'Reorder commits',
  'Mesaj': 'Message',
  'Yalnızca commit mesajı değişsin.': 'Change only the commit message.',
  'Yeni commit mesajı': 'New commit message',
  'Sırayı değiştir, birleştir ya da at. Geçmiş yeniden yazılır.':
    'Reorder, combine or drop them. History is rewritten.',
  'Bu commit’ten sonrasını düzenle…': 'Edit the commits after this one…',
  'Yukarı taşı': 'Move up',
  'Aşağı taşı': 'Move down',
  'Koru': 'Keep',
  'Birleştir': 'Combine',
  'Kaynat': 'Fold in',
  'At': 'Drop',
  'Olduğu gibi kalsın.': 'Leave it as it is.',
  'Bir öncekine katılsın, mesajlar birleşsin.':
    'Join it into the previous one and merge the messages.',
  'Bir öncekine katılsın, mesajı atılsın.':
    'Join it into the previous one and discard its message.',
  'Bu commit tamamen çıkarılsın.': 'Remove this commit entirely.',
  'En alttaki en eski commit. “Birleştir” ve “kaynat” bir alttakine katar.':
    'The bottom one is the oldest. “Combine” and “fold in” join into the one below.',
  'Bu commit’ler yeniden yazılacak. Uzak sunucuya gönderilmişlerse zorlamalı gönderim gerekir.':
    'These commits will be rewritten. If they were pushed, a force push will be needed.',
  'Kaydedilmemiş değişiklikler var. Önce commit’le ya da sakla.':
    'There are uncommitted changes. Commit or stash them first.',
  'Yarım kalmış bir işlem var. Önce onu bitir.':
    'An operation is in progress. Finish it first.',
  'Ayrık HEAD durumunda yeniden düzenleme yapılamaz.':
    'Cannot reorder while in detached HEAD.',
  'Bütün commit’ler atılıyor; en az biri kalmalı.':
    'Every commit is being dropped; at least one must remain.',
  'En eski commit bir öncekiyle birleştirilemez; onu “koru” yap.':
    'The oldest commit cannot be combined into a previous one; set it to “keep”.',
  'Yeniden düzenleme': 'Reordering',
  'Düzenlenemedi': 'Could not reorder',
  'HEAD geçmişi': 'HEAD history',
  'HEAD geçmişi (reflog)': 'HEAD history (reflog)',
  'Geçmişten silinmiş commit’lere de buradan dönebilirsin.':
    'You can also return to commits that are gone from the history.',
  'Kayıt yok': 'No entries',
  'Bu depoda henüz HEAD hareketi kaydedilmemiş.':
    'No HEAD movement has been recorded in this repository yet.',
  'Bu noktaya dön': 'Return to this point',
  'Geri dönülemedi': 'Could not return',
  '{sha} commit’ine dönülecek. Dosyalara ne olacağını seç:':
    'Returning to commit {sha}. Choose what happens to your files:',
  '{count} dosyadaki kaydedilmemiş değişiklik silinecek.':
    'Uncommitted changes in {count} files will be deleted.',
  'Değişiklikler hazırlıkta kalır.': 'Changes stay staged.',
  'Değişiklikler hazırlık dışında kalır.': 'Changes stay unstaged.',
  'Kaydedilmemiş her şey silinir.': 'Everything uncommitted is deleted.',
  'Önce': 'Before',
  'Sonra': 'After',
  'Yok': 'None',
  'Geliştirici: Urhoba': 'Developer: Urhoba',
  'Bu yazı tipiyle yazılmış örnek metin.': 'Sample text set in this font.',
  'GitHub ile giriş yap': 'Sign in with GitHub',
  'GitHub’a giriş yap': 'Sign in to GitHub',
  'Kişisel erişim jetonu kullan': 'Use a personal access token',
  'Geri dön': 'Go back',
  'Kodu kopyala': 'Copy the code',
  'Onaylaman bekleniyor…': 'Waiting for your approval…',
  'Tarayıcıda açılan sayfaya bu kodu gir:': 'Enter this code on the page that opened in your browser:',
  'Sayfa açılmadıysa buradan aç': 'Open it here if the page did not open',
  'Yetkiyi GitHub’dan da kaldır': 'Also revoke the authorisation on GitHub',
  '“GitHub ile giriş yap”a bas; tarayıcı açılır.':
    'Press “Sign in with GitHub”; your browser opens.',
  'Ekranda çıkan kodu gir ve izni onayla.': 'Enter the code shown and approve the access.',
  'Pull request’ler, depo yayınlama ve klonlama için GitHub hesabına bağlan.':
    'Connect your GitHub account for pull requests, publishing and cloning.',
  'AI ile açıklama öner': 'Suggest a description with AI',
  'README’den {count} karakter gönderildi.': '{count} characters from the README were sent.',
  'README bulunamadı; yalnızca dosya listesi gönderildi.':
    'No README found; only the file list was sent.',
  'GitHub’da yayınla': 'Publish on GitHub',
  'Depo GitHub’da oluşturulur, origin kurulur ve mevcut dal gönderilir.':
    'The repository is created on GitHub, origin is set up and the current branch is pushed.',
  'Hesap': 'Account',
  'Depo adı': 'Repository name',
  'GitHub yalnızca harf, rakam, nokta, alt çizgi ve tire kabul ediyor.':
    'GitHub accepts only letters, digits, dots, underscores and hyphens.',
  'İsteğe bağlı.': 'Optional.',
  'Görünürlük': 'Visibility',
  'Özel': 'Private',
  'Yalnızca sen ve davet ettiklerin görebilir.': 'Only you and the people you invite can see it.',
  'Herkese açık': 'Public',
  'GitHub’daki herkes görebilir.': 'Anyone on GitHub can see it.',
  'Yayınla': 'Publish',
  'Yayınlandı': 'Published',
  'Yayınlanamadı': 'Could not publish',
  'Kısmen tamamlandı': 'Partly completed',
  'Bir depo adı yaz.': 'Type a repository name.',
  'Önce GitHub hesabına giriş yapmalısın.': 'You need to sign in to GitHub first.',
  'Depoda hiç commit yok. Önce ilk commit’ini at.':
    'The repository has no commits. Make your first commit first.',
  'Ayrık HEAD durumunda yayınlanamaz. Önce bir dala geç.':
    'Cannot publish while in detached HEAD. Switch to a branch first.',
  '{branch} dalı gönderilecek ve origin şu adrese kurulacak:':
    'The {branch} branch will be pushed and origin will point to:',
  'Depoyu GitHub’da oluştur ve gönder': 'Create the repository on GitHub and push it',
  'Ayar kapsamı': 'Settings scope',
  'Genel': 'General',
  'Bu depo': 'This repository',
  'Bu depoya özel': 'Specific to this repository',
  'Uzak sunucu davranışı': 'Remote behaviour',
  'Genel ayara dön': 'Back to the general setting',
  'Bu depo için ayrı ayarlandı; genel varsayılanı izlemiyor.':
    'Set separately for this repository; it does not follow the general default.',
  'Genel varsayılanı izliyor. Burada bir değişiklik yaparsan yalnızca bu depoya özel olur.':
    'Following the general default. A change here applies to this repository only.',
  '“Genel” seçili kaldığı sürece ayar genel varsayılanı izler; genel ayarı değiştirdiğinde bu depo da güncellenir.':
    'While “General” stays selected the setting follows the general default; changing that default updates this repository too.',
  'Kapalıyken commit mesajı önerisi yalnızca yerel modelle çalışır.':
    'When off, commit message suggestions run on the local model only.',
  'AI sağlayıcısı': 'AI provider',
  'AI yardımı kapalı. Sağlayıcı ayarları açıldığında görünür.':
    'AI assistance is off. Provider settings appear once it is on.',
  'Bu depoda commit mesajı önerisi kullanılabilsin mi.':
    'Whether commit message suggestions are available in this repository.',
  'Sağlayıcı, model ve anahtar bütün depolar için ortak. AI’ın açık olması yukarıdaki bölümlerden ayarlanıyor.':
    'Provider, model and key are shared by all repositories. Turning AI on is set in the sections above.',
  'Commit mesajı ve gruplama önerileri. Varsayılan olarak kapalı.':
    'Commit message and grouping suggestions. Off by default.',
  'Yerel — kod makineden çıkmaz': 'Local — code never leaves your machine',
  'Bulut — kod dışarı gider': 'Cloud — code is sent out',
  'Ollama adresi': 'Ollama address',
  'Ollama kurulu değilse ollama.com adresinden indirebilirsin.':
    'If Ollama is not installed you can get it from ollama.com.',
  'API anahtarı': 'API key',
  'Anahtar ana süreçte, işletim sistemi anahtarlığında şifreli tutulur.':
    'The key stays in the main process, encrypted with the system keychain.',
  'Kayıtlı — değiştirmek için yaz': 'Saved — type to replace',
  'Anahtar kaydedildi': 'Key saved',
  'Anahtar kaydedilemedi': 'Could not save key',
  'Anahtarlık bulunamadı; anahtar yalnızca bu oturumda geçerli.':
    'No keychain found; the key is valid for this session only.',
  'Model': 'Model',
  'Model bulunamadı. Sağlayıcı ayarlarını kontrol et.':
    'No models found. Check the provider settings.',
  'Bu deponun kodu buluta gönderilebilsin': 'Allow sending this repository’s code to the cloud',
  'Commit mesajı önerisi için diff gönderilir. Her depo için ayrı ayrı açılır.':
    'The diff is sent for commit message suggestions. Enabled per repository.',
  'İşletim sisteminde anahtarlık yok; anahtar diske yazılmadı.':
    'No system keychain; the key was not written to disk.',
  'kod makineden çıkmıyor': 'code stays on your machine',
  'AI ile commit mesajı öner': 'Suggest a commit message with AI',
  'Öner': 'Suggest',
  'Öneri hazır': 'Suggestion ready',
  'Öneri alınamadı': 'Could not get a suggestion',
  '{count} karakterlik diff gönderildi.': 'Sent {count} characters of diff.',
  'AI ile grupla…': 'Group with AI…',
  'AI ile grupla': 'Group with AI',
  'Yalnızca depo adları gönderilir': 'Only repository names are sent',
  'Yalnızca depo adları gönderilir; kod gönderilmez.':
    'Only repository names are sent; no code leaves your machine.',
  'AI yardımı kapalı. Ayarlardan açman gerekiyor.':
    'AI assistance is off. Turn it on in settings.',
  'Depo adlarına bakıp anlamlı kümeler önerir. Klasör yapısının yakalayamadığı benzerlikleri bulur.':
    'Looks at repository names and suggests meaningful clusters — the ones your folder layout cannot capture.',
  'yerel model — veri dışarı çıkmıyor': 'local model — nothing leaves your machine',
  'Öneri iste': 'Ask for suggestions',
  'Model anlamlı bir grup öneremedi.': 'The model could not suggest any grouping.',
  '{count} grup önerildi': '{count} groups suggested',
  '{count} grubu uygula': 'Apply {count} groups',
  '{count} grup uygulandı': 'Applied {count} groups',
  'Gruplar uygulanamadı': 'Could not apply groups',
  'Diff büyük olduğu için dosya başına ilk 100 satır gönderildi.':
    'The diff was large, so only the first 100 lines per file were sent.',
  'Gruplanmamış': 'Ungrouped',
  'Üste sabitle': 'Pin to top',
  'Sabitlemeyi kaldır': 'Unpin',
  'Etiketler…': 'Tags…',
  'Gruba taşı': 'Move to group',
  'Gruptan çıkar': 'Remove from group',
  'Grubu yeniden adlandır': 'Rename group',
  'Grup adı değiştirilemedi': 'Could not rename group',
  'Etiket süzgecini temizle': 'Clear tag filter',
  'Etiketler kaydedilemedi': 'Could not save tags',
  'Bu depoda': 'On this repository',
  'Henüz etiket yok.': 'No tags yet.',
  'Yeni etiket': 'New tag',
  'örn. aktif': 'e.g. active',
  'Hızlı ekle': 'Quick add',
  '{tag} etiketini kaldır': 'Remove tag {tag}',
  'Depolarda ara': 'Search repositories',
  'Henüz depo yok': 'No repositories yet',
  'Eşleşen depo yok': 'No matching repository',
  'Eşleşen depo yok.': 'No matching repository.',
  'Farklı bir arama dene.': 'Try a different search.',
  'Diskteki bir klasörü ekle ya da uzak bir depoyu klonla.':
    'Add a folder from disk or clone a remote repository.',
  'Klasörü aç': 'Open folder',
  'Listeden çıkar': 'Remove from list',
  'Depo eklenemedi': 'Could not add repository',
  'Otomatik pull açık': 'Auto pull is on',
  '{name} için işlemler': 'Actions for {name}',
  '{name} deposunu aç': 'Open {name}',
  'Depo ekle…': 'Add repository…',
  'Klasör ekle…': 'Add folder…',
  'Tek bir depo seç': 'Pick a single repository',
  'Klasörü tara…': 'Scan folder…',
  'İçindeki bütün depoları bul': 'Find every repository inside',
  'Depo klonla…': 'Clone repository…',
  'Uzak sunucudan indir': 'Download from a remote',
  'Klasörü tara': 'Scan folder',
  'Seçtiğin klasördeki bütün git depolarını bulur ve tek seferde ekler.':
    'Finds every git repository in the folder you choose and adds them in one go.',
  'Henüz klasör seçilmedi': 'No folder chosen yet',
  'Klasör seç': 'Choose folder',
  'Başka klasör': 'Different folder',
  'Klasör taranıyor…': 'Scanning folder…',
  'Klasör taranamadı': 'Could not scan folder',
  '{count} depo bulundu': 'Found {count} repositories',
  'Tümünü seç': 'Select all',
  'Seçimi kaldır': 'Deselect all',
  'Depo bulunamadı': 'No repositories found',
  'Bu klasörde dört seviye derinliğe kadar git deposu yok.':
    'No git repository within four levels of this folder.',
  'zaten ekli': 'already added',
  '{count} depoyu ekle': 'Add {count} repositories',
  'Depo seç': 'Select repositories',
  '{count} depo eklendi': 'Added {count} repositories',
  'Depolar eklenemedi': 'Could not add repositories',
  'Eklenecek yeni depo bulunamadı': 'No new repositories to add',
  'Bir klasör ekle, proje klasörünü tara ya da uzak bir depoyu klonla.':
    'Add a folder, scan your projects folder, or clone a remote repository.',
  'Bir klasördeki bütün depoları bulup toplu ekler':
    'Finds every repository in a folder and adds them at once',
  'Depo görünümleri': 'Repository views',
  'Başlamak için soldan bir depo ekle ya da uzak bir depoyu klonla. Komut paletini Ctrl/Cmd + K ile açabilirsin.':
    'To get started, add a repository from the left or clone a remote one. Press Ctrl/Cmd + K for the command palette.',

  // --- Sekmeler ---
  'Değişiklikler': 'Changes',
  'Geçmiş': 'History',
  'Pull request’ler': 'Pull requests',

  // --- Üst çubuk ---
  'Fetch': 'Fetch',
  'Pull': 'Pull',
  'Push': 'Push',
  'Fetch tamamlandı': 'Fetch complete',
  'Fetch başarısız': 'Fetch failed',
  'Pull başarısız': 'Pull failed',
  'Push tamamlandı': 'Push complete',
  'Push başarısız': 'Push failed',
  'Push seçenekleri': 'Push options',
  'Zorlamalı push': 'Force push',
  'Zorlamalı gönder': 'Force push',
  'Geçmişi yeniden yazdıysan gerekir': 'Needed if you rewrote history',
  'Uzak dalda {count} yeni commit var.': 'The remote branch has {count} new commits.',
  'Yeni commit yok.': 'No new commits.',
  'Uzak dalda senin görmediğin commit’ler varsa önce fetch et.':
    'If the remote branch has commits you have not seen, fetch first.',
  'Uzak daldaki commit’lerin üzerine yazılacak. Bu yalnızca geçmişi yeniden yazdıysan (amend, rebase, reset) gerekir.':
    'Commits on the remote branch will be overwritten. You only need this after rewriting history (amend, rebase, reset).',
  'ayrık HEAD': 'detached HEAD',
  'Birleştirme sürüyor': 'Merge in progress',
  'Rebase sürüyor': 'Rebase in progress',
  'Cherry-pick sürüyor': 'Cherry-pick in progress',
  'Revert sürüyor': 'Revert in progress',
  'Bisect sürüyor': 'Bisect in progress',
  'GitHub bağlantısı': 'GitHub connection',
  'Etiketler': 'Tags',
  'SSH kurulumu': 'SSH setup',
  'Git komut günlüğü': 'Git command log',
  'Ayarlar': 'Settings',

  // --- Dallar ---
  'Yerel': 'Local',
  'Uzak': 'Remote',
  'Dal ara': 'Search branches',
  'Dal ara veya yeni dal adı yaz': 'Search branches or type a new name',
  'Eşleşen dal yok.': 'No matching branch.',
  'commit yok': 'no commits',
  'dalını oluştur ve geç': 'and switch to it',
  'dalını buraya birleştir': 'into this branch',
  'Dalı sil': 'Delete branch',
  'Yeniden adlandır…': 'Rename…',
  'Yeniden adlandır': 'Rename',
  'Dalı yeniden adlandır': 'Rename branch',
  'Yeni ad': 'New name',
  'Dal yeniden adlandırma': 'Branch rename',
  'Dal yeniden adlandırılamadı': 'Could not rename branch',
  'Uzak sunucudaki dalı da taşı': 'Move the remote branch too',
  'Yeni ad gönderilir, eski dal silinir. Bu dalı takip eden başkaları varsa onların bağlantısı kopar.':
    'The new name is pushed and the old branch is deleted. Anyone tracking the old branch loses their link.',
  'Uzak sunucuda dal eski adıyla kalacak; istediğinde push ederek yeni adı gönderebilirsin.':
    'The remote branch keeps its old name; you can push the new one whenever you want.',
  'Dal değiştirilemedi': 'Could not switch branch',
  'Dal değiştirme': 'Switch branch',
  'Dal silinemedi': 'Could not delete branch',
  'Birleştirilemedi': 'Could not merge',
  'Birleştirme': 'Merge',
  'Rebase': 'Rebase',
  'Rebase yapılamadı': 'Could not rebase',
  'Saklandı ve geçildi': 'Stashed and switched',
  'Geçiş yapılamadı': 'Could not switch',
  'Sakla ve geç': 'Stash and switch',
  'Kaydedilmemiş değişiklikler engelliyor': 'Uncommitted changes are in the way',
  'Birleştirilmemiş commit’ler varsa silmeyi zorlaman gerekir.':
    'If it has unmerged commits you will need to force the deletion.',
  '{name} dalı silindi': 'Deleted branch {name}',
  '{name} dalı oluşturuldu': 'Created branch {name}',
  'Dal oluşturulamadı': 'Could not create branch',
  '{name} dalına geçmeden önce': 'before switching to {name}',
  '{branch} dalına geç': 'Switch to {branch}',

  // --- Değişiklikler ---
  'Değişiklik yok': 'No changes',
  '{count} değişiklik': '{count} changes',
  'Tümünü hazırla': 'Stage all',
  'Tümünü çıkar': 'Unstage all',
  'Çakışan dosyalar': 'Conflicted files',
  'Commit için hazır': 'Staged for commit',
  'Hazırlanmamış değişiklikler': 'Unstaged changes',
  'Commit için hazırla': 'Stage for commit',
  'Sistemde aç': 'Open in system',
  '.gitignore’a ekle': 'Add to .gitignore',
  'Değişiklikleri geri al': 'Discard changes',
  'Çalışma dizini temiz': 'Working tree is clean',
  'Dosyaları düzenlediğinde değişiklikler burada belirir.':
    'Changes appear here as you edit files.',
  'Çalışma dizini': 'Working tree',
  'Hazırlanmış hâli': 'Staged version',
  '{path} dosyasını hazırla': 'Stage {path}',
  '{path} dosyasını hazırlıktan çıkar': 'Unstage {path}',
  'dosyasındaki kaydedilmemiş değişiklikler kalıcı olarak silinecek. Bu işlem geri alınamaz.':
    'will lose its uncommitted changes permanently. This cannot be undone.',
  '{count} dosyanın değişiklikleri geri alındı': 'Discarded changes in {count} files',
  '{path} .gitignore’a eklendi': 'Added {path} to .gitignore',
  'Hazırlanamadı': 'Could not stage',
  'Çıkarılamadı': 'Could not unstage',
  'Geri alınamadı': 'Could not discard',
  'Eklenemedi': 'Could not add',
  'Dosya açılamadı': 'Could not open file',
  'Satırlar uygulanamadı': 'Could not apply lines',
  'Seçili satırlar hazırlandı': 'Selected lines staged',
  'Seçili satırlar hazırlıktan çıkarıldı': 'Selected lines unstaged',
  'Seçili satırlar geri alındı': 'Selected lines discarded',

  // --- Dosya durumları ---
  'eklendi': 'added',
  'değişti': 'modified',
  'silindi': 'deleted',
  'yeniden adlandırıldı': 'renamed',
  'kopyalandı': 'copied',
  'takip edilmiyor': 'untracked',
  'çakışma': 'conflict',
  'tür değişti': 'type changed',

  // --- Commit kutusu ---
  'Özet (zorunlu)': 'Summary (required)',
  'Son commit mesajını düzenle': 'Edit the last commit message',
  'Commit özeti': 'Commit summary',
  'Açıklama (isteğe bağlı)': 'Description (optional)',
  'Commit açıklaması': 'Commit description',
  'Son commit’i düzelt': 'Amend last commit',
  'Commit’i düzelt': 'Amend commit',
  'Commit’le': 'Commit',
  '{count} dosyayı commit’le': 'Commit {count} files',
  'Commit oluşturuldu': 'Commit created',
  'Commit başarısız': 'Commit failed',

  // --- Diff ---
  'Dosya seçilmedi': 'No file selected',
  'Değişiklikleri görmek için soldaki listeden bir dosyaya tıkla.':
    'Click a file in the list to see its changes.',
  'Yan yana göster': 'Side by side',
  'Tek sütuna geç': 'Single column',
  '{count} satır seçili': '{count} lines selected',
  'Seçimi temizle': 'Clear selection',
  'Bu bloğu seç': 'Select this hunk',
  'İkili dosya': 'Binary file',
  'Bu dosyanın içeriği metin olarak karşılaştırılamıyor.':
    'This file cannot be compared as text.',
  'Diff çok büyük': 'Diff is too large',
  'Bu dosyanın farkı arayüzde gösterilemeyecek kadar büyük.':
    'This diff is too large to display.',
  'Fark yok': 'No differences',
  'Bu dosyada gösterilecek bir değişiklik yok.': 'This file has no changes to show.',

  // --- Geçmiş ---
  'Geçmiş boş': 'History is empty',
  'Filtreye uyan commit yok': 'No commits match the filter',
  'Filtreyi gevşetmeyi dene.': 'Try relaxing the filter.',
  'Bu depoda henüz commit yok. İlk commit’ini oluşturduğunda burada görünecek.':
    'No commits yet. Your first commit will show up here.',
  'Commit seç': 'Select a commit',
  'Soldaki listeden bir commit’e tıklayarak içindeki değişiklikleri gör. Sağ tıkla revert, reset ve etiket seçeneklerine ulaşabilirsin.':
    'Click a commit to see its changes. Right-click for revert, reset and tag options.',
  'merge': 'merge',
  'SHA’yı kopyala': 'Copy SHA',
  'Satır geçmişi (blame)': 'Line history (blame)',
  'Satır geçmişi': 'Line history',
  'Satır geçmişi yok': 'No line history',
  'Bu commit’i buraya uygula (cherry-pick)': 'Apply this commit here (cherry-pick)',
  'Commit’i buraya uygula': 'Apply commit here',
  'Cherry-pick': 'Cherry-pick',
  'Cherry-pick yapılamadı': 'Could not cherry-pick',
  'commit’indeki değişiklikler bu dala yeni bir commit olarak uygulanacak. Aynı satırlara dokunulmuşsa çakışma çıkabilir; çakışmayı çözüp işleme devam edebilirsin.':
    'will be applied to this branch as a new commit. If the same lines were touched you may get a conflict; resolve it and continue.',
  'İkili dosyalarda satır geçmişi gösterilemiyor.':
    'Line history is not available for binary files.',
  'Bu dosyanın geçmişi okunamadı. Henüz commit edilmemiş olabilir.':
    'Could not read this file’s history. It may not be committed yet.',
  'SHA kopyalandı': 'SHA copied',
  'Bu commit’i etiketle…': 'Tag this commit…',
  'Bu commit’i geri al (revert)': 'Revert this commit',
  'Bu commit’e sıfırla (reset)…': 'Reset to this commit…',
  'Bu commit’e sıfırla': 'Reset to this commit',
  'Commit’i geri al': 'Revert commit',
  'Revert': 'Revert',
  'commit’inin değişikliklerini geri alan yeni bir commit oluşturulacak. Geçmiş silinmez, bu yüzden paylaşılmış dallarda güvenlidir.':
    'will get a new commit that undoes its changes. History is preserved, so this is safe on shared branches.',
  'commit’ine taşınacak. Bu dal başkalarıyla paylaşıldıysa dikkatli ol: karşı tarafta ayrılmış bir geçmiş bırakır.':
    '. Be careful if this branch is shared: it leaves others with diverged history.',
  'Yumuşak': 'Soft',
  'Karışık': 'Mixed',
  'Sert': 'Hard',
  'Commit’ler geri alınır, değişiklikler hazırlıkta kalır.':
    'Commits are undone; changes stay staged.',
  'Commit’ler geri alınır, değişiklikler hazırlık dışında kalır.':
    'Commits are undone; changes stay unstaged.',
  'Commit’ler ve çalışma dizinindeki değişiklikler silinir. Geri dönüşü yok.':
    'Commits and working tree changes are deleted. No way back.',
  'Sıfırlanamadı': 'Could not reset',
  'HEAD {sha} commit’ine taşındı': 'HEAD moved to {sha}',
  '{count} dosya': '{count} files',
  '{sha} içindeki hâli': 'as of {sha}',

  // --- Geçmiş filtresi ---
  'Filtre': 'Filter',
  'Geçmişi süz': 'Filter history',
  'Mesaj': 'Message',
  'Commit mesajında ara': 'Search commit messages',
  'Yazar': 'Author',
  'Ad veya e-posta': 'Name or email',
  'Dosya yolu': 'File path',
  'Başlangıç': 'From',
  'Bitiş': 'To',
  'mesaj': 'message',
  'yazar': 'author',
  'yol': 'path',
  'başlangıç': 'from',
  'bitiş': 'to',
  '{label} filtresini kaldır': 'Remove {label} filter',
  '{count} commit yüklendi': '{count} commits loaded',
  'Sonuç yok': 'No results',

  // --- Çakışma çözümü ---
  'Çakışma': 'Conflict',
  '(boş)': '(empty)',
  'ile': 'and',
  'arasında çakışma': 'are in conflict',
  'Bizimki': 'Ours',
  'Onlarki': 'Theirs',
  'İkisi': 'Both',
  'Editörde aç': 'Open in editor',
  'Çözüldü olarak işaretle': 'Mark as resolved',
  'Çözülemedi': 'Could not resolve',
  '{path} çözüldü ve hazırlandı': 'Resolved and staged {path}',
  '{count} çakışma bloğu — her biri için bir taraf seç':
    '{count} conflict blocks — pick a side for each',
  'Bu dosyada çakışma işareti kalmamış': 'No conflict markers left in this file',
  'İkili dosyada çakışma': 'Conflict in a binary file',
  'Bu dosya metin olarak birleştirilemiyor. Hangi sürümü tutacağına karar verip dosyayı elle düzenle.':
    'This file cannot be merged as text. Decide which version to keep and edit it yourself.',

  // --- Yarım kalmış işlem ---
  'İşlem': 'Operation',
  '{label} yarıda kaldı': '{label} is unfinished',
  '{count} dosyada çakışma çözülmeyi bekliyor. Her birini çözüp hazırladıktan sonra devam et.':
    '{count} files have conflicts waiting. Resolve and stage each, then continue.',
  'Bütün çakışmalar çözüldü. İşlemi tamamlayabilirsin.':
    'All conflicts are resolved. You can finish the operation.',
  'İşlem iptal edildi': 'Operation aborted',
  'Depo önceki hâline döndü.': 'The repository is back to its previous state.',
  'İptal edilemedi': 'Could not abort',
  'Devam edilemedi': 'Could not continue',

  // --- Stash ---
  'Stash': 'Stash',
  'Değişiklikleri sakla': 'Stash changes',
  'Çalışma dizinini temizler, değişiklikleri kenara alır. Dal değiştirmeden önce işine yarar.':
    'Clears the working tree and sets your changes aside. Useful before switching branches.',
  'Stash açıklaması': 'Stash description',
  'Takip edilmeyen dosyalar da dahil olsun': 'Include untracked files',
  'Saklanacak değişiklik yok': 'Nothing to stash',
  'Saklananlar ({count})': 'Stashes ({count})',
  'Henüz stash yok.': 'No stashes yet.',
  'Stash’i sil': 'Drop stash',
  'Değişiklikler saklandı': 'Changes stashed',
  'Saklanamadı': 'Could not stash',
  'Stash uygulandı': 'Stash applied',
  'Uygulanamadı': 'Could not apply',
  'Stash silindi': 'Stash dropped',
  'Silinemedi': 'Could not delete',

  // --- Otomatik pull ---
  'Otomatik pull': 'Auto pull',
  'Otomatik pull başarısız': 'Auto pull failed',
  'Oto pull kapalı': 'Auto pull off',
  'Oto pull · {minutes} dk': 'Auto pull · {minutes} min',
  'Uzak sunucudaki değişiklikleri arka planda çeker. Bu ayar yalnızca bu depo için geçerlidir.':
    'Pulls remote changes in the background. This setting applies to this repository only.',
  'Belirlenen aralıkta uzak dalı kontrol et.': 'Check the remote branch on this interval.',
  'Aralık': 'Interval',
  '{minutes} dk': '{minutes} min',
  'Sadece çalışma dizini temizken': 'Only when the working tree is clean',
  'Kaydedilmemiş değişiklik varsa dokunma.': 'Do nothing if there are uncommitted changes.',
  'Sadece fast-forward': 'Fast-forward only',
  'Geçmişler ayrıldıysa birleştirme yapma, kararı sana bırak.':
    'Do not merge when histories diverge; leave the decision to you.',
  'Bu oturumda henüz otomatik pull çalışmadı.': 'Auto pull has not run yet this session.',
  'Şimdi çek': 'Pull now',
  'Ayar kaydedilemedi': 'Could not save setting',

  // --- Ayarlar ---
  'Görünüm ve dil': 'Appearance and language',
  'Sistem açılınca başlat': 'Start when the system starts',
  'Oturum açtığında Urhoba kendiliğinden açılır.': 'Urhoba opens by itself when you log in.',
  'Otomatik başlatma': 'Start at login',
  'Otomatik başlatma yalnızca kurulu uygulamada çalışır.':
    'Start at login only works for an installed application.',
  'Ayar yazılamadı; dosya izinlerini kontrol et.':
    'Could not write the setting; check file permissions.',
  'Hakkında': 'About',
  'Sürüm {version}': 'Version {version}',
  'Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.':
    'A modern desktop Git client that keeps all your repositories in one window.',
  'Çalışma ortamı': 'Environment',
  'Sorun bildirirken tanılama bilgisini paylaşman işi kolaylaştırır.':
    'Sharing the diagnostics makes bug reports much easier to act on.',
  'Kaynak kodu': 'Source code',
  'MIT lisansı ile dağıtılır.': 'Distributed under the MIT license.',
  'Arayüz dili': 'Interface language',
  'Diff’i yan yana göster': 'Show diffs side by side',
  'Kapalıyken eski ve yeni satırlar tek sütunda alt alta gösterilir.':
    'When off, old and new lines are shown stacked in one column.',
  'Arka planda fetch': 'Background fetch',
  'Uzak dalın kaç commit ilerde olduğunu tazeler; yerel dosyalara dokunmaz.':
    'Refreshes how far ahead the remote branch is; never touches local files.',
  'Bu deponun otomatik pull ayarları üst çubuktaki “Oto pull” düğmesinde.':
    'Auto pull settings for this repository live in the “Auto pull” button in the top bar.',
  'Genel varsayılanlar': 'Global defaults',
  'Bütün depolar için geçerli. Bir depo istediği ayarı kendisi için değiştirebilir.':
    'Applies to every repository. Any repository can override a setting for itself.',
  'Yalnızca bu depoyu etkiler. “Genel” seçili kaldığı sürece ayar genel varsayılanı izler.':
    'Affects this repository only. While “Global” is selected the setting follows the global default.',
  'Genel (açık)': 'Global (on)',
  'Genel (kapalı)': 'Global (off)',
  'Kapalı': 'Off',
  'Uzak sunucudaki değişiklikleri arka planda çeker.':
    'Pulls remote changes in the background.',
  'Ayrıntılı ayarlar üst çubuktaki “Oto pull” düğmesinde.':
    'Detailed settings live in the “Auto pull” button in the top bar.',
  'Bulut AI’ya kod gönderilebilsin': 'Allow sending code to cloud AI',
  'Bütün depolar için geçerli olur. Kapalıyken commit mesajı önerisi yalnızca yerel modelle çalışır.':
    'Applies to every repository. When off, commit suggestions only work with a local model.',
  'Commit mesajı önerisi için bu deponun diff’i buluta gönderilir.':
    'This repository’s diff is sent to the cloud for commit suggestions.',
  'Bu depoda buluta kod gönderilmesine izin verildi':
    'Sending code to the cloud is allowed for this repository',
  'Bu depoda buluta kod gönderilmiyor': 'Code is not sent to the cloud for this repository',
  'Genel varsayılanı ve bu deponun ayarını yukarıdaki bölümlerden değiştirebilirsin.':
    'You can change the global default and this repository’s setting in the sections above.',
  'Açık gelsin': 'Enabled by default',
  'Yeni eklenen depolarda otomatik pull baştan etkin olsun.':
    'Turn auto pull on for newly added repositories.',
  'Kaydedilmemiş değişiklik varken otomatik pull denenmesin.':
    'Skip auto pull when there are uncommitted changes.',
  'Arka planda merge commit’i üretilmesin.': 'Never create a merge commit in the background.',

  // --- Uzak sunucular ---
  'Uzak sunucular': 'Remotes',
  'Tanımlı uzak sunucu yok. Push edebilmek için bir tane eklemen gerekiyor.':
    'No remotes configured. You need one before you can push.',
  '{name} adresini düzenle': 'Edit {name} URL',
  '{name} sunucusunu kaldır': 'Remove remote {name}',
  'Uzak sunucu eklendi': 'Remote added',
  'Uzak sunucu kaldırıldı': 'Remote removed',
  'Adres güncellendi': 'URL updated',
  'Güncellenemedi': 'Could not update',
  'Kaldırılamadı': 'Could not remove',

  // --- Klonlama ---
  'Depo klonla': 'Clone repository',
  'SSH adresi kullanman önerilir; HTTPS’te her işlemde kimlik doğrulaması gerekir.':
    'Prefer an SSH URL; HTTPS asks for credentials on every operation.',
  'Depo adresi': 'Repository URL',
  'Örnek: git@github.com:kullanici/depo.git': 'Example: git@github.com:user/repo.git',
  'Hedef konum': 'Destination',
  'Klasör adı': 'Folder name',
  'Boş bırakırsan adres son parçasından türetilir.':
    'Left empty, it is derived from the last part of the URL.',
  'GitHub depolarım': 'My GitHub repositories',
  'Depo ara': 'Search repositories',
  'GitHub depolarında ara': 'Search GitHub repositories',
  'açıklama yok': 'no description',
  '{name} klonlandı': 'Cloned {name}',
  'Klonlama başarısız': 'Clone failed',
  '{phase} — %{percent}': '{phase} — {percent}%',
  'Nesneler sayılıyor': 'Counting objects',
  'Nesneler sıkıştırılıyor': 'Compressing objects',
  'İndiriliyor': 'Downloading',
  'Değişiklikler çözülüyor': 'Resolving deltas',
  'Dosyalar yazılıyor': 'Writing files',

  // --- Etiketler ---
  'Etiket': 'Label',
  'Etiket adı': 'Tag name',
  'Örnek: v1.0.0': 'Example: v1.0.0',
  'Doldurursan açıklamalı etiket oluşur — sürüm notu için doğru olan bu. Boş bırakırsan hafif etiket olur.':
    'Filling this creates an annotated tag — the right choice for release notes. Left empty you get a lightweight tag.',
  'Sürüm notu': 'Release note',
  'Mevcut etiketler ({count})': 'Existing tags ({count})',
  'Bu depoda etiket yok.': 'No tags in this repository.',
  'açıklamalı': 'annotated',
  'hafif': 'lightweight',
  'mesaj yok': 'no message',
  '{name} etiketini sil': 'Delete tag {name}',
  '{name} etiketi oluşturuldu': 'Created tag {name}',
  '{name} uzak sunucuya gönderildi': 'Pushed {name} to the remote',
  'Etiket oluşturulamadı': 'Could not create tag',
  'Etiket silindi': 'Tag deleted',
  'Etiket silinemedi': 'Could not delete tag',
  'Etiket gönderilemedi': 'Could not push tag',
  'Yeni etiket {sha} commit’ine takılacak.': 'The new tag will point at {sha}.',
  'Yeni etiket geçerli HEAD’e takılacak.': 'The new tag will point at the current HEAD.',

  // --- SSH ---
  'GitHub’a SSH ile bağlanmak için sistemdeki anahtarlar kullanılır. Uygulama hiçbir özel anahtarı kendi saklamaz.':
    'Your system SSH keys are used to reach GitHub. The app never stores a private key itself.',
  'ssh-agent': 'ssh-agent',
  'çalışıyor': 'running',
  'çalışmıyor': 'not running',
  'Parolalı anahtarlar agent olmadan arka planda kullanılamaz.':
    'Passphrase-protected keys cannot be used in the background without an agent.',
  'Yeni anahtar': 'New key',
  'GitHub bağlantısını sına': 'Test GitHub connection',
  'Anahtarlar ({count})': 'Keys ({count})',
  '~/.ssh içinde anahtar yok': 'No keys in ~/.ssh',
  '“Yeni anahtar” ile bir tane üret, public key’i GitHub hesabına ekle, sonra bağlantıyı sına.':
    'Generate one with “New key”, add the public key to your GitHub account, then test the connection.',
  'agent’ta yüklü': 'loaded in agent',
  'agent’ta değil': 'not in agent',
  'Public key kopyalandı': 'Public key copied',
  'GitHub → Settings → SSH and GPG keys → New SSH key ekranına yapıştır.':
    'Paste it into GitHub → Settings → SSH and GPG keys → New SSH key.',
  'Parolasız bir ed25519 anahtarı üretilir ve mümkünse ssh-agent’a eklenir. Parolasız anahtar, arka plandaki otomatik pull’un takılmadan çalışmasını sağlar; anahtar dosyasını koruma sorumluluğu sende.':
    'A passphrase-free ed25519 key is generated and added to ssh-agent when possible. No passphrase keeps background auto pull from stalling; protecting the key file is up to you.',
  'Genelde e-posta adresin — anahtarı tanımana yarar.':
    'Usually your email address — it helps you recognise the key.',
  'Dosya adı': 'File name',
  '~/.ssh içinde bu adla oluşturulur.': 'Created under ~/.ssh with this name.',
  'Sistemde ssh-keygen bulunamadı; anahtarı elle üretmen gerekiyor.':
    'ssh-keygen was not found; you will need to generate the key yourself.',
  'Anahtar üretildi': 'Key generated',
  'Anahtar üretilemedi': 'Could not generate key',
  '{path} — public key’i GitHub hesabına eklemeyi unutma.':
    '{path} — remember to add the public key to your GitHub account.',

  // --- GitHub ---
  'Pull request’leri görmek ve açmak için bir kişisel erişim jetonu gerekiyor.':
    'A personal access token is required to see and open pull requests.',
  'Jeton durumu': 'Token status',
  'anahtarlıkta şifreli': 'encrypted in keychain',
  'yalnızca bu oturumda': 'this session only',
  'ince ayarlı jeton': 'fine-grained token',
  'İşletim sisteminde anahtarlık bulunamadı. Jetonu korumasız diske yazmak yerine yalnızca bellekte tutuyoruz; uygulama kapanınca yeniden girmen gerekecek.':
    'No system keychain was found. Rather than writing the token to disk unprotected we keep it in memory only; you will need to sign in again after restarting.',
  'Jetonda repo yetkisi görünmüyor; özel depoları okumak ve PR açmak için gerekebilir.':
    'The token does not appear to have the repo scope; you may need it to read private repositories and open PRs.',
  'Bağlantıyı kaldır': 'Disconnect',
  'GitHub’da repo yetkili bir kişisel erişim jetonu oluştur.':
    'Create a personal access token with the repo scope on GitHub.',
  'Jetonu aşağıya yapıştır.': 'Paste the token below.',
  'Jeton oluşturma sayfasını aç': 'Open the token creation page',
  'Kişisel erişim jetonu': 'Personal access token',
  'Jeton yalnızca ana süreçte tutulur ve arayüze hiç aktarılmaz.':
    'The token stays in the main process and never reaches the interface.',
  '{login} olarak bağlanıldı': 'Connected as {login}',
  'Giriş başarısız': 'Sign-in failed',
  'GitHub bağlantısı kaldırıldı': 'GitHub disconnected',

  // --- Pull request'ler ---
  'GitHub hesabı bağlı değil': 'No GitHub account connected',
  'Pull request’leri görmek ve açmak için bir kişisel erişim jetonuyla bağlan.':
    'Connect with a personal access token to see and open pull requests.',
  'GitHub’a bağlan': 'Connect to GitHub',
  'Bu depo GitHub’da değil': 'This repository is not on GitHub',
  'Uzak sunucu {host} adresini gösteriyor. Pull request desteği şimdilik yalnızca github.com için var.':
    'The remote points at {host}. Pull request support currently covers github.com only.',
  'Depoda tanımlı bir uzak sunucu yok. Ayarlardan bir remote ekleyebilirsin.':
    'The repository has no remote configured. You can add one in settings.',
  '{count} açık': '{count} open',
  'PR oluştur': 'New PR',
  'Pull request’ler alınamadı': 'Could not load pull requests',
  'Açık pull request yok': 'No open pull requests',
  'Bir özellik dalında çalışıyorsan yukarıdan yeni bir PR açabilirsin.':
    'If you are on a feature branch you can open a new PR above.',
  'taslak': 'draft',
  'fork': 'fork',
  'Bu dala geç': 'Check out',
  'PR dalı': 'PR branch',
  'PR dalına geçilemedi': 'Could not check out the PR branch',
  'Pull request oluştur': 'Create pull request',
  '{branch} dalındaki değişiklikler için.': 'For the changes on {branch}.',
  'Önce bir dala geçmen gerekiyor.': 'You need to switch to a branch first.',
  'Bu dalda gönderilmemiş commit’ler var. PR açılmadan önce dal otomatik olarak gönderilecek.':
    'This branch has unpushed commits. It will be pushed automatically before the PR is opened.',
  'Başlık': 'Title',
  'Neyi değiştiriyor?': 'What does it change?',
  'Açıklama': 'Description',
  'Ne yaptığını ve neden yaptığını anlat.': 'Explain what you did and why.',
  'Hedef dal': 'Base branch',
  'Uzak sunucuda başka dal görünmüyor. Önce fetch etmeyi dene.':
    'No other branches on the remote. Try fetching first.',
  'Taslak olarak aç': 'Open as draft',
  'Taslak olarak aç — henüz incelenmeye hazır değil':
    'Open as draft — not ready for review yet',
  '#{number} açıldı': 'Opened #{number}',
  'PR açılamadı': 'Could not open PR',

  // --- Komut paleti ---
  'Komut paleti': 'Command palette',
  'Komut, depo veya dal ara': 'Search commands, repositories or branches',
  'Komut ara': 'Search commands',
  'Eşleşen komut yok.': 'No matching command.',
  'Görünüm': 'View',
  'Uzak sunucu': 'Remote',
  'Dallar': 'Branches',
  'Değişiklikler sekmesine geç': 'Go to Changes',
  'Geçmiş sekmesine geç': 'Go to History',
  'Pull request’ler sekmesine geç': 'Go to Pull requests',
  'Git komut günlüğünü aç/kapat': 'Toggle the git command log',
  'Uzak dalların durumunu tazeler': 'Refreshes the state of remote branches',
  'Değişiklikleri sakla (stash)': 'Stash changes',
  'Otomatik pull’u şimdi çalıştır': 'Run auto pull now',
  '{count} commit geride': '{count} commits behind',
  '{count} commit ileride': '{count} commits ahead',
  '{action} başarısız': '{action} failed',

  // --- Komut günlüğü ---
  'Git komutları': 'Git commands',
  '{count} kayıt': '{count} entries',
  'Henüz komut çalışmadı. Bir işlem yaptığında burada belirir.':
    'No commands have run yet. They appear here as you work.',

  // --- Tanılama ---
  'Tanılama': 'Diagnostics',
  'Günlükleri aç': 'Open logs',
  'Tanılama bilgisi kopyalandı': 'Diagnostics copied',
  'gömülü git': 'bundled git',
  'sistem git’i': 'system git',
  'Uygulama kendi git sürümünü taşıyor; sistemde git kurulu olması gerekmiyor.':
    'The app ships its own git; you do not need git installed.',
  'Gömülü git bulunamadı; sistemde kurulu git kullanılıyor.':
    'Bundled git was not found; the system git is being used.',
  'Uygulama': 'Application',
  'Platform': 'Platform',
  'Git': 'Git',
  'Electron': 'Electron',
  'Chromium': 'Chromium',
  'Node': 'Node',
  'Ayar klasörü': 'Settings folder',
  'Günlük dosyası': 'Log file',
};
