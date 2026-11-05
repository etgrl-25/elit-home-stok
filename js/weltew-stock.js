import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
  view.innerHTML=`<div class="ws-welcome"><div><p class="ws-eyebrow">ELİT HOME · ÖZEL ENVANTER</p><h1>Weltew Home Genel Stok</h1><p>Ürünlerinizi bulun, depo stoklarınızı tek yerde takip edin.</p></div><img class="ws-brand" src="icons/weltew-logo.png" alt="Weltew Home"></div>
  <div class="ws-stats"><article><span>Ürün çeşidi</span><strong data-ws="count">0</strong></article><article><span>Toplam miktar</span><strong data-ws="quantity">0</strong></article><article><span>Stok maliyeti</span><strong data-ws="value">₺0</strong></article><article><span>Tükenen ürünler</span><strong data-ws="empty-count">0</strong></article></div>
  <section class="ws-panel"><div class="ws-heading"><div><h2>Ürün envanteri</h2><p>Bu bölüm yalnızca elit hesabına özeldir.</p></div><button data-ws="import" class="ws-primary">↥ Stok dosyasını aktar</button><input data-ws="file" type="file" accept=".json,application/json" hidden></div>
  <div class="ws-filters"><input data-ws="search" type="search" placeholder="Ürün adı, kod veya barkod ara…" aria-label="Weltew ürünlerinde ara"><select data-ws="category" aria-label="Kategori"><option value="">Tüm kategoriler</option></select><select data-ws="warehouse" aria-label="Depo"><option value="">Tüm depolar</option></select><select data-ws="status" aria-label="Stok durumu"><option value="">Tüm stoklar</option><option value="available">Stokta</option><option value="empty">Tükenen</option></select><button data-ws="reset" class="ws-button">Temizle</button></div>
  <div data-ws="message" class="ws-message" role="status"></div><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>ÜRÜN / KOD</th><th>KATEGORİ / DEPO</th><th>MİKTAR</th><th>ALIŞ MALİYETİ</th><th>DURUM</th><th>İŞLEM</th></tr></thead><tbody data-ws="rows"></tbody></table></div><div data-ws="empty" class="ws-empty" hidden>Ürün bulunamadı. Aramayı veya filtreleri değiştirin.</div><div class="ws-footer"><span data-ws="summary"></span><div><button data-ws="prev" class="ws-button" aria-label="Önceki sayfa">←</button><span data-ws="page"></span><button data-ws="next" class="ws-button" aria-label="Sonraki sayfa">→</button></div></div></section>
  <dialog data-ws="dialog" class="ws-dialog"><form data-ws="form"><h2>Stok miktarını güncelle</h2><p data-ws="product-name"></p><label>Yeni miktar<input data-ws="qty" type="number" min="0" step="any" required></label><label>Açıklama<input data-ws="note" maxlength="300" placeholder="Sayım, giriş veya çıkış açıklaması"></label><p data-ws="form-message" role="status"></p><div class="ws-dialog-actions"><button type="button" data-ws="cancel" class="ws-button">Vazgeç</button><button type="submit" data-ws="save" class="ws-primary">Kaydet</button></div></form></dialog>`;
  const $=key=>view.querySelector(`[data-ws="${key}"]`);
  let user=null, rows=[], unsubscribe=null, page=1, generation=0, opened=false, editingId=null, loading=false, importing=false;
  const allowed=()=>canAccessWeltew(user)&&auth?.currentUser?.uid===user.uid&&canAccessWeltew(auth.currentUser);
  const requireOwner=()=>{if(!allowed()) throw Error('Bu bölüm yalnızca elit hesabına açıktır.');};
  const message=text=>{$('message').textContent=text;};
  function clear() {generation++;if(unsubscribe)unsubscribe();unsubscribe=null;rows=[];page=1;opened=false;editingId=null;loading=false;importing=false;$('import').disabled=false;$('search').value='';$('category').value='';$('warehouse').value='';$('status').value='';$('dialog').close();$('form').reset();$('form-message').textContent='';message('');render();}
  function options(key,field,label) {const el=$(key),prior=el.value;const vals=[...new Set(rows.map(p=>p[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));el.innerHTML=`<option value="">${label}</option>`+vals.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');el.value=vals.includes(prior)?prior:'';}
  function render(){
    options('category','category','Tüm kategoriler');options('warehouse','warehouse','Tüm depolar');
    const terms=fold($('search').value).trim().split(/\s+/).filter(Boolean);
    const filtered=rows.filter(p=>terms.every(t=>fold([p.name,p.sku,p.barcode].join(' ')).includes(t))&&(!$('category').value||p.category===$('category').value)&&(!$('warehouse').value||p.warehouse===$('warehouse').value)&&(!$('status').value||($('status').value==='empty'?p.qty<=0:p.qty>0))).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    $('count').textContent=num(rows.length);$('quantity').textContent=num(rows.reduce((s,p)=>s+p.qty,0));$('value').textContent=money(rows.reduce((s,p)=>s+p.qty*p.buy,0));$('empty-count').textContent=num(rows.filter(p=>p.qty<=0).length);
    const pages=Math.max(1,Math.ceil(filtered.length/40));page=Math.max(1,Math.min(page,pages));const offset=(page-1)*40;
    $('rows').innerHTML=filtered.slice(offset,offset+40).map(p=>`<tr><td><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></td><td>${escape(p.category||'—')}<small>${escape(p.warehouse||'—')}</small></td><td><b>${num(p.qty)}</b> <small class="ws-inline">adet</small></td><td>${money(p.buy)}</td><td><span class="ws-status ${p.qty>0?'ws-available':'ws-out'}">${p.qty>0?'Stokta':'Tükendi'}</span></td><td><button class="ws-button" data-ws-edit="${escape(p.id)}" aria-label="${escape(p.name)} stok miktarını güncelle">± Stok</button></td></tr>`).join('');
    $('empty').hidden=filtered.length>0||loading;$('summary').textContent=filtered.length?`${num(filtered.length)} üründen ${num(offset+1)}–${num(Math.min(offset+40,filtered.length))} gösteriliyor`:'0 ürün';$('page').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;
  }
  ['search','category','warehouse','status'].forEach(key=>$(key).addEventListener(key==='search'?'input':'change',()=>{page=1;render();}));
  $('reset').addEventListener('click',()=>{['search','category','warehouse','status'].forEach(k=>$(k).value='');page=1;render();});
  $('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
  $('import').addEventListener('click',()=>{if(allowed())$('file').click();});
  $('file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;const token=generation;
    try {
      requireOwner();if(importing)throw Error('Bir aktarım zaten devam ediyor.');if(file.size>25*1024*1024)throw Error('Dosya 25 MB sınırını aşıyor.');
      importing=true;$('import').disabled=true;
      const prepared=await prepareWeltewImport(JSON.parse(await file.text()));requireOwner();if(token!==generation)return;
      if(!confirm(`${num(prepared.length)} stok satırı aktarılacak. Daha önce aktarılan satırlar ve mevcut miktarlar korunur. Devam edilsin mi?`))return;
      let imported=0;
      for(let offset=0;offset<prepared.length;offset+=50){
        requireOwner();if(token!==generation)throw Error('Oturum değişti. Aktarım durduruldu.');
        const batch=prepared.slice(offset,offset+50);
        const added=await runTransaction(db,async transaction=>{
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          const refs=batch.map(p=>doc(db,'weltewInventory','main','products',p.id));
          const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
          requireOwner();if(token!==generation)throw Error('Oturum değişti.');
          let count=0;snapshots.forEach((snap,i)=>{if(!snap.exists()){const {id,...record}=batch[i];transaction.set(refs[i],{...record,updatedAt:serverTimestamp()});count++;}});return count;
        });
        imported+=added;if(token!==generation)return;message(`${num(Math.min(offset+50,prepared.length))} / ${num(prepared.length)} satır kontrol edildi…`);
      }
      message(`${num(imported)} yeni satır aktarıldı. ${num(prepared.length-imported)} mevcut satır korundu.`);
    } catch(error) {if(token===generation)message(error.code==='permission-denied'?'Erişim reddedildi. Firebase kurallarında bu bölüm için elit hesabına izin verilmelidir.':error.message);}
    finally{event.target.value='';if(token===generation){importing=false;$('import').disabled=false;}}
  });
  $('rows').addEventListener('click',event=>{const button=event.target.closest('[data-ws-edit]');if(!button||!allowed())return;const p=rows.find(p=>p.id===button.dataset.wsEdit);if(!p)return;editingId=p.id;$('product-name').textContent=p.name;$('qty').value=p.qty;$('note').value='';$('form-message').textContent='';$('dialog').showModal();});
  $('cancel').addEventListener('click',()=>$('dialog').close());
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();const token=generation,id=editingId,quantity=Number($('qty').value),note=$('note').value.trim();
    try {requireOwner();if(!id||!Number.isFinite(quantity)||quantity<0)throw Error('Geçerli bir miktar yazın.');$('save').disabled=true;
      const ref=doc(db,'weltewInventory','main','products',id),movement=doc(collection(db,'weltewInventory','main','movements'));
      await runTransaction(db,async transaction=>{requireOwner();if(token!==generation)throw Error('Oturum değişti.');const snap=await transaction.get(ref);if(!snap.exists())throw Error('Ürün bulunamadı.');requireOwner();if(token!==generation)throw Error('Oturum değişti.');transaction.update(ref,{qty:quantity,updatedAt:serverTimestamp()});transaction.set(movement,{productId:id,before:Number(snap.data().qty)||0,after:quantity,note,createdBy:user.uid,createdAt:serverTimestamp()});});
      if(token===generation){$('dialog').close();message('Stok miktarı güncellendi.');}
    }catch(error){if(token===generation)$('form-message').textContent=error.code==='permission-denied'?'Bu işlem için veritabanı erişimi reddedildi.':error.message;}finally{$('save').disabled=false;}
  });
  render();
  return {
    setUser(next){clear();user=next;nav.style.display=canAccessWeltew(next)?'flex':'none';if(!canAccessWeltew(next))view.style.display='none';},
    allowed,
    open(){if(!allowed())return;opened=true;if(unsubscribe)return;const token=generation;loading=true;message('Stoklar yükleniyor…');render();unsubscribe=onSnapshot(collection(db,'weltewInventory','main','products'),snapshot=>{if(!allowed()||token!==generation)return;loading=false;rows=snapshot.docs.map(d=>({...d.data(),id:d.id,qty:Number(d.data().qty)||0,buy:Number(d.data().buy)||0,name:String(d.data().name||'')}));message(rows.length?'':'Stok dosyanızı aktararak başlayabilirsiniz.');render();},error=>{if(token!==generation)return;loading=false;rows=[];message(error.code==='permission-denied'?'Bu stoklar için erişim izni yok. Firebase kuralları kontrol edilmeli.':'Stoklar yüklenemedi. Bağlantınızı kontrol edin.');render();});},
    close(){opened=false;},
    destroy(){clear();user=null;nav.style.display='none';view.style.display='none';}
  };
}
