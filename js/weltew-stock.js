import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {readInventoryFile, guessColumns, buildImportPlan, digest} from './weltew-import.js?v=22';

import {createStockAssistant} from './stock-assistant.js?v=22';

import {matchesInventoryQuery,matchesInventoryCategory,getInventoryGroups} from './inventory-search.js?v=19';

export const WELTEW_OWNER_EMAIL = 'elit@elithome.local';
export const canAccessWeltew = user => Boolean(user && user.email === WELTEW_OWNER_EMAIL);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold = v => String(v ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
const num = v => new Intl.NumberFormat('tr-TR', {maximumFractionDigits:2}).format(Number(v)||0);
const money = v => new Intl.NumberFormat('tr-TR', {style:'currency',currency:'TRY'}).format(Number(v)||0);
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))), n=>n.toString(16).padStart(2,'0')).join('');

export async function prepareWeltewImport(records) {
  if (!Array.isArray(records) || !records.length || records.length > 20000) throw Error('Dosyada 1–20.000 stok satırı olmalı.');
  const occurrences = new Map();
  return Promise.all(records.map(async (p, index) => {
    if (!p || typeof p !== 'object') throw Error(`${index+1}. satır geçersiz.`);
    const name=String(p.productName??'').trim(), sku=String(p.productCode??'').trim();
    const qty=Number(p.quantity), buy=Number(p.lastPurchaseCost??0);
    if (!name || !sku || p.quantity===null || p.quantity==='' || !Number.isFinite(qty) || qty<0 || !Number.isFinite(buy) || buy<0) throw Error(`${index+1}. satırda ürün adı, kodu, miktar veya maliyet geçersiz.`);
    const warehouse=String(p.warehouse??'').trim(), branch=String(p.branch??'').trim();
    const key=JSON.stringify([branch,warehouse,sku]), occurrence=occurrences.get(key)||0;
    occurrences.set(key,occurrence+1);
    return {id:await hash(key+'|'+occurrence),name,sku,qty,buy,warehouse,branch,category:String(p.family||p.productGroup||p.group1||''),barcode:String(p.barcode??''),unit:'adet'};
  }));
}

