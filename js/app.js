import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, deleteDoc, updateDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const EMAIL_SUFFIX = "@elithome.local"; // kullanıcı adını Firebase Auth e-postasına çeviriyoruz

const STORES = [
  { id: "magaza1", label: "Mağaza 1" },
  { id: "magaza2", label: "Mağaza 2" },
  { id: "magaza3", label: "Mağaza 3" }
];

const isConfigured = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
const setupWarning = document.getElementById("setupWarning");
if (!isConfigured) setupWarning.style.display = "block";

let auth, db;
if (isConfigured) {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
}

// ---------- DOM refs ----------
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginMsg = document.getElementById("loginMsg");
const submitBtn = document.getElementById("submitBtn");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const currentUserLabel = document.getElementById("currentUserLabel");
const logoutBtn = document.getElementById("logoutBtn");
const boards = document.getElementById("boards");
const toastEl = document.getElementById("toast");

let mode = "login";
const storeUnsubscribers = {};
const storeData = {};
const searchTerms = {};

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ---------- Giriş / Kayıt sekmeleri ----------
tabLogin.addEventListener("click", () => {
  mode = "login";
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  submitBtn.textContent = "Giriş Yap";
  loginMsg.textContent = "";
});
tabSignup.addEventListener("click", () => {
  mode = "signup";
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  submitBtn.textContent = "Hesap Oluştur";
  loginMsg.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isConfigured) {
    loginMsg.className = "login-msg error";
    loginMsg.textContent = "Önce Firebase yapılandırmasını tamamlayın.";
    return;
  }
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const email = username + EMAIL_SUFFIX;

  submitBtn.disabled = true;
  loginMsg.textContent = "";
  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast("Hesap oluşturuldu, giriş yapıldı.");
    }
  } catch (err) {
    loginMsg.className = "login-msg error";
    loginMsg.textContent = translateAuthError(err.code);
  } finally {
    submitBtn.disabled = false;
  }
});

function translateAuthError(code) {
  const map = {
    "auth/invalid-email": "Kullanıcı adı geçersiz.",
    "auth/user-not-found": "Böyle bir kullanıcı bulunamadı.",
    "auth/wrong-password": "Şifre hatalı.",
    "auth/invalid-credential": "Kullanıcı adı veya şifre hatalı.",
    "auth/email-already-in-use": "Bu kullanıcı adı zaten kayıtlı.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin."
  };
  return map[code] || "Bir hata oluştu, tekrar deneyin.";
}

logoutBtn.addEventListener("click", () => signOut(auth));

// ---------- Auth durumu ----------
if (isConfigured) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginScreen.style.display = "none";
      appScreen.style.display = "block";
      currentUserLabel.textContent = user.email.replace(EMAIL_SUFFIX, "");
      buildBoards();
      STORES.forEach(s => listenStore(s.id));
    } else {
      appScreen.style.display = "none";
      loginScreen.style.display = "flex";
      Object.values(storeUnsubscribers).forEach(fn => fn && fn());
    }
  });
}

// ---------- Panelleri oluştur ----------
function buildBoards() {
  boards.innerHTML = "";
  STORES.forEach(store => {
    searchTerms[store.id] = "";
    const card = document.createElement("div");
    card.className = "store-card";
    card.dataset.store = store.id;
    card.innerHTML = `
      <div class="store-head">
        <div>
          <div class="store-title"><span class="store-dot"></span>${store.label}</div>
          <div class="store-meta" data-role="meta">0 ürün · toplam 0 adet</div>
        </div>
      </div>
      <div class="store-body">
        <div class="add-row">
          <input type="text" placeholder="Ürün adı" data-role="new-name" />
          <input type="number" placeholder="Adet" value="1" min="0" data-role="new-stock" />
          <button class="add-btn" data-role="add-btn" title="Ürün ekle">+</button>
        </div>
        <div class="search-row">
          <input type="text" placeholder="Bu mağazada ara…" data-role="search" />
        </div>
        <div class="product-list" data-role="list"></div>
      </div>
    `;
    boards.appendChild(card);

    const nameInput = card.querySelector('[data-role="new-name"]');
    const stockInput = card.querySelector('[data-role="new-stock"]');
    const addBtn = card.querySelector('[data-role="add-btn"]');
    const searchInput = card.querySelector('[data-role="search"]');

    const submitAdd = () => addProduct(store.id, nameInput, stockInput);
    addBtn.addEventListener("click", submitAdd);
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); });
    stockInput.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); });

    searchInput.addEventListener("input", () => {
      searchTerms[store.id] = searchInput.value.trim().toLowerCase();
      renderStore(store.id);
    });
  });
}

