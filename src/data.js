// @ts-check
/** @typedef {{rows?:Array<Record<string,any>>,data?:Record<string,any>}} ReferenceData */
const paths = ["./data/conflict-registry.json","./data/markers.json","./data/showcase.json","./data/catalog.json","./data/products.json"];

/** @type {Map<string,Promise<ReferenceData>>} */
const cache = new Map();
/** @param {string} path @returns {Promise<ReferenceData>} */
export function loadReference(path) {
  if (!cache.has(path)) cache.set(path,fetch(path).then(r => { if(!r.ok) throw new Error("Reference data unavailable"); return r.json(); }));
  return cache.get(path);
}

export async function publishedRules() {
  const data = await loadReference(paths[0]);
  return (data.rows ?? []).filter(row => ["published","wiki_only"].includes(String(row.status)) && row.source_ref);
}

export async function markerNames(lang="en") {
  const data=await loadReference(paths[1]);
  const rows=data.data?.markers ?? [];
  return rows.map(row => ({key:row.key,name:row.display?.[lang] ?? row.display?.en ?? row.key,unit:row.units?.[0] ?? ""}));
}

export async function topProducts() {
  const [showcase,catalog,products]=await Promise.all([loadReference(paths[2]),loadReference(paths[3]),loadReference(paths[4])]);
  const catalogBySku=new Map((catalog.rows??[]).map(row=>[row.sku_id,row]));
  const productBySku=new Map((products.rows??[]).map(row=>[row.sku_id,row]));
  return (showcase.rows??[]).flatMap(row=>{
    const product=productBySku.get(row.sku_id),sku=catalogBySku.get(row.sku_id);
    if(!product||!sku||sku.lifecycle_status!=="active")return [];
    return [{id:row.sku_id,collection:row.collection_name_en??row.nutrient_id,nutrient:row.nutrient_id??row.collection_id,name:product.product_name_en??product.package_text_label??row.sku_id,brand:product.brand??"",labelUnits:product.su_units_per_intake??null}];
  });
}
