const fold = value => String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const number = value => new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(value);
const money = value => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(value);
export function answerStockQuestion(question, products) {
  const q=fold(question).replace(/[^a-z0-9.,\s-]/g,' ').trim();
  if(!q)return 'Bir stok sorusu yazabilirsin. Örneğin: Kaç koltuk var?';
  if(/\b(ekle|sil|sifirla|guncelle|aktar|cikar|dusur|artir|degistir)\b/.test(q))return 'Bu deneme asistanı sadece bilgi verir; stokları değiştirmez. İşlem yapmak için sayfadaki stok ve Excel düğmelerini kullan.';
  if(!products.length)return 'Henüz yüklü Weltew stok kaydı yok. Stok dosyanı yükledikten sonra tekrar sor.';
  if(/^(merhaba|selam|selam knk|selamlar|hey|sa)$/.test(q))return 'Selam! Weltew stok miktarlarını, alış maliyetlerini ve depolarını sorabilirsin. Bu hızlı deneme, yalnızca mevcut stok verilerini kullanır.';
  const empty=/\b(tukenen|bitmis|stoksuz|sifir)\b/.test(q)||/stok(?:u|ta)? (?:yok|olmayan)/.test(q);
  const low=/\b(azalan|az|dusuk|kritik|altinda|altindaki|kalan)\b/.test(q);
  const costly=/\b(pahali|yuksek|buyuk)\b/.test(q)&&/maliyet|deger|fiyat/.test(q);
  const cost=/maliyet|deger|fiyat|tutar/.test(q);
  const depots=/\b(depolar|depolari|depolarda|ambarlar|depo dagilimi)\b/.test(q);
  const total=/\b(toplam|genel|ozet|durum|envanter)\b/.test(q);
  const stop=new Set('kac ne nedir kadar adet tane var mi mu stok stokta stogu stoku stoklar stoklari urun urunler urunleri urunun bana goster gosterir misin hangi olan toplam maliyet maliyeti maliyetli alis fiyat fiyati deger degeri tutar tutari depo depoda depolar depolari depolarda ambarlar dagilimi nerede bul liste listele listesi durumu genel ozet ozeti envanter hangileri neler urunlerde urunde bulunuyor bulunur kac tane ve ile en pahali yuksek buyuk tukenen bitmis stoksuz sifir azalan az dusuk kritik altinda altindaki kalan daha lutfen hepsi hepsini'.split(' '));
  const terms=q.split(/\s+/).filter(t=>t&&!stop.has(t)&&!/^\d+(?:[.,]\d+)?$/.test(t));
  const matchesTerm=(p,t)=>{const values=fold([p.name,p.sku,p.barcode,p.category,p.warehouse,p.branch].join(' '));return values.includes(t)||(/(?:lar|ler)$/.test(t)&&values.includes(t.slice(0,-3)));};
  let found=products.filter(p=>terms.every(t=>matchesTerm(p,t)));
  if(!terms.length&&!empty&&!low&&!cost&&!depots&&!total&&!/\b(kac|adet|liste|listele)\b/.test(q))return 'Bunu bu denemede yorumlayamıyorum. Şunları deneyebilirsin: “Kaç koltuk var?”, “Toplam stok maliyeti”, “Tükenen ürünler”, “Stoku azalan ürünler” veya bir ürün kodu.';
  if(!found.length)return 'Bu sorudaki ürün/depo ifadesiyle eşleşen kayıt bulamadım. Ürün adını, kodunu veya depo adını daha kısa yazmayı dene.';
  let prefix='';
  if(empty){found=found.filter(p=>Number(p.qty)<=0);prefix='Stok miktarı 0 olan ürünler';}
  else if(low){const match=q.match(/(\d+(?:[.,]\d+)?)\s*(?:adet\s*)?(?:ve\s*)?(?:alt|az)/);const limit=match?Number(match[1].replace(',','.')):5;found=found.filter(p=>Number(p.qty)>0&&Number(p.qty)<limit);prefix=`Stok miktarı 0’dan büyük, ${number(limit)} adetten az olan ürünler`;}
  if(!found.length)return `${prefix||'Bu koşula uygun ürün'} bulunamadı.`;
  const qty=found.reduce((sum,p)=>sum+(Number(p.qty)||0),0),value=found.reduce((sum,p)=>sum+(Number(p.qty)||0)*(Number(p.buy)||0),0);
  if(depots){const groups=new Map();for(const p of found){const key=p.warehouse||'Depo belirtilmemiş';groups.set(key,(groups.get(key)||0)+(Number(p.qty)||0));}return `Depo dağılımı (${number(qty)} adet):\n`+[...groups].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,n])=>`${name}: ${number(n)} adet`).join('\n')+(groups.size>20?'\nİlk 20 depo gösterildi.':'');}
  if(cost&&!costly)return `${terms.length?'Eşleşen ürünler':'Weltew genel stok'}: ${number(found.length)} kayıt, ${number(qty)} adet.\nToplam stok maliyeti: ${money(value)}.\nHesap: mevcut adet × kayıtlı birim alış maliyeti. KDV eklenmiş ürünlerde kayıtlı KDV dahil maliyet kullanılır.`;
  if(total&&!terms.length&&!empty&&!low&&!costly)return `Weltew genel stok özeti:\n${number(found.length)} ürün/depo kaydı\n${number(qty)} toplam adet\n${money(value)} toplam alış maliyeti\n${number(found.filter(p=>Number(p.qty)<=0).length)} tükenen kayıt`;
  const sorted=[...found].sort(costly?(a,b)=>Number(b.buy)-Number(a.buy):low?(a,b)=>Number(a.qty)-Number(b.qty):(a,b)=>String(a.name).localeCompare(String(b.name),'tr'));
  return `${prefix||'Eşleşen stoklar'}: ${number(found.length)} kayıt, toplam ${number(qty)} adet.\n`+sorted.slice(0,10).map(p=>`${p.name} (${p.sku}) · ${p.warehouse||'Depo belirtilmemiş'}: ${number(Number(p.qty)||0)} adet${costly?' · '+money(Number(p.buy)||0)+'/adet':''}`).join('\n')+(found.length>10?'\nİlk 10 kayıt gösterildi. Ürün adı veya depo ekleyerek daraltabilirsin.':'');
}

