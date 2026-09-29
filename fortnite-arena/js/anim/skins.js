// ============================================================
// SKINS + BODY TYPES (retargeting): cada skin define roupa,
// cabelo, tom de pele e um tipo de corpo. As animações são
// definidas em espaço de articulação normalizado e aplicadas
// a qualquer proporção.
// ============================================================

export const BODY_TYPES = {
  padrao:   { label: 'Padrão',   height: 1.00, shoulder: 1.00, hip: 1.00, leg: 1.00, arm: 1.00, bulk: 1.00, head: 1.00 },
  atletico: { label: 'Atlético', height: 1.04, shoulder: 1.12, hip: 0.96, leg: 1.03, arm: 1.02, bulk: 1.10, head: 0.97 },
  robusto:  { label: 'Robusto',  height: 0.97, shoulder: 1.16, hip: 1.12, leg: 0.93, arm: 0.97, bulk: 1.28, head: 1.02 },
  esguio:   { label: 'Esguio',   height: 1.03, shoulder: 0.90, hip: 0.94, leg: 1.07, arm: 1.04, bulk: 0.86, head: 0.98 }
};

// tons de pele realistas
const ST = { claro: 0xf1c7a8, medio: 0xd9a07a, oliva: 0xc08a60, moreno: 0x9a6343, escuro: 0x6e4631 };

export const SKINS = {
  default: { name: 'Recruta', emoji: '🟦', hex: '#2563eb', top: 0x2563eb, top2: 0x1e3a8a, pant: 0x3b3f47, boots: 0x3a2a1e, accent: 0xef4444, skin: ST.medio,  hair: 0x2b1d14, hairStyle: 'short',    eye: 0x3b82f6, outfit: 'tshirt', body: 'padrao',   extras: ['backpack'] },
  red:     { name: 'Rubro',   emoji: '🔴', hex: '#dc2626', top: 0xb91c1c, top2: 0x7f1d1d, pant: 0x1f2937, boots: 0x111827, accent: 0xfbbf24, skin: ST.claro,  hair: 0x1f1a17, hairStyle: 'spiky',    eye: 0x6b3f1d, outfit: 'hoodie', body: 'atletico', extras: [] },
  green:   { name: 'Mata',    emoji: '🟢', hex: '#059669', top: 0x3f6212, top2: 0x365314, pant: 0x4b5320, boots: 0x3f2d1c, accent: 0xfde047, skin: ST.moreno, hair: 0x1b120c, hairStyle: 'bun',      eye: 0x4b3621, outfit: 'vest',   body: 'esguio',   extras: ['pouches'] },
  purple:  { name: 'Místico', emoji: '🟣', hex: '#7c3aed', top: 0x5b21b6, top2: 0x2e1065, pant: 0x1e1b4b, boots: 0x1e1b4b, accent: 0x22d3ee, skin: ST.claro,  hair: 0xd8d4f0, hairStyle: 'long',     eye: 0xa855f7, outfit: 'robe',   body: 'esguio',   extras: ['cape', 'aura'] },
  gold:    { name: 'Ouro',    emoji: '🟡', hex: '#f59e0b', top: 0xd4a017, top2: 0x7c5a10, pant: 0x3f3a33, boots: 0x2a211a, accent: 0xfff1b8, skin: ST.oliva,  hair: 0x16110d, hairStyle: 'short',    eye: 0x7b4a1f, outfit: 'armor',  body: 'robusto',  extras: [] },
  shadow:  { name: 'Sombra',  emoji: '⚫', hex: '#1f2937', top: 0x1f2430, top2: 0x0b0d12, pant: 0x14161c, boots: 0x0a0a0a, accent: 0xef4444, skin: ST.medio,  hair: 0x0a0a0a, hairStyle: 'ponytail', eye: 0xef4444, outfit: 'hoodie', body: 'atletico', extras: ['mask'] },
  ice:     { name: 'Gélido',  emoji: '🧊', hex: '#22d3ee', top: 0x67c7e0, top2: 0xe0f7ff, pant: 0x1e3a4c, boots: 0xe5e7eb, accent: 0xffffff, skin: ST.claro,  hair: 0xe8f4f8, hairStyle: 'short',    eye: 0x06b6d4, outfit: 'jacket', body: 'padrao',   extras: ['fur'] },
  fire:    { name: 'Fogo',    emoji: '🔥', hex: '#ea580c', top: 0xc2410c, top2: 0x431407, pant: 0x292524, boots: 0x1c1917, accent: 0xfbbf24, skin: ST.escuro, hair: 0x120c08, hairStyle: 'spiky',    eye: 0x5a3a22, outfit: 'vest',   body: 'robusto',  extras: ['pouches', 'backpack'] },
  pink:    { name: 'Rosa',    emoji: '💖', hex: '#ec4899', top: 0xdb2777, top2: 0xfbcfe8, pant: 0x3b1f36, boots: 0xf5f5f5, accent: 0xfbbf24, skin: ST.medio,  hair: 0xd9468f, hairStyle: 'ponytail', eye: 0x8b5a2b, outfit: 'jacket', body: 'esguio',   extras: [] },
  forest:  { name: 'Selva',   emoji: '🌲', hex: '#166534', top: 0x2f4f2a, top2: 0x1b2e18, pant: 0x3d4a2c, boots: 0x3b2a1a, accent: 0xfacc15, skin: ST.oliva,  hair: 0x3b2414, hairStyle: 'bun',      eye: 0x2f5d3a, outfit: 'vest',   body: 'padrao',   extras: ['backpack'] },
  ocean:   { name: 'Oceano',  emoji: '🌊', hex: '#0369a1', top: 0x075985, top2: 0x0c4a6e, pant: 0x0c4a6e, boots: 0x111827, accent: 0x22d3ee, skin: ST.moreno, hair: 0x0f0a07, hairStyle: 'short',    eye: 0x3a2a1a, outfit: 'tshirt', body: 'atletico', extras: [] },
  royal:   { name: 'Real',    emoji: '👑', hex: '#7e22ce', top: 0x6b21a8, top2: 0x3b0764, pant: 0x2e1065, boots: 0x1c1917, accent: 0xfbbf24, skin: ST.claro,  hair: 0x7a4a24, hairStyle: 'long',     eye: 0x3f6b9a, outfit: 'jacket', body: 'padrao',   extras: ['cape', 'crown'] }
};