async function addProduct(storeId, nameInput, stockInput) {
  const name = nameInput.value.trim();
  const stock = Math.max(0, parseInt(stockInput.value || "0", 10));
  if (!name) { nameInput.focus(); return; }
  try {
    await addDoc(collection(db, "stores", storeId, "products"), {
      name, stock, updatedAt: serverTimestamp()
    });
    nameInput.value = "";
    stockInput.value = "1";
    nameInput.focus();
  } catch (err) {
    showToast("Ürün eklenemedi: " + err.message);
  }
}

function listenStore(storeId) {
  const q = query(collection(db, "stores", storeId, "products"), orderBy("name"));
  storeUnsubscribers[storeId] = onSnapshot(q, snap => {
    storeData[storeId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStore(storeId);
  }, err => showToast("Senkronizasyon hatası: " + err.message));
}

function renderStore(storeId) {
  const card = boards.querySelector(`.store-card[data-store="${storeId}"]`);
  if (!card) return;
  const listEl = card.querySelector('[data-role="list"]');
  const metaEl = card.querySelector('[data-role="meta"]');
  const all = storeData[storeId] || [];
  const term = searchTerms[storeId] || "";
  const items = term ? all.filter(p => p.name.toLowerCase().includes(term)) : all;

  const totalStock = all.reduce((sum, p) => sum + (p.stock || 0), 0);
  metaEl.textContent = `${all.length} ürün · toplam ${totalStock} adet`;

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state">${term ? "Eşleşen ürün yok." : "Henüz ürün eklenmedi."}</div>`;
    return;
  }

  listEl.innerHTML = "";
  items.forEach(p => {
    const row = document.createElement("div");
    row.className = "product-row";
    row.innerHTML = `
      <div class="product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
      <div class="stepper">
        <button class="step-btn" data-role="minus">−</button>
        <span class="tag ${p.stock === 0 ? "zero" : ""}">${p.stock}</span>
        <button class="step-btn" data-role="plus">+</button>
      </div>
      <button class="del-btn" data-role="del" title="Ürünü sil">✕</button>
    `;
    row.querySelector('[data-role="minus"]').addEventListener("click", () => changeStock(storeId, p.id, Math.max(0, p.stock - 1)));
    row.querySelector('[data-role="plus"]').addEventListener("click", () => changeStock(storeId, p.id, p.stock + 1));
    row.querySelector('[data-role="del"]').addEventListener("click", () => removeProduct(storeId, p.id, p.name));
    listEl.appendChild(row);
  });
}

async function changeStock(storeId, productId, newStock) {
  try {
    await updateDoc(doc(db, "stores", storeId, "products", productId), {
      stock: newStock, updatedAt: serverTimestamp()
    });
  } catch (err) {
    showToast("Stok güncellenemedi: " + err.message);
  }
}

async function removeProduct(storeId, productId, name) {
  if (!confirm(`"${name}" ürünü silinsin mi?`)) return;
  try {
    await deleteDoc(doc(db, "stores", storeId, "products", productId));
    showToast("Ürün silindi.");
  } catch (err) {
    showToast("Silinemedi: " + err.message);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---------- PWA: service worker kaydı ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      /* offline destek olmadan da uygulama çalışmaya devam eder */
    });
  });
}
