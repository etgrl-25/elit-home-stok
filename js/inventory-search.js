const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
function words(value){return normalize(value).replace(/\boturma\s+grup(?:lari|lar|u)?\b/g,'koltuk takim').split(/[^a-z0-9]+/).filter(Boolean);}
function stem(word){
  if(/^oda(?:si|lari|lar|sinda|sinin)?$/.test(word))return 'oda';
  if(/^takim(?:lari|lar|i)?$/.test(word))return 'takim';
  if(/^grup(?:lari|lar|u)?$/.test(word))return 'grup';
  if(word.length>5)return word.replace(/(?:lari|leri|lar|ler)$/,'');
  return word;
}
const groups=[
  {label:'Yatak Odası',title:/\byatak\s+oda(?:si|lari|lar|sinda)?\b/,parts:/\b(komodin|komidin|sifonyer|gard[i]?ro[pb]|gardolap|karyola|makyaj\s+masa|tuvalet\s+masa|elbise\s+dolap|dolap)/},
  {label:'Yemek Odası',title:/\byemek\s+oda(?:si|lari|lar|sinda)?\b/,parts:/\b(masa|sandalye|konsol|ayna|vitrin|bufe)/},
  {label:'Koltuk Takımı',title:/\b(koltuk\s+takim|oturma\s+grup|kose\s+takim)/,parts:/\b(koltuk|berjer|berje|uclu|ikili|tekli|[123]\s*['’]?\s*l[ui]|kanepe|kanape|cekyat|kose)/},
  {label:'Genç / Çocuk Odası',title:/\b(genc|cocuk|bebek)\s+oda/,parts:/\b(ranza|calisma\s+masa)/},
  {label:'TV Ünitesi',title:/\b(tv|televizyon)\s+unite/,parts:/\b(tv|televizyon)\s+(sehpa|unite)/},
  {label:'Yatak / Baza',title:/^yatak\s*\/\s*baza$/,parts:/\b(baza|baza\s+baslik|yatak\s+baslik|baslik|yatak)\b/},
  {label:'Sehpa',title:/^sehpa(?:lar|lari)?$/,parts:/\b(sehpa|zigon)/}
];
function metadata(p){return normalize([p.category,p.family,p.productGroup,p.product_group,p.group1].filter(Boolean).join(' '));}
function namedGroups(text){return groups.filter(g=>g.title.test(text));}
export function getInventoryGroups(product){
  const categoryGroups=namedGroups(metadata(product));
  if(categoryGroups.length)return categoryGroups.map(g=>g.label);
  const title=normalize(product.name),titleGroups=namedGroups(title);
  if(titleGroups.length)return titleGroups.map(g=>g.label);
  const text=normalize([product.name,metadata(product)].join(' '));
  return groups.filter(g=>{
    if(g.label==='Yemek Odası'&&/\b(calisma|bilgisayar|ofis|makyaj|tuvalet)\b/.test(text))return false;
    if(g.label==='Koltuk Takımı'&&/\b(komodin|komidin|sifonyer|gard[i]?ro[pb]|dolap|karyola|masa|sandalye|konsol|ayna|sehpa)/.test(text))return false;
    return g.parts.test(text);
  }).map(g=>g.label);
}
export function matchesInventoryCategory(product,selected){
  if(!selected)return true;
  const selectedGroups=namedGroups(normalize(selected));
  if(selectedGroups.length){const productGroups=getInventoryGroups(product);return selectedGroups.some(g=>productGroups.includes(g.label));}
  return normalize(product.category).trim()===normalize(selected).trim();
}
export function matchesInventoryQuery(product,query){
  const terms=words(query).map(stem);
  if(!terms.length)return true;
  const productGroups=getInventoryGroups(product);
  const names=words([product.name,metadata(product),product.warehouse,product.branch,...productGroups,productGroups.length?'takim grup':''].join(' ')).map(stem);
  const codes=normalize([product.sku,product.barcode].join(' '));
  return terms.every(term=>names.some(word=>word.includes(term))||codes.includes(term));
}
