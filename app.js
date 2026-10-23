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
  { c: "#E8262C", s: "#FBE0E1" },
  { c: "#0F8B6C", s: "#DCF2E9" },
  { c: "#1D4ED8", s: "#DFE7FC" },
  { c: "#B5760B", s: "#F7E7CB" },
  { c: "#6D28D9", s: "#E7DFFA" },
  { c: "#0A0A0A", s: "#E4E4E4" }
];
function colorFor(index) { return PALETTE[Math.max(0, index) % PALETTE.length]; }

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
const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen"), appScreen = $("appScreen");
const loginForm = $("loginForm"), usernameInput = $("usernameInput"), passwordInput = $("passwordInput");
const loginMsg = $("loginMsg"), submitBtn = $("submitBtn");
const tabLogin = $("tabLogin"), tabSignup = $("tabSignup");
const currentUserLabel = $("currentUserLabel"), logoutBtn = $("logoutBtn"), toastEl = $("toast");
const sidebar = $("sidebar"), sidebarBackdrop = $("sidebarBackdrop");
const menuToggle = $("menuToggle"), sidebarClose = $("sidebarClose");
const navItems = document.querySelectorAll(".nav-item");
const viewTitle = $("viewTitle"), overviewView = $("overviewView"), storesView = $("storesView");
const sidebarStoreList = $("sidebarStoreList"), sidebarCategoryList = $("sidebarCategoryList");
const addStoreForm = $("addStoreForm"), newStoreNameInput = $("newStoreName");
const addCategoryForm = $("addCategoryForm"), newCategoryNameInput = $("newCategoryName");
const storeSelect = $("storeSelect"), storeDetailWrap = $("storeDetailWrap");
const globalSearchInput = $("globalSearchInput"), globalSearchResults = $("globalSearchResults");
const sidebarListsWrap = $("sidebarListsWrap");

const SHOWCASE_NAME = "Teşhir Ürünler";
const MAX_IMAGE_DIM = 480;
const IMAGE_QUALITY = 0.72;

