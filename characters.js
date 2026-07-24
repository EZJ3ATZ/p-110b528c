/* ==========================================================================
   characters.js — MATHEUS E CLARA
   --------------------------------------------------------------------------
   Person  → desenho vetorial de uma pessoa (corpo, cabelo, rosto, caminhada,
             olhar, sorriso discreto, brilho nos olhos) e física simples.
   Matheus → controlado pelo jogador.
   Clara   → tem uma inteligência própria, simples: ela decide quando andar
             junto, quando ficar parada, quando olhar e — se for o caso —
             quando seguir outro caminho. Ela nunca é "conquistada".
   ========================================================================== */

class Person {
  constructor(cfg) {
    this.name = cfg.name;
    this.x = cfg.x;
    this.z = cfg.z !== undefined ? cfg.z : 0.5;
    this.vx = 0; this.vz = 0;
    this.dir = 1;                 // -1 olhando para a esquerda, 1 para a direita
    this.build = cfg.build || 1;  // altura relativa
    this.speed = cfg.speed || 168;
    this.walkPhase = 0;
    this.moveAmt = 0;             // 0 parado, 1 andando (suavizado)
    this.gaze = 0;                // 0..1 — quanto está olhando para o outro
    this.smile = 0;
    this.blink = U.rand(0, 4);
    this.sitting = false;
    this.sparkTimer = 0;
    this.pal = cfg.pal;           // paleta de cores do personagem
    this.hair = cfg.hair;         // 'short' | 'long'
  }

  /* ---------------- física comum ---------------- */
  step(dt, env) {
    this.x = U.clamp(this.x + this.vx * dt, 30, World.WIDTH - 30);
    this.z = U.clamp(this.z + this.vz * dt, 0.06, 0.94);

    const sp = Math.hypot(this.vx, this.vz * 240);
    this.moveAmt = U.lerp(this.moveAmt, sp > 6 ? 1 : 0, dt * 8);
    this.walkPhase += dt * (4 + Math.min(sp, 220) * 0.026) * this.moveAmt;
    if (Math.abs(this.vx) > 8) this.dir = Math.sign(this.vx);

    this.blink -= dt;
    this.smile = U.lerp(this.smile, this.gaze > 0.45 ? 1 : 0, dt * 2.2);

    // faíscas discretas quando está olhando para o outro
    this.sparkTimer -= dt;
    if (this.gaze > 0.5 && this.sparkTimer <= 0) {
      this.sparkTimer = U.rand(0.18, 0.45);
      const g = this.headPos();
      Particles.emit('spark', g.x, g.y, 1,
        { c: U.mix([190, 220, 255], [255, 226, 170], env.warmth) });
    }
  }

  headPos() {
    const s = World.depthScale(this.z) * this.build;
    return { x: this.x, y: World.bandY(this.z) - (this.sitting ? 58 : 84) * s, s };
  }

  /** faz o personagem virar o rosto para o outro */
  lookAt(other) { this.faceDir = Math.sign(other.x - this.x) || 1; }

