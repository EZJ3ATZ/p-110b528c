/* ==========================================================================
   world.js — O MUNDO
   --------------------------------------------------------------------------
   Responsável por tudo que não é personagem:
     • utilitários matemáticos compartilhados (objeto U)
     • ciclo dia/noite e paleta do céu
     • céu, sol, lua, estrelas, nuvens, montanhas, floresta distante
     • riacho, chão, grama, pedras, árvores, arbustos, flores
     • lugares de memória
     • névoa, raios de sol, correção de cor (frio x quente) e vinheta

   Coordenadas do mundo (não são pixels de tela):
     x .......... 0 .. World.WIDTH  (o mapa é largo, cinematográfico)
     y .......... altura fixa: horizonte = 430, faixa caminhável = 548..782
     z .......... profundidade do personagem/objeto na faixa (0 = fundo, 1 = frente)

   A câmera (game.js) converte mundo -> tela com translação + escala.
   ========================================================================== */

/* --------------------------------------------------------------------------
   U — utilitários usados por todos os arquivos
   -------------------------------------------------------------------------- */
const U = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  smooth(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  // remapeia v da faixa [a,b] para [c,d], já limitado
  map(v, a, b, c, d) { return U.lerp(c, d, U.clamp((v - a) / (b - a || 1), 0, 1)); },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  // ruído determinístico: o mesmo x devolve sempre o mesmo valor (0..1)
  hash(x, y = 0) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); },
  // interpolação entre duas cores [r,g,b]
  mix(c1, c2, t) {
    return [U.lerp(c1[0], c2[0], t), U.lerp(c1[1], c2[1], t), U.lerp(c1[2], c2[2], t)];
  },
  scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; },
  // dessatura em direção a um cinza-azulado (o mundo "frio")
  desat(c, t, target = [122, 140, 162]) {
    const g = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2;
    const grey = [U.lerp(g, target[0], 0.5), U.lerp(g, target[1], 0.5), U.lerp(g, target[2], 0.5)];
    return U.mix(c, grey, U.clamp(t, 0, 1));
  },
  rgb(c, a = 1) {
    return 'rgba(' + U.clamp(c[0] | 0, 0, 255) + ',' + U.clamp(c[1] | 0, 0, 255) + ',' +
      U.clamp(c[2] | 0, 0, 255) + ',' + a + ')';
  }
};

/* --------------------------------------------------------------------------
   Paleta do céu ao longo do dia.
   Cada chave é um instante do ciclo (t de 0 a 1) com as três cores do
   gradiente, a cor do sol e a intensidade da luz ambiente.
   -------------------------------------------------------------------------- */
const SKY_KEYS = [
  { t: 0.00, top: [12, 18, 40],  mid: [30, 40, 74],   bot: [62, 70, 106],  sun: [186, 198, 236], light: 0.30 }, // madrugada
  { t: 0.16, top: [46, 60, 108], mid: [136, 116, 148], bot: [232, 168, 140], sun: [255, 202, 156], light: 0.58 }, // amanhecer
  { t: 0.32, top: [88, 148, 214], mid: [166, 204, 234], bot: [224, 236, 240], sun: [255, 248, 224], light: 1.00 }, // manhã
  { t: 0.56, top: [72, 138, 212], mid: [152, 198, 232], bot: [230, 240, 238], sun: [255, 250, 232], light: 1.00 }, // tarde
  { t: 0.76, top: [84, 92, 166], mid: [230, 142, 112], bot: [255, 196, 126], sun: [255, 176, 104], light: 0.76 }, // pôr do sol
  { t: 0.88, top: [34, 40, 82],  mid: [82, 70, 118],  bot: [146, 100, 114], sun: [212, 152, 152], light: 0.44 }, // crepúsculo
  { t: 1.00, top: [12, 18, 40],  mid: [30, 40, 74],   bot: [62, 70, 106],  sun: [186, 198, 236], light: 0.30 }
];

/* --------------------------------------------------------------------------
   Frases das memórias. Nunca contam um acontecimento — só um símbolo.
   -------------------------------------------------------------------------- */
const MEMORY_SPOTS = [
  { x: 780,  sym: '🌻', prop: 'flowers', txt: 'Algumas lembranças nunca deixam de florescer.' },
  { x: 1980, sym: '📖', prop: 'bench',   txt: 'Um banco vazio ainda guarda o formato de quem sentou ali.' },
  { x: 3150, sym: '🌧', prop: 'puddle',  txt: 'Nem toda chuva veio para destruir. Algumas só lavaram o caminho.' },
  { x: 4320, sym: '☀',  prop: 'stone',   txt: 'O tempo muda as pessoas, mas não apaga tudo.' },
  { x: 5480, sym: '✨', prop: 'flowers', txt: 'Existe luz que só aparece quando escurece.' },
  { x: 6650, sym: '🌙', prop: 'stone',   txt: 'Há noites que a gente atravessa só de lembrar de alguém.' },
  { x: 7820, sym: '🍂', prop: 'bench',   txt: 'O que caiu virou chão. E o chão sustenta o que vem depois.' }
];

