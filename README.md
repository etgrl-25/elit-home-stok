# Elit Home — Stok Yönetimi

3 mağazanın stoklarını **aynı ekrandan, gerçek zamanlı** görüntüleyip
ürün ekleyip çıkarabildiğiniz, Firebase tabanlı, kurulabilir bir
PWA (Progressive Web App).

## Özellikler

- Kullanıcı adı + şifre ile giriş / hesap oluşturma (Firebase Authentication)
- Sol menüden (☰) istediğiniz kadar mağaza ekleyip, yeniden adlandırıp silebilirsiniz
- **Genel Bakış**: tüm mağazaları aynı anda, yan yana gösteren ızgara görünümü
- **Mağazalar**: açılır listeden seçtiğiniz tek bir mağazayı büyük görünümde inceleme
- **Tüm Ürünlerde Ara**: sol menüden, TÜM mağazalardaki (ve Teşhir Ürünler'deki) ürünleri
  tek bir arama kutusundan; isim, açıklama ve tür bilgisine göre anlık arayın
- **Teşhir Ürünler**: mağazalardan bağımsız, ayrı bir "sanal mağaza" gibi çalışan,
  aynı ürün ekleme/stok/görsel özelliklerine sahip ayrı bir bölüm
- **Ürün Türleri**: koltuk takımları, yatak odaları gibi türleri elle (isim + ikon
  görseli yükleyerek) tanımlayın; ürün eklerken/düzenlerken bu türlerden seçin
- Her ürüne opsiyonel **açıklama** eklenebilir (ör. "2 üçlü 2 berjer") — ürün
  listelerinde her zaman ürün adı üstte, açıklaması altında gösterilir
- Bir ürüne tıklayınca açılan **ürün detay penceresinde**: stok +/- ile güncellenir,
  ürün görseli eklenir/değiştirilir/kaldırılır, ad/açıklama/tür düzenlenir, ürün silinir
- Ürün ekleme, `+ / −` ile hızlı stok güncelleme, ürün silme, mağaza içi arama — hepsi
  gerçek zamanlı senkron (Firestore `onSnapshot`)
- Keskin siyah-beyaz + kırmızı vurgulu, yüksek kontrastlı tasarım
- Mobil, tablet ve masaüstünde düzgün görünen responsive tasarım (mobilde sol menü kaydırmalı panel olarak açılır)
- Ana ekrana eklenebilir, çevrimdışı da açılabilen PWA (manifest + service worker)

> **Görseller nasıl saklanıyor?** Firebase Storage kurulumu gerektirmemesi için
> ürün ve tür görselleri, tarayıcıda otomatik olarak küçültülüp (~480px, JPEG)
> doğrudan Firestore belgesi içine gömülür. Bu, ek kurulum gerektirmez ama çok
> yüksek çözünürlüklü/az sıkışan görsellerde belge boyutu sınırına (1 MB)
> yaklaşabilir — uygulama görseli otomatik küçülttüğü için normal ürün
> fotoğraflarında sorun yaşamazsınız.

> **Not — veri modeli değişti:** Önceki sürümde mağazalar `Mağaza 1/2/3`
> olarak sabitti. Artık mağazalar Firestore'daki `stores` koleksiyonunda
> dinamik olarak tutuluyor. Uygulama ilk açıldığında bu koleksiyon
> boşsa, eski verilerinizin kaybolmaması için otomatik olarak
> `magaza1/2/3` adlarında üç mağaza oluşturur — daha önce eklediğiniz
> ürünler bu mağazaların altında görünmeye devam eder.

## Klasör yapısı

```
elit-home-stok/
├── index.html              # Ana sayfa
├── manifest.json           # PWA manifesti
├── service-worker.js       # Çevrimdışı önbellekleme
├── css/
│   └── style.css
├── js/
│   ├── app.js               # Uygulama mantığı (Auth + Firestore)
│   └── firebase-config.js   # Kendi Firebase bilgileriniz buraya girilir
├── icons/                   # PWA ikonları
└── README.md
```

---

## 1) Firebase projesini kurun

1. [console.firebase.google.com](https://console.firebase.google.com) adresine gidin,
   **"Add project"** ile yeni bir proje oluşturun (ör. `elit-home`).
2. Sol menüden **Build → Authentication → Get started** deyin.
   **Sign-in method** sekmesinden **Email/Password** sağlayıcısını etkinleştirin.
   > Uygulama kullanıcı adını arka planda `kullaniciadi@elithome.local`
   > biçiminde bir e-postaya çevirip Firebase Auth'a öyle gönderir; siz
   > sadece kullanıcı adı ve şifre girersiniz.
3. Sol menüden **Build → Firestore Database → Create database** deyin.
   Bir bölge seçin (ör. `eur3 (europe-west)`), **test modunda** başlatabilirsiniz.
4. Firestore **Rules** sekmesine gidip kuralları şu şekilde güncelleyin
   (sadece giriş yapan kullanıcılar okuyup yazabilsin):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   Ardından **Publish** ile yayınlayın.

5. Proje ayarlarına dönün: **⚙️ Project settings → General → Your apps**
   bölümünden **`</>` (Web)** simgesine tıklayıp bir uygulama kaydedin.
   Firebase size şuna benzer bir yapılandırma objesi verecek:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "elit-home.firebaseapp.com",
     projectId: "elit-home",
     storageBucket: "elit-home.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

6. Bu değerleri **`js/firebase-config.js`** dosyasına yapıştırın
   (`YOUR_API_KEY` gibi yer tutucuların yerine).

> Not: Bu değerler gizli anahtar değildir, tarayıcıya zaten gönderilir.
> Gerçek güvenliği 4. adımdaki Firestore kuralları ve Authentication sağlar.

---

## 2) Bilgisayarınızda çalıştırın

Tarayıcılar `file://` üzerinden ES modüllerine ve service worker'a izin
vermediği için dosyaları basit bir yerel sunucu ile açmanız gerekir.
Proje klasöründeyken:

```bash
# Python varsa
python3 -m http.server 8080

# veya Node.js varsa
npx serve .
```

Sonra tarayıcıdan `http://localhost:8080` adresini açın.

---

## 3) GitHub'a yükleyin

```bash
cd elit-home-stok
git init
git add .
git commit -m "Elit Home stok yönetim uygulaması"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/elit-home-stok.git
git push -u origin main
```

`js/firebase-config.js` içindeki değerler gizli olmadığı için doğrudan
commit edebilirsiniz; isterseniz bu dosyayı `.gitignore`'a ekleyip
sadece kendi makinenizde tutabilir, repoya bir
`firebase-config.example.js` şablonu bırakabilirsiniz.

---

## 4) Yayına alın (deploy)

### Seçenek A — Firebase Hosting (önerilen, aynı proje içinde)

```bash
npm install -g firebase-tools
firebase login
cd elit-home-stok
firebase init hosting
# "Public directory" sorusuna: .  (mevcut klasörün kendisi) yazın
# "Configure as a single-page app": Hayır (No)
firebase deploy
```

Komut sonunda size bir `https://elit-home.web.app` adresi verecek —
bunu telefonunuzda açıp **"Ana ekrana ekle"** diyerek uygulama gibi
kurabilirsiniz.

### Seçenek B — GitHub Pages (basit, config repo dosyasında görünür)

GitHub reponuzda **Settings → Pages → Branch: main / (root)** seçip
kaydedin. Birkaç dakika içinde `https://KULLANICI_ADINIZ.github.io/elit-home-stok/`
adresinden yayında olur. Firebase Authentication kullandığınız için
**Authentication → Settings → Authorized domains** kısmına bu GitHub
Pages adresini de eklemeyi unutmayın.

Bu yöntemde `js/firebase-config.js` içindeki değerler repoda,
commit geçmişinde ve GitHub'da kod olarak görünür durumda kalır
(daha önce açıkladığımız gibi bu değerler gizli anahtar değildir,
gerçek güvenlik Firestore kuralları ile sağlanır — ama yine de repo
kodunda görünmesini istemiyorsanız Seçenek C'yi kullanın).

### Seçenek C — GitHub Actions + Secrets (config repo koduna hiç yazılmaz)

Bu yöntemde Firebase bilgilerini repoya hiç commit etmezsiniz;
GitHub'ın **Settings → Secrets and variables** kısmına bir kere
girersiniz, her yayında `js/firebase-config.js` dosyasını otomatik
olarak bu gizli değerlerle üreten bir GitHub Actions iş akışı
(`.github/workflows/deploy.yml`) çalışır. Böylece repo kodunu
kim görürse görsün, `apiKey` gibi değerleri repoda/commit
geçmişinde göremez.

> Not: Yayınlanan **canlı sitenin** JavaScript'inde bu değerler yine
> mevcuttur (tarayıcının Firebase'e bağlanabilmesi için bu kaçınılmaz),
> ama bu artık GitHub'daki kod dosyalarında değil, sadece deploy
> sırasında oluşan geçici derlemede yer alır.

Adımlar:

1. Repo sayfasında **Settings → Secrets and variables → Actions** git.
2. **"New repository secret"** ile aşağıdaki 6 secret'ı tek tek ekleyin
   (isim tam olarak böyle olmalı, değer kısmına Firebase Console'daki
   kendi bilgilerinizi yazın):

   | Secret adı | Değer (örnek) |
   |---|---|
   | `FIREBASE_API_KEY` | `AIzaSyD4...` |
   | `FIREBASE_AUTH_DOMAIN` | `elit-home-xxxxx.firebaseapp.com` |
   | `FIREBASE_PROJECT_ID` | `elit-home-xxxxx` |
   | `FIREBASE_STORAGE_BUCKET` | `elit-home-xxxxx.appspot.com` |
   | `FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
   | `FIREBASE_APP_ID` | `1:123456789012:web:abcdef` |

3. **Settings → Pages** kısmına gidin, **"Build and deployment" → Source**
   bölümünden **"GitHub Actions"**'ı seçin (Branch seçeneği değil).
4. `main` dalına her push yaptığınızda (veya ilk kurulumda **Actions**
   sekmesinden workflow'u elle **"Run workflow"** ile tetikleyerek)
   `.github/workflows/deploy.yml` otomatik çalışır: secrets'tan
   `js/firebase-config.js` dosyasını üretir ve siteyi yayınlar.
5. **Actions** sekmesinden ilerlemeyi izleyebilir, tamamlandığında
   **Settings → Pages** üstünde yayın adresini görebilirsiniz.

Bu yöntemi seçtiyseniz README'nin başındaki "Seçenek B" adımlarını
uygulamanıza gerek yok — ikisini aynı anda kurmayın, biri yeterlidir.

---

## 5) Telefona uygulama gibi kurma (PWA)

- **Android / Chrome:** Siteyi açın → sağ üstteki ⋮ menüsü →
  **"Ana ekrana ekle" / "Uygulamayı yükle"**.
- **iPhone / Safari:** Siteyi açın → paylaş simgesi →
  **"Ana Ekrana Ekle"**.

Kurulduktan sonra uygulama kendi simgesiyle, adres çubuğu olmadan,
tam ekran açılır ve internet kesilse bile arayüz önbellekten yüklenir
(veri senkronizasyonu için yine internet gerekir).

---

## Veri modeli (Firestore)

```
stores/
  {storeId}: { name: string, createdAt: timestamp }
  {storeId}/products/
    {productId}: {
      name: string,
      description: string,      // opsiyonel, ör. "2 üçlü 2 berjer"
      category: string,         // categories/{id} referansı, boş olabilir
      stock: number,
      image: string,            // base64 data-url (küçültülmüş JPEG) veya ""
      updatedAt: timestamp
    }

showroomProducts/                // "Teşhir Ürünler" bölümü — mağazalardan bağımsız
  {productId}: { name, description, category, stock, image, updatedAt }  // yukarıdakiyle aynı yapı

categories/                      // "Ürün Türleri" — elle tanımlanan türler
  {categoryId}: { name: string, icon: string, createdAt: timestamp }
```

Mağaza eklemek/silmek/yeniden adlandırmak artık uygulama içinden
(sol menüdeki `+` ve ✎ / ✕ ikonlarından) yapılıyor, kodda bir dizi
düzenlemenize gerek yok. Bir mağaza silindiğinde, içindeki tüm
ürünler de otomatik olarak silinir.

Mevcut Firestore kuralları (`allow read, write: if request.auth != null`)
tüm koleksiyonları kapsadığı için `categories` ve `showroomProducts`
koleksiyonları için ayrıca bir kural eklemenize gerek yoktur.
