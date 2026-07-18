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

// Teşhir ürünler bölümü için sabit renk (mağaza paletinden ayrı, kolayca ayırt edilsin diye)
const SHOWROOM_COLOR = { c: "#9333EA", s: "#F1E4FE" };

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

// Yeni görünümler
const searchView = document.getElementById("searchView");
const globalSearchInput = document.getElementById("globalSearchInput");
const globalSearchResults = document.getElementById("globalSearchResults");

const showroomView = document.getElementById("showroomView");
const showroomWrap = document.getElementById("showroomWrap");

const categoriesView = document.getElementById("categoriesView");
const newCategoryIconInput = document.getElementById("newCategoryIconInput");
const newCategoryIconPreview = document.getElementById("newCategoryIconPreview");
const newCategoryIconPlaceholder = document.getElementById("newCategoryIconPlaceholder");
const newCategoryName = document.getElementById("newCategoryName");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const categoriesList = document.getElementById("categoriesList");

// Ürün detay modalı
const productModalBackdrop = document.getElementById("productModalBackdrop");
const productModalClose = document.getElementById("productModalClose");
const productModalImg = document.getElementById("productModalImg");
const productModalImgPlaceholder = document.getElementById("productModalImgPlaceholder");
const productModalImageInput = document.getElementById("productModalImageInput");
const productModalImageRemove = document.getElementById("productModalImageRemove");
const productModalName = document.getElementById("productModalName");
const productModalDesc = document.getElementById("productModalDesc");
const productModalCategory = document.getElementById("productModalCategory");
const productModalNewCategory = document.getElementById("productModalNewCategory");
const productModalStock = document.getElementById("productModalStock");
const productModalSave = document.getElementById("productModalSave");
const productModalShowroomBtn = document.getElementById("productModalShowroomBtn");
const productModalDelete = document.getElementById("productModalDelete");
const productModalMsg = document.getElementById("productModalMsg");

// Hızlı tür ekleme modalı
const categoryModalBackdrop = document.getElementById("categoryModalBackdrop");
const categoryModalClose = document.getElementById("categoryModalClose");
const quickCategoryIconInput = document.getElementById("quickCategoryIconInput");
const quickCategoryIconPreview = document.getElementById("quickCategoryIconPreview");
const quickCategoryIconPlaceholder = document.getElementById("quickCategoryIconPlaceholder");
const quickCategoryName = document.getElementById("quickCategoryName");
const quickCategorySave = document.getElementById("quickCategorySave");
const categoryModalMsg = document.getElementById("categoryModalMsg");

let mode = "login";
let currentView = "overview";
let selectedStoreId = null;

let storesUnsub = null;
let categoriesUnsub = null;
let showroomUnsub = null;
const productUnsubs = {};       // storeId -> unsubscribe fn
const storesMeta = [];          // [{id, name}]
const storeProducts = {};       // storeId -> [{id, name, description, category, stock, image}]
const searchTerms = {};         // storeId | "__showroom__" -> string
let categoriesMeta = [];        // [{id, name, icon}]
let showroomProducts = [];      // [{id, name, description, category, stock, image}]

let newCategoryIconData = "";
let quickCategoryIconData = "";

// Ürün detay modalının hangi ürüne baktığını izler
let modalScope = null;
let modalProductId = null;
let modalCurrentProduct = null;

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

// ---------- Görünüm değiştirme ----------
navItems.forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

const VIEW_TITLES = {
  overview: "Genel Bakış",
  stores: "Mağazalar",
  search: "Tüm Ürünlerde Ara",
  showroom: "Teşhir Ürünler",
  categories: "Ürün Türleri"
};

function switchView(view) {
  currentView = view;
  navItems.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  overviewView.style.display = view === "overview" ? "grid" : "none";
  storesView.style.display = view === "stores" ? "block" : "none";
  searchView.style.display = view === "search" ? "block" : "none";
  showroomView.style.display = view === "showroom" ? "block" : "none";
  categoriesView.style.display = view === "categories" ? "block" : "none";
  viewTitle.textContent = VIEW_TITLES[view] || "";

  if (view === "stores") renderStoreDetail();
  if (view === "search") { renderGlobalSearchResults(); setTimeout(() => globalSearchInput.focus({ preventScroll: true }), 50); }
  if (view === "showroom") renderShowroomView();
  if (view === "categories") renderCategoriesList();
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
      listenCategories();
      listenShowroom();
    } else {
      appScreen.style.display = "none";
      loginScreen.style.display = "flex";
      teardownListeners();
    }
  });
}

