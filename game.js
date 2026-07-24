/* ==========================================================================
   game.js — O LAÇO PRINCIPAL
   --------------------------------------------------------------------------
   Junta tudo:
     • canvas, redimensionamento e câmera cinematográfica (segue os dois e
       afasta o zoom quando eles se distanciam)
     • a variável invisível CONEXÃO — nunca aparece na tela, só muda o mundo
     • memórias, clima, ciclo do dia
     • os três finais simbólicos
     • entrada de teclado e de toque, e os botões da interface

   A conexão é a única "mecânica": ela sobe quando eles estão perto, caminham
   lado a lado e se olham; cai quando se afastam ou seguem em direções
   opostas. Todo o resto do jogo é consequência visual disso.
   ========================================================================== */

const Game = {
  /* ---------------------------------------------------------------- estado */
  state: 'menu',            // menu | playing | paused | ending
  canvas: null, ctx: null,
  view: { w: 0, h: 0, dpr: 1 },

  cam: { x: 0, y: 600, scale: 1, rise: 0 },

  env: {
    t: 0, dayT: 0.30, dayTarget: null,
    connection: 0, warmth: 0, mutual: 0,
    wind: 0.5, rain: 0, night: 0, light: 1,
    ambient: [34, 44, 82],
    skyTop: [0, 0, 0], skyMid: [0, 0, 0], skyBot: [0, 0, 0], sunColor: [255, 255, 255],
    sun: { x: 0, y: 0 }, moon: { x: 0, y: 0 }, horizonY: 0,
    rect: { x0: 0, x1: 0, y0: 0, y1: 0 },
    midX: 0, bloomX: 0, cam: null
  },

  // temporizadores que decidem os finais (também invisíveis)
  closeTime: 0,             // tempo perto, com conexão alta   → Final 1
  divergeTime: 0,           // tempo caminhando em sentidos opostos → Final 3
  patience: 120,            // paciência de Clara              → Final 2
  stillTime: 0,
  rainTimer: 30,
  wasMutual: false,

  /* ------------------------------------------------------------------------
     As frases. Sobem conforme a conexão cresce (a reconquista) e voltam
     quando ele se afasta. É o jeito do jogo dizer, sem gráfico nenhum:
     perto de você tudo melhora.
     ------------------------------------------------------------------------ */
  subindo: [
    { c: 0.12, sym: '🌱', txt: 'Ela percebeu você chegando perto.' },
    { c: 0.30, sym: '🌿', txt: 'Perto de você, o mundo para de doer.' },
    { c: 0.48, sym: '🌸', txt: 'As cores voltaram. Foi você chegando.' },
    { c: 0.66, sym: '☀️', txt: 'Ela parou de andar para o outro lado.' },
    { c: 0.82, sym: '🌻', txt: 'Tudo aqui fica melhor quando ela está por perto.' },
    { c: 0.95, sym: '✨', txt: 'Você não desistiu — e o campo inteiro floresceu.' }
  ],
  descendo: [
    { c: 0.55, sym: '🍂', txt: 'Ela sentiu você se afastando.' },
    { c: 0.28, sym: '🌧', txt: 'De longe, tudo perde a cor de novo.' },
    { c: 0.10, sym: '❄️', txt: 'O vento voltou. O frio também.' }
  ],
  topo: 0,                  // maior conexão já alcançada
  lineCooldown: 0,

  ending: null,             // { id, t }
  memTimer: 0,

  /* ------------------------------------------------------------------ boot */
  boot() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.env.cam = this.cam;

    this.dom = {
      hud: document.getElementById('hud'),
      hint: document.getElementById('hint'),
      lookBtn: document.getElementById('lookBtn'),
      memCard: document.getElementById('memoryCard'),
      memSym: document.getElementById('memSym'),
      memTxt: document.getElementById('memTxt'),
      start: document.getElementById('screenStart'),
      pause: document.getElementById('screenPause'),
      end: document.getElementById('screenEnd'),
      endTag: document.getElementById('endTag'),
      endQuote: document.getElementById('endQuote'),
      endBody: document.getElementById('endBody'),
      btnMusic: document.getElementById('btnMusic')
    };

    this.bindInput();
    this.bindUI();
    if (this.isTouch) {
      document.getElementById('startKeys').innerHTML =
        '<b>encoste na tela</b> para caminhar &nbsp;·&nbsp; botão <b>olhar</b> no canto';
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.reset();
    requestAnimationFrame(t => this.frame(t));
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.view = { w, h, dpr };
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  /** recomeça o mundo do zero */
  reset() {
    World.init();
    Particles.reset();

    const startX = 1300;
    this.matheus = new Matheus(startX);
    this.clara = new Clara(startX + 620);   // começam longe: é assim que ficou

    // começa no fim de tarde cinza, com garoa: o mundo já está esperando por ela
    Object.assign(this.env, {
      t: 0, dayT: 0.66, dayTarget: null,
      connection: 0.05, warmth: 0.05, mutual: 0,
      wind: 0.75, rain: 0.30, rainTarget: 0.45, night: 0, light: 1
    });
    this.closeTime = 0; this.divergeTime = 0; this.patience = 120;
    this.stillTime = 0; this.rainTimer = 34; this.wasMutual = false;
    this.ending = null; this.memTimer = 0;
    this.topo = 0; this.lineCooldown = 4;
    this.subindo.forEach(l => l.hit = false);
    this.descendo.forEach(l => l.hit = false);
    this.cam.x = startX; this.cam.y = 600; this.cam.rise = 0;
    this.cam.scale = this.baseScale();
    this.keys = this.keys || {};
    this.hideMemory();
  },

  /* ----------------------------------------------------------------- input */
  bindInput() {
    this.keys = {};
    this.touch = { active: false, ox: 0, oy: 0, ax: 0, az: 0, look: false };

    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space'].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') this.togglePause();
      if (e.key === 'm' || e.key === 'M') this.toggleMusic();
      if (e.key === 'f' || e.key === 'F') this.toggleFull();
      if (e.key === 'r' || e.key === 'R') this.restart();
      if (e.key === 'Enter' && this.state === 'menu') this.play();
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    /* CELULAR: encostar (e arrastar) em qualquer lugar da tela faz o Matheus
       caminhar até ali. Sem joystick, sem tutorial — é o controle mais simples
       possível para quem só quer ver o que acontece. */
    const c = this.canvas;
    const setTarget = e => {
      const rect = c.getBoundingClientRect();
      const sxp = e.clientX - rect.left, syp = e.clientY - rect.top;
      // desfaz a transformação da câmera: tela -> mundo
      this.touch.wx = (sxp - this.view.w / 2) / this.cam.scale + this.cam.x;
      const wy = (syp - this.view.h / 2) / this.cam.scale + this.cam.y;
      this.touch.wz = U.clamp((wy - World.BAND_Y0) / (World.BAND_Y1 - World.BAND_Y0), 0, 1);
      this.touch.active = true;
    };
    c.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') setTarget(e); });
    c.addEventListener('pointermove', e => {
      if (this.touch.active && e.pointerType !== 'mouse') setTarget(e);
    });
    const endTouch = () => { this.touch.active = false; };
    c.addEventListener('pointerup', endTouch);
    c.addEventListener('pointercancel', endTouch);
    c.addEventListener('pointerleave', endTouch);

    // botão "olhar" — no celular é o único botão do jogo
    this.isTouch = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
    if (this.isTouch) {
      const lb = document.getElementById('lookBtn');
      lb.classList.remove('hidden');
      const on = e => { e.preventDefault(); this.touch.look = true; };
      const off = () => { this.touch.look = false; };
      lb.addEventListener('pointerdown', on);
      lb.addEventListener('pointerup', off);
      lb.addEventListener('pointercancel', off);
      lb.addEventListener('pointerleave', off);
    }
  },

  /** escala base da câmera: cabe tanto no monitor quanto no celular em pé */
  baseScale() {
    return Math.min(this.view.w / 620, this.view.h / 780);
  },

  readInput() {
    const k = this.keys, m = this.matheus;
    let ax = 0, az = 0;
    if (k['arrowleft'] || k['a']) ax -= 1;
    if (k['arrowright'] || k['d']) ax += 1;
    if (k['arrowup'] || k['w']) az -= 1;
    if (k['arrowdown'] || k['s']) az += 1;

    // toque: caminha até o ponto tocado
    if (this.touch.active) {
      const dx = this.touch.wx - m.x;
      if (Math.abs(dx) > 12) ax += U.clamp(dx / 60, -1, 1);
      az += U.clamp((this.touch.wz - m.z) * 5, -1, 1);
    }

    // no celular ele olha sozinho quando para perto dela — sem precisar aprender nada
    const auto = Math.abs(this.clara.x - m.x) < 420 && Math.hypot(ax, az) < 0.15;
    const look = !!(k[' '] || k['shift'] || this.touch.look || auto);
    return { ax: U.clamp(ax, -1, 1), az: U.clamp(az, -1, 1), look };
  },

  /* -------------------------------------------------------------------- UI */
  bindUI() {
    document.getElementById('btnStart').onclick = () => this.play();
    document.getElementById('btnResume').onclick = () => this.togglePause();
    document.getElementById('btnRestart').onclick = () => this.restart();
    document.getElementById('btnRestart2').onclick = () => this.restart();
    document.getElementById('btnAgain').onclick = () => this.restart();
    document.getElementById('btnPause').onclick = () => this.togglePause();
    document.getElementById('btnMusic').onclick = () => this.toggleMusic();
    document.getElementById('btnFull').onclick = () => this.toggleFull();
  },

  play() {
    this.dom.start.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.state = 'playing';
    AudioEngine.start();
    // a dica aparece e some sozinha (no celular ela fala de toque, não de teclas)
    const hint = this.dom.hint;
    if (this.isTouch) {
      document.getElementById('hintTxt').textContent = 'encoste na tela para caminhar até lá';
      document.getElementById('hintTxt2').innerHTML = 'chegue <b>perto dela</b>';
    }
    hint.classList.remove('hidden', 'fade');
    setTimeout(() => hint.classList.add('fade'), 13000);
    setTimeout(() => hint.classList.add('hidden'), 16000);
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.dom.pause.classList.remove('hidden');
      AudioEngine.pause();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.dom.pause.classList.add('hidden');
      AudioEngine.resume();
    }
  },

  restart() {
    this.dom.pause.classList.add('hidden');
    this.dom.end.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.reset();
    this.state = 'playing';
    AudioEngine.start();
    AudioEngine.resume();
  },

  toggleMusic() {
    AudioEngine.setEnabled(!AudioEngine.enabled);
    this.dom.btnMusic.classList.toggle('off', !AudioEngine.enabled);
  },

  toggleFull() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen ||
        document.documentElement.webkitRequestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  },

  /* --------------------------------------------------------------- memória */
  showMemory(m) {
    this.dom.memSym.textContent = m.sym;
    this.dom.memTxt.textContent = m.txt;
    this.dom.memCard.classList.add('show');
    this.memTimer = 7;
    const y = World.bandY(m.z);
    Particles.emit('burst', m.x, y - 40, 26,
      { c: U.mix([170, 210, 255], [255, 220, 160], this.env.warmth) });
    AudioEngine.chime();
  },
  hideMemory() { this.dom.memCard.classList.remove('show'); },

  /** frase da reconquista (sem símbolo de lugar, só o sentimento) */
  showLine(l) {
    this.dom.memSym.textContent = l.sym;
    this.dom.memTxt.textContent = l.txt;
    this.dom.memCard.classList.add('show');
    this.memTimer = 5.5;
    this.lineCooldown = 12;
    if (this.subindo.includes(l)) {
      AudioEngine.chime();
      Particles.emit('burst', this.env.midX, World.BAND_Y0 - 30, 18, { c: [255, 220, 160] });
    }
  },

  /* ---------------------------------------------------------------- finais */
  endWith(id) {
    if (this.ending) return;
    this.ending = { id, t: 0, shown: false };
    this.state = 'ending';
    this.env.dayTarget = 0.775;               // o dia caminha para o pôr do sol
    AudioEngine.swell();
    if (id === 2) this.clara.leave(Math.sign(this.clara.x - this.matheus.x) || 1);
  },

  /** cenas finais: o jogador solta o controle e o mundo termina de contar */
  runEnding(dt) {
    const e = this.ending, m = this.matheus, c = this.clara, env = this.env;
    e.t += dt;

    if (e.id === 1) {
      /* --- ficam juntos, sentam e olham o sol descer --- */
      const mid = (m.x + c.x) / 2;
      const goalM = mid - 22, goalC = mid + 22;
      if (!m.sitting) {
        m.vx = U.clamp(goalM - m.x, -60, 60);
        c.vx = U.clamp(goalC - c.x, -60, 60);
        m.vz = (0.62 - m.z) * 0.5; c.vz = (0.62 - c.z) * 0.5;
        if (Math.abs(goalM - m.x) < 8 && Math.abs(goalC - c.x) < 8 && e.t > 2.5) {
          m.vx = c.vx = 0;
          m.sitting = c.sitting = true;
          m.dir = 1; c.dir = 1;               // os dois virados para o poente
          m.faceDir = 1; c.faceDir = 1;
        }
        m.gaze = U.lerp(m.gaze, 1, dt * 2);
        c.gaze = U.lerp(c.gaze, 1, dt * 2);
      } else {
        m.vx = c.vx = 0; m.vz = c.vz = 0;
        m.gaze = c.gaze = 0.5;                // o sorriso fica; o olhar vai para o horizonte
        m.faceDir = c.faceDir = 1;
        this.cam.rise = U.lerp(this.cam.rise, 30, dt * 0.5);
      }
      env.connection = Math.min(1, env.connection + dt * 0.12);

    } else if (e.id === 2) {
      /* --- ela segue outro caminho; ele não corre atrás --- */
      m.vx = U.lerp(m.vx, 0, dt * 3); m.vz = 0;
      m.gaze = U.lerp(m.gaze, e.t < 9 ? 1 : 0.35, dt * 1.2);
      m.lookAt(c);
      c.update(dt, env, m);                   // ela continua andando, devagar
      this.cam.rise = U.lerp(this.cam.rise, 210, dt * 0.28);
      env.connection = U.lerp(env.connection, 0.34, dt * 0.25);

    } else {
      /* --- cada um por uma estrada --- */
      m.vx = U.lerp(m.vx, -74, dt * 1.4);
      c.vx = U.lerp(c.vx, 74, dt * 1.4);
      m.gaze = U.lerp(m.gaze, 0, dt); c.gaze = U.lerp(c.gaze, 0, dt);
      this.cam.rise = U.lerp(this.cam.rise, 240, dt * 0.3);
      env.connection = U.lerp(env.connection, 0.28, dt * 0.2);
    }

    if (e.id !== 2) c.step(dt, env);
    m.step(dt, env);

    // a frase entra depois que a cena respirou
    if (!e.shown && e.t > (e.id === 1 ? 8.5 : 9.5)) {
      e.shown = true;
      this.showEndScreen(e.id);
    }
  },

  showEndScreen(id) {
    const D = {
      1: {
        tag: 'final · o pôr do sol',
        quote: 'Algumas conexões transformam uma vida inteira.',
        body: 'Não houve beijo. Não houve promessa.<br />Só dois silêncios sentados no mesmo lugar, vendo o sol descer.'
      },
      2: {
        tag: 'final · o outro caminho',
        quote: 'Amar também é desejar felicidade, mesmo quando ela segue outro caminho.',
        body: 'Ela continuou andando devagar.<br />Você não correu atrás — e isso também foi um jeito de amar.'
      },
      3: {
        tag: 'final · duas estradas',
        quote: 'Nem toda história termina junta. Algumas apenas continuam dentro de nós.',
        body: 'O campo seguiu bonito dos dois lados.<br />As flores que nasceram ali não desapareceram porque vocês se afastaram.'
      }
    }[id];
    this.dom.endTag.innerHTML = D.tag;
    this.dom.endQuote.innerHTML = D.quote;
    this.dom.endBody.innerHTML = D.body;
    this.dom.end.classList.remove('hidden');
    this.dom.hud.classList.add('hidden');
  },

  /* ------------------------------------------------------------- atualizar */
  update(dt) {
    const env = this.env, m = this.matheus, c = this.clara;
    env.t += dt;

    /* ---- relógio do mundo ----
       O horário NÃO é aleatório: ele obedece à distância entre os dois.
       Longe, o dia vai embora (crepúsculo azul, chuva). Perto, amanhece.
       É a forma mais direta de dizer o que este jogo quer dizer. */
    if (env.dayTarget !== null) {
      env.dayT += U.clamp(env.dayTarget - env.dayT, -1, 1) * dt * 0.18;
    } else {
      const alvo = U.lerp(0.685, 0.34, U.smooth(env.warmth));
      env.dayT += (alvo - env.dayT) * dt * 0.35;
    }

    /* ---- personagens ---- */
    if (this.state === 'ending') {
      this.runEnding(dt);
    } else {
      m.input = this.readInput();
      m.update(dt, env, c);
      c.update(dt, env, m);
    }

    /* ================= A CONEXÃO (invisível) ================= */
    const dx = Math.abs(c.x - m.x);
    const d = dx + Math.abs(c.z - m.z) * 240;

    const near = U.map(d, 520, 120, 0, 1);
    const sameWay = m.moveAmt > 0.4 && c.moveAmt > 0.4 &&
      Math.sign(m.vx) === Math.sign(c.vx) && Math.abs(m.vx) > 10 && d < 340;
    const mutualNow = m.gaze > 0.55 && c.gaze > 0.55 && d < 900;

    if (d < 210 && m.moveAmt < 0.25 && c.moveAmt < 0.25) this.stillTime += dt;
    else this.stillTime = Math.max(0, this.stillTime - dt * 2);

    // perto some rápido, longe cai rápido: a relação tem que ficar ÓBVIA
    const gain = near * 0.045 +
      (sameWay ? 0.030 : 0) +
      (mutualNow ? 0.060 : 0) +
      (this.stillTime > 2 ? 0.030 : 0);

    const apart = m.moveAmt > 0.35 && c.moveAmt > 0.35 &&
      Math.sign(m.vx) !== Math.sign(c.vx) && d > 330;
    const loss = (d > 560 ? U.map(d, 560, 2200, 0.020, 0.090) : 0) + (apart ? 0.045 : 0);

    if (this.state === 'playing') {
      env.connection = U.clamp(env.connection + (gain - loss) * dt, 0, 1);
    }
    // o mundo acompanha logo atrás — dá para ver a mudança acontecendo
    env.warmth = U.lerp(env.warmth, env.connection, dt * 1.1);
    env.mutual = U.lerp(env.mutual, mutualNow ? 1 : 0, dt * 2.2);
    env.midX = (m.x + c.x) / 2;
    env.bloomX = d < 900 ? env.midX : m.x;

    // o mundo inteiro responde no instante em que os dois se olham
    if (mutualNow && !this.wasMutual) {
      AudioEngine.chime();
      Particles.emit('starlet', env.midX, World.BAND_Y0 - 60, 16);
      for (let i = 0; i < 10; i++) {
        Particles.emit('petal', env.midX + U.rand(-300, 300), World.HORIZON + U.rand(20, 120), 1);
      }
    }
    this.wasMutual = mutualNow;

    /* ---- clima ---- */
    env.wind = U.clamp(0.16 + (1 - env.warmth) * 0.72 + Math.sin(env.t * 0.23) * 0.12, 0, 1.2);

    this.rainTimer -= dt;
    if (this.rainTimer <= 0) {
      // chove mais quando o mundo está frio; nunca chove no auge da conexão
      const chance = 0.55 * (1 - env.warmth);
      env.rainTarget = Math.random() < chance ? U.rand(0.45, 0.9) : 0;
      this.rainTimer = U.rand(26, 55);
    }
    let rt = env.rainTarget || 0;
    if (env.warmth > 0.62) rt = 0;                     // o sol volta quando eles voltam
    env.rain = U.lerp(env.rain, rt, dt * 0.25);

    /* ---- câmera cinematográfica ---- */
    // a câmera "puxa" na direção dela, mas nunca o suficiente para tirar
    // o Matheus da tela (isso quebrava tudo no celular)
    const maxBias = (this.view.w * 0.16) / this.cam.scale;
    const followX = m.x + U.clamp((c.x - m.x) * 0.38, -maxBias, maxBias);
    // em tela de celular o afastamento é menor, senão eles viram formiguinhas
    const minZoom = this.view.w < 720 ? 0.90 : 0.78;
    const zoom = U.map(d, 260, 1500, 1.08, minZoom);
    const base = this.baseScale();
    this.cam.scale = U.lerp(this.cam.scale, base * zoom, dt * 1.1);
    const halfW = this.view.w / 2 / this.cam.scale;
    this.cam.x = U.lerp(this.cam.x, U.clamp(followX, halfW - 100, World.WIDTH - halfW + 100), dt * 2.2);
    // enquadramento: o chão fica no terço de baixo e a sobra de tela vira céu
    // (no celular em pé isso é o que evita um vazio de grama embaixo)
    const camYBase = U.clamp(World.BAND_Y1 - 0.30 * this.view.h / this.cam.scale, 380, 620);
    this.cam.y = U.lerp(this.cam.y, camYBase - this.cam.rise, dt * 1.2);

    /* ---- ambiente, mundo, partículas ---- */
    World.updateEnv(env, this.view);
    env.rect = World.viewRect(this.cam, this.view);
    env.chars = [m, c];          // usado para não deixar árvore esconder ninguém
    World.update(dt, env);
    Particles.update(dt, env);
    AudioEngine.setEnv(env.warmth, env.wind, env.rain, env.night);

    /* ---- frases da reconquista ----
       sobem quando ele chega perto, voltam quando ele se afasta */
    this.lineCooldown -= dt;
    if (this.state === 'playing' && this.lineCooldown <= 0 && this.memTimer <= 0) {
      const conn = env.connection;
      for (const l of this.subindo) {
        if (!l.hit && conn >= l.c) {
          l.hit = true; this.topo = Math.max(this.topo, l.c);
          this.showLine(l); break;
        }
      }
      if (this.memTimer <= 0) {
        for (const l of this.descendo) {
          if (this.topo > l.c + 0.14 && conn <= l.c && !l.hit) {
            l.hit = true;
            // ao cair, as frases de subida acima daqui voltam a valer
            this.subindo.forEach(s => { if (s.c > l.c) s.hit = false; });
            this.topo = l.c;
            this.showLine(l); break;
          }
        }
      }
      // uma frase de queda pode acontecer de novo depois que ele reconquistar
      for (const l of this.descendo) if (l.hit && conn > l.c + 0.22) l.hit = false;
    }

    /* ---- memórias ---- */
    if (this.memTimer > 0) {
      this.memTimer -= dt;
      if (this.memTimer <= 0) this.hideMemory();
    }
    if (this.state === 'playing') {
      for (const mem of World.memories) {
        if (mem.found) continue;
        if (Math.abs(mem.x - m.x) < 95 && Math.abs(mem.z - m.z) < 0.4) {
          mem.found = true;
          this.showMemory(mem);
          break;
        }
      }
    }

    /* ================= OS FINAIS ================= */
    if (this.state === 'playing' && env.t > 20) {
      // 1 · permanecer perto por bastante tempo (o final que ele quer alcançar)
      if (env.connection > 0.72 && d < 300) this.closeTime += dt;
      else this.closeTime = Math.max(0, this.closeTime - dt * 0.5);
      if (this.closeTime > 42) this.endWith(1);

      // 3 · caminhar em direções diferentes por muito tempo (precisa ser de propósito)
      if (apart && d > 700) this.divergeTime += dt * 1.2;
      else if (d > 1800) this.divergeTime += dt * 0.5;
      else this.divergeTime = Math.max(0, this.divergeTime - dt * 1.2);
      if (this.divergeTime > 34) this.endWith(3);

      // 2 · a paciência dela acaba: ela decide seguir o próprio caminho
      if (env.t > 150) {
        if (env.connection < 0.45 && d > 520) this.patience -= dt;
        else this.patience += dt * 0.6;
        this.patience = Math.min(this.patience, 120);
        if (this.patience <= 0) this.endWith(2);
      }
    }
  },

  /* --------------------------------------------------------------- desenho */
  render() {
    const ctx = this.ctx, env = this.env, view = this.view, cam = this.cam;

    // céu e fundos (espaço de tela, com parallax próprio)
    World.drawSky(ctx, env, cam, view);
    World.drawFar(ctx, env, cam, view);

    // mundo (dentro da câmera)
    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    World.drawGround(ctx, env, cam, view);
    World.drawGroundDetail(ctx, env, cam, view);

    // tudo que tem "profundidade" é ordenado pelo z para o desenho ficar certo
    const drawables = [];
    const r = env.rect, x0 = r.x0 - 260, x1 = r.x1 + 260;

    for (const t of World.trees) {
      if (t.x > x0 && t.x < x1) drawables.push({ z: t.z, f: () => World.drawTree(ctx, t, env) });
    }
    for (const b of World.bushes) {
      if (b.x > x0 && b.x < x1) drawables.push({ z: b.z, f: () => World.drawBush(ctx, b, env) });
    }
    for (const mm of World.memories) {
      if (mm.x > x0 && mm.x < x1) drawables.push({ z: mm.z - 0.01, f: () => World.drawMemory(ctx, mm, env) });
    }
    drawables.push({ z: this.clara.z, f: () => this.clara.draw(ctx, env) });
    drawables.push({ z: this.matheus.z, f: () => this.matheus.draw(ctx, env) });

    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) d.f();

    Particles.draw(ctx, env);
    ctx.restore();

    // atmosfera por cima de tudo
    World.drawRays(ctx, env, view);
    World.drawFog(ctx, env, view);
    World.drawGrade(ctx, env, view);
    this.drawClaraArrow(ctx, env, view);
  },

  /**
   * Quando ela está fora da tela, uma luzinha na borda mostra para que lado
   * ela ficou. Sem isso, no celular, dá para se perder — e o jogo inteiro é
   * sobre saber para onde caminhar.
   */
  drawClaraArrow(ctx, env, view) {
    if (this.state !== 'playing') return;
    const c = this.clara;
    const sx = (c.x - this.cam.x) * this.cam.scale + view.w / 2;
    const margin = 46;
    if (sx > margin && sx < view.w - margin) return;

    const right = sx >= view.w - margin;
    const x = right ? view.w - 26 : 26;
    const y = view.h * 0.56;
    const pulse = 0.45 + 0.25 * Math.sin(env.t * 2.4);
    const col = U.mix([170, 200, 245], [255, 214, 150], env.warmth);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 54);
    g.addColorStop(0, U.rgb(col, 0.30 * pulse));
    g.addColorStop(1, U.rgb(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 54, y - 54, 108, 108);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = pulse + 0.2;
    ctx.strokeStyle = U.rgb(col);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const d = right ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x - 5 * d, y - 11);
    ctx.lineTo(x + 5 * d, y);
    ctx.lineTo(x - 5 * d, y + 11);
    ctx.stroke();
    ctx.restore();
  },

  /* ------------------------------------------------------------------ loop */
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(0.048, (now - (this._last || now)) / 1000);
    this._last = now;
    if (this.state === 'playing' || this.state === 'ending') this.update(dt);
    else {
      // no menu e na pausa o mundo continua respirando, só que sem interferência
      World.updateEnv(this.env, this.view);
      this.env.rect = World.viewRect(this.cam, this.view);
    }
    this.render();
  }
};

Game.boot();