  /* ---------------- desenho ---------------- */
  draw(ctx, env) {
    const y = World.bandY(this.z);
    const s = World.depthScale(this.z) * this.build;
    const P = this.pal;
    const cold = (1 - env.warmth);

    // as roupas perdem cor quando o mundo esfria — mas eles nunca somem no escuro
    const skin = World.toneChar(P.skin, env);
    const hairC = World.toneChar(P.hair, env);
    const top = World.toneChar(U.mix(P.topCold, P.topWarm, env.warmth), env);
    const bottom = World.toneChar(P.bottom, env);
    const dark = U.scale(top, 0.72);

    const bob = Math.sin(this.walkPhase * 2) * 1.5 * s * this.moveAmt;
    const feetY = y;
    const hipY = y - (this.sitting ? 26 : 40) * s + bob;
    const shoY = y - (this.sitting ? 50 : 68) * s + bob;
    const headY = y - (this.sitting ? 58 : 84) * s + bob;
    const headR = 9.6 * s;

    // ---------- sombra ----------
    ctx.fillStyle = U.rgb(env.ambient, 0.24 * U.clamp(env.light, 0.2, 1));
    ctx.beginPath();
    ctx.ellipse(this.x, feetY + 1, 15 * s, 4.6 * s, 0, 0, 6.283);
    ctx.fill();

    // ---------- cabelo comprido (atrás do corpo) ----------
    if (this.hair === 'long') {
      ctx.fillStyle = U.rgb(U.scale(hairC, 0.86));
      ctx.beginPath();
      ctx.moveTo(this.x - headR * 1.05, headY - headR * 0.2);
      ctx.quadraticCurveTo(this.x - headR * 1.7, headY + 18 * s, this.x - headR * 0.8, headY + 30 * s);
      ctx.quadraticCurveTo(this.x, headY + 36 * s, this.x + headR * 0.8, headY + 30 * s);
      ctx.quadraticCurveTo(this.x + headR * 1.7, headY + 18 * s, this.x + headR * 1.05, headY - headR * 0.2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ---------- pernas ----------
    const swing = Math.sin(this.walkPhase) * 10 * s * this.moveAmt;
    ctx.strokeStyle = U.rgb(bottom);
    ctx.lineWidth = 5.2 * s;
    if (this.sitting) {
      // sentado: coxas para frente, canelas para baixo
      const fx = this.dir * 20 * s;
      ctx.beginPath();
      ctx.moveTo(this.x, hipY);
      ctx.lineTo(this.x + fx, hipY + 3 * s);
      ctx.lineTo(this.x + fx * 0.92, feetY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x + 1.5 * s, hipY + 2 * s);
      ctx.lineTo(this.x + fx * 0.9, hipY + 6 * s);
      ctx.lineTo(this.x + fx * 0.8, feetY);
      ctx.stroke();
    } else {
      ctx.beginPath();   // perna de trás
      ctx.moveTo(this.x, hipY);
      ctx.quadraticCurveTo(this.x - swing * 0.5, (hipY + feetY) / 2, this.x - swing, feetY);
      ctx.stroke();
      ctx.strokeStyle = U.rgb(U.scale(bottom, 1.12));
      ctx.beginPath();   // perna da frente
      ctx.moveTo(this.x, hipY);
      ctx.quadraticCurveTo(this.x + swing * 0.5, (hipY + feetY) / 2, this.x + swing, feetY);
      ctx.stroke();
    }

    // ---------- tronco ----------
    ctx.fillStyle = U.rgb(top);
    ctx.beginPath();
    ctx.moveTo(this.x - 8.4 * s, shoY);
    ctx.quadraticCurveTo(this.x - 10.5 * s, hipY - 6 * s, this.x - 7 * s, hipY + 2 * s);
    ctx.lineTo(this.x + 7 * s, hipY + 2 * s);
    ctx.quadraticCurveTo(this.x + 10.5 * s, hipY - 6 * s, this.x + 8.4 * s, shoY);
    ctx.quadraticCurveTo(this.x, shoY - 6 * s, this.x - 8.4 * s, shoY);
    ctx.closePath();
    ctx.fill();
    // dobra de luz no tronco
    ctx.fillStyle = U.rgb(U.mix(top, [255, 245, 220], 0.22), 0.5);
    ctx.beginPath();
    ctx.ellipse(this.x - 3.5 * s * this.dir, shoY + 9 * s, 3.4 * s, 9 * s, 0, 0, 6.283);
    ctx.fill();

    // ---------- braços ----------
    const asw = -swing * 0.85;
    ctx.strokeStyle = U.rgb(dark);
    ctx.lineWidth = 4.2 * s;
    ctx.beginPath();
    ctx.moveTo(this.x - 7 * s, shoY + 3 * s);
    ctx.quadraticCurveTo(this.x - 11 * s + asw * 0.4, shoY + 15 * s, this.x - 9 * s + asw, shoY + 26 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.x + 7 * s, shoY + 3 * s);
    ctx.quadraticCurveTo(this.x + 11 * s - asw * 0.4, shoY + 15 * s, this.x + 9 * s - asw, shoY + 26 * s);
    ctx.stroke();
    // mãos
    ctx.fillStyle = U.rgb(skin);
    ctx.beginPath(); ctx.arc(this.x - 9 * s + asw, shoY + 27 * s, 2.3 * s, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + 9 * s - asw, shoY + 27 * s, 2.3 * s, 0, 6.283); ctx.fill();

    // ---------- pescoço e cabeça ----------
    const turn = (this.faceDir !== undefined ? this.faceDir : this.dir) * this.gaze;
    const hx = this.x + turn * 2.2 * s;   // rosto vira para quem ele/ela olha

    ctx.strokeStyle = U.rgb(U.scale(skin, 0.92));
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(this.x, shoY - 1 * s);
    ctx.lineTo(this.x, headY + headR * 0.75);
    ctx.stroke();

    ctx.fillStyle = U.rgb(skin);
    ctx.beginPath();
    ctx.ellipse(hx, headY, headR * 0.92, headR, 0, 0, 6.283);
    ctx.fill();

    // ---------- cabelo (frente) ----------
    ctx.fillStyle = U.rgb(hairC);
    if (this.hair === 'long') {
      ctx.beginPath();
      ctx.ellipse(hx, headY - headR * 0.34, headR * 1.06, headR * 0.86, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();  // mecha caindo no rosto
      ctx.moveTo(hx - headR * 1.02, headY - headR * 0.35);
      ctx.quadraticCurveTo(hx - headR * 1.25, headY + headR * 0.5, hx - headR * 0.72, headY + headR * 0.75);
      ctx.quadraticCurveTo(hx - headR * 0.95, headY - headR * 0.1, hx - headR * 0.62, headY - headR * 0.6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(hx, headY - headR * 0.36, headR * 0.98, headR * 0.72, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(hx - headR * 0.98, headY - headR * 0.42, headR * 1.96, headR * 0.28);
    }

    // ---------- rosto ----------
    const eyeY = headY + headR * 0.06;
    const ex = turn * 1.6 * s;
    const blinking = this.blink < 0;
    if (this.blink < -0.12) this.blink = U.rand(2.5, 6.5);

    ctx.fillStyle = 'rgba(28,26,34,0.9)';
    if (blinking) {
      ctx.fillRect(hx - 4.2 * s + ex, eyeY, 2.6 * s, 0.9 * s);
      ctx.fillRect(hx + 1.6 * s + ex, eyeY, 2.6 * s, 0.9 * s);
    } else {
      ctx.beginPath(); ctx.arc(hx - 2.9 * s + ex, eyeY, 1.25 * s, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 2.9 * s + ex, eyeY, 1.25 * s, 0, 6.283); ctx.fill();
      // brilho nos olhos — só existe quando está olhando para o outro
      if (this.gaze > 0.25) {
        ctx.fillStyle = U.rgb([255, 255, 255], this.gaze * 0.95);
        ctx.beginPath(); ctx.arc(hx - 2.4 * s + ex, eyeY - 0.6 * s, 0.55 * s, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + 3.4 * s + ex, eyeY - 0.6 * s, 0.55 * s, 0, 6.283); ctx.fill();
      }
    }

    // sorriso discreto
    if (this.smile > 0.05) {
      ctx.strokeStyle = 'rgba(120,72,68,' + (0.35 + this.smile * 0.5) + ')';
      ctx.lineWidth = 1.05 * s;
      ctx.beginPath();
      ctx.arc(hx + ex, headY + headR * 0.34, 2.9 * s, 0.28 * Math.PI, 0.72 * Math.PI);
      ctx.stroke();
      // rubor
      ctx.fillStyle = U.rgb([236, 150, 150], this.smile * 0.20);
      ctx.beginPath(); ctx.arc(hx - 5 * s + ex, headY + headR * 0.28, 2 * s, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 5 * s + ex, headY + headR * 0.28, 2 * s, 0, 6.283); ctx.fill();
    }

    // brilho suave em volta de quem olha (quase imperceptível, mas está lá)
    if (this.gaze > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(hx, headY, 0, hx, headY, 46 * s);
      const c = U.mix([170, 200, 255], [255, 220, 170], env.warmth);
      g.addColorStop(0, U.rgb(c, 0.13 * this.gaze));
      g.addColorStop(1, U.rgb(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(hx - 46 * s, headY - 46 * s, 92 * s, 92 * s);
      ctx.restore();
    }
  }
}

/* ==========================================================================
   Matheus — o jogador
   ========================================================================== */
class Matheus extends Person {
  constructor(x) {
    super({
      name: 'Matheus', x, z: 0.55, speed: 172, build: 1.02, hair: 'short',
      pal: {
        skin: [226, 184, 152], hair: [52, 40, 36],
        topCold: [72, 88, 110], topWarm: [86, 126, 140], bottom: [56, 58, 74]
      }
    });
    this.input = { ax: 0, az: 0, look: false };
  }

  update(dt, env, other) {
    const acc = this.input;
    this.vx = U.lerp(this.vx, acc.ax * this.speed, dt * 9);
    this.vz = U.lerp(this.vz, acc.az * 0.46, dt * 9);

    // olhar: segurar o botão. Ele só consegue olhar de fato se ela estiver por perto.
    const d = Math.abs(other.x - this.x);
    const canSee = d < 1500;
    const want = acc.look && canSee ? 1 : 0;
    this.gaze = U.lerp(this.gaze, want, dt * (want ? 3.4 : 2.6));
    if (this.gaze > 0.05) this.lookAt(other); else this.faceDir = undefined;

    this.step(dt, env);
  }
}

/* ==========================================================================
   Clara — inteligência própria
   --------------------------------------------------------------------------
   Ela não segue o jogador. Ela decide. A proximidade e a conexão só mudam a
   probabilidade das decisões dela — nunca as obrigam.
   ========================================================================== */
class Clara extends Person {
  constructor(x) {
    super({
      name: 'Clara', x, z: 0.45, speed: 150, build: 0.96, hair: 'long',
      pal: {
        skin: [238, 200, 172], hair: [118, 62, 46],
        topCold: [122, 104, 118], topWarm: [196, 122, 142], bottom: [88, 74, 96]
      }
    });
    this.mode = 'wander';
    this.decision = 1.2;
    this.gazeTimer = 2;
    this.gazeWant = false;
    this.target = x;
    this.targetZ = this.z;
    this.leaveDir = 1;
    this.patience = 1;      // cai quando ele fica longe por muito tempo
  }

  /** ela decide seguir o próprio caminho (Final 2) */
  leave(dir) { this.mode = 'leaving'; this.leaveDir = dir; this.gazeWant = false; }
  sitDown(dir) { this.mode = 'sit'; this.sitting = true; this.dir = dir; }

  update(dt, env, player) {
    const dx = player.x - this.x;
    const d = Math.abs(dx);

    /* ---------------- decisões ---------------- */
    if (this.mode !== 'leaving' && this.mode !== 'sit') {
      this.decision -= dt;
      if (this.decision <= 0) {
        this.decision = U.rand(1.7, 4.4);
        const c = env.connection;
        if (d < 210) {
          // perto: ou caminha ao lado dele, ou fica parada só olhando
          this.mode = Math.random() < 0.55 + c * 0.25 ? 'walk_with' : 'pause';
        } else if (d < 950) {
          this.mode = Math.random() < 0.20 + c * 0.6 ? 'approach' : 'wander';
        } else {
          this.mode = Math.random() < 0.45 ? 'wander' : 'pause';
        }
        if (this.mode === 'wander') {
          this.target = U.clamp(this.x + U.rand(-420, 420), 60, World.WIDTH - 60);
          this.targetZ = U.clamp(this.z + U.rand(-0.3, 0.3), 0.1, 0.9);
        }
      }
    }

    /* ---------------- movimento por modo ---------------- */
    let want = 0, wantZ = 0;
    switch (this.mode) {
      case 'walk_with': {
        // quanto mais conexão, mais perto ela aceita ficar (a reconquista aparece aqui)
        const side = Math.sign(dx) || 1;
        const gap = U.lerp(115, 46, env.connection);
        const goal = player.x - side * gap;
        want = U.clamp((goal - this.x) / 90, -1, 1) * (player.moveAmt > 0.4 ? 1 : 0.35);
        wantZ = U.clamp((player.z + 0.1 - this.z) * 1.4, -1, 1) * 0.5;
        break;
      }
      case 'approach': {
        // com conexão alta ela vai até ele; com conexão baixa, para no meio do caminho
        const stop = U.lerp(240, 70, env.connection);
        if (d > stop) want = Math.sign(dx) * (0.45 + env.connection * 0.35);
        wantZ = U.clamp((player.z - this.z) * 1.2, -1, 1) * 0.4;
        break;
      }
      case 'wander': {
        want = U.clamp((this.target - this.x) / 140, -1, 1) * 0.38;
        wantZ = U.clamp((this.targetZ - this.z) * 3, -1, 1) * 0.3;
        if (Math.abs(this.target - this.x) < 24) this.mode = 'pause';
        break;
      }
      case 'leaving': {
        want = this.leaveDir * 0.44;
        break;
      }
      case 'pause':
      case 'sit':
      default: want = 0;
    }

    this.vx = U.lerp(this.vx, want * this.speed, dt * 5);
    this.vz = U.lerp(this.vz, wantZ * 0.4, dt * 4);

    /* ---------------- o olhar dela ---------------- */
    if (this.mode === 'leaving') {
      this.gazeWant = false;
    } else {
      this.gazeTimer -= dt;
      if (this.gazeTimer <= 0) {
        // quanto mais perto (e mais conexão), maior a chance de ela olhar
        let chance = U.map(d, 1000, 120, 0.04, 0.80) * (0.45 + env.connection * 0.85);
        if (player.gaze > 0.55 && d < 620) chance += 0.4;   // ela percebe quando ele olha
        // nunca 100%: ela também desvia o olhar, como qualquer pessoa
        this.gazeWant = Math.random() < Math.min(chance, 0.86);
        this.gazeTimer = this.gazeWant ? U.rand(1.8, 4.6) : U.rand(1.4, 4.2);
      }
    }
    const canSee = d < 1400;
    this.gaze = U.lerp(this.gaze, (this.gazeWant && canSee) ? 1 : 0, dt * (this.gazeWant ? 2.4 : 2.0));
    if (this.gaze > 0.05) this.lookAt(player); else this.faceDir = undefined;
    if (this.mode === 'sit') this.gaze = 0;

    this.step(dt, env);
  }
}