function teardownListeners() {
  if (storesUnsub) storesUnsub();
  if (categoriesUnsub) categoriesUnsub();
  if (showroomUnsub) showroomUnsub();
  Object.values(productUnsubs).forEach(fn => fn && fn());
  for (const k in productUnsubs) delete productUnsubs[k];
  storesMeta.length = 0;
  for (const k in storeProducts) delete storeProducts[k];
  categoriesMeta = [];
  showroomProducts = [];
  closeProductModal();
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
    if (currentView === "search") renderGlobalSearchResults();
  }, err => showToast("Mağaza listesi alınamadı: " + err.message));
}

function listenProducts(storeId) {
  const q = query(collection(db, "stores", storeId, "products"), orderBy("name"));
  productUnsubs[storeId] = onSnapshot(q, snap => {
    storeProducts[storeId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOverview();
    if (currentView === "stores" && selectedStoreId === storeId) renderStoreDetail();
    if (currentView === "search") renderGlobalSearchResults();
    refreshOpenModalIfNeeded();
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

// ---------- Teşhir Ürünler görünümü ----------
function renderShowroomView() {
  showroomWrap.innerHTML = "";
  showroomWrap.appendChild(buildProductsCard(
    { type: "showroom" },
    "Teşhir Ürünler",
    SHOWROOM_COLOR,
    { showRename: false, showDelete: false }
  ));
}

// ---------- Mağaza kartı (Teşhir Ürünler ile aynı alt yapıyı kullanır) ----------
function buildStoreCard(store, colorIndex) {
  return buildProductsCard(
    { type: "store", storeId: store.id },
    store.name,
    colorFor(colorIndex),
    {
      showRename: true,
      showDelete: true,
      onRename: () => renameStore(store.id, store.name),
      onDelete: () => deleteStore(store.id, store.name)
    }
  );
}

// ---------- Ortak: mağaza / teşhir ürün kartı üretimi ----------
function scopeKey(scope) {
  return scope.type === "store" ? scope.storeId : "__showroom__";
}
function productsColRef(scope) {
  return scope.type === "store"
    ? collection(db, "stores", scope.storeId, "products")
    : collection(db, "showroomProducts");
}
function productDocRef(scope, id) {
  return scope.type === "store"
    ? doc(db, "stores", scope.storeId, "products", id)
    : doc(db, "showroomProducts", id);
}
function getProductsArray(scope) {
  return scope.type === "store" ? (storeProducts[scope.storeId] || []) : showroomProducts;
}

function buildProductsCard(scope, title, color, opts = {}) {
  const key = scopeKey(scope);
  const card = document.createElement("div");
  card.className = "store-card";
  card.dataset.scope = key;
  card.style.setProperty("--card-color", color.c);
  card.innerHTML = `
    <div class="store-head" style="border-top:4px solid ${color.c}">
      <div class="store-head-left">
        <span class="store-dot" style="background:${color.c}"></span>
        <div>
          <div class="store-title">${escapeHtml(title)}</div>
          <div class="store-meta" data-role="meta">0 ürün · toplam 0 adet</div>
        </div>
      </div>
      <div class="store-head-actions" data-role="head-actions"></div>
    </div>
    <div class="store-body">
      <div class="add-row">
        <input type="text" placeholder="Ürün adı" data-role="new-name" />
        <input type="number" placeholder="Adet" value="1" min="0" data-role="new-stock" />
        <button class="add-btn" data-role="add-btn" title="Ürün ekle">+</button>
      </div>
      <div class="add-row-extra">
        <input type="text" placeholder="Açıklama (opsiyonel, ör. 2 üçlü 2 berjer)" data-role="new-desc" />
        <select data-role="new-category"></select>
      </div>
      <div class="search-row">
        <input type="text" placeholder="Bu listede ara…" data-role="search" value="${escapeHtml(searchTerms[key] || "")}" />
      </div>
      <div class="product-list" data-role="list"></div>
    </div>
  `;

  const headActions = card.querySelector('[data-role="head-actions"]');
  if (opts.showRename) {
    const b = document.createElement("button");
    b.className = "icon-btn";
    b.title = "Yeniden adlandır";
    b.textContent = "✎";
    b.addEventListener("click", opts.onRename);
    headActions.appendChild(b);
  }
  if (opts.showDelete) {
    const b = document.createElement("button");
    b.className = "icon-btn danger";
    b.title = "Sil";
    b.textContent = "✕";
    b.addEventListener("click", opts.onDelete);
    headActions.appendChild(b);
  }

  const nameInput = card.querySelector('[data-role="new-name"]');
  const stockInput = card.querySelector('[data-role="new-stock"]');
  const descInput = card.querySelector('[data-role="new-desc"]');
  const categorySelect = card.querySelector('[data-role="new-category"]');
  const addBtn = card.querySelector('[data-role="add-btn"]');
  const searchInput = card.querySelector('[data-role="search"]');

  renderCategoryOptions(categorySelect, "");

  const submitAdd = () => addProduct(scope, nameInput, stockInput, descInput, categorySelect);
  addBtn.addEventListener("click", submitAdd);
  nameInput.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); });
  stockInput.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); });
  descInput.addEventListener("keydown", e => { if (e.key === "Enter") submitAdd(); });

  searchInput.addEventListener("input", () => {
    searchTerms[key] = searchInput.value.trim().toLowerCase();
    fillProductList(card, scope, color);
  });

  fillProductList(card, scope, color);
  return card;
}

