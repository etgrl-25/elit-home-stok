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
  apiKey: "AIzaSyCFXgBo-tHQBSXFsbE45-1Iiy8kSVk4k1E",
  authDomain: "elithome-67b92.firebaseapp.com",
  projectId: "elithome-67b92",
  storageBucket: "elithome-67b92.firebasestorage.app",
  messagingSenderId: "809627969318",
  appId: "1:809627969318:web:51b413f8118340d0f203e7"
};
