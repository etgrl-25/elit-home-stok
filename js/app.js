import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, deleteDoc, updateDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const EMAIL_SUFFIX = "@elithome.local";
const PALETTE = [
  { c: "#E8262C", s: "#FBE0E1" }, // kırmızı
  { c: "#0F8B6C", s: "#DCF2E9" }, // yeşil
  { c: "#1D4ED8", s: "#DFE7FC" }, // mavi
  { c: "#B5760B", s: "#F7E7CB" }, // hardal
  { c: "#6D28D9", s: "#E7DFFA" }, // mor
  { c: "#0A0A0A", s: "#E4E4E4" }  // siyah
];
function colorFor(index) { return PALETTE[index % PALETTE.length]; }

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
const toastEl = document.getElementById("toast");

const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const menuToggle = document.getElementById("menuToggle");
const sidebarClose = document.getElementById("sidebarClose");
const navItems = document.querySelectorAll(".nav-item");
const viewTitle = document.getElementById("viewTitle");
const overviewView = document.getElementById("overviewView");
const storesView = document.getElementById("storesView");
const sidebarStoreList = document.getElementById("sidebarStoreList");
const addStoreForm = document.getElementById("addStoreForm");
const newStoreNameInput = document.getElementById("newStoreName");
const storeSelect = document.getElementById("storeSelect");
const storeDetailWrap = document.getElementById("storeDetailWrap");

let mode = "login";
let currentView = "overview";
let selectedStoreId = null;

let storesUnsub = null;
const productUnsubs = {};       // storeId -> unsubscribe fn
const storesMeta = [];          // [{id, name}]
const storeProducts = {};       // storeId -> [{id, name, stock}]
const searchTerms = {};         // storeId -> string

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
  const username = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
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

// ---------- Sidebar aç/kapa (mobil) ----------
function openSidebar() {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.add("show");
}
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("show");
}
menuToggle.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

// ---------- Görünüm değiştirme (Genel Bakış / Mağazalar) ----------
navItems.forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  currentView = view;
  navItems.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  overviewView.style.display = view === "overview" ? "grid" : "none";
  storesView.style.display = view === "stores" ? "block" : "none";
  viewTitle.textContent = view === "overview" ? "Genel Bakış" : "Mağazalar";
  if (view === "stores") renderStoreDetail();
  closeSidebar();
}

// ---------- Auth durumu ----------
if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginScreen.style.display = "none";
      appScreen.style.display = "block";
      currentUserLabel.textContent = user.email.replace(EMAIL_SUFFIX, "");
      await ensureSeedStores();
      listenStores();
    } else {
      appScreen.style.display = "none";
      loginScreen.style.display = "flex";
      teardownListeners();
    }
  });
}

function teardownListeners() {
  if (storesUnsub) storesUnsub();
  Object.values(productUnsubs).forEach(fn => fn && fn());
  for (const k in productUnsubs) delete productUnsubs[k];
  storesMeta.length = 0;
  for (const k in storeProducts) delete storeProducts[k];
}

// İlk kullanımda (mağaza koleksiyonu boşsa) eski sabit 3 mağazayı tohumla —
// böylece önceki sürümde eklenmiş ürünler kaybolmaz.
async function ensureSeedStores() {
  const snap = await getDocs(collection(db, "stores"));
  if (!snap.empty) return;
  const defaults = [
    { id: "magaza1", name: "Mağaza 1" },
    { id: "magaza2", name: "Mağaza 2" },
    { id: "magaza3", name: "Mağaza 3" }
  ];
  for (const s of defaults) {
    await setDoc(doc(db, "stores", s.id), { name: s.name, createdAt: serverTimestamp() });
  }
}

