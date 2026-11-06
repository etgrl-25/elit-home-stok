# Elit Home Groq asistanı

Bu Worker yalnızca `elit@elithome.local` hesabının mevcut Firebase ID tokenını imzasıyla doğruladıktan sonra Groq çağrısı yapar. Kullanıcı stok paylaşımını açmadıkça yalnızca sohbet mesajları gönderilir. Stok değiştiren araç yoktur. Konuşma son 16 mesaj ve 18.000 karakterle sınırlanır, tarayıcı belleğinde tutulur; Temizle veya çıkış yapıldığında devam eden yanıt iptal edilir ve bağlam silinir.

## Cloudflare kurulumu

- Worker adı: `elit-home-assistant`.
- Git deposu: `etgrl-25/elit-home-stok`, dal: `main`, kök klasör: `assistant-worker`.
- Derleme komutu boş; yayın komutu: `npx wrangler deploy`.
- `wrangler.toml` proje kimliğini ve kullanıcı başına dakikada 10 istek için rate-limit bağlamasını tanımlar. Panelden elle yayınlanırsa bağlama yokken bellek içi sınır kullanılır; bu sınır sunucu örneğine özgüdür ve dağıtık kesin kota değildir.
- Cloudflare Settings → Variables and Secrets → Add → **Secret**: `GROQ_API_KEY`. Değeri yalnızca Groq panelinden kopyalayıp buraya yapıştırın. Anahtarı sohbette veya GitHub’da paylaşmayın.
- Ücretsiz Groq planını koruyun; bu kod ücretli plan açmaz. Kota aşımında hata gösterir, başka bir ücretli sağlayıcıya geçmez.

Ön yüz varsayılan olarak `https://elit-home-assistant.ertugrulerturann.workers.dev` adresini kullanır. Adres değişirse sohbet içindeki Yapay zekâ bağlantısı alanından yeni Workers adresi kaydedilebilir. Bu alan API anahtarı kabul etmez.

Model: `openai/gpt-oss-120b` (Groq), düşük düşünme seviyesi, en fazla 2.048 çıktı tokenı; parça parça metin akışı. Çalışma anındaki model erişimi ve ücretsiz kotalar Groq hesabına bağlıdır. Gerçek Groq uçtan uca testi için gizli anahtarın kullanıcı tarafından eklenmesi gerekir.

Stok özeti toplam adet ve maliyeti, mevcut sorunun yerel stok sorgusu sonucunu (en fazla 10 ayrıntı kaydı) içerir. Tam envanter veya diğer sekmelerdeki kasa/ciro verileri gönderilmez. Bir müşteri sorusunun genel yanıtı ile veritabanından doğrulanmış kayıt aynı şey değildir.