export function createWeltewStockPanel({auth,db}) {
  const view=document.getElementById('weltewView'), nav=document.getElementById('weltewNavBtn');
  view.innerHTML=`<div class="ws-welcome"><div><p class="ws-eyebrow">ELİT HOME · ÖZEL ENVANTER</p><h1>Weltew Home Genel Stok</h1><p>Ürünlerinizi bulun, depo stoklarınızı tek yerde takip edin.</p></div><div class="brand-partner brand-partner-white"><span class="brand-partner-label">MARKA</span><img src="icons/weltew-logo-white.png" alt="Weltew Home"></div></div>
  <div class="ws-stats"><article><span>Ürün çeşidi</span><strong data-ws="count">0</strong></article><article><span>Toplam miktar</span><strong data-ws="quantity">0</strong></article><article><span>Stok maliyeti</span><strong data-ws="value">₺0</strong></article><article><span>Tükenen ürünler</span><strong data-ws="empty-count">0</strong></article></div>
  <section class="ws-panel"><div class="ws-heading"><div><h2>Ürün envanteri</h2><p>Bu bölüm yalnızca elit hesabına özeldir.</p></div><button data-ws="vat-undo" class="ws-button" type="button">KDV’yi geri al</button><button data-ws="vat" class="ws-button" type="button">%10 KDV ekle</button><button data-ws="zero-all" class="ws-button ws-danger" type="button">Hepsini kaldır · Stoğu sıfırla</button><button data-ws="import" class="ws-primary">↥ Excel / Toplu stok ekle</button><input data-ws="file" type="file" accept=".xlsx,.xls,.csv,.json" hidden></div>
  <div class="ws-filters"><input data-ws="search" type="search" placeholder="Ürün, kategori, kod veya depo ara…" aria-label="Weltew ürünlerinde ara"><select data-ws="category" aria-label="Kategori"><option value="">Tüm ürün grupları</option></select><select data-ws="warehouse" aria-label="Depo"><option value="">Tüm depolar</option></select><select data-ws="status" aria-label="Stok durumu"><option value="">Tüm stoklar</option><option value="available">Stokta</option><option value="empty">Tükenen</option></select><button data-ws="reset" class="ws-button">Temizle</button></div>
  <div data-ws="message" class="ws-message" role="status"></div><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>ÜRÜN / KOD</th><th>KATEGORİ / DEPO</th><th>MİKTAR</th><th>ALIŞ MALİYETİ</th><th>DURUM</th><th>İŞLEM</th></tr></thead><tbody data-ws="rows"></tbody></table></div><div data-ws="empty" class="ws-empty" hidden>Ürün bulunamadı. Aramayı veya filtreleri değiştirin.</div><div class="ws-footer"><span data-ws="summary"></span><div><button data-ws="prev" class="ws-button" aria-label="Önceki sayfa">←</button><span data-ws="page"></span><button data-ws="next" class="ws-button" aria-label="Sonraki sayfa">→</button></div></div></section>
  <dialog data-ws="dialog" class="ws-dialog"><form data-ws="form"><h2>Stok miktarını güncelle</h2><p data-ws="product-name"></p><label>Yeni miktar<input data-ws="qty" type="number" min="0" step="any" required></label><label>İşlem türü<select data-ws="move-type"><option value="Giriş">Stok girişi</option><option value="Çıkış">Stok çıkışı</option><option value="Sayım">Sayım / düzeltme</option></select></label><label>Müşteri / firma<input data-ws="customer" maxlength="120" placeholder="Örn. Ömür Keskin"></label><label>Nereden geldi?<input data-ws="source" maxlength="120" placeholder="Örn. Fabrika"></label><label>Nereye gitti?<input data-ws="destination" maxlength="120" placeholder="Örn. Müşteri, mağaza veya depo"></label><label>Açıklama<input data-ws="note" maxlength="300" placeholder="İsteğe bağlı not"></label><p data-ws="form-message" role="status"></p><div class="ws-dialog-actions"><button type="button" data-ws="cancel" class="ws-button">Vazgeç</button><button type="submit" data-ws="save" class="ws-primary">Kaydet</button></div></form></dialog>
  <dialog data-ws="zero-dialog" class="ws-dialog" aria-labelledby="ws-zero-title"><form data-ws="zero-form"><h2 id="ws-zero-title">Weltew stoklarını sıfırla</h2><p>Filtrelerden bağımsız olarak tüm Weltew ürünlerinin miktarı 0 olur. Ürün kayıtları korunur. İşlem geri alınamaz.</p><label>İşlem şifresi<input data-ws="zero-password" type="password" required autocomplete="off" autofocus></label><p data-ws="zero-message" role="alert"></p><div class="ws-dialog-actions"><button type="button" data-ws="zero-cancel" class="ws-button">Vazgeç</button><button type="submit" data-ws="zero-submit" class="ws-primary">Tüm stokları sıfırla</button></div></form></dialog>
  <dialog data-ws="import-dialog" class="ws-dialog ws-import-dialog" aria-labelledby="ws-import-title"><h2 id="ws-import-title">Excel / Toplu stok aktarımı</h2><p>Dosyayı seçin, işlem türünü belirleyin ve önizlemeyi kontrol edin. Excel dosyası cihazınızda okunur.</p><div class="ws-import-settings"><label>İşlem türü<select data-ws="import-mode"><option value="add">Gelen adetleri mevcut stoğun üzerine ekle</option><option value="sync">Adet ve birim maliyetleri Excel’e göre güncelle</option><option value="costs">Yalnızca birim maliyetleri güncelle (adetleri koru)</option><option value="replace">Yalnızca miktarları güncelle (maliyetleri koru)</option></select></label><label>Excel sayfası<select data-ws="import-sheet"></select></label></div><p data-ws="import-file-name"></p><div data-ws="import-columns" class="ws-import-settings"></div><p>Ürün kodu ve miktar zorunlu. Aynı kod birden fazla depoda varsa depo sütununu seçin. Yeni ürünler için ürün adı gereklidir. Dosyada olmayan ürünler değişmez.</p><button data-ws="import-preview" class="ws-button" type="button">Önizlemeyi hazırla</button><div data-ws="import-summary" role="status"></div><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>ÜRÜN / KOD</th><th>DEPO</th><th>MEVCUT</th><th>DOSYA</th><th>SONUÇ ADET</th><th>ESKİ BİRİM MALİYET</th><th>YENİ BİRİM MALİYET</th></tr></thead><tbody data-ws="import-rows"></tbody></table></div><p data-ws="import-message" role="alert"></p><div class="ws-dialog-actions"><button type="button" data-ws="import-cancel" class="ws-button">Vazgeç</button><button type="button" data-ws="import-apply" class="ws-primary" disabled>Onayla ve aktar</button></div></dialog>`;


  const $=key=>view.querySelector(`[data-ws="${key}"]`);
  let user=null, rows=[], unsubscribe=null, page=1, generation=0, opened=false, editingId=null, loading=false, importing=false, zeroing=false, addingVat=false;
  const allowed=()=>canAccessWeltew(user)&&auth?.currentUser?.uid===user.uid&&canAccessWeltew(auth.currentUser);
  const requireOwner=()=>{if(!allowed()) throw Error('Bu bölüm yalnızca elit hesabına açıktır.');};
  const message=text=>{$('message').textContent=text;};
  const assistant=createStockAssistant({view,getRows:()=>rows,allowed,isLoading:()=>loading,onOpen:()=>openStock(),getToken:()=>auth.currentUser.getIdToken()});
  function clear() {assistant.clear();generation++;$('import-dialog').close();importFile=null;importPlan=null;$('zero-dialog').close();$('zero-form').reset();if(unsubscribe)unsubscribe();unsubscribe=null;rows=[];page=1;opened=false;editingId=null;loading=false;importing=false;$('import').disabled=false;$('search').value='';$('category').value='';$('warehouse').value='';$('status').value='';$('dialog').close();$('form').reset();$('form-message').textContent='';message('');render();}
  function options(key,field,label) {const el=$(key),prior=el.value;const vals=[...new Set(rows.flatMap(p=>key==='category'?[p.category,...getInventoryGroups(p)]:[p[field]]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));el.innerHTML=`<option value="">${label}</option>`+vals.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');el.value=vals.includes(prior)?prior:'';}
  function render(){
    options('category','category','Tüm ürün grupları');options('warehouse','warehouse','Tüm depolar');
    const terms=fold($('search').value).trim().split(/\s+/).filter(Boolean);
    const filtered=rows.filter(p=>matchesInventoryQuery(p,$('search').value)&&matchesInventoryCategory(p,$('category').value)&&(!$('warehouse').value||p.warehouse===$('warehouse').value)&&(!$('status').value||($('status').value==='empty'?p.qty<=0:p.qty>0))).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    $('count').textContent=num(rows.length);$('quantity').textContent=num(rows.reduce((s,p)=>s+p.qty,0));$('value').textContent=money(rows.reduce((s,p)=>s+p.qty*p.buy,0));$('empty-count').textContent=num(rows.filter(p=>p.qty<=0).length);
    const pages=Math.max(1,Math.ceil(filtered.length/40));page=Math.max(1,Math.min(page,pages));const offset=(page-1)*40;
    $('rows').innerHTML=filtered.slice(offset,offset+40).map(p=>`<tr><td><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></td><td>${escape(p.category||'—')}<small>${escape(p.warehouse||'—')}</small></td><td><b>${num(p.qty)}</b> <small class="ws-inline">adet</small></td><td>${money(p.buy)}${p.vatRate===0.1?'<small>%10 KDV eklendi</small>':''}</td><td><span class="ws-status ${p.qty>0?'ws-available':'ws-out'}">${p.qty>0?'Stokta':'Tükendi'}</span></td><td><button class="ws-button" data-ws-edit="${escape(p.id)}" aria-label="${escape(p.name)} stok miktarını güncelle">± Stok</button></td></tr>`).join('');
    $('empty').hidden=filtered.length>0||loading;$('summary').textContent=filtered.length?`${num(filtered.length)} üründen ${num(offset+1)}–${num(Math.min(offset+40,filtered.length))} gösteriliyor`:'0 ürün';$('page').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;
  }
  ['search','category','warehouse','status'].forEach(key=>$(key).addEventListener(key==='search'?'input':'change',()=>{page=1;render();}));
  $('reset').addEventListener('click',()=>{['search','category','warehouse','status'].forEach(k=>$(k).value='');page=1;render();});
  async function updateVat(undo){
    if(!allowed()||loading||zeroing||importing||addingVat)return;
    const token=generation,targets=rows.filter(p=>undo?p.vatRate===0.1:p.buy>0&&p.vatRate!==0.1).map(p=>p.id);let completed=0;
    if(!targets.length){message(undo?'Geri alınacak %10 KDV kaydı yok.':'KDV eklenecek ürün yok. Maliyeti 0 olan veya %10 KDV eklenmiş ürünler atlanır.');return;}
    if(!confirm(undo?num(targets.length)+' ürünün KDV işlemi geri alınacak ve KDV öncesi kayıtlı alış maliyetleri geri getirilecek. Adetler değişmez. Onaylıyor musunuz?':num(targets.length)+' ürünün alış maliyetine %10 KDV eklenecek (1.000 TL → 1.100 TL). Tüm depolar ve filtre dışında kalan ürünler de kapsanır. Ürün adetleri değişmez. Daha önce eklenenlere tekrar uygulanmaz. Onaylıyor musunuz?'))return;
    try{
      requireOwner();addingVat=true;invalidateImport();
      for(const key of ['vat','vat-undo','zero-all','import','save','import-apply'])$(key).disabled=true;
      for(let offset=0;offset<targets.length;offset+=40){
        requireOwner();if(token!==generation)throw Error('Oturum değişti. İşlem durduruldu.');
        const ids=targets.slice(offset,offset+40);
        const changed=await runTransaction(db,async transaction=>{
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          const refs=ids.map(id=>doc(db,'weltewInventory','main','products',id));
          const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');let count=0;
          snapshots.forEach((snap,i)=>{
            if(!snap.exists())return;const product=snap.data(),before=Number(product.buy)||0;
            if(undo?product.vatRate!==0.1:before<=0||product.vatRate===0.1)return;
            if(undo&&(!Number.isFinite(product.buyBeforeVat)||product.buyBeforeVat<0))throw Error('KDV öncesi maliyet kaydı eksik. Ürün maliyeti değiştirilmedi.');
            const after=undo?product.buyBeforeVat:Math.round((before*1.1+Number.EPSILON)*100)/100;
            if(!Number.isFinite(after))throw Error('Ürün maliyeti sınırı aşıldı.');
            transaction.update(refs[i],{buy:after,buyBeforeVat:undo?product.buyBeforeVat:before,vatRate:undo?0:0.1,vatAppliedAt:undo?null:serverTimestamp(),vatRevertedAt:undo?serverTimestamp():null,updatedAt:serverTimestamp()});
            transaction.set(doc(collection(db,'weltewInventory','main','movements')),{productId:ids[i],before:Number(product.qty)||0,after:Number(product.qty)||0,buyBefore:before,buyAfter:after,vatRate:undo?0:0.1,note:undo?'%10 KDV geri alındı; KDV öncesi alış maliyeti geri getirildi':'Alış maliyetine %10 KDV eklendi',createdBy:user.uid,createdAt:serverTimestamp()});count++;
          });return count;
        });
        completed+=changed;if(token===generation)message(num(completed)+(undo?' ürünün KDV işlemi geri alındı…':' ürünün maliyetine %10 KDV eklendi…'));
      }
      if(token===generation)message(num(completed)+(undo?' ürünün KDV işlemi geri alındı. KDV öncesi maliyetleri geri getirildi.':' ürünün alış maliyetine %10 KDV eklendi. Toplam stok maliyeti güncellendi.'));
    }catch(error){if(token===generation)message(num(completed)+' ürün güncellendi. '+(error.code==='permission-denied'?'Veritabanı erişimi reddedildi.':error.message)+' Tekrar deneyebilirsiniz; tamamlanan ürünlere aynı işlem tekrar uygulanmaz.');}
    finally{addingVat=false;for(const key of ['vat','vat-undo','zero-all','import','save'])$(key).disabled=false;}
  }
  $('vat').addEventListener('click',()=>updateVat(false));
  $('vat-undo').addEventListener('click',()=>updateVat(true));
  $('zero-all').addEventListener('click',()=>{if(!allowed()||zeroing||importing||addingVat||loading)return;$('zero-form').reset();$('zero-message').textContent='';$('zero-dialog').showModal();});
  $('zero-cancel').addEventListener('click',()=>$('zero-dialog').close());
  $('zero-dialog').addEventListener('close',()=>{$('zero-password').value='';});
  $('zero-dialog').addEventListener('cancel',e=>{if(zeroing)e.preventDefault();});
  $('zero-form').addEventListener('submit',async event=>{
    event.preventDefault();if(zeroing||importing||addingVat)return;const token=generation;let completed=0,started=false;
    try{
      requireOwner();if(loading)throw Error('Stokların yüklenmesini bekleyin.');
      if(await hash($('zero-password').value)!=='e204d67929dbc17ab03bac3d6c6aaa74b9e0385d9f23a81cd425cb81e266bd81')throw Error('Şifre yanlış. Stoklar değiştirilmedi.');
      requireOwner();if(token!==generation)return;
      const targets=rows.filter(p=>p.qty!==0).map(p=>p.id);
      if(!targets.length){$('zero-dialog').close();message('Tüm stoklar zaten 0.');return;}
      if(!confirm('Tüm Weltew stok miktarları 0 olacak. Son onayı veriyor musunuz?'))return;
      started=true;zeroing=true;
      for(const key of ['zero-all','zero-submit','zero-cancel','import','save'])$(key).disabled=true;
      for(let offset=0;offset<targets.length;offset+=50){
        requireOwner();if(token!==generation)throw Error('Oturum değişti. İşlem durduruldu.');
        const ids=targets.slice(offset,offset+50);
        const count=await runTransaction(db,async transaction=>{
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          const refs=ids.map(id=>doc(db,'weltewInventory','main','products',id));
          const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          let changed=0;
          snapshots.forEach((snap,i)=>{if(!snap.exists())return;const before=Number(snap.data().qty)||0;if(before===0)return;
            transaction.update(refs[i],{qty:0,updatedAt:serverTimestamp()});
            transaction.set(doc(collection(db,'weltewInventory','main','movements')),{productId:ids[i],before,after:0,note:'Toplu stok sıfırlama',createdBy:user.uid,createdAt:serverTimestamp()});changed++;
          });return changed;
        });
        completed+=count;if(token===generation)$('zero-message').textContent=num(completed)+' ürün sıfırlandı…';
      }
      if(token===generation){$('zero-dialog').close();message(num(completed)+' ürünün stoğu sıfırlandı. Ürün kayıtları korundu.');}
    }catch(error){if(token===generation)$('zero-message').textContent=(completed?num(completed)+' ürün sıfırlandı. Kalanlar tamamlanamadı. ':'')+(error.code==='permission-denied'?'Veritabanı erişimi reddedildi.':error.message);}
    finally{$('zero-password').value='';if(started){zeroing=false;for(const key of ['zero-all','zero-submit','zero-cancel','import','save'])$(key).disabled=false;}}
  });
  $('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
  let importFile=null, importPlan=null, importMode='add', previewing=false;
  const columnLabels={sku:'Ürün kodu *',qty:'Miktar / Gelen adet *',name:'Ürün adı',warehouse:'Depo / Ambar',branch:'Şube',buy:'Birim maliyet / Son alış maliyeti',category:'Kategori',barcode:'Barkod'};
  function invalidateImport(){importPlan=null;$('import-apply').disabled=true;$('import-rows').innerHTML='';$('import-summary').textContent='';$('import-message').textContent='';}
  function selectImportSheet(){
    invalidateImport();const sheet=importFile?.sheets[Number($('import-sheet').value)];if(!sheet)return;
    const mapping=guessColumns(sheet.headers);
    $('import-columns').innerHTML=Object.entries(columnLabels).map(([key,label])=>`<label>${label}<select data-import-column="${key}"><option value="-1">Seçilmedi</option>${sheet.headers.map((h,i)=>`<option value="${i}" ${mapping[key]===i?'selected':''}>${escape(h||'Sütun '+(i+1))}</option>`).join('')}</select></label>`).join('');
  }
  $('import-columns').addEventListener('change',invalidateImport);
  $('import-sheet').addEventListener('change',selectImportSheet);
  $('import-mode').addEventListener('change',invalidateImport);
  $('import').addEventListener('click',()=>{if(allowed()&&!importing&&!zeroing&&!addingVat&&!loading)$('file').click();});
  $('import-cancel').addEventListener('click',()=>$('import-dialog').close());
  $('import-dialog').addEventListener('cancel',e=>{if(importing)e.preventDefault();});
  $('file').addEventListener('change',async event=>{
    const file=event.target.files[0],token=generation;if(!file)return;
    try{
      requireOwner();if(importing||zeroing||addingVat)throw Error('Bir toplu işlem zaten devam ediyor.');
      $('import').disabled=true;message('Dosya okunuyor…');
      const parsed=await readInventoryFile(file);requireOwner();if(token!==generation)return;
      importFile=parsed;invalidateImport();$('import-file-name').textContent=file.name;
      $('import-sheet').innerHTML=parsed.sheets.map((sheet,i)=>`<option value="${i}">${escape(sheet.name)}</option>`).join('');
      $('import-sheet').value='0';selectImportSheet();$('import-dialog').showModal();message('');
    }catch(error){if(token===generation)message(error.message);}
    finally{event.target.value='';if(token===generation)$('import').disabled=false;}
  });
  $('import-preview').addEventListener('click',async()=>{
    if(previewing||importing||!importFile)return;const token=generation;previewing=true;
    try{
      requireOwner();invalidateImport();$('import-preview').disabled=true;
      const mapping=Object.fromEntries([...view.querySelectorAll('[data-import-column]')].map(el=>[el.dataset.importColumn,Number(el.value)]));
      const sheet=importFile.sheets[Number($('import-sheet').value)],mode=$('import-mode').value;
      const plan=await buildImportPlan(sheet,mapping,rows,mode);
      requireOwner();if(token!==generation)return;
      // Ignore a preview if its settings changed while product IDs were prepared.
      if(sheet!==importFile.sheets[Number($('import-sheet').value)]||mode!==$('import-mode').value||Object.entries(mapping).some(([key,index])=>Number(view.querySelector(`[data-import-column="${key}"]`).value)!==index))return;
      importPlan=plan;importMode=mode;
      const fresh=plan.filter(p=>p.isNew).length;
      const costChanges=plan.filter(p=>p.updateBuy&&Math.abs(p.buyAfter-p.buyBefore)>0.00000001).length;
      const projectedCost=plan.reduce((sum,p)=>sum+p.after*p.buyAfter,0);
      $('import-summary').textContent=`${num(plan.length)} ürün · ${num(plan.length-fresh)} mevcut · ${num(fresh)} yeni. ${mode==='add'?'Dosyadaki adetler mevcut stoğa EKLENECEK; mevcut maliyetler korunacak.':mode==='costs'?'Yalnızca birim maliyetler Excel’den güncellenecek; adetler korunacak.':mode==='sync'?'Adetler ve birim maliyetler Excel’e göre güncellenecek.':'Yalnızca adetler güncellenecek; mevcut maliyetler korunacak.'} ${mode==='sync'||mode==='costs'?num(costChanges)+' üründe fiyat farkı var. Dosyadaki KDV hariç birim maliyetler kullanılır; bu satırlardaki uygulama KDV işareti kaldırılır. ':''}Aktarılan ürünlerin öngörülen toplam maliyeti: ${money(projectedCost)}. Dosyada olmayan ürünler bu toplama dahil değildir. İlk 30 ürün aşağıda. Son miktarlar aktarım anındaki stok üzerinden hesaplanır.`;
      $('import-rows').innerHTML=plan.slice(0,30).map(p=>`<tr><td>${escape(p.name)}<small>${escape(p.sku)}${p.isNew?' · YENİ ÜRÜN':''}</small></td><td>${escape(p.warehouse||'—')}</td><td>${num(p.before)}</td><td>${num(p.amount)}</td><td><b>${num(p.after)}</b></td><td>${money(p.buyBefore)}</td><td>${money(p.buyAfter)}</td></tr>`).join('');
      $('import-apply').disabled=false;
    }catch(error){if(token===generation)$('import-message').textContent=error.message;}
    finally{previewing=false;$('import-preview').disabled=false;}
  });
  $('import-apply').addEventListener('click',async()=>{
    if(importing||zeroing||addingVat||!importPlan||!importFile)return;
    const token=generation,plan=importPlan,mode=importMode,fingerprint=importFile.fingerprint;
    const operation=mode==='add'?fingerprint:crypto.randomUUID();let completed=0,skipped=0;
    try{
      requireOwner();if(!confirm(`${num(plan.length)} ürün aktarılacak. ${mode==='add'?'Dosyadaki adetler mevcut stoklara eklenecek. Aynı dosya tekrar yüklenirse ikinci kez eklenmez.':mode==='costs'?'Yalnızca birim maliyetler Excel’den güncellenecek; adetler korunacak. Güncellenen maliyetler KDV hariçtir.':mode==='sync'?'Adetler ve birim maliyetler Excel’e göre değiştirilecek. Güncellenen maliyetler KDV hariçtir.':'Yalnızca miktarlar değiştirilecek; eski maliyetler korunacak.'} Onaylıyor musunuz?`))return;
      importing=true;$('import-dialog').setAttribute('aria-busy','true');
      for(const key of ['import','zero-all','import-apply','import-preview','import-cancel','import-mode','import-sheet','save'])$(key).disabled=true;
      view.querySelectorAll('[data-import-column]').forEach(el=>el.disabled=true);
      for(let offset=0;offset<plan.length;offset+=25){
        requireOwner();if(token!==generation)throw Error('Oturum değişti. İşlem durduruldu.');
        const batch=plan.slice(offset,offset+25);
        const moveIds=await Promise.all(batch.map(p=>digest('import|'+mode+'|'+operation+'|'+p.id)));
        const result=await runTransaction(db,async transaction=>{
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          const refs=batch.map(p=>doc(db,'weltewInventory','main','products',p.id));
          const moves=moveIds.map(id=>doc(db,'weltewInventory','main','movements',id));
          const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
          const receipts=await Promise.all(moves.map(ref=>transaction.get(ref)));
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          let changed=0,duplicate=0;
          snapshots.forEach((snap,i)=>{
            if(receipts[i].exists()){duplicate++;return;}
            const item=batch[i];if(!snap.exists()&&!item.isNew)throw Error(`${item.sku}: ürün artık bulunamıyor. Önizlemeyi yeniden hazırlayın.`);
            const before=snap.exists()?Number(snap.data().qty)||0:0,after=mode==='costs'?before:mode==='add'?before+item.amount:item.amount;
            if(!Number.isFinite(after))throw Error(`${item.sku}: miktar sınırı aşıldı.`);
            if(snap.exists())transaction.update(refs[i],{qty:after,...(item.updateBuy?{buy:item.record.buy,buyBeforeVat:item.record.buy,vatRate:0,vatAppliedAt:null,vatRevertedAt:null}:{}),updatedAt:serverTimestamp()});
            else transaction.set(refs[i],{...item.record,qty:after,updatedAt:serverTimestamp()});
            transaction.set(moves[i],{productId:item.id,before,after,...(item.updateBuy?{buyBefore:snap.exists()?Number(snap.data().buy)||0:0,buyAfter:item.record.buy}:{}),note:mode==='add'?'Excel toplu stok girişi':mode==='costs'?'Excel birim maliyet güncelleme (adet korundu)':mode==='sync'?'Excel adet ve birim maliyet güncelleme':'Excel stok miktarı güncelleme',createdBy:user.uid,createdAt:serverTimestamp(),importFingerprint:fingerprint,importMode:mode});changed++;
          });return {changed,duplicate};
        });
        completed+=result.changed;skipped+=result.duplicate;
        if(token===generation)$('import-message').textContent=`${num(completed)} ürün aktarıldı; ${num(skipped)} daha önce aktarılmış satır atlandı…`;
      }
      if(token===generation){$('import-dialog').close();invalidateImport();message(`${num(completed)} ürün aktarıldı. ${skipped?num(skipped)+' ürün aynı dosyadan daha önce aktarıldığı için yeniden eklenmedi.':''}`);}
    }catch(error){if(token===generation)$('import-message').textContent=`${num(completed)} ürün aktarıldı. ${error.code==='permission-denied'?'Veritabanı erişimi reddedildi.':error.message} Tamamlanan satırlar kaydedildi.${mode==='add'?' Aynı dosyayı yeniden deneyebilirsiniz; tamamlanan satırlar tekrar eklenmez.':''}`;}
    finally{
      importing=false;$('import-dialog').removeAttribute('aria-busy');
      for(const key of ['import','zero-all','import-preview','import-cancel','import-mode','import-sheet','save'])$(key).disabled=false;
      $('import-apply').disabled=!importPlan;view.querySelectorAll('[data-import-column]').forEach(el=>el.disabled=false);
    }
  });

  $('rows').addEventListener('click',event=>{const button=event.target.closest('[data-ws-edit]');if(!button||!allowed()||zeroing||importing||addingVat)return;const p=rows.find(p=>p.id===button.dataset.wsEdit);if(!p)return;editingId=p.id;$('product-name').textContent=p.name;$('qty').value=p.qty;$('move-type').value='Sayım';$('customer').value='';$('source').value='';$('destination').value='';$('note').value='';$('form-message').textContent='';$('dialog').showModal();});
  $('cancel').addEventListener('click',()=>$('dialog').close());
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();const token=generation,id=editingId,quantity=Number($('qty').value),note=$('note').value.trim(),moveType=$('move-type').value,customer=$('customer').value.trim(),source=$('source').value.trim(),destination=$('destination').value.trim();
    try {requireOwner();if(zeroing||importing||addingVat)throw Error('Toplu stok işlemi devam ediyor.');if(!id||!Number.isFinite(quantity)||quantity<0)throw Error('Geçerli bir miktar yazın.');$('save').disabled=true;
      const ref=doc(db,'weltewInventory','main','products',id),movement=doc(collection(db,'weltewInventory','main','movements'));
      await runTransaction(db,async transaction=>{requireOwner();if(token!==generation)throw Error('Oturum değişti.');const snap=await transaction.get(ref);if(!snap.exists())throw Error('Ürün bulunamadı.');requireOwner();if(token!==generation)throw Error('Oturum değişti.');transaction.update(ref,{qty:quantity,updatedAt:serverTimestamp()});transaction.set(movement,{productId:id,before:Number(snap.data().qty)||0,after:quantity,moveType,customer,source,destination,note,createdBy:user.uid,createdAt:serverTimestamp()});});
      if(token===generation){$('dialog').close();message('Stok miktarı güncellendi.');}
    }catch(error){if(token===generation)$('form-message').textContent=error.code==='permission-denied'?'Bu işlem için veritabanı erişimi reddedildi.':error.code==='resource-exhausted'?'Firebase günlük işlem kotası doldu. Kota sıfırlanınca tekrar deneyin.':error.message;}finally{$('save').disabled=false;}
  });
  function openStock(){if(!allowed())return;opened=true;if(unsubscribe)return;const token=generation;loading=true;message('Stoklar yükleniyor…');render();unsubscribe=onSnapshot(collection(db,'weltewInventory','main','products'),snapshot=>{if(!allowed()||token!==generation)return;loading=false;rows=snapshot.docs.map(d=>({...d.data(),id:d.id,qty:Number(d.data().qty)||0,buy:Number(d.data().buy)||0,name:String(d.data().name||'')}));message(rows.length?'':'Stok dosyanızı aktararak başlayabilirsiniz.');render();},error=>{if(token!==generation)return;loading=false;rows=[];message(error.code==='permission-denied'?'Bu stoklar için erişim izni yok. Firebase kuralları kontrol edilmeli.':'Stoklar yüklenemedi. Bağlantınızı kontrol edin.');render();});}
  render();
  return {
    setUser(next){clear();user=next;assistant.setVisible(canAccessWeltew(next));nav.style.display=canAccessWeltew(next)?'flex':'none';if(!canAccessWeltew(next))view.style.display='none';},
    allowed,
    open:openStock,
    close(){opened=false;},
    destroy(){clear();user=null;nav.style.display='none';view.style.display='none';}
  };
}