// ---------- Mağaza listesi (Firestore'dan canlı) ----------
function listenStores() {
  const q = query(collection(db, "stores"), orderBy("createdAt"));
  storesUnsub = onSnapshot(q, snap => {
    const ids = new Set(snap.docs.map(d => d.id));

    // Kaldırılan mağazaların ürün dinleyicilerini kapat
    Object.keys(productUnsubs).forEach(id => {
      if (!ids.has(id)) {
        productUnsubs[id]();
        delete productUnsubs[id];
        delete storeProducts[id];
      }
    });

    storesMeta.length = 0;
    snap.docs.forEach(d => storesMeta.push({ id: d.id, ...d.data() }));

    // Yeni mağazalar için ürün dinleyicisi başlat
    storesMeta.forEach(s => {
      if (!productUnsubs[s.id]) listenProducts(s.id);
      if (!(s.id in searchTerms)) searchTerms[s.id] = "";
    });

    if (selectedStoreId && !ids.has(selectedStoreId)) selectedStoreId = null;
    if (!selectedStoreId && storesMeta.length) selectedStoreId = storesMeta[0].id;

    renderSidebarStoreList();
    renderOverview();
    populateStoreSelect();
    if (currentView === "stores") renderStoreDetail();
  }, err => showToast("Mağaza listesi alınamadı: " + err.message));
}

function listenProducts(storeId) {
  const q = query(collection(db, "stores", storeId, "products"), orderBy("name"));
  productUnsubs[storeId] = onSnapshot(q, snap => {
    storeProducts[storeId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOverview();
    if (currentView === "stores" && selectedStoreId === storeId) renderStoreDetail();
  }, err => showToast("Senkronizasyon hatası: " + err.message));
}

// ---------- Mağaza ekleme / yeniden adlandırma / silme ----------
addStoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newStoreNameInput.value.trim();
  if (!name) return;
  try {
    const ref = await addDoc(collection(db, "stores"), { name, createdAt: serverTimestamp() });
    newStoreNameInput.value = "";
    selectedStoreId = ref.id;
    showToast(`"${name}" eklendi.`);
  } catch (err) {
    showToast("Mağaza eklenemedi: " + err.message);
  }
});

async function renameStore(storeId, oldName) {
  const name = prompt("Yeni mağaza adı:", oldName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === oldName) return;
  try {
    await updateDoc(doc(db, "stores", storeId), { name: trimmed });
    showToast("Mağaza adı güncellendi.");
  } catch (err) {
    showToast("Güncellenemedi: " + err.message);
  }
}

async function deleteStore(storeId, name) {
  if (!confirm(`"${name}" mağazasını ve içindeki TÜM ürünleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
  try {
    const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
    const batch = writeBatch(db);
    productsSnap.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, "stores", storeId));
    await batch.commit();
    showToast(`"${name}" silindi.`);
  } catch (err) {
    showToast("Mağaza silinemedi: " + err.message);
  }
}

// ---------- Sidebar mağaza listesini çiz ----------
function renderSidebarStoreList() {
  sidebarStoreList.innerHTML = "";
  storesMeta.forEach((s, i) => {
    const color = colorFor(i).c;
    const row = document.createElement("div");
    row.className = "sidebar-store-row" + (s.id === selectedStoreId && currentView === "stores" ? " active" : "");
    row.innerHTML = `
      <span class="sidebar-store-dot" style="background:${color}"></span>
      <span class="sidebar-store-name">${escapeHtml(s.name)}</span>
      <button class="sidebar-icon-btn" data-role="rename" title="Yeniden adlandır">✎</button>
      <button class="sidebar-icon-btn" data-role="delete" title="Sil">✕</button>
    `;
    row.querySelector('[data-role="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      renameStore(s.id, s.name);
    });
    row.querySelector('[data-role="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      deleteStore(s.id, s.name);
    });
    row.addEventListener("click", () => {
      selectedStoreId = s.id;
      storeSelect.value = s.id;
      switchView("stores");
    });
    sidebarStoreList.appendChild(row);
  });
  if (storesMeta.length === 0) {
    sidebarStoreList.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-size:12px;padding:6px 8px;">Henüz mağaza yok.</div>`;
  }
}

// ---------- Genel Bakış (tüm mağazalar ızgarası) ----------
function renderOverview() {
  overviewView.innerHTML = "";
  if (storesMeta.length === 0) {
    overviewView.innerHTML = `<div class="store-empty-hint">Henüz mağaza eklenmedi. Sol menüden "+ " ile ilk mağazanızı ekleyin.</div>`;
    return;
  }
  storesMeta.forEach((s, i) => {
    overviewView.appendChild(buildStoreCard(s, i));
  });
}

// ---------- Mağazalar sekmesi: seçici + tekli görünüm ----------
function populateStoreSelect() {
  const prev = storeSelect.value;
  storeSelect.innerHTML = "";
  storesMeta.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    storeSelect.appendChild(opt);
  });
  if (selectedStoreId && storesMeta.some(s => s.id === selectedStoreId)) {
    storeSelect.value = selectedStoreId;
  } else if (prev && storesMeta.some(s => s.id === prev)) {
    storeSelect.value = prev;
  }
}
storeSelect.addEventListener("change", () => {
  selectedStoreId = storeSelect.value;
  renderSidebarStoreList();
  renderStoreDetail();
});