let mode = "login";
let currentView = "overview";
let selectedStoreId = null;
let storesUnsub = null;
const productUnsubs = {};
const storesMeta = [];
const storeProducts = {};
const searchTerms = {};
const expandedProducts = new Set();

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ---------- Giriş / Kayıt ----------
tabLogin.addEventListener("click", () => {
  mode = "login"; tabLogin.classList.add("active"); tabSignup.classList.remove("active");
  submitBtn.textContent = "Giriş Yap"; loginMsg.textContent = "";
});
tabSignup.addEventListener("click", () => {
  mode = "signup"; tabSignup.classList.add("active"); tabLogin.classList.remove("active");
  submitBtn.textContent = "Hesap Oluştur"; loginMsg.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isConfigured) {
    loginMsg.className = "login-msg error";
    loginMsg.textContent = "Önce Firebase yapılandırmasını tamamlayın.";
    return;
  }
  const username = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const email = username + EMAIL_SUFFIX;
  submitBtn.disabled = true;
  loginMsg.textContent = "";
  try {
    if (mode === "login") await signInWithEmailAndPassword(auth, email, passwordInput.value);
    else {
      await createUserWithEmailAndPassword(auth, email, passwordInput.value);
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

// ---------- Sidebar (mobil) ----------
function openSidebar() { sidebar.classList.add("open"); sidebarBackdrop.classList.add("show"); }
function closeSidebar() { sidebar.classList.remove("open"); sidebarBackdrop.classList.remove("show"); }
menuToggle.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

navItems.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

function switchView(view) {
  currentView = view;
  navItems.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  overviewView.style.display = view === "overview" ? "grid" : "none";
  storesView.style.display = view === "stores" ? "block" : "none";
  viewTitle.textContent = view === "overview" ? "Genel Bakış" : "Mağazalar";
  if (view === "stores") renderStoreDetail();
  renderSidebarLists();
  closeSidebar();
}

// ---------- Auth durumu ----------
if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginScreen.style.display = "none";
      appScreen.style.display = "block";
      currentUserLabel.textContent = user.email.replace(EMAIL_SUFFIX, "");
      try {
        await ensureSeedStores();
        await ensureShowcaseCategory();
      } catch (err) { showToast("Başlangıç verisi hazırlanamadı: " + err.message); }
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
  expandedProducts.clear();
}

async function ensureSeedStores() {
  const snap = await getDocs(collection(db, "stores"));
  if (!snap.empty) return;
  for (const s of [{ id: "magaza1", name: "Mağaza 1" }, { id: "magaza2", name: "Mağaza 2" }, { id: "magaza3", name: "Mağaza 3" }]) {
    await setDoc(doc(db, "stores", s.id), { name: s.name, type: "store", createdAt: serverTimestamp() });
  }
}

async function ensureShowcaseCategory() {
  const snap = await getDocs(collection(db, "stores"));
  if (snap.docs.some(d => d.data().type === "category")) return;
  await addDoc(collection(db, "stores"), { name: SHOWCASE_NAME, type: "category", createdAt: serverTimestamp() });
}

// ---------- Canlı dinleyiciler ----------
function listenStores() {
  const q = query(collection(db, "stores"), orderBy("createdAt"));
  storesUnsub = onSnapshot(q, snap => {
    const ids = new Set(snap.docs.map(d => d.id));
    Object.keys(productUnsubs).forEach(id => {
      if (!ids.has(id)) { productUnsubs[id](); delete productUnsubs[id]; delete storeProducts[id]; }
    });
    storesMeta.length = 0;
    snap.docs.forEach(d => storesMeta.push({ id: d.id, ...d.data(), type: d.data().type || "store" }));
    storesMeta.forEach(s => {
      if (!productUnsubs[s.id]) listenProducts(s.id);
      if (!(s.id in searchTerms)) searchTerms[s.id] = "";
    });
    if (selectedStoreId && !ids.has(selectedStoreId)) selectedStoreId = null;
    if (!selectedStoreId && storesMeta.length) selectedStoreId = storesMeta[0].id;
    renderSidebarLists();
    renderOverview();
    populateStoreSelect();
    if (currentView === "stores") renderStoreDetail();
  }, err => showToast("Liste alınamadı: " + err.message));
}

function listenProducts(storeId) {
  const q = query(collection(db, "stores", storeId, "products"), orderBy("name"));
  productUnsubs[storeId] = onSnapshot(q, snap => {
    storeProducts[storeId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOverview();
    if (currentView === "stores" && selectedStoreId === storeId) renderStoreDetail();
    if (globalSearchInput.value.trim()) runGlobalSearch(globalSearchInput.value.trim().toLowerCase());
  }, err => showToast("Senkronizasyon hatası: " + err.message));
}

// ---------- Tüm mağaza/kategorilerde arama ----------
globalSearchInput.addEventListener("input", () => runGlobalSearch(globalSearchInput.value.trim().toLowerCase()));

function runGlobalSearch(term) {
  if (!term) {
    globalSearchResults.style.display = "none";
    globalSearchResults.innerHTML = "";
    sidebarListsWrap.style.display = "block";
    return;
  }
  sidebarListsWrap.style.display = "none";
  globalSearchResults.style.display = "flex";

  const matches = [];
  storesMeta.forEach((s, i) => {
    (storeProducts[s.id] || []).forEach(p => {
      const hay = [p.name, p.category, p.description].filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(term)) matches.push({ storeId: s.id, storeName: s.name, colorIndex: i, product: p });
    });
  });

  if (!matches.length) {
    globalSearchResults.innerHTML = `<div class="gsr-empty">Eşleşen ürün bulunamadı.</div>`;
    return;
  }
  globalSearchResults.innerHTML = "";
  matches.forEach(m => {
    const color = colorFor(m.colorIndex).c;
    const row = document.createElement("div");
    row.className = "gsr-item";
    row.innerHTML = `
      <div class="gsr-item-top">
        <span class="gsr-name">${escapeHtml(m.product.name)}</span>
        <span class="gsr-stock" style="color:${color}">${m.product.stock}</span>
      </div>
      <div class="gsr-meta">
        <span class="gsr-store-dot" style="background:${color}"></span>
        <span>${escapeHtml(m.storeName)}</span>
        ${m.product.category ? `<span class="gsr-category">${escapeHtml(m.product.category)}</span>` : ""}
        ${m.product.description ? `<span>${escapeHtml(m.product.description)}</span>` : ""}
      </div>`;
    row.addEventListener("click", () => {
      selectedStoreId = m.storeId;
      searchTerms[m.storeId] = (m.product.name || "").toLowerCase();
      expandedProducts.add(`${m.storeId}:${m.product.id}`);
      globalSearchInput.value = "";
      runGlobalSearch("");
      storeSelect.value = m.storeId;
      switchView("stores");
    });
    globalSearchResults.appendChild(row);
  });
}

// ---------- Mağaza / kategori ekleme, ad değiştirme, silme ----------
addStoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newStoreNameInput.value.trim();
  if (!name) return;
  try {
    const ref = await addDoc(collection(db, "stores"), { name, type: "store", createdAt: serverTimestamp() });
    newStoreNameInput.value = ""; selectedStoreId = ref.id;
    showToast(`"${name}" eklendi.`);
  } catch (err) { showToast("Mağaza eklenemedi: " + err.message); }
});

addCategoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newCategoryNameInput.value.trim();
  if (!name) return;
  try {
    const ref = await addDoc(collection(db, "stores"), { name, type: "category", createdAt: serverTimestamp() });
    newCategoryNameInput.value = ""; selectedStoreId = ref.id;
    showToast(`"${name}" kategorisi eklendi.`);
  } catch (err) { showToast("Kategori eklenemedi: " + err.message); }
});

async function renameStore(storeId, oldName) {
  const name = prompt("Yeni ad:", oldName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === oldName) return;
  try { await updateDoc(doc(db, "stores", storeId), { name: trimmed }); showToast("Ad güncellendi."); }
  catch (err) { showToast("Güncellenemedi: " + err.message); }
}

async function deleteStore(storeId, name) {
  if (!confirm(`"${name}" ve içindeki TÜM ürünleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
  try {
    const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
    const batch = writeBatch(db);
    productsSnap.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, "stores", storeId));
    await batch.commit();
    showToast(`"${name}" silindi.`);
  } catch (err) { showToast("Silinemedi: " + err.message); }
}

// ---------- Sidebar listeleri ----------
function renderSidebarLists() {
  renderSidebarGroup(sidebarStoreList, storesMeta.filter(s => s.type !== "category"), "Henüz mağaza yok.");
  renderSidebarGroup(sidebarCategoryList, storesMeta.filter(s => s.type === "category"), "Henüz kategori yok.");
}

function renderSidebarGroup(container, list, emptyText) {
  container.innerHTML = "";
  list.forEach(s => {
    const color = colorFor(storesMeta.findIndex(x => x.id === s.id)).c;
    const row = document.createElement("div");
    row.className = "sidebar-store-row" + (s.id === selectedStoreId && currentView === "stores" ? " active" : "");
    row.innerHTML = `
      <span class="sidebar-store-dot" style="background:${color}"></span>
      <span class="sidebar-store-name">${escapeHtml(s.name)}</span>
      <button class="sidebar-icon-btn" data-role="rename" title="Yeniden adlandır">✎</button>
      <button class="sidebar-icon-btn" data-role="delete" title="Sil">✕</button>`;
    row.querySelector('[data-role="rename"]').addEventListener("click", (e) => { e.stopPropagation(); renameStore(s.id, s.name); });
    row.querySelector('[data-role="delete"]').addEventListener("click", (e) => { e.stopPropagation(); deleteStore(s.id, s.name); });
    row.addEventListener("click", () => { selectedStoreId = s.id; storeSelect.value = s.id; switchView("stores"); });
    container.appendChild(row);
  });
  if (!list.length) {
    container.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-size:12px;padding:6px 8px;">${emptyText}</div>`;
  }
}

// ---------- Genel Bakış ----------
function renderOverview() {
  overviewView.innerHTML = "";
  if (!storesMeta.length) {
    overviewView.innerHTML = `<div class="store-empty-hint">Henüz mağaza eklenmedi. Sol menüden "+" ile ilk mağazanızı ekleyin.</div>`;
    return;
  }
  storesMeta.forEach((s, i) => overviewView.appendChild(buildStoreCard(s, i)));
}

// ---------- Mağazalar (tekli görünüm) ----------
function populateStoreSelect() {
  const prev = storeSelect.value;
  storeSelect.innerHTML = "";
  storesMeta.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = (s.type === "category" ? "🏷 " : "") + s.name;
    storeSelect.appendChild(opt);
  });
  if (selectedStoreId && storesMeta.some(s => s.id === selectedStoreId)) storeSelect.value = selectedStoreId;
  else if (prev && storesMeta.some(s => s.id === prev)) storeSelect.value = prev;
}
storeSelect.addEventListener("change", () => {
  selectedStoreId = storeSelect.value;
  renderSidebarLists();
  renderStoreDetail();
});

