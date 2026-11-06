import {streamChat,trimChatHistory,normalizeAssistantEndpoint} from './ai-chat.js?v=21';
import {matchesInventoryQuery} from './inventory-search.js?v=19';
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
  let found=products.filter(p=>matchesInventoryQuery(p,terms.join(' ')));
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

export function createStockAssistant({view,getRows,allowed,isLoading,onOpen=()=>{},getToken=async()=>{throw Error('Oturum bulunamadı.');}}) {
  const root=document.createElement('div');root.className='ws-chat-root';root.hidden=true;document.body.append(root);
  const button=document.createElement('button');button.type='button';button.className='ws-primary ws-chat-launcher';button.textContent='✦ Asistan';button.setAttribute('aria-label','Asistanla sohbet et');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','ws-floating-chat');root.append(button);
  const dialog=document.createElement('dialog');dialog.className='ws-dialog ws-assistant ws-chat-window';dialog.id='ws-floating-chat';dialog.setAttribute('aria-label','Elit Home asistanı');
  dialog.innerHTML='<div class="ws-assistant-head"><h2>Elit Home Asistanı</h2><button type="button" class="ws-button" data-sa="clear">Konuşmaları temizle</button><button type="button" class="ws-button" data-sa="close">Kapat</button></div><p data-sa="status"></p><label>Yanıt türü<select data-sa="mode"><option value="ai">Yapay zekâ · Genel sohbet</option><option value="local">Hızlı stok sorgusu</option></select></label><label class="ws-chat-share"><input data-sa="share" type="checkbox"> Stok özetini Groq ile paylaş ve yanıta dahil et</label><details data-sa="settings"><summary>Yapay zekâ bağlantısı</summary><p>Cloudflare’daki asistan adresini gir. API anahtarını buraya yazma. Bu ayar yalnızca bu tarayıcıda saklanır.</p><label>Asistan adresi<input data-sa="endpoint" type="url" placeholder="https://elit-home-assistant.…workers.dev" autocomplete="off"></label><button class="ws-button" data-sa="connect" type="button">Bağlantıyı kaydet</button><p data-sa="connection-message" role="status"></p></details><div class="ws-assistant-suggestions"><button type="button" class="ws-button">Genel stok özeti</button><button type="button" class="ws-button">Toplam stok maliyeti</button><button type="button" class="ws-button">Tükenen ürünler</button></div><div class="ws-assistant-log" data-sa="log" role="log" aria-live="polite"></div><form data-sa="form"><label>Mesajın<input data-sa="input" maxlength="3000" required placeholder="Bir şey sor…" autocomplete="off"></label><button class="ws-primary" type="submit" data-sa="send">Gönder</button><button class="ws-button" type="button" data-sa="stop" hidden>Durdur</button></form><small data-sa="timing"></small>';
  root.append(dialog);const $=key=>dialog.querySelector(`[data-sa="${key}"]`);
  let endpoint='https://elit-home-assistant.ertugrulerturann.workers.dev',history=[],controller=null,busy=false,epoch=0;
  try{endpoint=normalizeAssistantEndpoint(localStorage.getItem('elit-home-assistant-url')||endpoint);}catch{}
  $('endpoint').value=endpoint;$('mode').value=endpoint?'ai':'local';
  function status(){const ai=$('mode').value==='ai';$('status').textContent=ai?(endpoint?'Groq sohbeti · Mesaj gönderince bağlantı kontrol edilir. Stokları değiştirmez.':'Genel sohbet için sunucu bağlantısı bekleniyor. Yapay zekâ bağlantısı bölümünden asistan adresini kaydet.'):'Hızlı stok modu · Yalnızca mevcut Weltew stoklarından hesaplar, genel sohbet yapmaz.';$('share').disabled=!ai;}
  function add(text,kind){const bubble=document.createElement('div');bubble.className='ws-assistant-bubble '+kind;bubble.textContent=text;$('log').append(bubble);while($('log').children.length>32)$('log').firstElementChild.remove();$('log').scrollTop=$('log').scrollHeight;return bubble;}
  function setBusy(value){busy=value;$('send').disabled=value;$('stop').hidden=!value;$('mode').disabled=value;$('share').disabled=value||$('mode').value!=='ai';$('connect').disabled=value;}
  function clearTranscript(){epoch++;controller?.abort();controller=null;history=[];setBusy(false);$('log').textContent='';$('input').value='';$('timing').textContent='';}
  async function ask(question){
    if(!allowed()){close();return;}if(busy)return;
    const ai=$('mode').value==='ai';if(ai&&!endpoint){$('settings').open=true;$('connection-message').textContent='Önce Cloudflare asistan adresini kaydet.';$('endpoint').focus();return;}
    add(question,'question');const bubble=add(ai?'Yanıt hazırlanıyor…':'Hesaplanıyor…','answer');const start=performance.now(),token=epoch;
    if(!ai){bubble.textContent=isLoading()?'Stoklar yükleniyor. Biraz sonra tekrar sor.':answerStockQuestion(question,getRows());$('timing').textContent=`Cihazda hesaplandı: ${Math.max(1,Math.round(performance.now()-start))} ms`;return;}
    if($('share').checked&&isLoading()){bubble.textContent='Stok verileri henüz yükleniyor. Yükleme bitince tekrar sor.';return;}
    setBusy(true);const aborter=new AbortController();controller=aborter;const timer=setTimeout(()=>aborter.abort(),65000);
    try{
      const authToken=await getToken();if(token!==epoch||!allowed())return;
      let stockContext='';
      if($('share').checked){const rows=getRows();stockContext=JSON.stringify({scope:'Weltew Home genel stok, tüm depolar',records:rows.length,totalQuantity:rows.reduce((s,p)=>s+(Number(p.qty)||0),0),totalCost:rows.reduce((s,p)=>s+(Number(p.qty)||0)*(Number(p.buy)||0),0),query:question,localQueryResult:answerStockQuestion(question,rows),detailLimit:'Sorgu ayrıntıları en fazla 10 kayıt içerir; liste tam envanter değildir.'}).slice(0,6500);}
      const messages=trimChatHistory([...history,{role:'user',content:question}]);let first=true;
      const answer=await streamChat({endpoint,token:authToken,messages,stockContext,signal:aborter.signal,onText:text=>{if(token!==epoch||!allowed())return;bubble.textContent=text;$('log').scrollTop=$('log').scrollHeight;if(first){first=false;$('timing').textContent=`İlk yanıt: ${((performance.now()-start)/1000).toFixed(1)} sn · Groq`;}}});
      if(token===epoch&&allowed()){history=trimChatHistory([...messages,{role:'assistant',content:answer}]);$('timing').textContent+=` · Tamamlandı`;} 
    }catch(error){if(token===epoch){bubble.textContent+=(bubble.textContent==='Yanıt hazırlanıyor…'?'':'\n\n');if(bubble.textContent.startsWith('Yanıt hazırlanıyor…'))bubble.textContent='';bubble.textContent+=aborter.signal.aborted?'Yanıt durduruldu veya zaman aşımına uğradı.':error.message;$('timing').textContent='Yanıt tamamlanmadı.';}}
    finally{clearTimeout(timer);if(token===epoch){controller=null;setBusy(false);}}
  }
  function close(){dialog.close();button.setAttribute('aria-expanded','false');}
  button.addEventListener('click',()=>{if(!allowed())return;if(dialog.open){close();return;}onOpen();dialog.show();button.setAttribute('aria-expanded','true');$('input').focus();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();button.focus();}});
  $('clear').addEventListener('click',()=>{clearTranscript();$('input').focus();});
  $('stop').addEventListener('click',()=>controller?.abort());
  $('mode').addEventListener('change',status);
  $('connect').addEventListener('click',()=>{try{endpoint=normalizeAssistantEndpoint($('endpoint').value.trim());localStorage.setItem('elit-home-assistant-url',endpoint);$('mode').value='ai';$('connection-message').textContent='Adres kaydedildi. Bir mesaj göndererek bağlantıyı deneyebilirsin.';status();}catch(error){$('connection-message').textContent=error.message;}});
  $('close').addEventListener('click',()=>{close();button.focus();});
  $('form').addEventListener('submit',event=>{event.preventDefault();const question=$('input').value.trim();if(question&&!busy){ask(question);$('input').value='';}});
  dialog.querySelectorAll('.ws-assistant-suggestions button').forEach(chip=>chip.addEventListener('click',()=>{if(!busy){$('mode').value='local';status();ask(chip.textContent);}}));
  status();
  return {setVisible(visible){root.hidden=!visible;if(!visible){clearTranscript();close();}},clear(){root.hidden=true;clearTranscript();close();}};
}