function renderStoreDetail() {
  storeDetailWrap.innerHTML = "";
  if (storesMeta.length === 0) {
    storeDetailWrap.innerHTML = `<div class="store-empty-hint">Henüz mağaza eklenmedi. Sol menüden ilk mağazanızı ekleyin.</div>`;
    return;
  }
  const idx = storesMeta.findIndex(s => s.id === selectedStoreId);
  const s = idx >= 0 ? storesMeta[idx] : storesMeta[0];
  storeDetailWrap.appendChild(buildStoreCard(s, idx >= 0 ? idx : 0));
}

// ---------- Ortak: mağaza kartı üretimi ----------
function buildStoreCard(store, colorIndex) {
  const color = colorFor(colorIndex);
  const card = document.createElement("div");
  card.className = "store-card";
  card.dataset.store = store.id;
  card.style.setProperty("--card-color", color.c);
  card.innerHTML = `
    <div class="store-head" style="border-top:4px solid ${color.c}">
      <div class="store-head-left">
        <span class="store-dot" style="background:${color.c}"></span>
        <div>
          <div class="store-title">${escapeHtml(store.name)}</div>
          <div class="store-meta" data-role="meta">0 ürün · toplam 0 adet</div>
        </div>
      </div>
      <div class="store-head-actions">
        <button class="icon-btn" data-role="rename" title="Yeniden adlandır">✎</button>
        <button class="icon-btn danger" data-role="delete" title="Mağazayı sil">✕</button>
      </div>
    </div>
    <div class="store-body">
      <div class="add-row">
        <input type="text" placeholder="Ürün adı" data-role="new-name" />
        <input type="number" placeholder="Adet" value="1" min="0" data-role="new-stock" />
        <button class="add-btn" data-role="add-btn" title="Ürün ekle">+</button>
      </div>
      <div class="search-row">
        <input type="text" placeholder="Bu mağazada ara…" data-role="search" value="${escapeHtml(searchTerms[store.id] || "")}" />
      </div>
      <div class="product-list" data-role="list"></div>
    </div>
  `;

  card.querySelector('[data-role="rename"]').addEventListener("click", () => renameStore(store.id, store.name));
  card.querySelector('[data-role="delete"]').addEventListener("click", () => deleteStore(store.id, store.name));

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
    fillProductList(card, store.id, color);
  });

  fillProductList(card, store.id, color);
  return card;
}

function fillProductList(card, storeId, color) {
  const listEl = card.querySelector('[data-role="list"]');
  const metaEl = card.querySelector('[data-role="meta"]');
  const all = storeProducts[storeId] || [];
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
        <span class="tag ${p.stock === 0 ? "zero" : ""}" style="background:${color.s};color:${color.c}">${p.stock}</span>
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
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