function renderStoreDetail() {
  storeDetailWrap.innerHTML = "";
  if (!storesMeta.length) {
    storeDetailWrap.innerHTML = `<div class="store-empty-hint">Henüz mağaza eklenmedi. Sol menüden ilk mağazanızı ekleyin.</div>`;
    return;
  }
  const idx = storesMeta.findIndex(s => s.id === selectedStoreId);
  storeDetailWrap.appendChild(buildStoreCard(storesMeta[idx >= 0 ? idx : 0], idx >= 0 ? idx : 0));
}

// ---------- Kart ----------
function buildStoreCard(store, colorIndex) {
  const color = colorFor(colorIndex);
  const card = document.createElement("div");
  card.className = "store-card";
  card.dataset.store = store.id;
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
        <button class="icon-btn danger" data-role="delete" title="Sil">✕</button>
      </div>
    </div>
    <div class="store-body">
      <div class="add-form">
        <input type="text" placeholder="Ürün adı" data-role="new-name" class="add-input" />
        <input type="text" placeholder="Tür (opsiyonel) — ör. Koltuk Takımları" data-role="new-category" class="add-input" />
        <input type="text" placeholder="Açıklama (opsiyonel) — ör. 2 üçlü, 2 berjer" data-role="new-desc" class="add-input" />
        <div class="add-row-bottom">
          <input type="number" placeholder="Adet" value="1" min="0" data-role="new-stock" class="add-stock-input" />
          <button class="add-btn-wide" data-role="add-btn">Ürün Ekle</button>
        </div>
      </div>
      <div class="search-row">
        <input type="text" placeholder="Bu listede ara (ürün / tür / açıklama)…" data-role="search" value="${escapeHtml(searchTerms[store.id] || "")}" />
      </div>
      <div class="product-list" data-role="list"></div>
    </div>`;

  card.querySelector('[data-role="rename"]').addEventListener("click", () => renameStore(store.id, store.name));
  card.querySelector('[data-role="delete"]').addEventListener("click", () => deleteStore(store.id, store.name));

  const q = (r) => card.querySelector(`[data-role="${r}"]`);
  const nameInput = q("new-name"), categoryInput = q("new-category"), descInput = q("new-desc"), stockInput = q("new-stock");
  const submitAdd = () => addProduct(store.id, nameInput, categoryInput, descInput, stockInput);
  q("add-btn").addEventListener("click", submitAdd);
  [nameInput, categoryInput, descInput, stockInput].forEach(inp =>
    inp.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); }));

  q("search").addEventListener("input", (e) => {
    searchTerms[store.id] = e.target.value.trim().toLowerCase();
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
  const items = term
    ? all.filter(p => [p.name, p.category, p.description].filter(Boolean).join(" ").toLowerCase().includes(term))
    : all;

  metaEl.textContent = `${all.length} ürün · toplam ${all.reduce((n, p) => n + (p.stock || 0), 0)} adet`;

  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state">${term ? "Eşleşen ürün yok." : "Henüz ürün eklenmedi."}</div>`;
    return;
  }

  listEl.innerHTML = "";
  items.forEach(p => {
    const key = `${storeId}:${p.id}`;
    const isOpen = expandedProducts.has(key);
    const item = document.createElement("div");
    item.className = "product-item";

    const subBits = [];
    if (p.category) subBits.push(`<span class="product-category">${escapeHtml(p.category)}</span>`);
    if (p.description) subBits.push(`<span class="product-desc-text">${escapeHtml(p.description)}</span>`);

    item.innerHTML = `
      <div class="product-row" data-role="row">
        ${p.image ? `<img class="product-thumb" src="${p.image}" alt="" />` : ""}
        <div class="product-info">
          <div class="product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          ${subBits.length ? `<div class="product-sub">${subBits.join("")}</div>` : ""}
        </div>
        <div class="product-row-right">
          <span class="tag ${p.stock === 0 ? "zero" : ""}" style="background:${color.s};color:${color.c}">${p.stock}</span>
          <span class="chevron ${isOpen ? "open" : ""}" data-role="chevron">⌄</span>
        </div>
      </div>
      <div class="product-expand" data-role="expand" style="display:${isOpen ? "flex" : "none"};">
        <div class="expand-image-row">
          <div class="expand-image-preview">
            ${p.image ? `<img src="${p.image}" alt="" />` : `<span class="ph">Görsel yok</span>`}
          </div>
          <div class="expand-image-actions">
            <label class="file-btn">Görsel Ekle
              <input type="file" accept="image/*" data-role="img-input" hidden />
            </label>
            ${p.image ? `<button class="img-remove-btn" data-role="img-remove">Görseli Kaldır</button>` : ""}
          </div>
        </div>
        <div class="expand-stock-row">
          <span class="expand-stock-label">Stok</span>
          <div class="stepper-lg">
            <button class="step-btn-lg" data-role="minus">−</button>
            <span class="tag-lg">${p.stock}</span>
            <button class="step-btn-lg" data-role="plus">+</button>
          </div>
        </div>
        <button class="expand-delete-btn" data-role="del">Ürünü Sil</button>
      </div>`;

    const expandEl = item.querySelector('[data-role="expand"]');
    const chevronEl = item.querySelector('[data-role="chevron"]');
    item.querySelector('[data-role="row"]').addEventListener("click", () => {
      const open = expandEl.style.display === "flex";
      expandEl.style.display = open ? "none" : "flex";
      chevronEl.classList.toggle("open", !open);
      if (open) expandedProducts.delete(key); else expandedProducts.add(key);
    });

    item.querySelector('[data-role="minus"]').addEventListener("click", () => changeStock(storeId, p.id, Math.max(0, p.stock - 1)));
    item.querySelector('[data-role="plus"]').addEventListener("click", () => changeStock(storeId, p.id, p.stock + 1));
    item.querySelector('[data-role="del"]').addEventListener("click", () => removeProduct(storeId, p.id, p.name));
    item.querySelector('[data-role="img-input"]').addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleImageFile(file, storeId, p.id);
    });
    const rm = item.querySelector('[data-role="img-remove"]');
    if (rm) rm.addEventListener("click", () => removeImage(storeId, p.id));

    listEl.appendChild(item);
  });
}

