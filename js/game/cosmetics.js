// ============================================================
// COSMÉTICOS + LOJA — raridades, picaretas, planadores, rastros,
// emotes; rotação diária determinística da loja; inventário.
// ============================================================
import { SKINS } from '../anim/skins.js';

export const RARITY = {
  comum:    { label: 'Comum',    color: '#8a94a6', c2: '#5b6474', price: 500 },
  incomum:  { label: 'Incomum',  color: '#4fb33a', c2: '#2d7a1f', price: 800 },
  raro:     { label: 'Raro',     color: '#2f8ce0', c2: '#1a5aa8', price: 1200 },
  epico:    { label: 'Épico',    color: '#a34de0', c2: '#6b21a8', price: 1500 },
  lendario: { label: 'Lendário', color: '#e8913a', c2: '#b45309', price: 2000 }
};

// estilo → parâmetros do modelo (weapons.js) + efeitos de golpe
export const PICKAXES = {
  padrao:  { name: 'Picareta Padrão', rarity: 'comum',   trail: 0xffffff, spark: 0xffc26b, pitch: 1.0 },
  machado: { name: 'Machado Lenhador', rarity: 'incomum', trail: 0xfbbf24, spark: 0xffb347, pitch: 0.9 },
  martelo: { name: 'Martelo Trovão',  rarity: 'raro',    trail: 0x60a5fa, spark: 0x93c5fd, pitch: 0.75 },
  foice:   { name: 'Foice Sombria',   rarity: 'epico',   trail: 0xa855f7, spark: 0xd8b4fe, pitch: 1.2 },
  cristal: { name: 'Cristal Glacial', rarity: 'epico',   trail: 0x22d3ee, spark: 0xa5f3fc, pitch: 1.35 },
  lamina:  { name: 'Lâmina de Plasma', rarity: 'lendario', trail: 0xf43f5e, spark: 0xfda4af, pitch: 1.5 },
  doce:    { name: 'Bengala Doce',    rarity: 'raro',    trail: 0xf472b6, spark: 0xfce7f3, pitch: 1.25 },
  tridente:{ name: 'Tridente dos Mares', rarity: 'epico', trail: 0x67e8f9, spark: 0xa5f3fc, pitch: 1.1 },
  chave:   { name: 'Chave Inglesa',   rarity: 'incomum', trail: 0xcbd5e1, spark: 0xfde68a, pitch: 0.85 },
  guitarra:{ name: 'Guitarra-Machado', rarity: 'lendario', trail: 0xe879f9, spark: 0xf5d0fe, pitch: 1.3 },
  pirulito:{ name: 'Pirulito Gigante', rarity: 'raro', trail: 0xfde047, spark: 0xfbcfe8, pitch: 1.4 },
  // v18
  katana:  { name: 'Katana Carmesim', rarity: 'lendario', trail: 0xf87171, spark: 0xfecaca, pitch: 1.45 },
  ancora:  { name: 'Âncora do Capitão', rarity: 'epico', trail: 0x94a3b8, spark: 0xe2e8f0, pitch: 0.7 },
  taco:    { name: 'Taco Estelar', rarity: 'raro', trail: 0xfde047, spark: 0xfef08a, pitch: 1.0 },
  osso:    { name: 'Osso de Dino', rarity: 'incomum', trail: 0xf5efe0, spark: 0xfde68a, pitch: 0.8 },
  viking:  { name: 'Machado Nórdico', rarity: 'epico', trail: 0x38bdf8, spark: 0xbae6fd, pitch: 0.85 },
  relampago:{ name: 'Raio Elétrico', rarity: 'lendario', trail: 0xfde047, spark: 0xfef9c3, pitch: 1.6 },
  cogumelo:{ name: 'Cogumelo Mágico', rarity: 'raro', trail: 0xf87171, spark: 0xffffff, pitch: 1.3 },
  espatula:{ name: 'Espátula do Chef', rarity: 'incomum', trail: 0xe5e7eb, spark: 0xfde68a, pitch: 1.15 },
  dourada: { name: 'Picareta Dourada', rarity: 'lendario', trail: 0xfde047, spark: 0xfff1a8, pitch: 1.05 },
  neon:    { name: 'Picareta Néon', rarity: 'epico', trail: 0xff3ea5, spark: 0x67e8f9, pitch: 1.2 }
};
export const GLIDERS = {
  classico: { name: 'Planador Clássico', rarity: 'comum' },
  guardachuva: { name: 'Guarda-chuva Vitória', rarity: 'raro' },
  asas:     { name: 'Asas de Dragão',     rarity: 'epico' },
  jato:     { name: 'Jato Propulsor',     rarity: 'lendario' },
  folha:    { name: 'Folha Gigante',      rarity: 'incomum' },
  balao:    { name: 'Balões de Festa',    rarity: 'raro' },
  paraquedas: { name: 'Paraquedas Tático', rarity: 'comum' },
  borboleta:{ name: 'Asas de Borboleta',  rarity: 'epico' },
  disco:    { name: 'Disco Voador',       rarity: 'lendario' },
  // v16
  tapete:   { name: 'Tapete Mágico',      rarity: 'epico' },
  neon:     { name: 'Delta Néon',         rarity: 'raro' },
  pipa:     { name: 'Pipa de Papel',      rarity: 'incomum' },
  dirigivel:{ name: 'Mini Dirigível',     rarity: 'lendario' },
  fenix:    { name: 'Asas de Fénix',      rarity: 'lendario' },
  nuvem:    { name: 'Nuvem Fofa',         rarity: 'raro' }
};
export const CONTRAILS = {
  nenhum:  { name: 'Sem rastro', rarity: 'comum', color: null },
  nuvem:   { name: 'Nuvem',      rarity: 'comum', color: 0xffffff },
  arcoiris:{ name: 'Arco-íris',  rarity: 'raro', color: 'rainbow' },
  fogo:    { name: 'Chamas',     rarity: 'epico', color: 0xff6a00 },
  estrelas:{ name: 'Estelar',    rarity: 'lendario', color: 0xfde047 },
  raios:   { name: 'Relâmpago',  rarity: 'epico', color: 0x60a5fa, fx: 'magic', fxColor: 0x93c5fd, land: 0x60a5fa },
  coracoes:{ name: 'Corações',   rarity: 'raro', color: 0xf472b6, fx: 'magic', fxColor: 0xf9a8d4, land: 0xf472b6 },
  fumaca:  { name: 'Fumaça Ninja', rarity: 'incomum', color: 0x334155, fx: 'dust', land: 0x475569 },
  neve:    { name: 'Nevasca',    rarity: 'raro', color: 0xe0f2fe, fx: 'magic', fxColor: 0xffffff, land: 0xe0f2fe },
  toxico:  { name: 'Tóxico',     rarity: 'epico', color: 0x84cc16, fx: 'magic', fxColor: 0xbef264, land: 0x84cc16 },
  galaxia: { name: 'Galáxia',    rarity: 'lendario', color: 0xa855f7, fx: 'magic', fxColor: 0xe9d5ff, land: 0xa855f7 }
};
export const SHOP_EMOTES = {
  robo:   { name: 'Robô', rarity: 'raro' },
  hype:   { name: 'Hype', rarity: 'epico' },
  pulos:  { name: 'Pulinhos', rarity: 'incomum' },
  laranja: { name: 'Justiça Laranja', rarity: 'epico' },
  passinho: { name: 'Passinho', rarity: 'raro' },
  disco:  { name: 'Febre Disco', rarity: 'raro' },
  galinha: { name: 'Galinha', rarity: 'incomum' },
  moinho: { name: 'Moinho', rarity: 'incomum' },
  toprock: { name: 'Toprock', rarity: 'epico' },
  palmas: { name: 'Palmas no Alto', rarity: 'comum' }
};

