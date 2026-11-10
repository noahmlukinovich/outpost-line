/** One shared palette so placeholder art (and later the UI) stays visually consistent. */
export const Palette = {
  // Ground / environment (desaturated so units pop)
  ground: 0x23261f,
  groundLight: 0x2d3127,
  groundDark: 0x181a15,
  dirt: 0x3a3426,
  sandbag: 0x8a7a55,
  sandbagDark: 0x5e5238,

  // FDC (player): cool slate/white with cyan accents
  fdcBody: 0x5d6b78,
  fdcHelmet: 0xc9d3dc,
  fdcAccent: 0x47e0ff,
  fdcWeapon: 0x15181b,

  // The Choir (enemy): bio-magenta with amber glowing cores
  choirBody: 0x9b2f7a,
  choirShell: 0x5a1747,
  choirCore: 0xffb238,

  // Effects
  tracer: 0xffe7a3,
  flash: 0xfff2c4,
  shield: 0x6fc8ff,
  ichor: 0x6b1f55,

  // UI (amber-on-charcoal military HUD)
  uiAmber: 0xf2a93b,
  uiText: 0xe8dcc0,
  uiPanel: 0x1b1d18,
  uiDim: 0x7d7a6c,
} as const;

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