// ---------- Ürün işlemleri ----------
async function addProduct(storeId, nameInput, categoryInput, descInput, stockInput) {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  try {
    await addDoc(collection(db, "stores", storeId, "products"), {
      name,
      category: categoryInput.value.trim(),
      description: descInput.value.trim(),
      stock: Math.max(0, parseInt(stockInput.value || "0", 10)),
      updatedAt: serverTimestamp()
    });
    nameInput.value = ""; categoryInput.value = ""; descInput.value = ""; stockInput.value = "1";
    nameInput.focus();
  } catch (err) { showToast("Ürün eklenemedi: " + err.message); }
}

async function changeStock(storeId, productId, newStock) {
  try { await updateDoc(doc(db, "stores", storeId, "products", productId), { stock: newStock, updatedAt: serverTimestamp() }); }
  catch (err) { showToast("Stok güncellenemedi: " + err.message); }
}

async function removeProduct(storeId, productId, name) {
  if (!confirm(`"${name}" ürünü silinsin mi?`)) return;
  try {
    await deleteDoc(doc(db, "stores", storeId, "products", productId));
    expandedProducts.delete(`${storeId}:${productId}`);
    showToast("Ürün silindi.");
  } catch (err) { showToast("Silinemedi: " + err.message); }
}

// Görseller tarayıcıda küçültülüp ürün belgesinde saklanır (Firebase Storage gerekmez).
function handleImageFile(file, storeId, productId) {
  if (!file.type.startsWith("image/")) { showToast("Lütfen bir görsel dosyası seçin."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        await updateDoc(doc(db, "stores", storeId, "products", productId), {
          image: canvas.toDataURL("image/jpeg", IMAGE_QUALITY), updatedAt: serverTimestamp()
        });
        showToast("Görsel eklendi.");
      } catch (err) { showToast("Görsel kaydedilemedi: " + err.message); }
    };
    img.onerror = () => showToast("Görsel okunamadı.");
    img.src = e.target.result;
  };
  reader.onerror = () => showToast("Dosya okunamadı.");
  reader.readAsDataURL(file);
}

async function removeImage(storeId, productId) {
  try {
    await updateDoc(doc(db, "stores", storeId, "products", productId), { image: null, updatedAt: serverTimestamp() });
    showToast("Görsel kaldırıldı.");
  } catch (err) { showToast("Kaldırılamadı: " + err.message); }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