export function createStockAssistant({view,getRows,allowed,isLoading,onOpen=()=>{}}) {
  const root=document.createElement('div');root.className='ws-chat-root';root.hidden=true;document.body.append(root);
  const button=document.createElement('button');button.type='button';button.className='ws-primary ws-chat-launcher';button.textContent='✦ Asistan';button.setAttribute('aria-label','Stok asistanıyla sohbet et');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','ws-floating-chat');root.append(button);
  const dialog=document.createElement('dialog');dialog.className='ws-dialog ws-assistant ws-chat-window';dialog.id='ws-floating-chat';dialog.setAttribute('aria-label','Stok asistanı sohbeti');
  dialog.innerHTML='<div class="ws-assistant-head"><h2>Hızlı stok asistanı</h2><button type="button" class="ws-button" data-sa="close" aria-label="Asistanı kapat">Kapat</button></div><p>Deneme · Stok verileriyle anında yanıt. Genel sohbet yapmaz, stokları değiştirmez. Tüm Weltew depolarını kapsar; sayfa filtrelerini kullanmaz.</p><div class="ws-assistant-suggestions"><button type="button" class="ws-button">Genel stok özeti</button><button type="button" class="ws-button">Toplam stok maliyeti</button><button type="button" class="ws-button">Tükenen ürünler</button><button type="button" class="ws-button">Stoku azalan ürünler</button></div><div class="ws-assistant-log" data-sa="log" role="log" aria-live="polite"></div><form data-sa="form"><label>Stok sorusu<input data-sa="input" maxlength="300" required placeholder="Örn. Kaç koltuk var?" autocomplete="off"></label><button class="ws-primary" type="submit">Sor</button></form><small data-sa="timing"></small>';
  root.append(dialog);const $=key=>dialog.querySelector(`[data-sa="${key}"]`);
  function add(text,kind){const bubble=document.createElement('div');bubble.className='ws-assistant-bubble '+kind;bubble.textContent=text;$('log').append(bubble);while($('log').children.length>30)$('log').firstElementChild.remove();$('log').scrollTop=$('log').scrollHeight;}
  function ask(question){if(!allowed()){dialog.close();return;}add(question,'question');const start=performance.now();add(isLoading()?'Stoklar henüz yükleniyor. Yüklendikten sonra tekrar sor.':answerStockQuestion(question,getRows()),'answer');$('timing').textContent=`Yanıt hesabı: ${Math.max(1,Math.round(performance.now()-start))} ms · cihazda işlendi`;}
  function close(){dialog.close();button.setAttribute('aria-expanded','false');}
  button.addEventListener('click',()=>{if(!allowed())return;if(dialog.open){close();return;}onOpen();dialog.show();button.setAttribute('aria-expanded','true');$('input').focus();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();button.focus();}});
  $('close').addEventListener('click',()=>{close();button.focus();});
  $('form').addEventListener('submit',event=>{event.preventDefault();const question=$('input').value.trim();if(question){ask(question);$('input').value='';}});
  dialog.querySelectorAll('.ws-assistant-suggestions button').forEach(chip=>chip.addEventListener('click',()=>ask(chip.textContent)));
  return {setVisible(visible){root.hidden=!visible;if(!visible)close();},clear(){root.hidden=true;close();$('log').textContent='';$('input').value='';$('timing').textContent='';}};
}
