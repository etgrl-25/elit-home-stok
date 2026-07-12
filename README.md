# Elit Home — Stok Yönetimi

3 mağazanın stoklarını **aynı ekrandan, gerçek zamanlı** görüntüleyip
ürün ekleyip çıkarabildiğiniz, Firebase tabanlı, kurulabilir bir
PWA (Progressive Web App).

## Özellikler

- Kullanıcı adı + şifre ile giriş / hesap oluşturma (Firebase Authentication)
- 3 mağaza yan yana, gerçek zamanlı senkron (Firestore `onSnapshot`)
- Ürün ekleme, `+ / −` ile stok güncelleme, ürün silme, mağaza içi arama
- Mobil, tablet ve masaüstünde düzgün görünen responsive tasarım
- Ana ekrana eklenebilir, çevrimdışı da açılabilen PWA (manifest + service worker)

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

### Seçenek B — GitHub Pages

GitHub reponuzda **Settings → Pages → Branch: main / (root)** seçip
kaydedin. Birkaç dakika içinde `https://KULLANICI_ADINIZ.github.io/elit-home-stok/`
adresinden yayında olur. Firebase Authentication kullandığınız için
**Authentication → Settings → Authorized domains** kısmına bu GitHub
Pages adresini de eklemeyi unutmayın.

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
  magaza1/
    products/
      {productId}: { name: string, stock: number, updatedAt: timestamp }
  magaza2/
    products/ ...
  magaza3/
    products/ ...
```

Mağaza sayısını veya adlarını değiştirmek isterseniz `js/app.js`
dosyasının başındaki `STORES` dizisini düzenlemeniz yeterli.