/* ==========================================================================
   World
   ========================================================================== */
const World = {
  /* ----- constantes geométricas ----- */
  WIDTH: 9000,
  HORIZON: 430,     // linha do horizonte (y de mundo)
  RIVER_Y0: 470, RIVER_Y1: 534,   // riacho, atrás da faixa caminhável
  BAND_Y0: 552, BAND_Y1: 782,     // faixa onde os personagens andam
  DAY_LENGTH: 320,  // segundos de um ciclo dia->noite->dia completo

  /* ----- conteúdo gerado ----- */
  trees: [], bushes: [], tufts: [], stones: [], flowers: [], memories: [], clouds: [], stars: [],
  time: 0,

  /* ---------------- geometria / câmera ---------------- */
  bandY(z) { return U.lerp(this.BAND_Y0, this.BAND_Y1, z); },
  depthScale(z) { return 0.80 + z * 0.36; },
  sx(x, cam, view) { return (x - cam.x) * cam.scale + view.w / 2; },
  sy(y, cam, view) { return (y - cam.y) * cam.scale + view.h / 2; },
  viewRect(cam, view) {
    const hw = view.w / 2 / cam.scale, hh = view.h / 2 / cam.scale;
    return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  },

  /* ---------------- construção do mundo ---------------- */
  init() {
    this.time = 0;
    this.trees = []; this.bushes = []; this.tufts = []; this.stones = [];
    this.flowers = []; this.memories = []; this.clouds = []; this.stars = [];

    // Árvores: a maioria no fundo, algumas bem à frente (moldura da câmera).
    for (let x = 60; x < this.WIDTH - 60; x += U.rand(70, 190)) {
      const front = Math.random() < 0.24;
      this.trees.push({
        x: x + U.rand(-30, 30),
        z: front ? U.rand(1.02, 1.5) : U.rand(-0.55, 0.20),
        scale: front ? U.rand(1.05, 1.45) : U.rand(0.7, 1.15),
        seed: Math.random(),
        kind: Math.random() < 0.18 ? 'pine' : (Math.random() < 0.25 ? 'birch' : 'oak'),
        swaySpd: U.rand(0.5, 0.95),
        blobs: this._treeBlobs()
      });
    }

    // Arbustos (poucos e discretos: o chão precisa respirar)
    for (let i = 0; i < 110; i++) {
      this.bushes.push({
        x: U.rand(0, this.WIDTH), z: U.rand(-0.3, 1.25),
        s: U.rand(0.55, 1.0), seed: Math.random()
      });
    }

    // Tufos de grama (detalhe do chão)
    for (let i = 0; i < 1400; i++) {
      this.tufts.push({
        x: U.rand(0, this.WIDTH), z: U.rand(-0.05, 1.3),
        h: U.rand(6, 15), seed: Math.random()
      });
    }

    // Pedras
    for (let i = 0; i < 120; i++) {
      this.stones.push({ x: U.rand(0, this.WIDTH), z: U.rand(0, 1.2), s: U.rand(0.5, 1.4), seed: Math.random() });
    }

    // Nuvens (parallax lento no céu)
    for (let i = 0; i < 22; i++) {
      this.clouds.push({
        x: U.rand(0, this.WIDTH), y: U.rand(40, 330),
        s: U.rand(0.6, 2.0), spd: U.rand(2, 7), seed: Math.random(),
        off: 0 // deslocamento extra: as nuvens "se abrem" quando há conexão
      });
    }

    // Estrelas (posições fixas em tela, aparecem à noite)
    for (let i = 0; i < 170; i++) {
      this.stars.push({ u: Math.random(), v: Math.random() * 0.72, s: U.rand(0.6, 1.9), ph: Math.random() * 6.283 });
    }

    // Lugares de memória
    MEMORY_SPOTS.forEach((m, i) => {
      this.memories.push({
        x: m.x, z: 0.42 + (i % 3) * 0.14, sym: m.sym, txt: m.txt, prop: m.prop,
        found: false, glow: 0, pulse: Math.random() * 6.283
      });
    });

    // Um punhado de flores já existe desde o começo — o mundo nunca esteve morto.
    for (let i = 0; i < 80; i++) this.plantFlower(U.rand(0, this.WIDTH), U.rand(0, 1), 1);
  },

  // pontos de folhagem de uma árvore (gerados uma vez, reaproveitados)
  _treeBlobs() {
    const n = U.randInt(5, 8), out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        dx: U.rand(-34, 34), dy: U.rand(-96, -44),
        r: U.rand(20, 36), w: U.rand(0.95, 1.35), seed: Math.random()
      });
    }
    return out;
  },

  /* ---------------- flores ---------------- */
  plantFlower(x, z, age = 0) {
    if (this.flowers.length > 620) return;   // teto por causa dos celulares
    const pal = [[240, 224, 120], [242, 150, 178], [232, 240, 246], [200, 156, 232], [246, 178, 110]];
    this.flowers.push({
      x, z, age, type: U.randInt(0, 2),
      c: U.pick(pal), s: U.rand(0.9, 1.5), ph: Math.random() * 6.283
    });
  },

  /* ---------------- estado do ambiente ---------------- */
  /**
   * Calcula tudo que depende do relógio e da conexão: cores do céu, luz,
   * posição do sol/lua, quanto é noite. Chamado uma vez por quadro.
   */
  updateEnv(env, view) {
    // --- interpola a paleta do céu no instante atual do dia ---
    const t = env.dayT % 1;
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const k = U.smooth((t - a.t) / (b.t - a.t || 1));
    const w = env.warmth;

    // O frio emocional lava a cor do céu; o calor a intensifica.
    env.skyTop = U.desat(U.mix(a.top, b.top, k), (1 - w) * 0.7);
    env.skyMid = U.desat(U.mix(a.mid, b.mid, k), (1 - w) * 0.7);
    env.skyBot = U.desat(U.mix(a.bot, b.bot, k), (1 - w) * 0.6);
    env.sunColor = U.mix(a.sun, b.sun, k);

    const baseLight = U.lerp(a.light, b.light, k);
    env.night = U.clamp(1 - (baseLight - 0.3) / 0.7, 0, 1);
    // piso de luz: por mais triste que o mundo fique, dá para enxergar os dois
    env.light = U.clamp(baseLight * (0.86 + 0.22 * w) * (1 - env.rain * 0.18), 0.46, 1.25);
    env.ambient = U.mix([34, 44, 82], [70, 84, 120], w); // cor da sombra/noite

    // --- posição do sol e da lua (em coordenadas de tela) ---
    const horizonY = this.sy(this.HORIZON, env.cam, view);
    const dayU = (t - 0.14) / 0.72;                 // 0 no nascer, 1 no poente
    env.sunUp = dayU >= 0 && dayU <= 1;
    env.sun = {
      x: view.w * (0.06 + 0.88 * U.clamp(dayU, 0, 1)),
      y: horizonY - Math.sin(U.clamp(dayU, 0, 1) * Math.PI) * (horizonY * 0.78 + 40)
    };
    const nightU = t < 0.14 ? (t + 0.14) / 0.42 : (t - 0.86) / 0.42;
    env.moon = {
      x: view.w * (0.88 - 0.76 * U.clamp(nightU, 0, 1)),
      y: horizonY - Math.sin(U.clamp(nightU, 0, 1) * Math.PI) * (horizonY * 0.6 + 30)
    };
    env.horizonY = horizonY;
  },

  /**
   * Aplica ao objeto colorido: temperatura emocional + luz do momento.
   * É o que faz o mundo inteiro "ganhar cor" quando eles estão perto.
   */
  tone(c, env, ambientMix = 0.55) {
    let out = U.desat(c, (1 - env.warmth) * 0.52);
    out = U.scale(out, env.light);
    out = U.mix(out, env.ambient, (1 - U.clamp(env.light, 0, 1)) * ambientMix);
    // leve dourado quando quente
    out = U.mix(out, [out[0] * 1.10 + 16, out[1] * 1.02 + 6, out[2] * 0.92], env.warmth * 0.26);
    return out;
  },

  /** cor de personagem: nunca escurece tanto quanto o cenário */
  toneChar(c, env) {
    const fake = { warmth: env.warmth * 0.5 + 0.25, light: Math.max(env.light, 0.62), ambient: env.ambient };
    return this.tone(c, fake, 0.35);
  },

  /* ---------------- atualização ---------------- */
  update(dt, env) {
    this.time += dt;

    // nuvens andam; quando há conexão elas se abrem (afastam-se e clareiam)
    const openness = env.warmth;
    for (const c of this.clouds) {
      c.x += c.spd * dt * (0.4 + env.wind);
      if (c.x > this.WIDTH + 600) c.x = -600;
      c.off = U.lerp(c.off, openness * 120 * (c.seed < 0.5 ? -1 : 1), dt * 0.5);
    }

    // flores nascem sozinhas perto de onde os dois estão, quando há calor
    if (env.warmth > 0.18 && env.bloomX !== undefined) {
      this._bloomAcc = (this._bloomAcc || 0) + dt * (env.warmth - 0.14) * 22;
      while (this._bloomAcc >= 1) {
        this._bloomAcc -= 1;
        // nascem mais perto deles: dá para ver o chão florescendo em volta
        const spread = U.lerp(240, 520, Math.random());
        this.plantFlower(env.bloomX + U.rand(-spread, spread), U.rand(0, 1), 0);
      }
    }

    // crescimento / murcha
    for (let i = this.flowers.length - 1; i >= 0; i--) {
      const f = this.flowers[i];
      if (env.warmth < 0.16) f.age -= dt * 0.12;      // frio: murcham devagar
      else f.age = Math.min(1, f.age + dt * 0.7);
      if (f.age <= 0) this.flowers.splice(i, 1);
    }

    // brilho das memórias
    for (const m of this.memories) {
      m.pulse += dt * 1.6;
      m.glow = U.lerp(m.glow, m.found ? 0.45 : 1, dt * 1.5);
    }
  },

  /* ======================================================================
     DESENHO — céu e fundos (espaço de tela, com parallax próprio)
     ====================================================================== */
  drawSky(ctx, env, cam, view) {
    const hY = env.horizonY;

    // base sólida (garante que nunca sobre nada do quadro anterior)
    ctx.fillStyle = U.rgb(env.skyBot);
    ctx.fillRect(0, 0, view.w, view.h);

    // gradiente do céu
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(hY, 10));
    g.addColorStop(0, U.rgb(env.skyTop));
    g.addColorStop(0.62, U.rgb(env.skyMid));
    g.addColorStop(1, U.rgb(env.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, Math.max(hY, 0));

    // estrelas
    if (env.night > 0.08) {
      ctx.save();
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(this.time * 2 + s.ph);
        ctx.globalAlpha = env.night * tw * (0.5 + env.warmth * 0.5);
        ctx.fillStyle = '#f4f6ff';
        ctx.fillRect(s.u * view.w, s.v * hY, s.s, s.s);
      }
      ctx.restore();
    }

    // sol / lua com halo
    const drawOrb = (p, color, r, alpha) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
      gr.addColorStop(0, U.rgb(color, 0.70 * alpha));
      gr.addColorStop(0.12, U.rgb(color, 0.34 * alpha));
      gr.addColorStop(0.45, U.rgb(color, 0.10 * alpha));
      gr.addColorStop(1, U.rgb(color, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(p.x - r * 6, p.y - r * 6, r * 12, r * 12);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = U.rgb(color);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      ctx.restore();
    };
    drawOrb(env.sun, env.sunColor, 26, (1 - env.night) * (0.45 + env.warmth * 0.55));
    drawOrb(env.moon, [226, 232, 250], 17, env.night * 0.85);

    // nuvens (parallax bem lento)
    ctx.save();
    for (const c of this.clouds) {
      const px = (c.x - cam.x * 0.06) % (this.WIDTH + 1200);
      const x = ((px + this.WIDTH + 1200) % (this.WIDTH + 1200)) - 600 + c.off;
      const y = c.y * (hY / 420);
      if (x < -400 || x > view.w + 400) continue;
      const cover = U.clamp(0.16 + (1 - env.warmth) * 0.4 + env.rain * 0.45, 0, 0.8);
      const col = U.mix(env.skyBot, [255, 255, 255], 0.35 + env.warmth * 0.35);
      ctx.globalAlpha = cover;
      ctx.fillStyle = U.rgb(U.scale(col, 0.55 + env.light * 0.5));
      for (let i = 0; i < 4; i++) {
        const s = c.s * (26 + U.hash(c.seed + i) * 22);
        ctx.beginPath();
        ctx.ellipse(x + (i - 1.5) * s * 0.9, y + Math.sin(i * 2 + c.seed * 6) * s * 0.16,
          s, s * 0.52, 0, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  /** montanhas distantes + floresta de fundo, geradas por ruído (parallax) */
  drawFar(ctx, env, cam, view) {
    const hY = env.horizonY;

    // três camadas de morros
    const layers = [
      { p: 0.10, amp: 74, base: 6,  col: U.mix(env.skyMid, [92, 108, 130], 0.55), step: 120 },
      { p: 0.17, amp: 52, base: 26, col: U.mix(env.skyMid, [74, 96, 104], 0.7),  step: 90 },
      { p: 0.26, amp: 34, base: 44, col: U.mix(env.skyBot, [52, 78, 74], 0.82),  step: 70 }
    ];
    for (const L of layers) {
      const off = cam.x * L.p;
      ctx.fillStyle = U.rgb(this.tone(L.col, env, 0.75));
      ctx.beginPath();
      ctx.moveTo(-10, hY + 4);
      for (let sxp = -10; sxp <= view.w + L.step; sxp += L.step) {
        const wx = (sxp + off) / L.step;
        const h = (U.hash(Math.floor(wx)) * 0.6 + U.hash(Math.floor(wx / 3)) * 0.4) * L.amp + L.base;
        const h2 = (U.hash(Math.floor(wx) + 1) * 0.6 + U.hash(Math.floor((wx + 1) / 3)) * 0.4) * L.amp + L.base;
        ctx.quadraticCurveTo(sxp + L.step * 0.5, hY - (h + h2) * 0.62, sxp + L.step, hY - h2);
      }
      ctx.lineTo(view.w + 20, hY + 8);
      ctx.closePath();
      ctx.fill();
    }

    // floresta distante logo abaixo do horizonte
    const off = cam.x * 0.34, step = 26;
    ctx.fillStyle = U.rgb(this.tone(U.mix([44, 70, 60], [58, 96, 64], env.warmth), env, 0.7));
    ctx.beginPath();
    ctx.moveTo(-10, hY + 60);
    for (let sxp = -20; sxp <= view.w + step; sxp += step) {
      const wx = Math.floor((sxp + off) / step);
      const h = 16 + U.hash(wx) * 40;
      ctx.lineTo(sxp, hY - h * 0.5);
      ctx.lineTo(sxp + step * 0.5, hY - h);
      ctx.lineTo(sxp + step, hY - h * 0.45);
    }
    ctx.lineTo(view.w + 20, hY + 60);
    ctx.closePath();
    ctx.fill();
  },

  /* ======================================================================
     DESENHO — chão (dentro da transformação da câmera)
     ====================================================================== */
  drawGround(ctx, env, cam, view) {
    const r = this.viewRect(cam, view);
    const x0 = r.x0 - 200, x1 = r.x1 + 200, w = x1 - x0;

    // campo entre o horizonte e o riacho
    const farGrass = this.tone(U.mix([86, 104, 78], [116, 158, 84], env.warmth), env, 0.6);
    const nearGrass = this.tone(U.mix([70, 88, 66], [96, 142, 74], env.warmth), env, 0.5);
    const bottom = Math.max(this.BAND_Y1 + 400, r.y1 + 300);
    const g = ctx.createLinearGradient(0, this.HORIZON, 0, this.BAND_Y1 + 220);
    g.addColorStop(0, U.rgb(farGrass));
    g.addColorStop(0.34, U.rgb(U.mix(farGrass, nearGrass, 0.5)));
    g.addColorStop(1, U.rgb(U.scale(nearGrass, 0.82)));
    ctx.fillStyle = g;
    ctx.fillRect(x0, this.HORIZON, w, bottom - this.HORIZON);

    this.drawRiver(ctx, env, x0, x1);

    // trilha de terra por onde eles caminham
    const path = this.tone(U.mix([104, 92, 78], [142, 120, 92], env.warmth), env, 0.5);
    ctx.fillStyle = U.rgb(path, 0.30);
    ctx.beginPath();
    const py = this.bandY(0.52);
    ctx.moveTo(x0, py - 26);
    for (let x = x0; x <= x1; x += 60) {
      ctx.lineTo(x, py - 26 + Math.sin(x * 0.0016) * 12);
    }
    for (let x = x1; x >= x0; x -= 60) {
      ctx.lineTo(x, py + 34 + Math.sin(x * 0.0016 + 1) * 12);
    }
    ctx.closePath();
    ctx.fill();
  },

  /** riacho: brilha mais conforme a conexão cresce */
  drawRiver(ctx, env, x0, x1) {
    const water = this.tone(U.mix([64, 92, 116], [96, 158, 190], env.warmth), env, 0.7);
    ctx.fillStyle = U.rgb(water);
    ctx.beginPath();
    ctx.moveTo(x0, this.RIVER_Y0 + Math.sin(x0 * 0.001) * 6);
    for (let x = x0; x <= x1; x += 50) ctx.lineTo(x, this.RIVER_Y0 + Math.sin(x * 0.001) * 6);
    for (let x = x1; x >= x0; x -= 50) ctx.lineTo(x, this.RIVER_Y1 + Math.sin(x * 0.0013 + 2) * 5);
    ctx.closePath();
    ctx.fill();

    // reflexos na água
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const shine = (0.10 + env.warmth * 0.45) * env.light;
    ctx.strokeStyle = U.rgb(U.mix([190, 220, 240], env.sunColor, env.warmth), shine);
    ctx.lineWidth = 2;
    for (let x = Math.floor(x0 / 90) * 90; x <= x1; x += 90) {
      const y = U.lerp(this.RIVER_Y0 + 8, this.RIVER_Y1 - 6, U.hash(x));
      const len = 22 + U.hash(x + 7) * 46;
      const ph = Math.sin(this.time * 1.4 + x * 0.01);
      ctx.beginPath();
      ctx.moveTo(x + ph * 8, y);
      ctx.lineTo(x + ph * 8 + len, y);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** grama, pedras e flores — desenhados antes dos personagens */
  drawGroundDetail(ctx, env, cam, view) {
    const r = this.viewRect(cam, view);
    const x0 = r.x0 - 120, x1 = r.x1 + 120;

    // tufos de grama
    const gcol = this.tone(U.mix([74, 92, 62], [104, 150, 72], env.warmth), env, 0.5);
    ctx.strokeStyle = U.rgb(gcol);
    ctx.lineCap = 'round';
    for (const t of this.tufts) {
      if (t.x < x0 || t.x > x1) continue;
      const s = this.depthScale(t.z), y = this.bandY(t.z);
      const sway = Math.sin(this.time * 1.8 + t.seed * 8) * (1 + env.wind * 5);
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(t.x, y);
      ctx.quadraticCurveTo(t.x + sway * 0.5, y - t.h * s * 0.6, t.x + sway, y - t.h * s);
      ctx.stroke();
    }

    // pedras
    for (const st of this.stones) {
      if (st.x < x0 || st.x > x1) continue;
      const s = this.depthScale(st.z) * st.s * 0.7, y = this.bandY(st.z);
      ctx.fillStyle = U.rgb(this.tone([88, 88, 90], env, 0.6));
      ctx.beginPath();
      ctx.ellipse(st.x, y - 3 * s, 9 * s, 5 * s, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = U.rgb(this.tone([126, 126, 124], env, 0.6), 0.7);
      ctx.beginPath();
      ctx.ellipse(st.x - 2 * s, y - 4.5 * s, 5 * s, 2.6 * s, 0, 0, 6.283);
      ctx.fill();
    }

    // flores
    for (const f of this.flowers) {
      if (f.x < x0 || f.x > x1 || f.age <= 0.01) continue;
      this.drawFlower(ctx, f, env);
    }
  },

  drawFlower(ctx, f, env) {
    const s = this.depthScale(f.z) * f.s * U.smooth(f.age);
    const y = this.bandY(f.z);
    const sway = Math.sin(this.time * 2.2 + f.ph) * (1.2 + env.wind * 3.4);
    const stem = this.tone([86, 122, 66], env, 0.5);
    const petal = this.tone(f.c, env, 0.45);

    ctx.strokeStyle = U.rgb(stem);
    ctx.lineWidth = 1.3 * s;
    ctx.beginPath();
    ctx.moveTo(f.x, y);
    ctx.quadraticCurveTo(f.x + sway * 0.4, y - 7 * s, f.x + sway, y - 12 * s);
    ctx.stroke();

    const hx = f.x + sway, hy = y - 12 * s;
    ctx.fillStyle = U.rgb(petal);
    if (f.type === 0) {                     // margarida
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283 + f.ph;
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * 3 * s, hy + Math.sin(a) * 3 * s, 2.4 * s, 1.7 * s, a, 0, 6.283);
        ctx.fill();
      }
      ctx.fillStyle = U.rgb(this.tone([250, 208, 96], env, 0.4));
      ctx.beginPath(); ctx.arc(hx, hy, 1.9 * s, 0, 6.283); ctx.fill();
    } else if (f.type === 1) {              // botão redondo
      ctx.beginPath(); ctx.arc(hx, hy, 3.3 * s, 0, 6.283); ctx.fill();
      ctx.fillStyle = U.rgb(U.mix(petal, [255, 255, 255], 0.45), 0.8);
      ctx.beginPath(); ctx.arc(hx - 1 * s, hy - 1 * s, 1.5 * s, 0, 6.283); ctx.fill();
    } else {                                // florzinha de três pétalas
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * 6.283 + f.ph;
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * 2.4 * s, hy + Math.sin(a) * 2.4 * s, 2.6 * s, 2 * s, a, 0, 6.283);
        ctx.fill();
      }
    }
  },

  /* ---------------- árvores e arbustos ---------------- */
  drawTree(ctx, t, env) {
    const s = this.depthScale(t.z) * t.scale;
    const y = this.bandY(t.z);
    const sway = Math.sin(this.time * t.swaySpd + t.seed * 6.3) * (2 + env.wind * 13);

    // Árvore da frente na altura de quem está caminhando fica translúcida:
    // nada pode esconder os dois — é a única coisa que importa na tela.
    let fade = 1;
    if (env.chars) {
      for (const p of env.chars) {
        if (t.z > p.z + 0.05 && Math.abs(t.x - p.x) < 90 * s) fade = Math.min(fade, 0.30);
      }
    }
    ctx.save();
    ctx.globalAlpha = fade;

    // sombra no chão
    ctx.fillStyle = U.rgb(env.ambient, 0.20 * env.light);
    ctx.beginPath();
    ctx.ellipse(t.x + sway * 0.3, y + 2, 34 * s, 8 * s, 0, 0, 6.283);
    ctx.fill();

    // tronco
    const bark = this.tone(t.kind === 'birch' ? [186, 180, 168] : [92, 70, 56], env, 0.6);
    const topY = y - 74 * s;
    ctx.fillStyle = U.rgb(bark);
    ctx.beginPath();
    ctx.moveTo(t.x - 7 * s, y);
    ctx.quadraticCurveTo(t.x - 4 * s, y - 40 * s, t.x - 2.6 * s + sway, topY);
    ctx.lineTo(t.x + 2.6 * s + sway, topY);
    ctx.quadraticCurveTo(t.x + 4 * s, y - 40 * s, t.x + 7 * s, y);
    ctx.closePath();
    ctx.fill();

    // galhos
    ctx.strokeStyle = U.rgb(U.scale(bark, 0.9));
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const dy = -34 * s - i * 16 * s, dir = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(t.x + sway * 0.4, y + dy);
      ctx.quadraticCurveTo(t.x + dir * 16 * s + sway * 0.7, y + dy - 8 * s,
        t.x + dir * 26 * s + sway, y + dy - 20 * s);
      ctx.stroke();
    }

    // folhagem: quantidade e cor dependem da conexão
    const alive = U.clamp(env.warmth * 1.25, 0, 1);
    const count = Math.max(2, Math.round(t.blobs.length * (0.45 + alive * 0.55)));
    const green = U.mix([62, 92, 62], [78, 148, 68], alive);
    const dry = [96, 82, 56];
    const leafC = this.tone(U.mix(dry, green, alive), env, 0.55);
    const leafHi = this.tone(U.mix(U.mix(dry, green, alive), [230, 238, 150], 0.42), env, 0.5);

    for (let i = 0; i < count; i++) {
      const b = t.blobs[i];
      const bx = t.x + b.dx * s + sway * (1 + (-b.dy) / 90);
      const by = y + b.dy * s;
      ctx.fillStyle = U.rgb(leafC, 0.94);
      ctx.beginPath();
      ctx.ellipse(bx, by, b.r * s * b.w, b.r * s * 0.82, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = U.rgb(leafHi, 0.5);
      ctx.beginPath();
      ctx.ellipse(bx - b.r * s * 0.28, by - b.r * s * 0.3, b.r * s * 0.55, b.r * s * 0.4, 0, 0, 6.283);
      ctx.fill();

      // flores na árvore quando a conexão está alta
      if (env.warmth > 0.55) {
        const n = Math.round((env.warmth - 0.55) * 16);
        ctx.fillStyle = U.rgb(this.tone([250, 200, 214], env, 0.35), 0.9);
        for (let j = 0; j < n; j++) {
          const a = U.hash(b.seed + j) * 6.283, rr = U.hash(b.seed + j + 9) * b.r * s;
          ctx.beginPath();
          ctx.arc(bx + Math.cos(a) * rr, by + Math.sin(a) * rr, 1.8 * s, 0, 6.283);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  },

  drawBush(ctx, b, env) {
    const s = this.depthScale(b.z) * b.s, y = this.bandY(b.z);
    const sway = Math.sin(this.time * 1.3 + b.seed * 7) * (1 + env.wind * 6);
    const alive = U.clamp(env.warmth * 1.2, 0, 1);
    const col = this.tone(U.mix([70, 74, 56], [64, 118, 58], alive), env, 0.55);
    ctx.fillStyle = U.rgb(col);
    for (let i = 0; i < 3; i++) {
      const r = (11 + U.hash(b.seed + i) * 9) * s;
      ctx.beginPath();
      ctx.ellipse(b.x + (i - 1) * 10 * s + sway * 0.5, y - r * 0.55, r, r * 0.75, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = U.rgb(U.mix(col, [240, 244, 190], 0.3), 0.45);
    ctx.beginPath();
    ctx.ellipse(b.x - 4 * s + sway * 0.5, y - 14 * s, 9 * s, 6 * s, 0, 0, 6.283);
    ctx.fill();
  },

  /* ---------------- lugares de memória ---------------- */
  drawMemory(ctx, m, env) {
    const s = this.depthScale(m.z), y = this.bandY(m.z);
    const pulse = 0.7 + 0.3 * Math.sin(m.pulse);
    const alpha = m.glow * (m.found ? 0.5 : 1) * pulse;

    // halo no chão
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(m.x, y - 6, 0, m.x, y - 6, 90 * s);
    const col = U.mix([150, 190, 230], [255, 214, 150], env.warmth);
    gr.addColorStop(0, U.rgb(col, 0.30 * alpha));
    gr.addColorStop(1, U.rgb(col, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(m.x, y - 6, 90 * s, 30 * s, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();

    // objeto físico do lugar
    if (m.prop === 'bench') this.drawBench(ctx, m.x, y, s, env);
    else if (m.prop === 'stone') {
      ctx.fillStyle = U.rgb(this.tone([132, 128, 124], env, 0.6));
      ctx.beginPath(); ctx.ellipse(m.x, y - 8 * s, 22 * s, 13 * s, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = U.rgb(this.tone([168, 164, 158], env, 0.6), 0.8);
      ctx.beginPath(); ctx.ellipse(m.x - 5 * s, y - 13 * s, 12 * s, 6 * s, 0, 0, 6.283); ctx.fill();
    } else if (m.prop === 'puddle') {
      ctx.fillStyle = U.rgb(this.tone([96, 130, 158], env, 0.7), 0.75);
      ctx.beginPath(); ctx.ellipse(m.x, y - 2 * s, 34 * s, 9 * s, 0, 0, 6.283); ctx.fill();
    }

    // símbolo flutuando
    const bob = Math.sin(m.pulse * 0.8) * 6 * s;
    ctx.save();
    ctx.globalAlpha = U.clamp(alpha, 0, 1);
    ctx.font = (26 * s).toFixed(1) + 'px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.sym, m.x, y - 66 * s + bob);
    ctx.restore();
  },

  drawBench(ctx, x, y, s, env) {
    const wood = this.tone([124, 92, 64], env, 0.55);
    const dark = U.scale(wood, 0.75);
    ctx.fillStyle = U.rgb(env.ambient, 0.18 * env.light);
    ctx.beginPath(); ctx.ellipse(x, y + 1, 34 * s, 6 * s, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = U.rgb(dark);
    ctx.fillRect(x - 26 * s, y - 16 * s, 4 * s, 16 * s);
    ctx.fillRect(x + 22 * s, y - 16 * s, 4 * s, 16 * s);
    ctx.fillStyle = U.rgb(wood);
    ctx.fillRect(x - 30 * s, y - 20 * s, 60 * s, 5 * s);   // assento
    ctx.fillRect(x - 30 * s, y - 34 * s, 60 * s, 4 * s);   // encosto
    ctx.fillStyle = U.rgb(dark);
    ctx.fillRect(x - 28 * s, y - 34 * s, 3 * s, 16 * s);
    ctx.fillRect(x + 25 * s, y - 34 * s, 3 * s, 16 * s);
  },

  /* ======================================================================
     DESENHO — atmosfera (espaço de tela, depois de tudo)
     ====================================================================== */
  /** raios de sol atravessando as árvores — só existem quando há calor */
  drawRays(ctx, env, view) {
    const a = env.warmth * (1 - env.night) * 0.5;
    if (a < 0.02) return;
    const sun = env.sun;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ang = -1.05 + i * 0.19 + Math.sin(this.time * 0.18 + i) * 0.035;
      const len = view.h * 1.7, wdt = 22 + i * 10;
      ctx.save();
      ctx.translate(sun.x, sun.y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, U.rgb(env.sunColor, 0.085 * a));
      g.addColorStop(0.45, U.rgb(env.sunColor, 0.035 * a));
      g.addColorStop(1, U.rgb(env.sunColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-wdt * 0.25, 0);
      ctx.lineTo(wdt * 0.25, 0);
      ctx.lineTo(wdt * 1.6, len);
      ctx.lineTo(-wdt * 1.6, len);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },

  /** névoa no horizonte — cresce com o frio e com a chuva */
  drawFog(ctx, env, view) {
    const a = U.clamp((1 - env.warmth) * 0.26 + env.rain * 0.22, 0, 0.5);
    if (a < 0.02) return;
    const hY = env.horizonY;
    const top = hY - 130, hgt = 400;
    const g = ctx.createLinearGradient(0, top, 0, top + hgt);
    const col = U.mix([200, 212, 228], [150, 168, 190], env.night);
    g.addColorStop(0, U.rgb(col, 0));
    g.addColorStop(0.34, U.rgb(col, a));
    g.addColorStop(0.62, U.rgb(col, a * 0.5));
    g.addColorStop(1, U.rgb(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, view.w, hgt);
  },

  /**
   * Correção de cor: é aqui que o mundo inteiro fica frio ou quente.
   * Nada disso aparece como número — só como sensação.
   */
  drawGrade(ctx, env, view) {
    const cold = 1 - env.warmth;

    // frio: azul acinzentado por cima de tudo
    if (cold > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = U.rgb([150, 176, 214], cold * 0.24);
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }
    // quente: dourado suave (azul quase neutro, para não esverdear a cena)
    if (env.warmth > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = U.rgb([255, 198, 148], env.warmth * 0.34);
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
      if (env.warmth > 0.5) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgb([255, 214, 158], (env.warmth - 0.5) * 0.10);
        ctx.fillRect(0, 0, view.w, view.h);
        ctx.restore();
      }
    }
    // noite
    if (env.night > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = U.rgb(U.mix([120, 140, 200], [90, 110, 170], env.warmth), env.night * 0.32);
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }

    // olhar mútuo: o mundo respira luz
    if (env.mutual > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(view.w / 2, view.h * 0.55, 0, view.w / 2, view.h * 0.55, view.w * 0.7);
      g.addColorStop(0, U.rgb([255, 226, 176], 0.16 * env.mutual));
      g.addColorStop(1, U.rgb([255, 226, 176], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }

    // vinheta (mais fechada quando o mundo está frio)
    const v = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.34,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(6,10,22,' + (0.15 + cold * 0.16) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, view.w, view.h);
  }
};