function fillProductList(card, scope, color) {
  const key = scopeKey(scope);
  const listEl = card.querySelector('[data-role="list"]');
  const metaEl = card.querySelector('[data-role="meta"]');
  const all = getProductsArray(scope);
  const term = searchTerms[key] || "";
  const items = term ? all.filter(p => matchesTerm(p, term)) : all;

  const totalStock = all.reduce((sum, p) => sum + (p.stock || 0), 0);
  metaEl.textContent = `${all.length} ürün · toplam ${totalStock} adet`;

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state">${term ? "Eşleşen ürün yok." : "Henüz ürün eklenmedi."}</div>`;
    return;
  }

  listEl.innerHTML = "";
  items.forEach(p => listEl.appendChild(buildProductRow(p, scope, color)));
}

function matchesTerm(p, term) {
  const cat = p.category ? categoriesMeta.find(c => c.id === p.category) : null;
  const hay = [p.name, p.description || "", cat ? cat.name : ""].join(" ").toLowerCase();
  return hay.includes(term);
}

// ---------- Ortak ürün satırı (mağaza / teşhir / arama sonuçlarında kullanılır) ----------
// Mobilde de her yerde: isim üstte, açıklama altta.
function buildProductRow(p, scope, color, sourceLabel) {
  const row = document.createElement("div");
  row.className = "product-row";

  const cat = p.category ? categoriesMeta.find(c => c.id === p.category) : null;
  const thumbHtml = p.image
    ? `<img src="${p.image}" alt="" />`
    : (cat && cat.icon
        ? `<img src="${cat.icon}" alt="" />`
        : `<span>${escapeHtml((p.name || "?").trim().charAt(0).toUpperCase() || "?")}</span>`);
  const pillHtml = cat
    ? `<span class="product-cat-pill ${pillClassFor(cat.name)}">${cat.icon ? `<img src="${cat.icon}" alt="" />` : ""}${escapeHtml(cat.name)}</span>`
    : "";

  row.innerHTML = `
    <div class="product-thumb">${thumbHtml}</div>
    <div class="product-info">
      ${sourceLabel ? `<div class="search-result-source">${escapeHtml(sourceLabel)}</div>` : ""}
      <div class="product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
      ${p.description ? `<div class="product-desc" title="${escapeHtml(p.description)}">${escapeHtml(p.description)}</div>` : ""}
      ${pillHtml}
    </div>
    <div class="product-side">
      <div class="stepper">
        <button type="button" class="step-btn" data-role="minus">−</button>
        <span class="tag ${(p.stock || 0) === 0 ? "zero" : ""}" style="background:${color.s};color:${color.c}">${p.stock || 0}</span>
        <button type="button" class="step-btn" data-role="plus">+</button>
      </div>
      <button type="button" class="del-btn" data-role="del" title="Ürünü sil">✕</button>
    </div>
  `;

  row.querySelector('[data-role="minus"]').addEventListener("click", (e) => {
    e.stopPropagation();
    changeStock(scope, p.id, Math.max(0, (p.stock || 0) - 1));
  });
  row.querySelector('[data-role="plus"]').addEventListener("click", (e) => {
    e.stopPropagation();
    changeStock(scope, p.id, (p.stock || 0) + 1);
  });
  row.querySelector('[data-role="del"]').addEventListener("click", (e) => {
    e.stopPropagation();
    removeProduct(scope, p.id, p.name);
  });
  row.addEventListener("click", () => openProductModal(scope, p));

  return row;
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pillClassFor(name) {
  return "cat-pill-" + (hashStr(name || "") % 6);
}

async function addProduct(scope, nameInput, stockInput, descInput, categorySelect) {
  const name = nameInput.value.trim();
  const stock = Math.max(0, parseInt(stockInput.value || "0", 10));
  const description = descInput ? descInput.value.trim() : "";
  const category = categorySelect ? categorySelect.value : "";
  if (!name) { nameInput.focus(); return; }
  try {
    await addDoc(productsColRef(scope), {
      name, description, category, stock, image: "", updatedAt: serverTimestamp()
    });
    nameInput.value = "";
    stockInput.value = "1";
    if (descInput) descInput.value = "";
    if (categorySelect) categorySelect.value = "";
    nameInput.focus();
  } catch (err) {
    showToast("Ürün eklenemedi: " + err.message);
  }
}

async function changeStock(scope, productId, newStock) {
  try {
    await updateDoc(productDocRef(scope, productId), {
      stock: newStock, updatedAt: serverTimestamp()
    });
  } catch (err) {
    showToast("Stok güncellenemedi: " + err.message);
  }
}

async function deleteProductDirect(scope, productId) {
  await deleteDoc(productDocRef(scope, productId));
}

async function removeProduct(scope, productId, name) {
  if (!confirm(`"${name}" ürünü silinsin mi?`)) return;
  try {
    await deleteProductDirect(scope, productId);
    if (scope.type === "store") await removeProductFromShowroomBySource(scope.storeId, productId, true);
    showToast("Ürün silindi.");
  } catch (err) {
    showToast("Silinemedi: " + err.message);
  }
}

// ---------- Tüm Ürünlerde Ara ----------
globalSearchInput.addEventListener("input", renderGlobalSearchResults);

function renderGlobalSearchResults() {
  const term = globalSearchInput.value.trim().toLowerCase();

  const results = [];
  storesMeta.forEach((s, i) => {
    (storeProducts[s.id] || []).forEach(p => {
      results.push({ p, scope: { type: "store", storeId: s.id }, color: colorFor(i), sourceLabel: s.name });
    });
  });
  showroomProducts.forEach(p => {
    results.push({ p, scope: { type: "showroom" }, color: SHOWROOM_COLOR, sourceLabel: "Teşhir Ürünler" });
  });

  globalSearchResults.innerHTML = "";

  if (!term) {
    globalSearchResults.innerHTML = `<div class="store-empty-hint">Aramak için yukarıya yazmaya başlayın. Tüm mağazalar ve Teşhir Ürünler taranır.</div>`;
    return;
  }

  const filtered = results.filter(r => matchesTerm(r.p, term));
  if (filtered.length === 0) {
    globalSearchResults.innerHTML = `<div class="store-empty-hint">Eşleşen ürün bulunamadı.</div>`;
    return;
  }
  filtered.slice(0, 300).forEach(r => {
    globalSearchResults.appendChild(buildProductRow(r.p, r.scope, r.color, r.sourceLabel));
  });
}

// ---------- Ürün Türleri (kategoriler) ----------
function listenCategories() {
  const q = query(collection(db, "categories"), orderBy("name"));
  categoriesUnsub = onSnapshot(q, snap => {
    categoriesMeta = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategoriesList();
    renderOverview();
    if (currentView === "stores") renderStoreDetail();
    if (currentView === "showroom") renderShowroomView();
    if (currentView === "search") renderGlobalSearchResults();
    refreshOpenModalIfNeeded();
  }, err => showToast("Ürün türleri alınamadı: " + err.message));
}

function renderCategoryOptions(selectEl, selectedId) {
  const prev = selectedId !== undefined ? selectedId : selectEl.value;
  selectEl.innerHTML = `<option value="">— Tür seçilmedi —</option>`;
  categoriesMeta.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    selectEl.appendChild(opt);
  });
  if (prev && categoriesMeta.some(c => c.id === prev)) selectEl.value = prev;
}