export const CATS = {
  skin: { label: 'Traje', list: () => SKINS },
  pickaxe: { label: 'Picareta', list: () => PICKAXES },
  glider: { label: 'Planador', list: () => GLIDERS },
  contrail: { label: 'Rastro', list: () => CONTRAILS },
  emote: { label: 'Emote', list: () => SHOP_EMOTES }
};
// os 12 trajes originais continuam liberados; os 6 novos trajes são da loja
export const DEFAULT_OWNED = ['skin:default', 'skin:red', 'skin:green', 'skin:purple', 'skin:gold', 'skin:shadow', 'skin:ice', 'skin:fire', 'skin:pink', 'skin:forest', 'skin:ocean', 'skin:royal', 'pickaxe:padrao', 'pickaxe:osso', 'pickaxe:espatula', 'glider:classico', 'contrail:nenhum', 'contrail:nuvem'];

export function itemInfo(id){
  const [cat, key] = id.split(':');
  const it = CATS[cat] && CATS[cat].list()[key]; if(!it) return null;
  const r = RARITY[it.rarity || 'comum'];
  const price = it.price || Math.round(r.price * ({ skin: 1, pickaxe: 0.6, glider: 0.6, contrail: 0.4, emote: 0.4 }[cat]) / 100) * 100;
  return { id, cat, key, name: it.name, rarity: it.rarity || 'comum', r, price, hex: it.hex };
}

// rotação diária: mesma loja para o mesmo dia (PRNG com semente = dia)
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function dailyShop(date){
  const d = date || new Date();
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const rnd = mulberry(day * 9973);
  const all = [];
  for(const cat of Object.keys(CATS)) for(const key of Object.keys(CATS[cat].list())) if(!DEFAULT_OWNED.includes(cat + ':' + key)) all.push(cat + ':' + key);
  for(let i = all.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  // destaque = 2 itens mais raros; diário = 8 itens
  const byRar = all.slice().sort((a, b) => Object.keys(RARITY).indexOf(itemInfo(b).rarity) - Object.keys(RARITY).indexOf(itemInfo(a).rarity));
  // destaque: 1 traje raro + 1 item raro de outra categoria
  const sk = byRar.filter(x => x.startsWith('skin:')).slice(0, 4), ot = byRar.filter(x => !x.startsWith('skin:')).slice(0, 5);
  const featured = [sk[Math.floor(rnd() * sk.length)], ot[Math.floor(rnd() * ot.length)]].filter(Boolean);
  const daily = all.filter(x => !featured.includes(x)).slice(0, 8);
  const next = new Date(d); next.setHours(24, 0, 0, 0);
  return { featured, daily, resetsIn: next - d };
}
