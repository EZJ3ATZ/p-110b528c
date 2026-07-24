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

  // rivais, flores e casamento
  rivals: [], rivalTimer: 26, rivalCount: 0, avisouRival: false,
  flor: { cd: 0, dadas: 0 },
  wedding: false, flash: 0, shake: 0,

  /* ------------------------------------------------------------------------
     O ROTEIRO — quatro escolhas, uns 80 segundos no total.
     As três primeiras são do Matheus (quem está jogando faz por ele).
     A última é da Clara: o fim da história é decisão dela.
     ------------------------------------------------------------------------ */
  etapa: 0, etapaT: 0, escolhaAberta: false, autoWalk: null,

  frasesFlor: [
    { sym: '💐', txt: 'Ela aceitou a flor. E ficou mais perto.' },
    { sym: '🌷', txt: 'Uma flor não resolve nada. Mas ela sorriu.' },
    { sym: '🌹', txt: 'Você lembrou do que ela gosta.' },
    { sym: '💛', txt: 'Não é sobre a flor. É sobre você ter parado para colher.' }
  ],

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
      btnMusic: document.getElementById('btnMusic'),
      florBtn: document.getElementById('florBtn'),
      choice: document.getElementById('choiceCard'),
      choiceQuem: document.getElementById('choiceQuem'),
      choiceCena: document.getElementById('choiceCena'),
      choicePergunta: document.getElementById('choicePergunta'),
      choiceA: document.getElementById('choiceA'),
      choiceB: document.getElementById('choiceB')
    };
    this.dom.choiceA.onclick = () => this.responder('a');
    this.dom.choiceB.onclick = () => this.responder('b');

    this.bindInput();
    this.bindUI();
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
    this.clara = new Clara(startX + 540);   // começam longe: é assim que ficou
    this.beats = this.montarBeats();
    this.beatIdx = 0; this.beatT = 0; this.repetirBeat = false;
    this.escolhaAberta = false;
    this.autoWalk = null; this.claraScript = null;
    this.claraBaseX = this.clara.x;
    this.dom.choice.classList.add('hidden');

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
    this.rivals = []; this.rivalTimer = 26; this.rivalCount = 0; this.avisouRival = false;
    this.flor = { cd: 0, dadas: 0 };
    this.wedding = false; this.futuro = false; this.flash = 0; this.shake = 0;
    this.dom.florBtn.classList.add('hidden');
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
      if (e.key === 'e' || e.key === 'E') this.darFlor();
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
      this.autoWalk = null;                 // o toque assume o controle
      const dx = this.touch.wx - m.x;
      if (Math.abs(dx) > 12) ax += U.clamp(dx / 60, -1, 1);
      az += U.clamp((this.touch.wz - m.z) * 5, -1, 1);
    }

    // caminhada automática depois de uma escolha ("Ir até ela")
    if (this.autoWalk) {
      const dx = this.autoWalk.alvo - m.x;
      if (Math.abs(dx) < 26) this.autoWalk = null;
      else { ax += U.clamp(dx / 70, -1, 1); az += U.clamp((this.clara.z - m.z) * 4, -1, 1); }
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
    this.dom.florBtn.onclick = () => this.darFlor();
  },

  /* --------------------------------------------------------- dar uma flor */
  /** Ele colhe do chão enquanto caminha; entregar é uma escolha dele. */
  colherFlor() {
    const m = this.matheus;
    if (m.holding || this.flor.cd > 0 || this.state !== 'playing') return;
    for (let i = 0; i < World.flowers.length; i++) {
      const f = World.flowers[i];
      if (f.age > 0.6 && Math.abs(f.x - m.x) < 46 && Math.abs(f.z - m.z) < 0.22) {
        m.holding = { c: f.c };
        World.flowers.splice(i, 1);
        Particles.emit('spark', f.x, World.bandY(f.z) - 16, 4, { c: f.c });
        return;
      }
    }
  },

  darFlor() {
    const m = this.matheus, c = this.clara;
    if (this.state !== 'playing' || !m.holding) return;
    if (Math.abs(c.x - m.x) > 190) return;          // ela precisa estar por perto

    const cor = m.holding.c;
    m.holding = null;
    this.flor.cd = 6;
    this.flor.dadas++;

    this.env.connection = U.clamp(this.env.connection + 0.14, 0, 1);
    c.gazeWant = true; c.gazeTimer = 5; c.smile = 1;
    c.decision = 0.1; c.mode = 'walk_with';         // ela chega mais perto depois

    const mid = (m.x + c.x) / 2, y = World.bandY(c.z);
    Particles.emit('burst', mid, y - 50, 24, { c: cor });
    for (let i = 0; i < 12; i++) Particles.emit('petal', mid + U.rand(-60, 60), y - 90, 1);
    AudioEngine.chime();

    const f = this.frasesFlor[Math.min(this.flor.dadas - 1, this.frasesFlor.length - 1)];
    this.lineCooldown = 0; this.memTimer = 0;
    this.showLine(f);
  },

  play() {
    this.dom.start.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.state = 'playing';
    AudioEngine.start();
    // a dica aparece e some sozinha (no celular ela fala de toque, não de teclas)
    const hint = this.dom.hint;
    document.getElementById('hintTxt').textContent = this.isTouch
      ? 'encoste na tela para caminhar' : '← → ou W A S D para caminhar';
    document.getElementById('hintTxt2').innerHTML = 'as escolhas aparecem sozinhas';
    hint.classList.remove('hidden', 'fade');
    setTimeout(() => hint.classList.add('fade'), 7000);
    setTimeout(() => hint.classList.add('hidden'), 9500);
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
    if (this.escolhaAberta) return;         // nunca competir com o cartão de escolha
    this.dom.memSym.textContent = l.sym;
    this.dom.memTxt.textContent = l.txt;
    this.dom.memCard.classList.add('show');
    this.memTimer = 3.6;
    this.lineCooldown = 10;
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
    this.escolhaAberta = false;
    this.autoWalk = null;
    this.dom.choice.classList.add('hidden');
    this.dom.florBtn.classList.add('hidden');
    this.env.dayTarget = id === 2 ? 0.685 : 0.775;
    AudioEngine.swell();
    if (id === 2) {
      // garante que exista "o outro" ao lado dela na cena final
      if (!this.rivals.length) {
        this.rivals.push(new Rival(this.clara.x + 70, this.clara.z, this.rivalCount++));
      }
      this.rivals.length = 1;
      const o = this.rivals[0];
      o.mode = 'insistindo'; o.alpha = 1; o.timer = 999;
    }
  },

  /** cenas finais: o jogador solta o controle e o mundo termina de contar */
  runEnding(dt) {
    const e = this.ending, m = this.matheus, c = this.clara, env = this.env;
    e.t += dt;

    if (e.id === 1) {
      /* ------------------------------------------------------------------
         FINAL FELIZ — os dois se olham, a luz cresce, tudo fica branco
         e quando a luz baixa eles já estão no altar.
         ------------------------------------------------------------------ */
      env.connection = 1;

      if (!this.wedding) {
        // 1ª parte: se aproximam e se olham enquanto a luz sobe
        const mid = (m.x + c.x) / 2;
        m.vx = U.clamp((mid - 26 - m.x) * 2, -70, 70);
        c.vx = U.clamp((mid + 26 - c.x) * 2, -70, 70);
        m.vz = (0.62 - m.z) * 0.6; c.vz = (0.62 - c.z) * 0.6;
        m.gaze = U.lerp(m.gaze, 1, dt * 2.4); c.gaze = U.lerp(c.gaze, 1, dt * 2.4);
        m.lookAt(c); c.lookAt(m);
        this.flash = U.clamp(e.t / 3.4, 0, 1);

        if (e.t > 3.4) {                       // ---- teletransporte ----
          this.wedding = true;
          this.rivals.length = 0;
          m.wedding = c.wedding = true;
          m.holding = null; m.slump = 0;
          m.x = World.ALTAR_X - 34; c.x = World.ALTAR_X + 34;
          m.z = c.z = 0.55;
          m.vx = c.vx = 0; m.vz = c.vz = 0;
          m.dir = 1; c.dir = -1;               // de frente um para o outro
          this.cam.x = World.ALTAR_X;
          env.dayTarget = 0.45;                // dia claro e dourado
          env.rainTarget = 0; env.rain = 0;
          env.warmth = 1;
          AudioEngine.swell();
        }
      } else {
        // 2ª parte: no altar
        this.flash = Math.max(0, this.flash - dt * 0.75);
        m.vx = c.vx = 0; m.vz = c.vz = 0;
        m.gaze = c.gaze = 1;
        m.lookAt(c); c.lookAt(m);
        m.smile = c.smile = 1;
        // sobe a cena para os noivos não ficarem atrás do texto final
        this.cam.rise = U.lerp(this.cam.rise, -120, dt * 0.45);
        // pétalas caindo sobre os dois
        if (Math.random() < dt * 26) {
          Particles.emit('petal', World.ALTAR_X + U.rand(-220, 220), World.BAND_Y0 - 220, 1);
        }
        if (Math.random() < dt * 3) AudioEngine.chime();
      }

    } else if (e.id === 2) {
      /* ------------------------------------------------------------------
         Ela escolheu seguir o outro caminho.
         Ele não corre atrás. E o jogo mostra a vida que veio depois.
         ------------------------------------------------------------------ */
      const outro = this.rivals[0];

      if (!this.futuro) {
        // 1ª parte: os dois vão embora juntos, ele fica parado olhando
        m.vx = U.lerp(m.vx, 0, dt * 3); m.vz = 0;
        m.gaze = U.lerp(m.gaze, 1, dt * 1.4); m.lookAt(c);
        m.slump = U.lerp(m.slump, 1, dt * 0.5);
        c.vx = U.lerp(c.vx, 58, dt * 1.2); c.vz = 0;
        c.gaze = U.lerp(c.gaze, 0, dt * 2);
        if (outro) { outro.vx = c.vx; outro.gaze = 0; outro.alpha = 1; outro.step(dt, env); }
        env.connection = U.lerp(env.connection, 0.04, dt * 0.5);
        if (e.t > 5) this.flash = U.clamp((e.t - 5) / 2.6, 0, 1);

        if (e.t > 7.6) {                       // ---- anos depois ----
          this.futuro = true;
          c.x = World.FUTURE_X; c.z = 0.55; c.vx = 0; c.gaze = 0; c.smile = 0;
          c.dir = -1; c.faceDir = undefined; c.mode = 'sit'; c.sitting = false;
          if (outro) {
            outro.x = World.FUTURE_X + 74; outro.z = 0.55; outro.vx = 0;
            outro.alpha = 1; outro.dir = -1;
            outro.label = 0;                   // aqui ele já é só o marido dela
            outro.mode = 'parado';
          }
          m.x = World.FUTURE_X - 1100;         // ele não faz parte desta cena
          m.alpha = 0;
          this.cam.x = World.FUTURE_X + 24;
          // fim de tarde nublado: dá para ver tudo, mas sem cor nenhuma
          env.dayTarget = 0.50;
          env.rainTarget = 0.12;
          AudioEngine.swell();
        }
      } else {
        // 2ª parte: a casa, os anos, as crianças — e o campo sem cor
        this.flash = Math.max(0, this.flash - dt * 0.7);
        // um fiapo de calor: a cena é triste, não é escura
        env.connection = 0; env.warmth = U.lerp(env.warmth, 0.14, dt * 2);
        c.vx = 0; c.vz = 0; c.gaze = 0; c.smile = U.lerp(c.smile, 0, dt);
        c.step(dt, env);
        if (outro) { outro.vx = 0; outro.step(dt, env); }
        // a cena sobe um pouco para o casal não ficar atrás do texto final
        this.cam.rise = U.lerp(this.cam.rise, -135, dt * 0.5);
      }

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
    if (!e.shown && e.t > (e.id === 1 ? 11 : (e.id === 2 ? 13 : 9.5))) {
      e.shown = true;
      this.showEndScreen(e.id);
    }
  },

  showEndScreen(id) {
    const D = {
      1: {
        tag: 'final · o altar',
        quote: 'Algumas conexões transformam uma vida inteira.',
        body: 'Você atravessou a chuva, o cinza e todo mundo que apareceu no meio do caminho.<br />No fim, era só isso: ficar perto.'
      },
      2: {
        tag: 'final · o outro caminho',
        quote: 'A vida seguiu. Mas o campo nunca mais voltou a ficar colorido.',
        body: 'Vieram a casa, os anos, as crianças correndo no quintal.<br />' +
          'E em algumas tardes, sem motivo nenhum, ela para — e lembra de um lugar onde tudo florescia.'
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
    // no final triste o botão vira um convite: ainda dá tempo de responder
    const zap = document.getElementById('btnZap');
    if (zap) zap.innerHTML = id === 1 ? '💬 responder pro Matheus' : '💬 ainda dá tempo';
    this.dom.end.classList.remove('hidden');
    this.dom.hud.classList.add('hidden');
  },

  /* =======================================================================
     ROTEIRO E ESCOLHAS
     ======================================================================= */
  abrirEscolha(e) {
    this.escolhaAberta = e;
    this.dom.choiceQuem.textContent = e.quem || '';
    this.dom.choiceQuem.classList.toggle('hidden', !e.quem);
    this.dom.choiceCena.innerHTML = e.cena;
    this.dom.choiceCena.classList.toggle('fala', !!e.quem);
    this.dom.choicePergunta.textContent = e.pergunta || 'o que você faz?';
    this.dom.choiceA.innerHTML = e.a.txt;
    this.dom.choiceB.innerHTML = e.b.txt;
    this.dom.choice.classList.remove('hidden');
    this.dom.choice.style.animation = 'none';
    void this.dom.choice.offsetWidth;
    this.dom.choice.style.animation = '';
    this.hideMemory();
    if (e.quem) { this.clara.gazeWant = true; this.clara.gazeTimer = 6; }
  },

  responder(qual) {
    const e = this.escolhaAberta;
    if (!e) return;
    this.escolhaAberta = false;
    this.dom.choice.classList.add('hidden');

    const opt = (qual === 'a' ? e.a : e.b);
    this.repetirBeat = false;
    if (e.fn) { e.fn.call(this); return; }          // formato antigo
    this.aplicarEfeito(opt.ef || {});

    e.recusas = (e.recusas || 0) + (this.repetirBeat ? 1 : 0);
    if (this.repetirBeat && e.recusas < 2) {
      // ele insistiu em ficar parado: a chance volta daqui a pouco
      e.reabrirEm = 4.5;
      this.beatT = 0;
    } else {
      if (this.repetirBeat) this.showLine({ sym: '🍂', txt: 'Você não foi. E quem não vai, um dia perde o lugar.' });
      this.proximoBeat();
    }
  },

  /** caminhada automática — quem está jogando não precisa aprender controle */
  irAte(x) { this.autoWalk = { alvo: x }; },

  irAteEla() {
    this.claraScript = null;            // ela volta a andar por conta própria
    this.irAte(this.clara.x - 80);
    this.etapa = 2;
  },

  /* =======================================================================
     O ROTEIRO EM CENAS
     Uma lista de "beats": esperar, caminhar, ela falar, você responder.
     Curto de propósito — cada escolha é um toque só.
     ======================================================================= */
  montarBeats() {
    const F = (t) => ({ frase: t });
    return [
      { esperar: 2.2 },
      {
        cena: 'Ela está ali, do outro lado do campo.<br />Faz meses que vocês não se falam.',
        a: { txt: 'Ir até ela', ef: { ir: 'clara', conexao: 0.06 } },
        b: { txt: 'Ficar onde está', ef: { conexao: -0.06, repetir: true, ...F('Você ficou parado. O campo esfriou.') } }
      },
      { irAteEla: true, max: 7 },

      {
        quem: 'Clara', cena: '“Você sumiu.”',
        a: { txt: 'Eu sei. E não tem desculpa.', ef: { conexao: 0.16 } },
        b: { txt: 'Você também sumiu.', ef: { conexao: -0.07 } }
      },
      { esperar: 1.2 },
      {
        cena: 'O campo começou a florir de novo em volta de vocês.',
        a: { txt: '🌼  Colher uma flor e dar pra ela', ef: { gesto: 'flor', conexao: 0.16 } },
        b: { txt: 'Deixar quieto', ef: { conexao: 0.02 } }
      },
      { esperar: 1.4 },
      {
        quem: 'Clara', cena: '“Ainda dividia um cheeseburger com alguém?”',
        a: { txt: '🍔  Só com você. Quer um agora?', ef: { gesto: 'burger', conexao: 0.18 } },
        b: { txt: 'Não lembro mais disso.', ef: { conexao: -0.10 } }
      },
      { esperar: 2.4, rival: true },
      {
        cena: 'Apareceu um cara com a sua cara, dizendo ser você.<br />Ela parou, sem saber qual é o verdadeiro.',
        a: { txt: '👊  Dar um soco nele', ef: { soco: true, conexao: 0.16 } },
        b: { txt: 'Deixar acontecer', ef: { conexao: -0.20, ...F('Você deixou. Ela também percebe quando você não vem.') } }
      },
      { esperar: 2.6 },
      {
        quem: 'Clara', cena: '“Por que você voltou?”',
        a: { txt: 'Porque eu nunca fui embora de verdade.', ef: { conexao: 0.20 } },
        b: { txt: 'Sei lá. Deu vontade.', ef: { conexao: -0.04 } }
      },
      { esperar: 1.2 },
      {
        cena: 'Ela está bem do seu lado agora.',
        a: { txt: '😌  Um beijo na testa dela', ef: { gesto: 'beijo', conexao: 0.20 } },
        b: { txt: 'Só ficar em silêncio do lado dela', ef: { conexao: 0.06 } }
      },
      { esperar: 1.6 },
      {
        quem: 'Clara', cena: '“Eu pensei em você esse tempo todo.<br />Só que agora sou eu que preciso escolher.”',
        pergunta: 'clara escolhe',
        a: { txt: '💛  Perdoar e ficar com ele', ef: { fim: 1 } },
        b: { txt: '🚶‍♀️  Seguir o outro caminho', ef: { fim: 2 } }
      }
    ];
  },

  aplicarEfeito(ef) {
    const env = this.env, m = this.matheus, c = this.clara;
    if (ef.conexao) env.connection = U.clamp(env.connection + ef.conexao, 0, 1);
    if (ef.frase) this.showLine({ sym: ef.conexao < 0 ? '🍂' : '💛', txt: ef.frase });
    if (ef.ir === 'clara') this.irAteEla();
    if (ef.soco) this.socar();
    if (ef.gesto) this.gesto(ef.gesto);
    if (ef.repetir) this.repetirBeat = true;
    if (ef.fim) this.endWith(ef.fim);
  },

  /**
   * O soco no Matheus falso.
   * Ele atravessa a tela num piscar, acerta, o outro voa e some.
   * Não é briga: é o verdadeiro se impondo — e ela vendo quem ficou.
   */
  socar() {
    const m = this.matheus, c = this.clara, r = this.rivals[0];
    if (!r) return;
    const dir = Math.sign(r.x - m.x) || 1;

    this.claraScript = null;
    this.autoWalk = null;
    m.x = r.x - dir * 46;                  // ele já chega junto: o soco é imediato
    m.z = r.z;
    m.dir = dir; m.faceDir = dir;
    m.gaze = 0; m.slump = 0;
    m.vx = dir * 60;

    r.levarSoco(dir);
    this.shake = 0.55;                     // a câmera treme

    const px = (m.x + r.x) / 2, py = World.bandY(r.z) - 74;
    Particles.emit('emoji', px, py, 1, { txt: '👊', s: 34 });
    Particles.emit('burst', px, py, 26, { c: [255, 232, 200] });
    for (let i = 0; i < 8; i++) Particles.emit('spark', px, py, 1, { c: [255, 244, 220] });
    AudioEngine.impacto();

    // ela vira para o verdadeiro
    c.gazeWant = true; c.gazeTimer = 7; c.smile = 1;
    c.mode = 'walk_with'; c.decision = 0.1;
    setTimeout(() => this.showLine({ sym: '👊', txt: 'Só existe um. E foi o que ficou.' }), 900);
  },

  /** um gesto: ele chega junto, o símbolo sobe e ela responde no rosto */
  gesto(tipo) {
    const m = this.matheus, c = this.clara;
    const mid = (m.x + c.x) / 2, y = World.bandY(c.z) - 60;
    const cfg = {
      flor:   { txt: '🌼', cor: [255, 226, 170] },
      burger: { txt: '🍔', cor: [255, 208, 140] },
      beijo:  { txt: '💛', cor: [255, 190, 200] }
    }[tipo];

    this.irAte(c.x - Math.sign(c.x - m.x) * 62);
    m.holding = null;
    c.gazeWant = true; c.gazeTimer = 6; c.smile = 1; c.decision = 0.1; c.mode = 'walk_with';
    m.gaze = 1; m.lookAt(c);

    for (let i = 0; i < 5; i++) Particles.emit('emoji', mid, y, 1, { txt: cfg.txt, s: 26 });
    Particles.emit('burst', mid, y, 20, { c: cfg.cor });
    for (let i = 0; i < 10; i++) Particles.emit('petal', mid + U.rand(-70, 70), y - 40, 1);
    AudioEngine.chime();
  },

  roteiro(dt) {
    if (this.state !== 'playing' || this.escolhaAberta || this.ending) return;
    const m = this.matheus, c = this.clara, env = this.env;
    const b = this.beats[this.beatIdx];
    if (!b) return;
    this.beatT += dt;

    // 1) espera curta
    if (b.esperar !== undefined) {
      if (this.beatT === dt && b.rival) {
        // o falso entra pelo lado OPOSTO ao Matheus e para ao lado dela:
        // fica sempre "matheus — clara — falso", claro de ler na tela
        const lado = (Math.sign(c.x - m.x) || 1);
        const r = new Rival(c.x + lado * 520, c.z, this.rivalCount++);
        r.alvoX = c.x + lado * 92;
        this.rivals.push(r);
      }
      // se o falso está entrando em cena, espera ele chegar ao lado dela
      if (b.rival) {
        const r = this.rivals[0];
        const chegou = r && (r.mode === 'esperando' || r.mode === 'insistindo');
        if (chegou || this.beatT > 8) this.proximoBeat();
        return;
      }
      if (this.beatT > b.esperar) this.proximoBeat();
      return;
    }

    // 2) caminhada automática até ela
    if (b.irAteEla) {
      if (this.beatT === dt) this.irAteEla();
      const perto = Math.abs(c.x - m.x) < 150;
      if ((perto && this.beatT > 1.2) || this.beatT > (b.max || 7)) {
        this.autoWalk = null;
        this.proximoBeat();
      }
      return;
    }

    // 3) escolha (fala dela ou cena)
    if (b.reabrirEm && this.beatT < b.reabrirEm) {
      this.claraScript = { alvoX: this.claraBaseX };   // ela continua esperando
      return;
    }
    this.abrirEscolha(b);
  },

  proximoBeat() { this.beatIdx++; this.beatT = 0; },


  /* ---------------------------------------------------------------- rivais */
  atualizarRivais(dt, env, m, c) {
    if (this.ending) return;               // nos finais quem manda é a cena
    for (let i = this.rivals.length - 1; i >= 0; i--) {
      const r = this.rivals[i];
      r.update(dt, env, c, m);
      if (r.morto) {
        // se ele saiu porque o Matheus chegou, isso conta a favor dos dois
        if (r.saiuPor === 'matheus') {
          env.connection = U.clamp(env.connection + 0.06, 0, 1);
          if (this.lineCooldown <= 0 && this.memTimer <= 0) {
            this.showLine({ sym: '🌤', txt: 'Ele foi embora. Você ficou.' });
          }
        }
        this.rivals.splice(i, 1);
      }
    }
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
    const rivalAtivo = this.rivals.find(r => r.mode === 'insistindo');

    if (this.state === 'ending') {
      this.runEnding(dt);
    } else if (this.escolhaAberta) {
      // com o cartão aberto o mundo continua vivo, mas ninguém caminha
      m.vx = U.lerp(m.vx, 0, dt * 6); c.vx = U.lerp(c.vx, 0, dt * 6);
      m.step(dt, env); c.step(dt, env);
    } else {
      m.input = this.readInput();
      m.update(dt, env, c);
      if (this.claraScript) {
        // o roteiro leva a Clara até o outro (ela vai ver quem é)
        const dx = this.claraScript.alvoX - c.x;
        c.vx = U.lerp(c.vx, U.clamp(dx / 70, -1, 1) * 105, dt * 3);
        c.gaze = U.lerp(c.gaze, 0, dt * 2);
        c.gazeTarget = 'rival';
        c.step(dt, env);
        if (Math.abs(dx) < 24) c.vx = 0;
      } else {
        c.update(dt, env, m, this.rivals[0]);
      }
      this.colherFlor();
      if (this.flor.cd > 0) this.flor.cd -= dt;
    }
    this.roteiro(dt);

    /* ---- quem aparece para atrapalhar ---- */
    this.atualizarRivais(dt, env, m, c);

    /* ================= A CONEXÃO (invisível) ================= */
    const dx = Math.abs(c.x - m.x);
    const d = dx + Math.abs(c.z - m.z) * 240;

    const near = U.map(d, 520, 120, 0, 1);
    const sameWay = m.moveAmt > 0.4 && c.moveAmt > 0.4 &&
      Math.sign(m.vx) === Math.sign(c.vx) && Math.abs(m.vx) > 10 && d < 340;
    const mutualNow = m.gaze > 0.55 && c.gaze > 0.55 && d < 900 && c.gazeTarget === 'player';

    if (d < 210 && m.moveAmt < 0.25 && c.moveAmt < 0.25) this.stillTime += dt;
    else this.stillTime = Math.max(0, this.stillTime - dt * 2);

    // perto some rápido, longe cai rápido: a relação tem que ficar ÓBVIA
    let gain = near * 0.045 +
      (sameWay ? 0.030 : 0) +
      (mutualNow ? 0.060 : 0) +
      (this.stillTime > 2 ? 0.030 : 0);

    const apart = m.moveAmt > 0.35 && c.moveAmt > 0.35 &&
      Math.sign(m.vx) !== Math.sign(c.vx) && d > 330;
    let loss = (d > 560 ? U.map(d, 560, 2200, 0.020, 0.090) : 0) + (apart ? 0.045 : 0);

    // enquanto tem alguém puxando conversa com ela, nada avança
    if (rivalAtivo && Math.abs(rivalAtivo.x - c.x) < 150) { gain *= 0.10; loss += 0.030; }

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
      // longe dela chove quase sempre; perto, o tempo abre. Sem sutileza.
      const chance = 0.9 * (1 - env.warmth);
      env.rainTarget = Math.random() < chance ? U.rand(0.4, 0.9) : 0;
      this.rainTimer = U.rand(22, 45);
    }
    let rt = env.rainTarget || 0;
    if (env.warmth > 0.62) rt = 0;                     // o sol volta quando eles voltam
    env.rain = U.lerp(env.rain, rt, dt * 0.25);

    /* ---- câmera cinematográfica ---- */
    // a câmera "puxa" na direção dela, mas nunca o suficiente para tirar
    // o Matheus da tela (isso quebrava tudo no celular)
    const maxBias = (this.view.w * 0.16) / this.cam.scale;
    // nos finais a câmera pertence à cena, não ao jogador
    const followX = this.futuro ? c.x + 34
      : (this.wedding ? World.ALTAR_X
        : m.x + U.clamp((c.x - m.x) * 0.38, -maxBias, maxBias));
    // em tela de celular o afastamento é menor, senão eles viram formiguinhas
    const minZoom = this.view.w < 720 ? 0.90 : 0.78;
    const zoom = this.wedding ? 1.85 : (this.futuro ? 1.05 : U.map(d, 260, 1500, 1.08, minZoom));
    const base = this.baseScale();
    this.cam.scale = U.lerp(this.cam.scale, base * zoom, dt * (this.wedding ? 0.7 : 1.1));
    const halfW = this.view.w / 2 / this.cam.scale;
    this.cam.x = U.lerp(this.cam.x, U.clamp(followX, halfW - 100, World.WIDTH - halfW + 100), dt * 2.2);
    // enquadramento: o chão fica no terço de baixo e a sobra de tela vira céu
    // (no celular em pé isso é o que evita um vazio de grama embaixo)
    const camYBase = (this.wedding || this.futuro)
      ? World.bandY(this.wedding ? 0.58 : 0.50) - 0.26 * this.view.h / this.cam.scale
      : U.clamp(World.BAND_Y1 - 0.30 * this.view.h / this.cam.scale, 380, 620);
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

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);

    /* ---- botão da flor: só aparece quando ela pode receber ---- */
    const podeDar = this.state === 'playing' && !!m.holding && Math.abs(c.x - m.x) < 190;
    this.dom.florBtn.classList.toggle('hidden', !podeDar);

    /* ---- memórias ---- */
    if (this.memTimer > 0) {
      this.memTimer -= dt;
      if (this.memTimer <= 0) this.hideMemory();
    }
    // (os lugares de memória continuam no cenário, mas não interrompem mais o
    //  jogo com cartões: quem manda na tela agora são as escolhas)
  },

  /* --------------------------------------------------------------- desenho */
  render() {
    const ctx = this.ctx, env = this.env, view = this.view, cam = this.cam;

    // céu e fundos (espaço de tela, com parallax próprio)
    World.drawSky(ctx, env, cam, view);
    World.drawFar(ctx, env, cam, view);

    // mundo (dentro da câmera)
    ctx.save();
    // tremor do soco
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 16;
      ctx.translate(U.rand(-k, k), U.rand(-k, k));
    }
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    World.drawGround(ctx, env, cam, view);
    World.drawGroundDetail(ctx, env, cam, view);
    if (this.wedding) World.drawAltar(ctx, env);   // fica atrás dos noivos
    if (this.futuro) World.drawFuturo(ctx, env, env.t);

    // tudo que tem "profundidade" é ordenado pelo z para o desenho ficar certo
    const drawables = [];
    const r = env.rect, x0 = r.x0 - 260, x1 = r.x1 + 260;

    for (const t of World.trees) {
      if (t.x > x0 && t.x < x1) drawables.push({ z: t.z, f: () => World.drawTree(ctx, t, env) });
    }
    for (const b of World.bushes) {
      if (b.x > x0 && b.x < x1) drawables.push({ z: b.z, f: () => World.drawBush(ctx, b, env) });
    }
    // os lugares de memória não aparecem nas cenas finais (atrapalhavam o clima)
    if (!this.wedding && !this.futuro) {
      for (const mm of World.memories) {
        if (mm.x > x0 && mm.x < x1) drawables.push({ z: mm.z - 0.01, f: () => World.drawMemory(ctx, mm, env) });
      }
    }
    drawables.push({ z: this.clara.z, f: () => this.clara.draw(ctx, env) });
    drawables.push({ z: this.matheus.z, f: () => this.matheus.draw(ctx, env) });
    for (const r of this.rivals) {
      drawables.push({ z: r.z, f: () => { r.draw(ctx, env); r.drawLabel(ctx, env); } });
    }

    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) d.f();

    Particles.draw(ctx, env);
    ctx.restore();

    // atmosfera por cima de tudo
    World.drawRays(ctx, env, view);
    World.drawFog(ctx, env, view);
    World.drawGrade(ctx, env, view);
    this.drawClaraArrow(ctx, env, view);

    // clarão do teletransporte
    if (this.flash > 0.001) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,252,244,' + U.clamp(Math.pow(this.flash, 1.6), 0, 1) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }
  },

  /**
   * Quando ela está fora da tela, uma luzinha na borda mostra para que lado
   * ela ficou. Sem isso, no celular, dá para se perder — e o jogo inteiro é
   * sobre saber para onde caminhar.
   */
  drawClaraArrow(ctx, env, view) {
    if (this.state !== 'playing' || this.wedding) return;
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