function renderCategoriesList() {
  categoriesList.innerHTML = "";
  if (categoriesMeta.length === 0) {
    categoriesList.innerHTML = `<div class="store-empty-hint">Henüz tür eklenmedi. Yukarıdan ilk türünüzü ekleyin (ör. Koltuk Takımları, Yatak Odaları).</div>`;
    return;
  }
  categoriesMeta.forEach(cat => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <div class="category-row-icon">${cat.icon ? `<img src="${cat.icon}" alt="" />` : "▤"}</div>
      <div class="category-row-name">${escapeHtml(cat.name)}</div>
      <button class="icon-btn" data-role="rename" title="Yeniden adlandır">✎</button>
      <button class="icon-btn danger" data-role="delete" title="Türü sil">✕</button>
    `;
    row.querySelector('[data-role="rename"]').addEventListener("click", () => renameCategory(cat));
    row.querySelector('[data-role="delete"]').addEventListener("click", () => deleteCategory(cat));
    categoriesList.appendChild(row);
  });
}

async function addCategory(name, icon) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Tür adı boş olamaz.");
  const ref = await addDoc(collection(db, "categories"), {
    name: trimmed, icon: icon || "", createdAt: serverTimestamp()
  });
  return ref.id;
}

async function renameCategory(cat) {
  const name = prompt("Yeni tür adı:", cat.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === cat.name) return;
  try {
    await updateDoc(doc(db, "categories", cat.id), { name: trimmed });
    showToast("Tür adı güncellendi.");
  } catch (err) {
    showToast("Güncellenemedi: " + err.message);
  }
}

async function deleteCategory(cat) {
  if (!confirm(`"${cat.name}" türünü silmek istediğinize emin misiniz? Bu türe atanmış ürünler silinmez, sadece etiketleri kaybolur.`)) return;
  try {
    await deleteDoc(doc(db, "categories", cat.id));
    showToast("Tür silindi.");
  } catch (err) {
    showToast("Silinemedi: " + err.message);
  }
}

function wireIconUpload(inputEl, previewImgEl, placeholderEl, onData) {
  inputEl.addEventListener("change", async () => {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataURL(file, 140, 0.82);
      previewImgEl.src = dataUrl;
      previewImgEl.style.display = "block";
      placeholderEl.style.display = "none";
      onData(dataUrl);
    } catch (err) {
      showToast("İkon yüklenemedi: " + err.message);
    } finally {
      inputEl.value = "";
    }
  });
}
wireIconUpload(newCategoryIconInput, newCategoryIconPreview, newCategoryIconPlaceholder, d => { newCategoryIconData = d; });
wireIconUpload(quickCategoryIconInput, quickCategoryIconPreview, quickCategoryIconPlaceholder, d => { quickCategoryIconData = d; });

addCategoryBtn.addEventListener("click", async () => {
  const name = newCategoryName.value.trim();
  if (!name) { newCategoryName.focus(); return; }
  try {
    await addCategory(name, newCategoryIconData);
    newCategoryName.value = "";
    newCategoryIconData = "";
    newCategoryIconPreview.style.display = "none";
    newCategoryIconPreview.removeAttribute("src");
    newCategoryIconPlaceholder.style.display = "flex";
    showToast(`"${name}" türü eklendi.`);
  } catch (err) {
    showToast("Tür eklenemedi: " + err.message);
  }
});
newCategoryName.addEventListener("keydown", e => { if (e.key === "Enter") addCategoryBtn.click(); });

// Ürün detay modalından "+ Yeni Tür"
productModalNewCategory.addEventListener("click", () => {
  quickCategoryName.value = "";
  quickCategoryIconData = "";
  quickCategoryIconPreview.style.display = "none";
  quickCategoryIconPreview.removeAttribute("src");
  quickCategoryIconPlaceholder.style.display = "flex";
  categoryModalMsg.textContent = "";
  categoryModalBackdrop.style.display = "flex";
});
categoryModalClose.addEventListener("click", () => { categoryModalBackdrop.style.display = "none"; });
categoryModalBackdrop.addEventListener("click", (e) => {
  if (e.target === categoryModalBackdrop) categoryModalBackdrop.style.display = "none";
});
quickCategoryName.addEventListener("keydown", e => { if (e.key === "Enter") quickCategorySave.click(); });

quickCategorySave.addEventListener("click", async () => {
  const name = quickCategoryName.value.trim();
  if (!name) { categoryModalMsg.textContent = "Tür adı boş olamaz."; return; }
  try {
    const newId = await addCategory(name, quickCategoryIconData);
    categoryModalBackdrop.style.display = "none";
    renderCategoryOptions(productModalCategory, newId);
    showToast(`"${name}" türü eklendi.`);
  } catch (err) {
    categoryModalMsg.textContent = "Kaydedilemedi: " + err.message;
  }
});

// ---------- Teşhir Ürünler dinleyicisi ----------
function listenShowroom() {
  const q = query(collection(db, "showroomProducts"), orderBy("name"));
  showroomUnsub = onSnapshot(q, snap => {
    showroomProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === "showroom") renderShowroomView();
    if (currentView === "search") renderGlobalSearchResults();
    refreshOpenModalIfNeeded();
  }, err => showToast("Teşhir ürünleri alınamadı: " + err.message));
}

// ---------- Teşhir Ürünlere Ekle/Kaldır (mağazadaki üründen bağımsız bir kopya oluşturur, orijinali silinmez) ----------
function findShowroomCopyOf(storeId, productId) {
  return showroomProducts.find(sp => sp.sourceStoreId === storeId && sp.sourceProductId === productId) || null;
}

async function addProductToShowroom(product, storeId) {
  if (findShowroomCopyOf(storeId, product.id)) {
    showToast("Bu ürün zaten Teşhir Ürünler'de.");
    return;
  }
  try {
    await addDoc(collection(db, "showroomProducts"), {
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      stock: product.stock || 0,
      image: product.image || "",
      sourceStoreId: storeId,
      sourceProductId: product.id,
      updatedAt: serverTimestamp()
    });
    showToast(`"${product.name}" Teşhir Ürünler'e eklendi.`);
  } catch (err) {
    showToast("Teşhire eklenemedi: " + err.message);
  }
}

