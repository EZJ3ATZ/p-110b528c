/* ==========================================================================
   particles.js — PARTÍCULAS E VIDA DO AR
   --------------------------------------------------------------------------
   Um único sistema cuida de tudo que flutua na tela:

     frio  → poeira azul, folhas secas caindo, chuva, vento
     calor → partículas douradas, pétalas, borboletas, pássaros, vaga-lumes
     olhar → faíscas junto ao rosto
     olhar mútuo → estrelinhas por toda parte

   Os emissores não são ligados por eventos: eles simplesmente leem o
   ambiente (env.warmth, env.wind, env.night, env.rain) e nascem sozinhos.
   ========================================================================== */

const Particles = {
  list: [],
  MAX: 720,
  acc: {},          // acumuladores de taxa de emissão por tipo

  reset() { this.list.length = 0; this.acc = {}; },

  add(p) { if (this.list.length < this.MAX) this.list.push(p); },

  /** emissor pontual — usado pelos personagens (faíscas do olhar, memórias) */
  emit(type, x, y, n = 1, opt = {}) {
    for (let i = 0; i < n; i++) {
      switch (type) {
        case 'spark':
          this.add({
            type: 'spark', x: x + U.rand(-8, 8), y: y + U.rand(-8, 8),
            vx: U.rand(-8, 8), vy: U.rand(-24, -8),
            life: 0, max: U.rand(0.8, 1.6), s: U.rand(1.2, 2.6),
            c: opt.c || [255, 232, 186], layer: 1
          });
          break;
        case 'starlet':
          this.add({
            type: 'starlet', x: x + U.rand(-260, 260), y: y + U.rand(-180, 60),
            vx: U.rand(-6, 6), vy: U.rand(-14, -3),
            life: 0, max: U.rand(1.6, 3.2), s: U.rand(2, 4.4),
            c: [255, 244, 210], rot: Math.random() * 6.283, layer: 1
          });
          break;
        case 'burst':
          this.add({
            type: 'gold', x: x + U.rand(-20, 20), y: y + U.rand(-20, 20),
            vx: U.rand(-30, 30), vy: U.rand(-45, -12),
            life: 0, max: U.rand(1.4, 2.8), s: U.rand(1.4, 3),
            c: opt.c || [255, 216, 150], layer: 1
          });
          break;
        case 'petal':
          this.add({
            type: 'leaf', x, y, vx: U.rand(-14, 14), vy: U.rand(-6, 14),
            life: 0, max: U.rand(3, 6), s: U.rand(2.4, 4.4),
            c: [248, 196, 210], rot: Math.random() * 6.283, spin: U.rand(-3, 3), layer: 1
          });
          break;
        // símbolo dos gestos (flor, lanche, beijo) subindo entre os dois
        case 'emoji':
          this.add({
            type: 'emoji', x: x + U.rand(-14, 14), y,
            vx: U.rand(-9, 9), vy: U.rand(-34, -18),
            life: 0, max: U.rand(1.8, 2.8), s: opt.s || 22,
            txt: opt.txt || '💛', c: [255, 255, 255], layer: 1
          });
          break;
      }
    }
  },

  /* ---------------------------------------------------------------- update */
  update(dt, env) {
    const R = env.rect;                     // retângulo visível do mundo
    const wind = 12 + env.wind * 120;       // px/s
    const rate = (key, perSec, fn) => {     // helper de emissão contínua
      if (perSec <= 0) return;
      this.acc[key] = (this.acc[key] || 0) + perSec * dt;
      while (this.acc[key] >= 1) { this.acc[key] -= 1; fn(); }
    };
    const rx = () => U.rand(R.x0 - 120, R.x1 + 120);

    /* ---- poeira azul: quanto mais distantes, mais fria a tela ---- */
    rate('cold', (1 - env.warmth) * 16, () => this.add({
      type: 'cold', x: rx(), y: U.rand(R.y0, R.y1),
      vx: U.rand(-6, 6), vy: U.rand(-12, -2),
      life: 0, max: U.rand(3.5, 7), s: U.rand(1, 2.6),
      c: [150, 190, 235], layer: 1
    }));

    /* ---- partículas douradas: nascem quando há proximidade ---- */
    rate('gold', env.warmth * 22, () => this.add({
      type: 'gold', x: rx(), y: U.rand(World.HORIZON + 60, R.y1),
      vx: U.rand(-8, 8), vy: U.rand(-20, -5),
      life: 0, max: U.rand(2.5, 5.5), s: U.rand(1.2, 3),
      c: [255, 214, 150], layer: 1
    }));

    /* ---- folhas secas: o vento aumenta com a distância ---- */
    rate('leaf', (1 - env.warmth) * 5 + env.wind * 4, () => this.add({
      type: 'leaf', x: rx(), y: U.rand(World.HORIZON, World.BAND_Y0 - 60),
      vx: wind * U.rand(0.5, 1.1), vy: U.rand(8, 26),
      life: 0, max: U.rand(4, 9), s: U.rand(2.6, 5),
      c: U.mix([176, 132, 74], [128, 122, 96], Math.random()),
      rot: Math.random() * 6.283, spin: U.rand(-4, 4), layer: 1
    }));

    /* ---- pétalas: o oposto, leves e claras ---- */
    rate('petal', Math.max(0, env.warmth - 0.35) * 7, () => this.add({
      type: 'leaf', x: rx(), y: U.rand(World.HORIZON, World.BAND_Y0 - 40),
      vx: U.rand(-20, 20), vy: U.rand(6, 18),
      life: 0, max: U.rand(4, 8), s: U.rand(2.2, 4),
      c: U.pick([[250, 200, 214], [252, 226, 232], [246, 214, 168]]),
      rot: Math.random() * 6.283, spin: U.rand(-3, 3), layer: 1
    }));

    /* ---- chuva ---- */
    rate('rain', env.rain * 260, () => this.add({
      type: 'rain', x: rx(), y: R.y0 - 40,
      vx: wind * 0.35, vy: U.rand(760, 980),
      life: 0, max: 2.2, s: U.rand(6, 13), c: [186, 208, 232], layer: 1
    }));

    /* ---- vaga-lumes: noite + alguma conexão ---- */
    const fireflyWant = env.night * Math.max(0, env.warmth - 0.2) * 26;
    const flies = this.count('firefly');
    if (flies < fireflyWant) {
      this.add({
        type: 'firefly', x: rx(), y: U.rand(World.BAND_Y0 - 90, World.BAND_Y1),
        vx: U.rand(-14, 14), vy: U.rand(-8, 8),
        life: 0, max: U.rand(9, 18), s: U.rand(1.6, 2.8),
        c: [220, 255, 170], ph: Math.random() * 6.283, layer: 1
      });
    }

    /* ---- borboletas: dia + conexão ---- */
    const bflyWant = (1 - env.night) * Math.max(0, env.warmth - 0.32) * 14;
    if (this.count('butterfly') < bflyWant) {
      this.add({
        type: 'butterfly', x: rx(), y: U.rand(World.BAND_Y0 - 70, World.BAND_Y1 - 20),
        vx: U.rand(-26, 26), vy: 0,
        life: 0, max: U.rand(10, 20), s: U.rand(0.8, 1.5),
        c: U.pick([[255, 226, 140], [255, 176, 190], [186, 220, 255]]),
        ph: Math.random() * 6.283, layer: 1
      });
    }

    /* ---- pássaros: cruzam o céu e, com muita conexão, pousam nas árvores ---- */
    rate('bird', Math.max(0, env.warmth - 0.25) * 0.6 * (1 - env.night), () => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.add({
        type: 'bird', x: dir > 0 ? R.x0 - 100 : R.x1 + 100,
        y: U.rand(World.HORIZON - 190, World.HORIZON - 30),
        vx: dir * U.rand(60, 110), vy: 0,
        life: 0, max: 40, s: U.rand(0.7, 1.3), c: [40, 44, 54],
        ph: Math.random() * 6.283, layer: 1
      });
    });

    /* ---- estrelinhas do olhar mútuo ---- */
    rate('mutual', env.mutual * 16, () => this.emit('starlet', env.midX || 0, World.BAND_Y0 - 40, 1));

    /* ------------------------- física -------------------------- */
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;

      switch (p.type) {
        case 'cold':
        case 'gold':
          p.x += (p.vx + wind * 0.12) * dt;
          p.y += p.vy * dt;
          p.vy += (p.type === 'gold' ? -3 : 2) * dt;
          break;
        case 'leaf':
          p.x += (p.vx + Math.sin(p.life * 2 + p.rot) * 26) * dt;
          p.y += p.vy * dt;
          p.vy = Math.min(p.vy + 12 * dt, 60);
          p.rot += p.spin * dt;
          break;
        case 'rain':
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > World.bandY(U.rand(0, 1))) p.life = p.max; // some ao tocar o chão
          break;
        case 'firefly':
          p.vx += Math.sin(p.life * 1.7 + p.ph) * 22 * dt;
          p.vy += Math.cos(p.life * 1.3 + p.ph * 2) * 16 * dt;
          p.vx = U.clamp(p.vx, -26, 26); p.vy = U.clamp(p.vy, -20, 20);
          p.x += p.vx * dt; p.y += p.vy * dt;
          break;
        case 'butterfly':
          p.vx += Math.sin(p.life * 2.1 + p.ph) * 34 * dt;
          p.vx = U.clamp(p.vx, -46, 46);
          p.x += p.vx * dt;
          p.y += Math.sin(p.life * 5 + p.ph) * 22 * dt;
          break;
        case 'bird':
          p.x += p.vx * dt;
          p.y += Math.sin(p.life * 1.1 + p.ph) * 10 * dt;
          if (p.x < R.x0 - 400 || p.x > R.x1 + 400) p.life = p.max;
          break;
        case 'spark':
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 14 * dt;
          break;
        case 'starlet':
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 1.4;
          break;
        case 'emoji':
          p.x += (p.vx + Math.sin(p.life * 3) * 10) * dt;
          p.y += p.vy * dt;
          p.vy += 9 * dt;
          break;
      }

      // partículas de ambiente somem quando o clima emocional muda
      if (p.type === 'cold' && env.warmth > 0.8) p.life += dt * 2;
      if (p.type === 'gold' && env.warmth < 0.12) p.life += dt * 2;

      if (p.life >= p.max || p.x < R.x0 - 700 || p.x > R.x1 + 700) this.list.splice(i, 1);
    }
  },

  count(type) {
    let n = 0;
    for (const p of this.list) if (p.type === type) n++;
    return n;
  },

  /* ---------------------------------------------------------------- draw */
  draw(ctx, env) {
    ctx.save();
    for (const p of this.list) {
      const t = p.life / p.max;
      const fade = U.smooth(Math.min(1, p.life / 0.5)) * U.smooth(Math.min(1, (1 - t) / 0.3));
      const c = World.tone(p.c, env, 0.35);

      switch (p.type) {
        case 'cold':
        case 'gold': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade * (p.type === 'gold' ? 0.85 : 0.6);
          ctx.fillStyle = U.rgb(p.c);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'leaf': {
          ctx.globalAlpha = fade * 0.92;
          ctx.fillStyle = U.rgb(c);
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.s * 1.5, p.s * 0.7, 0, 0, 6.283);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'rain': {
          ctx.globalAlpha = fade * 0.45;
          ctx.strokeStyle = U.rgb(p.c);
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.014, p.y - p.s);
          ctx.stroke();
          break;
        }
        case 'firefly': {
          const blink = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(p.life * 1.6 + p.ph)), 2);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade * blink;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 7);
          g.addColorStop(0, U.rgb(p.c, 0.9));
          g.addColorStop(1, U.rgb(p.c, 0));
          ctx.fillStyle = g;
          ctx.fillRect(p.x - p.s * 7, p.y - p.s * 7, p.s * 14, p.s * 14);
          ctx.fillStyle = U.rgb([255, 255, 220]);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.7, 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'butterfly': {
          const flap = Math.sin(p.life * 16 + p.ph);
          ctx.globalAlpha = fade;
          ctx.fillStyle = U.rgb(c);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(p.s, p.s);
          ctx.beginPath();
          ctx.ellipse(-3, 0, 3.4, 4.6 * Math.abs(flap) + 0.8, -0.4, 0, 6.283);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(3, 0, 3.4, 4.6 * Math.abs(flap) + 0.8, 0.4, 0, 6.283);
          ctx.fill();
          ctx.fillStyle = U.rgb(U.scale(c, 0.5));
          ctx.fillRect(-0.6, -3, 1.2, 6);
          ctx.restore();
          break;
        }
        case 'bird': {
          const flap = Math.sin(p.life * 7 + p.ph) * 5;
          ctx.globalAlpha = fade * 0.8;
          ctx.strokeStyle = U.rgb(World.tone(p.c, env, 0.8));
          ctx.lineWidth = 1.6 * p.s;
          ctx.beginPath();
          ctx.moveTo(p.x - 7 * p.s, p.y + flap * 0.4);
          ctx.quadraticCurveTo(p.x - 3 * p.s, p.y - flap, p.x, p.y);
          ctx.quadraticCurveTo(p.x + 3 * p.s, p.y - flap, p.x + 7 * p.s, p.y + flap * 0.4);
          ctx.stroke();
          break;
        }
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade;
          ctx.fillStyle = U.rgb(p.c);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - t * 0.5), 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'emoji': {
          ctx.globalAlpha = fade;
          ctx.font = (p.s * (0.7 + fade * 0.4)).toFixed(1) +
            'px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.txt, p.x, p.y);
          break;
        }
        case 'starlet': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = U.rgb(p.c);
          // estrela de quatro pontas
          ctx.beginPath();
          const r = p.s, r2 = p.s * 0.28;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * 6.283, rr = i % 2 ? r2 : r;
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
    ctx.restore();
  }
};
