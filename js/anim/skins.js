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
  default: { rarity: 'comum', name: 'Recruta', emoji: '🟦', hex: '#2563eb', top: 0x2563eb, top2: 0x1e3a8a, pant: 0x3b3f47, boots: 0x3a2a1e, accent: 0xef4444, skin: ST.medio,  hair: 0x2b1d14, hairStyle: 'short',    eye: 0x3b82f6, outfit: 'tshirt', body: 'padrao',   extras: ['backpack', 'gloves', 'kneepads', 'cargo', 'watch', 'emblem', 'sneakers'] },
  red:     { rarity: 'comum', name: 'Rubro',   emoji: '🔴', hex: '#dc2626', top: 0xb91c1c, top2: 0x7f1d1d, pant: 0x1f2937, boots: 0x111827, accent: 0xfbbf24, skin: ST.claro,  hair: 0x1f1a17, hairStyle: 'short',    eye: 0x6b3f1d, outfit: 'hoodie', body: 'atletico', extras: ['cap', 'sneakers', 'watch', 'cargo'], capBack: true, capColor: 0x111827 },
  green:   { rarity: 'comum', name: 'Mata',    emoji: '🟢', hex: '#059669', top: 0x3f6212, top2: 0x365314, pant: 0x4b5320, boots: 0x3f2d1c, accent: 0xfde047, skin: ST.moreno, hair: 0x1b120c, hairStyle: 'bun',      eye: 0x4b3621, outfit: 'vest',   body: 'esguio',   extras: ['pouches', 'bandana', 'holster', 'cargo', 'kneepads', 'gloves'] },
  purple:  { rarity: 'epico', name: 'Místico', emoji: '🟣', hex: '#7c3aed', top: 0x5b21b6, top2: 0x2e1065, pant: 0x1e1b4b, boots: 0x1e1b4b, accent: 0x22d3ee, skin: ST.claro,  hair: 0xd8d4f0, hairStyle: 'long',     eye: 0xa855f7, outfit: 'robe',   body: 'esguio',   extras: ['cape', 'aura', 'gloves', 'emblem'] },
  gold:    { rarity: 'lendario', name: 'Ouro',    emoji: '🟡', hex: '#f59e0b', top: 0xd4a017, top2: 0x7c5a10, pant: 0x3f3a33, boots: 0x2a211a, accent: 0xfff1b8, skin: ST.oliva,  hair: 0x16110d, hairStyle: 'short',    eye: 0x7b4a1f, outfit: 'armor',  body: 'robusto',  extras: ['straps', 'gloves', 'emblem'] },
  shadow:  { rarity: 'epico', name: 'Sombra',  emoji: '⚫', hex: '#1f2937', top: 0x1f2430, top2: 0x0b0d12, pant: 0x14161c, boots: 0x0a0a0a, accent: 0xef4444, skin: ST.medio,  hair: 0x0a0a0a, hairStyle: 'ponytail', eye: 0xef4444, outfit: 'hoodie', body: 'atletico', extras: ['mask', 'holster', 'gloves', 'straps'] },
  ice:     { rarity: 'raro', name: 'Gélido',  emoji: '🧊', hex: '#22d3ee', top: 0x67c7e0, top2: 0xe0f7ff, pant: 0x1e3a4c, boots: 0xe5e7eb, accent: 0xffffff, skin: ST.claro,  hair: 0xe8f4f8, hairStyle: 'short',    eye: 0x06b6d4, outfit: 'jacket', body: 'padrao',   extras: ['fur', 'gloves', 'kneepads', 'goggles'] },
  fire:    { rarity: 'raro', name: 'Fogo',    emoji: '🔥', hex: '#ea580c', top: 0xc2410c, top2: 0x431407, pant: 0x292524, boots: 0x1c1917, accent: 0xfbbf24, skin: ST.escuro, hair: 0x120c08, hairStyle: 'spiky',    eye: 0x5a3a22, outfit: 'vest',   body: 'robusto',  extras: ['pouches', 'backpack', 'headband', 'straps', 'gloves'] },
  pink:    { rarity: 'incomum', name: 'Rosa',    emoji: '💖', hex: '#ec4899', top: 0xdb2777, top2: 0xfbcfe8, pant: 0x3b1f36, boots: 0xf5f5f5, accent: 0xfbbf24, skin: ST.medio,  hair: 0xd9468f, hairStyle: 'ponytail', eye: 0x8b5a2b, outfit: 'jacket', body: 'esguio',   extras: ['tiedjacket', 'sneakers', 'watch', 'emblem'] },
  forest:  { rarity: 'incomum', name: 'Selva',   emoji: '🌲', hex: '#166534', top: 0x2f4f2a, top2: 0x1b2e18, pant: 0x3d4a2c, boots: 0x3b2a1a, accent: 0xfacc15, skin: ST.oliva,  hair: 0x3b2414, hairStyle: 'bun',      eye: 0x2f5d3a, outfit: 'vest',   body: 'padrao',   extras: ['backpack', 'cap', 'bandana', 'cargo', 'holster'], capColor: 0x3d4a2c },
  ocean:   { rarity: 'incomum', name: 'Oceano',  emoji: '🌊', hex: '#0369a1', top: 0x075985, top2: 0x0c4a6e, pant: 0x0c4a6e, boots: 0x111827, accent: 0x22d3ee, skin: ST.moreno, hair: 0x0f0a07, hairStyle: 'short',    eye: 0x3a2a1a, outfit: 'tshirt', body: 'atletico', extras: ['headband', 'watch', 'sneakers', 'cargo', 'gloves'] },
  royal:   { rarity: 'lendario', name: 'Real',    emoji: '👑', hex: '#7e22ce', top: 0x6b21a8, top2: 0x3b0764, pant: 0x2e1065, boots: 0x1c1917, accent: 0xfbbf24, skin: ST.claro,  hair: 0x7a4a24, hairStyle: 'long',     eye: 0x3f6b9a, outfit: 'jacket', body: 'padrao',   extras: ['cape', 'crown', 'gloves', 'straps'] },
  // ---- novos (loja) ----
  astro:   { rarity: 'lendario', name: 'Astronauta', emoji: '', hex: '#e5e7eb', top: 0xe5e7eb, top2: 0x94a3b8, pant: 0xd1d5db, boots: 0x64748b, accent: 0x38bdf8, skin: ST.medio, hair: 0x2b1d14, hairStyle: 'short', eye: 0x3b82f6, outfit: 'jacket', body: 'padrao', extras: ['helmet', 'backpack', 'glowlines'], glow: 0x38bdf8 },
  ninja:   { rarity: 'epico', name: 'Ninja Rubi', emoji: '', hex: '#111827', top: 0x111827, top2: 0x7f1d1d, pant: 0x0b0f19, boots: 0x0a0a0a, accent: 0xdc2626, skin: ST.claro, hair: 0x0a0a0a, hairStyle: 'bun', eye: 0x991b1b, outfit: 'hoodie', body: 'esguio', extras: ['mask', 'scarf'] },
  punk:    { rarity: 'raro', name: 'Punk Neon', emoji: '', hex: '#db2777', top: 0x27272a, top2: 0x18181b, pant: 0x3f3f46, boots: 0x18181b, accent: 0xf472b6, skin: ST.oliva, hair: 0xf472b6, hairStyle: 'mohawk', eye: 0x4b3621, outfit: 'vest', body: 'atletico', extras: ['shoulderpads', 'goggles'] },
  dj:      { rarity: 'epico', name: 'DJ Batida', emoji: '', hex: '#a21caf', top: 0x581c87, top2: 0x2e1065, pant: 0x1e1b4b, boots: 0xf5f5f5, accent: 0xe879f9, skin: ST.escuro, hair: 0x120c08, hairStyle: 'afro', eye: 0x3a2a1a, outfit: 'jacket', body: 'padrao', extras: ['headphones', 'glowlines'], glow: 0xe879f9 },
  viking:  { rarity: 'raro', name: 'Viking', emoji: '', hex: '#92400e', top: 0x78350f, top2: 0x451a03, pant: 0x3f3a33, boots: 0x292524, accent: 0xe5e7eb, skin: ST.claro, hair: 0xb45309, hairStyle: 'long', eye: 0x3f6b9a, outfit: 'armor', body: 'robusto', extras: ['horns', 'beard', 'fur'] },
  // ---- v15 ----
  pirata:  { rarity: 'epico', name: 'Capitã Maré', emoji: '', hex: '#7f1d1d', top: 0x7f1d1d, top2: 0xf5f0e1, pant: 0x1c1917, boots: 0x0c0a09, accent: 0xd4a02a, skin: ST.oliva, hair: 0x3b1f0f, hairStyle: 'long', eye: 0x4b3621, outfit: 'jacket', body: 'esguio', extras: ['tricorn', 'eyepatch', 'pouches'] },
  samurai: { rarity: 'lendario', name: 'Samurai Carmesim', emoji: '', hex: '#b91c1c', top: 0x450a0a, top2: 0x7f1d1d, pant: 0x1c1917, boots: 0x0c0a09, accent: 0xd4a02a, skin: ST.claro, hair: 0x0a0a0a, hairStyle: 'bun', eye: 0x3a2a1a, outfit: 'armor', body: 'atletico', extras: ['kabuto', 'shoulderpads', 'mask'] },
  xerife:  { rarity: 'raro', name: 'Xerife', emoji: '', hex: '#a16207', top: 0x78350f, top2: 0x92400e, pant: 0x1e3a8a, boots: 0x451a03, accent: 0xd4a02a, skin: ST.medio, hair: 0x3b2414, hairStyle: 'short', eye: 0x3f6b9a, outfit: 'vest', body: 'robusto', extras: ['cowboyhat', 'scarf', 'beard'] },
  mago:    { rarity: 'epico', name: 'Arcano', emoji: '', hex: '#1e3a8a', top: 0x1e3a8a, top2: 0x172554, pant: 0x172554, boots: 0x1c1917, accent: 0xfde047, skin: ST.claro, hair: 0xe5e7eb, hairStyle: 'long', eye: 0x60a5fa, outfit: 'robe', body: 'esguio', extras: ['wizardhat', 'beard', 'aura'], glow: 0x60a5fa },
  agente:  { rarity: 'raro', name: 'Agente Sombra', emoji: '', hex: '#111827', top: 0x111827, top2: 0x030712, pant: 0x111827, boots: 0x030712, accent: 0xb91c1c, skin: ST.escuro, hair: 0x0a0a0a, hairStyle: 'short', eye: 0x3a2a1a, outfit: 'jacket', body: 'atletico', extras: ['sunglasses', 'tie'] },
  coelho:  { rarity: 'incomum', name: 'Coelhinho', emoji: '', hex: '#f9a8d4', top: 0xf9a8d4, top2: 0xfdf2f8, pant: 0xfbcfe8, boots: 0xfafafa, accent: 0xec4899, skin: ST.claro, hair: 0xfdf2f8, hairStyle: 'short', eye: 0xec4899, outfit: 'hoodie', body: 'padrao', extras: ['bunnyears'] },
  cyber:   { rarity: 'lendario', name: 'Ciborgue', emoji: '', hex: '#ef4444', top: 0x1f2937, top2: 0x0b0f19, pant: 0x111827, boots: 0x030712, accent: 0xef4444, skin: ST.medio, hair: 0x0a0a0a, hairStyle: 'mohawk', eye: 0xef4444, outfit: 'armor', body: 'atletico', extras: ['visor', 'glowlines', 'shoulderpads'], glow: 0xef4444 }
};