async function removeProductFromShowroomBySource(storeId, productId, silent = false) {
  const copy = findShowroomCopyOf(storeId, productId);
  if (!copy) return;
  try {
    await deleteDoc(doc(db, "showroomProducts", copy.id));
    if (!silent) showToast("Teşhir Ürünler'den kaldırıldı.");
  } catch (err) {
    if (!silent) showToast("Kaldırılamadı: " + err.message);
  }
}

function updateShowroomButtonState() {
  if (!modalScope || modalScope.type !== "store" || !modalProductId) {
    productModalShowroomBtn.style.display = "none";
    return;
  }
  productModalShowroomBtn.style.display = "block";
  const already = !!findShowroomCopyOf(modalScope.storeId, modalProductId);
  productModalShowroomBtn.classList.toggle("added", already);
  productModalShowroomBtn.textContent = already
    ? "✓ Teşhirde — Kaldırmak İçin Tıkla"
    : "◈ Teşhir Ürünlere Ekle";
}

productModalShowroomBtn.addEventListener("click", async () => {
  if (!modalScope || modalScope.type !== "store" || !modalCurrentProduct) return;
  const already = findShowroomCopyOf(modalScope.storeId, modalCurrentProduct.id);
  if (already) {
    await removeProductFromShowroomBySource(modalScope.storeId, modalCurrentProduct.id);
  } else {
    await addProductToShowroom(modalCurrentProduct, modalScope.storeId);
  }
  updateShowroomButtonState();
});

