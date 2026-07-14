// ==========================================================
// Firebase Console → Project settings → General → Your apps → SDK config
// bölümünden aldığınız bilgileri aşağıya yapıştırın.
// Bu değerler "gizli anahtar" değildir; tarayıcıya zaten gönderilirler.
// Gerçek güvenlik Firestore Security Rules ve Authentication ile sağlanır.
//
// GitHub Actions + Secrets ile yayınlıyorsanız bu dosyanın aşağıdaki
// içeriğine dokunmanıza gerek yoktur — .github/workflows/deploy.yml
// her yayında bu dosyayı GitHub Secrets'taki değerlerle otomatik olarak
// yeniden oluşturur, siz sadece repo Settings → Secrets kısmına
// değerleri bir kere girersiniz. Bkz. README.md "Seçenek C".
// ==========================================================
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
