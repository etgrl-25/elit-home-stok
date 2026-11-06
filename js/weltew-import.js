const fold = value => String(value ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
export const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value)), n => n.toString(16).padStart(2, '0')).join('');
const fields = {sku:['ürün kodu','stok kodu','malzeme kodu','productCode','sku','kod'],name:['ürün adı','stok adı','malzeme adı','productName','name','açıklama'],qty:['miktar','adet','stok miktarı','quantity','qty','gelen adet'],warehouse:['depo','ambar','warehouse','ambar adı','depo adı'],branch:['şube','branch','şube adı'],buy:['alış maliyeti','son alış maliyeti','lastPurchaseCost','birim maliyet','maliyet'],category:['kategori','family','grup','productGroup'],barcode:['barkod','barcode']};
export function guessColumns(headers) {
  return Object.fromEntries(Object.entries(fields).map(([key, aliases]) => [key, headers.findIndex(h => aliases.map(fold).includes(fold(h)))]));
}
export function parseQuantity(value) {
  if (typeof value === 'number') return value;
  let s=String(value ?? '').trim().replace(/\s/g,'');
  if (!s) return NaN;
  // Excel numeric cells are read as numbers; Turkish text numbers use a decimal comma.
  if (s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}
export async function readInventoryFile(file) {
  if(file.size>25*1024*1024)throw Error('Dosya 25 MB sınırını aşıyor.');
  const bytes=await file.arrayBuffer(), fingerprint=await digest(bytes);
  if (/\.json$/i.test(file.name)) {
    const records=JSON.parse(new TextDecoder().decode(bytes));
    if(!Array.isArray(records)||!records.length)throw Error('Dosyada stok satırı bulunamadı.');
    const headers=['productCode','productName','quantity','warehouse','branch','lastPurchaseCost','family','barcode'];
    return {fingerprint,sheets:[{name:'Stok listesi',headers,rows:records.map(r=>headers.map(h=>r[h]??''))}]};
  }
  const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const book=XLSX.read(bytes,{type:'array',cellText:true,cellDates:false});
  const sheets=book.SheetNames.map(name=>{
    const sheet=book.Sheets[name];
    if(!sheet['!ref'])return null;
    const range=XLSX.utils.decode_range(sheet['!ref']);
    if(range.e.r-range.s.r>20050||range.e.c-range.s.c>200)throw Error('Dosyada en fazla 20.000 satır ve 200 sütun olabilir.');
    const raw=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:false});
    const text=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false});
    // Preserve formatted product codes, such as 000123, while retaining numeric quantities.
    let header=raw.findIndex(row=>{const g=guessColumns(row);return g.sku>=0&&g.qty>=0;});
    if(header<0)header=0;
    if(!raw.length)return null;
    return {name,headers:text[header].map(String),rows:raw.slice(header+1).map((row,i)=>row.map((cell,j)=>({raw:cell,text:text[header+1+i]?.[j]??String(cell)})))};
  }).filter(Boolean);
  if(!sheets.length)throw Error('Excel dosyasında dolu bir sayfa bulunamadı.');
  return {fingerprint,sheets};
}
function value(row,index,numeric=false){const cell=row[index];return cell&&typeof cell==='object'?(numeric?cell.raw:cell.text):cell;}
export async function buildImportPlan(sheet, mapping, existing, mode) {
  mapping={...Object.fromEntries(Object.keys(fields).map(key=>[key,-1])),...mapping};
  if(!['add','replace'].includes(mode))throw Error('Aktarım türünü seçin.');
  if(mapping.sku<0||mapping.qty<0)throw Error('Ürün kodu ve miktar sütunlarını seçin.');
  if(mapping.sku===mapping.qty)throw Error('Ürün kodu ve miktar farklı sütunlar olmalı.');
  if(!sheet.rows.length||sheet.rows.length>20000)throw Error('Dosyada 1–20.000 stok satırı olmalı.');
  const groups=new Map();
  const bySku=new Map();
  for(const product of existing){const key=String(product.sku).trim();if(!bySku.has(key))bySku.set(key,[]);bySku.get(key).push(product);}
  for(let i=0;i<sheet.rows.length;i++){
    const row=sheet.rows[i];if(row.every(c=>String(c?.raw??c??'').trim()===''))continue;
    const get=(key,numeric=false)=>mapping[key]>=0?value(row,mapping[key],numeric):'';
    const sku=String(get('sku')??'').trim(),qty=parseQuantity(get('qty',true));
    if(!sku||!Number.isFinite(qty)||qty<0)throw Error(`${i+2}. satır: ürün kodu veya miktar geçersiz.`);
    const warehouse=String(get('warehouse')??'').trim(),branch=String(get('branch')??'').trim();
    const matches=(bySku.get(sku)||[]).filter(p=>(mapping.warehouse<0||String(p.warehouse??'').trim()===warehouse)&&(mapping.branch<0||String(p.branch??'').trim()===branch));
    if(matches.length>1)throw Error(`${sku}: birden fazla kayıt bulundu. Depo/şube sütununu seçin; aynı kod aynı depoda tekrarlanıyorsa kayıtları ayırın.`);
    const old=matches[0];
    const name=String(get('name')??'').trim();
    if(!old&&!name)throw Error(`${sku}: yeni ürün için ürün adı sütunu gerekli.`);
    const buy=mapping.buy>=0?parseQuantity(get('buy',true)):0;
    if(!old&&(!Number.isFinite(buy)||buy<0))throw Error(`${sku}: maliyet geçersiz.`);
    const id=old?.id??await digest(JSON.stringify([branch,warehouse,sku])+'|0');
    const prior=groups.get(id);
    if(prior){if(mode==='replace')throw Error(`${sku}: dosyada aynı ürün/depo birden fazla kez var. Miktar güncellemek için satırları birleştirin.`);prior.amount+=qty;if(!Number.isFinite(prior.amount))throw Error(`${sku}: miktar sınırı aşıldı.`);continue;}
    groups.set(id,{id,sku,name:old?.name??name,warehouse:old?.warehouse??warehouse,before:Number(old?.qty)||0,amount:qty,isNew:!old,record:{name,sku,warehouse,branch,buy,category:String(get('category')??''),barcode:String(get('barcode')??''),unit:'adet'}});
  }
  if(!groups.size)throw Error('Aktarılacak stok satırı bulunamadı.');
  return [...groups.values()].map(p=>({...p,after:mode==='add'?p.before+p.amount:p.amount}));
}
