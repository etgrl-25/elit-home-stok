const normalize=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
function words(value){return normalize(value).replace(/\boturma\s+grup(?:lari|lar|u)?\b/g,'koltuk takim').split(/[^a-z0-9]+/).filter(Boolean);}
function stem(word){
  if(/^takim(?:lari|lar|i)?$/.test(word))return 'takim';
  if(/^grup(?:lari|lar|u)?$/.test(word))return 'grup';
  if(word.length>5)return word.replace(/(?:lari|leri|lar|ler)$/,'');
  return word;
}
export function matchesInventoryQuery(product,query){
  const terms=words(query).map(stem);
  if(!terms.length)return true;
  const names=words([product.name,product.category,product.warehouse,product.branch].join(' ')).map(stem);
  const codes=normalize([product.sku,product.barcode].join(' '));
  return terms.every(term=>names.some(word=>word.includes(term))||codes.includes(term));
}
