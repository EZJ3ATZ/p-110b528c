/* ==========================================================================
   audio.js — MÚSICA E ATMOSFERA (100% gerada no navegador)
   --------------------------------------------------------------------------
   Nenhum arquivo de áudio é carregado: tudo é sintetizado com a Web Audio API,
   então o jogo continua sendo três arquivos de texto no GitHub Pages.

   A trilha tem camadas que entram e saem sozinhas conforme a CONEXÃO:
     • sempre     → pad grave em lá menor, reverberado, melancólico
     • vento      → ruído filtrado, mais alto quando eles estão distantes
     • chuva      → ruído agudo, quando o mundo chora
     • conexão    → filtro abre (mais brilho), acorde ganha a 9ª, entra um
                    arpejo dedilhado e um contracanto agudo
     • olhar mútuo→ um sino
   ========================================================================== */

const AudioEngine = {
  ctx: null,
  started: false,
  enabled: true,

  // estado do ambiente (atualizado pelo game.js)
  warmth: 0, wind: 0.4, rain: 0, night: 0,

  // progressão melancólica, porém com esperança no fim (F – G)
  progression: [
    [57, 60, 64],  // Am
    [53, 57, 60],  // F
    [48, 55, 64],  // C
    [55, 59, 62],  // G
    [57, 60, 64],  // Am
    [52, 55, 59],  // Em
    [53, 57, 60],  // F
    [55, 59, 62]   // G
  ],
  chordIdx: 0,
  nextTime: 0,
  BEAT: 4.6,      // duração de cada acorde, em segundos

  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /* ------------------------------------------------------------------ setup */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    // saída principal
    this.master = ctx.createGain();
    this.master.gain.value = 0;            // sobe suavemente no start()
    this.master.connect(ctx.destination);

    // reverberação (impulso sintético)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.9, 2.6);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.55;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    // barramento dos instrumentos, com filtro que "abre" conforme a conexão
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 640;
    this.tone.Q.value = 0.6;
    this.tone.connect(this.master);
    this.tone.connect(this.verb);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.tone);

    // ---- vento (ruído passa-banda) ----
    const noise = this._noiseSource();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    // ---- chuva (ruído agudo) ----
    const noise2 = this._noiseSource();
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass'; rf.frequency.value = 2600;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    noise2.connect(rf); rf.connect(this.rainGain);
    this.rainGain.connect(this.master);

    this.nextTime = ctx.currentTime + 0.3;
  },

  /** buffer de ruído branco em loop, usado por vento e chuva */
  _noiseSource() {
    const ctx = this.ctx, len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.start();
    return src;
  },

  /** resposta ao impulso sintética: ruído com decaimento exponencial */
  _impulse(dur, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  },

  /* ------------------------------------------------------------------ ciclo */
  start() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
    this._fadeMaster(this.enabled ? 0.55 : 0, 2.5);
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 220);
  },

  pause() { this._fadeMaster(0, 0.6); },
  resume() { if (this.started) this._fadeMaster(this.enabled ? 0.55 : 0, 1.2); },

  setEnabled(v) {
    this.enabled = v;
    if (this.started) this._fadeMaster(v ? 0.55 : 0, 0.8);
  },

  _fadeMaster(v, t) {
    if (!this.ctx) return;
    const g = this.master.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + t);
  },

  /** o game.js chama isto todo quadro */
  setEnv(warmth, wind, rain, night) {
    this.warmth = warmth; this.wind = wind; this.rain = rain; this.night = night;
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    // conexão abre o filtro: a mesma música fica mais clara, mais quente
    this.tone.frequency.setTargetAtTime(520 + warmth * 3200, now, 0.8);
    this.windGain.gain.setTargetAtTime(0.018 + (1 - warmth) * 0.055 + wind * 0.045, now, 1.2);
    this.rainGain.gain.setTargetAtTime(rain * 0.055, now, 1.0);
  },

  /* --------------------------------------------------------------- sequência */
  _schedule() {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.9) {
      this._playChord(this.nextTime);
      this.nextTime += this.BEAT;
      this.chordIdx = (this.chordIdx + 1) % this.progression.length;
    }
  },

  _playChord(t) {
    const w = this.warmth;
    const notes = this.progression[this.chordIdx].slice();
    // com conexão, o acorde ganha a 9ª/6ª — o mesmo acorde soa mais aberto
    if (w > 0.45) notes.push(notes[0] + 14);
    if (w > 0.7) notes.push(notes[1] + 12);

    // pad
    notes.forEach((m, i) => this._pad(this.mtof(m), t + i * 0.05, this.BEAT * 1.25, 0.16 - i * 0.012));
    // baixo
    this._pad(this.mtof(notes[0] - 12), t, this.BEAT * 1.1, 0.13, 'sine');

    // arpejo dedilhado — só existe quando eles estão próximos
    if (w > 0.28) {
      const scale = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 19];
      const n = 2 + Math.round(w * 4);
      for (let i = 0; i < n; i++) {
        const when = t + 0.35 + i * (this.BEAT / (n + 1.4));
        this._pluck(this.mtof(U.pick(scale)), when, 0.06 + w * 0.09);
      }
    }
    // contracanto agudo, bem discreto, no auge da conexão
    if (w > 0.72) {
      this._pad(this.mtof(notes[2] + 24), t + 0.6, this.BEAT * 0.8, 0.035, 'sine');
    }
  },

  /** voz do pad: dois osciladores levemente desafinados */
  _pad(freq, t, dur, gain, type) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.musicGain);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = type || 'triangle';
      o.frequency.value = freq * (i ? 1.004 : 0.997);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  },

  /** nota dedilhada: ataque rápido, decaimento curto */
  _pluck(freq, t, gain) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.001), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    g.connect(this.musicGain);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(g);
    o.start(t); o.stop(t + 1.6);
  },

  /** sino do olhar mútuo */
  chime() {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime + 0.02;
    const base = this.mtof(this.progression[this.chordIdx][0] + 24);
    [1, 1.5, 2].forEach((mult, i) => {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      g.connect(this.tone); g.connect(this.verb);
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mult;
      o.connect(g); o.start(t); o.stop(t + 3.4);
    });
  },

  /** acorde suspenso usado nos finais */
  swell() {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime + 0.05;
    [57, 64, 69, 72].forEach((m, i) => this._pad(this.mtof(m), t + i * 0.12, 7, 0.09));
  }
};