// ---------- Ürün detay modalı (stok + görsel + düzenleme buradan yapılır) ----------
function findProductInScope(scope, id) {
  return getProductsArray(scope).find(p => p.id === id) || null;
}

function openProductModal(scope, product) {
  modalScope = scope;
  modalProductId = product.id;
  modalCurrentProduct = product;

  productModalName.value = product.name || "";
  productModalDesc.value = product.description || "";
  productModalStock.value = product.stock || 0;
  renderCategoryOptions(productModalCategory, product.category || "");
  updateModalImagePreview(product.image || "");
  updateShowroomButtonState();
  productModalMsg.textContent = "";
  productModalBackdrop.style.display = "flex";
}

function updateModalImagePreview(image) {
  if (image) {
    productModalImg.src = image;
    productModalImg.style.display = "block";
    productModalImgPlaceholder.style.display = "none";
    productModalImageRemove.style.display = "inline-flex";
  } else {
    productModalImg.removeAttribute("src");
    productModalImg.style.display = "none";
    productModalImgPlaceholder.style.display = "flex";
    productModalImageRemove.style.display = "none";
  }
}

function closeProductModal() {
  productModalBackdrop.style.display = "none";
  modalScope = null;
  modalProductId = null;
  modalCurrentProduct = null;
  productModalImageInput.value = "";
}
productModalClose.addEventListener("click", closeProductModal);
productModalBackdrop.addEventListener("click", (e) => {
  if (e.target === productModalBackdrop) closeProductModal();
});

function refreshOpenModalIfNeeded() {
  if (!modalScope || !modalProductId) return;
  const p = findProductInScope(modalScope, modalProductId);
  if (!p) { closeProductModal(); return; }
  modalCurrentProduct = p;
  if (document.activeElement !== productModalStock) productModalStock.value = p.stock || 0;
  updateModalImagePreview(p.image || "");
  updateShowroomButtonState();
}

document.querySelector('[data-role="modal-minus"]').addEventListener("click", () => {
  if (!modalScope || !modalProductId) return;
  const newStock = Math.max(0, parseInt(productModalStock.value || "0", 10) - 1);
  productModalStock.value = newStock;
  changeStock(modalScope, modalProductId, newStock);
});
document.querySelector('[data-role="modal-plus"]').addEventListener("click", () => {
  if (!modalScope || !modalProductId) return;
  const newStock = Math.max(0, parseInt(productModalStock.value || "0", 10) + 1);
  productModalStock.value = newStock;
  changeStock(modalScope, modalProductId, newStock);
});
productModalStock.addEventListener("change", () => {
  if (!modalScope || !modalProductId) return;
  const newStock = Math.max(0, parseInt(productModalStock.value || "0", 10));
  productModalStock.value = newStock;
  changeStock(modalScope, modalProductId, newStock);
});

productModalSave.addEventListener("click", async () => {
  if (!modalScope || !modalProductId) return;
  const name = productModalName.value.trim();
  if (!name) { productModalMsg.textContent = "Ürün adı boş olamaz."; return; }
  const description = productModalDesc.value.trim();
  const category = productModalCategory.value || "";
  try {
    await updateDoc(productDocRef(modalScope, modalProductId), {
      name, description, category, updatedAt: serverTimestamp()
    });
    showToast("Ürün güncellendi.");
    closeProductModal();
  } catch (err) {
    productModalMsg.textContent = "Kaydedilemedi: " + err.message;
  }
});

productModalDelete.addEventListener("click", async () => {
  if (!modalScope || !modalProductId || !modalCurrentProduct) return;
  if (!confirm(`"${modalCurrentProduct.name}" ürünü silinsin mi?`)) return;
  try {
    await deleteProductDirect(modalScope, modalProductId);
    if (modalScope.type === "store") await removeProductFromShowroomBySource(modalScope.storeId, modalProductId, true);
    showToast("Ürün silindi.");
    closeProductModal();
  } catch (err) {
    productModalMsg.textContent = "Silinemedi: " + err.message;
  }
});

productModalImageInput.addEventListener("change", async () => {
  const file = productModalImageInput.files && productModalImageInput.files[0];
  if (!file || !modalScope || !modalProductId) return;
  try {
    const dataUrl = await compressImageToDataURL(file, 480, 0.72);
    await updateDoc(productDocRef(modalScope, modalProductId), {
      image: dataUrl, updatedAt: serverTimestamp()
    });
    updateModalImagePreview(dataUrl);
    showToast("Görsel güncellendi.");
  } catch (err) {
    showToast("Görsel yüklenemedi: " + err.message);
  } finally {
    productModalImageInput.value = "";
  }
});

productModalImageRemove.addEventListener("click", async () => {
  if (!modalScope || !modalProductId) return;
  try {
    await updateDoc(productDocRef(modalScope, modalProductId), {
      image: "", updatedAt: serverTimestamp()
    });
    updateModalImagePreview("");
    showToast("Görsel kaldırıldı.");
  } catch (err) {
    showToast("Kaldırılamadı: " + err.message);
  }
});

// ---------- Görsel sıkıştırma (Firestore'a base64 olarak kaydedilir) ----------
function compressImageToDataURL(file, maxDim = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Lütfen bir görsel dosyası seçin."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel açılamadı."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(err);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
