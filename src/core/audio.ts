import type { GameSettings } from './save';

export type SoundName =
  | 'laser' | 'missile' | 'hit' | 'explosion' | 'pickup' | 'levelup' | 'shield'
  | 'shieldDown' | 'hurt' | 'boss' | 'click' | 'lose' | 'nova'
  | 'pulse' | 'scatter' | 'beam' | 'arc' | 'shieldHit' | 'hullHit' | 'kamikaze' | 'bossPhase';

type VoiceKind = 'music' | 'sfx';
type MusicMode = 'calm' | 'combat' | 'boss';

interface ActiveVoice {
  source: OscillatorNode | AudioBufferSourceNode;
  nodes: AudioNode[];
  endTime: number;
  priority: number;
  kind: VoiceKind;
}

interface ToneSpec {
  from: number;
  to: number;
  duration: number;
  type: OscillatorType;
  level: number;
  attack?: number;
  points?: ReadonlyArray<readonly [number, number]>;
}

interface NoiseSpec {
  from: number;
  to: number;
  duration: number;
  level: number;
  filter: BiquadFilterType;
}

const SAMPLE_PATHS: Partial<Record<SoundName, string>> = {
  laser: '/assets/audio/sfx_laser1.ogg',
  missile: '/assets/audio/sfx_laser2.ogg',
  shield: '/assets/audio/sfx_shieldUp.ogg',
  shieldDown: '/assets/audio/sfx_shieldDown.ogg',
  pickup: '/assets/audio/sfx_twoTone.ogg',
  hurt: '/assets/audio/sfx_zap.ogg',
  lose: '/assets/audio/sfx_lose.ogg',
};

const THROTTLE: Record<SoundName, number> = {
  laser: 0.055,
  missile: 0.09,
  hit: 0.04,
  explosion: 0.08,
  pickup: 0.06,
  levelup: 0.15,
  shield: 0.08,
  shieldDown: 0.15,
  hurt: 0.08,
  boss: 0.5,
  click: 0.025,
  lose: 0.5,
  nova: 0.2,
  pulse: 0.045,
  scatter: 0.085,
  beam: 0.12,
  arc: 0.1,
  shieldHit: 0.045,
  hullHit: 0.065,
  kamikaze: 0.3,
  bossPhase: 0.8,
};

const PRIORITY: Partial<Record<SoundName, number>> = {
  explosion: 1,
  pickup: 1,
  levelup: 2,
  shield: 1,
  shieldDown: 3,
  hurt: 3,
  boss: 4,
  click: 2,
  lose: 4,
  nova: 2,
  shieldHit: 1,
  hullHit: 2,
  kamikaze: 4,
  bossPhase: 5,
};

const TONES: Record<SoundName, ToneSpec> = {
  laser: { from: 760, to: 180, duration: 0.09, type: 'sawtooth', level: 0.12 },
  missile: { from: 240, to: 65, duration: 0.22, type: 'sawtooth', level: 0.12 },
  hit: { from: 180, to: 90, duration: 0.05, type: 'sawtooth', level: 0.1 },
  explosion: { from: 95, to: 32, duration: 0.38, type: 'sawtooth', level: 0.12 },
  pickup: { from: 540, to: 980, duration: 0.15, type: 'sine', level: 0.12 },
  levelup: { from: 420, to: 1260, duration: 0.5, type: 'sine', level: 0.12 },
  shield: { from: 320, to: 760, duration: 0.3, type: 'sine', level: 0.12 },
  shieldDown: { from: 380, to: 90, duration: 0.28, type: 'sawtooth', level: 0.12 },
  hurt: { from: 170, to: 55, duration: 0.22, type: 'sawtooth', level: 0.12 },
  boss: { from: 90, to: 34, duration: 0.7, type: 'sawtooth', level: 0.13 },
  click: { from: 520, to: 650, duration: 0.06, type: 'sine', level: 0.1 },
  lose: { from: 250, to: 48, duration: 0.8, type: 'sawtooth', level: 0.12 },
  nova: { from: 140, to: 45, duration: 0.45, type: 'sawtooth', level: 0.13 },
  pulse: { from: 1080, to: 360, duration: 0.085, type: 'square', level: 0.075, attack: 0.002 },
  scatter: { from: 290, to: 75, duration: 0.14, type: 'sawtooth', level: 0.075 },
  beam: { from: 320, to: 180, duration: 0.32, type: 'sawtooth', level: 0.06, attack: 0.018 },
  arc: {
    from: 1500, to: 1100, duration: 0.18, type: 'square', level: 0.065, attack: 0.002,
    points: [[0.03, 540], [0.07, 1800], [0.11, 420], [0.18, 1100]],
  },
  shieldHit: { from: 960, to: 430, duration: 0.18, type: 'sine', level: 0.12 },
  hullHit: { from: 140, to: 45, duration: 0.2, type: 'triangle', level: 0.15 },
  kamikaze: {
    from: 380, to: 980, duration: 0.58, type: 'square', level: 0.075, attack: 0.008,
    points: [[0.12, 760], [0.24, 420], [0.4, 880], [0.58, 980]],
  },
  bossPhase: {
    from: 48, to: 42, duration: 0.9, type: 'sawtooth', level: 0.14, attack: 0.025,
    points: [[0.28, 160], [0.55, 110], [0.9, 42]],
  },
};

const NOISE: Partial<Record<SoundName, NoiseSpec>> = {
  explosion: { from: 1800, to: 80, duration: 0.5, level: 0.3, filter: 'lowpass' },
  boss: { from: 900, to: 80, duration: 0.65, level: 0.28, filter: 'lowpass' },
  nova: { from: 1500, to: 70, duration: 0.55, level: 0.32, filter: 'lowpass' },
  scatter: { from: 2200, to: 500, duration: 0.16, level: 0.14, filter: 'bandpass' },
  arc: { from: 3200, to: 800, duration: 0.16, level: 0.11, filter: 'highpass' },
  shieldHit: { from: 2400, to: 900, duration: 0.14, level: 0.07, filter: 'bandpass' },
  hullHit: { from: 900, to: 100, duration: 0.2, level: 0.18, filter: 'lowpass' },
  bossPhase: { from: 1400, to: 70, duration: 0.85, level: 0.24, filter: 'lowpass' },
};

const MAX_SFX_VOICES = 18;
const MAX_MUSIC_VOICES = 6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const amount = clamp01((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
}

function isSoundName(name: string): name is SoundName {
  return Object.prototype.hasOwnProperty.call(THROTTLE, name);
}

export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private sfx?: GainNode;
  private filter?: BiquadFilterNode;
  private calmLayer?: GainNode;
  private combatLayer?: GainNode;
  private bossLayer?: GainNode;
  private readonly samples = new Map<SoundName, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly sfxVoices = new Set<ActiveVoice>();
  private readonly musicVoices = new Set<ActiveVoice>();
  private settings: GameSettings;
  private muted = false;
  private paused = false;
  private samplesRequested = false;
  private nextNote = 0;
  private noteIndex = 0;
  private noise?: AudioBuffer;
  private intensity = 0;
  private targetIntensity = 0;
  private bossAmount = 0;
  private bossRequested = false;
  private lastUpdateTime = -1;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  async unlock(): Promise<void> {
    if (!this.context) this.initialize();
    const context = this.context;
    if (!context) return;
    try {
      if (context.state === 'suspended') await context.resume();
    } catch {
      return;
    }
    if (this.context !== context || context.state !== 'running') return;
    if (!this.samplesRequested) {
      this.samplesRequested = true;
      void this.loadSamples(context);
    }
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
    this.applyVolumes();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.nextNote = 0;
    this.noteIndex = 0;
    this.lastUpdateTime = -1;
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  update(intensity: number, boss = false): void {
    this.targetIntensity = Number.isFinite(intensity) ? clamp01(intensity) : 0;
    this.bossRequested = boss;
    const context = this.context;
    const now = context?.currentTime ?? 0;
    const elapsed = this.lastUpdateTime >= 0 && now > this.lastUpdateTime
      ? Math.min(0.1, now - this.lastUpdateTime)
      : 1 / 60;
    this.lastUpdateTime = now;
    const blend = 1 - Math.exp(-elapsed / 0.32);
    this.intensity += (this.targetIntensity - this.intensity) * blend;
    this.bossAmount += ((boss ? 1 : 0) - this.bossAmount) * blend;
    this.updateMusicMix();
    if (!context || !this.music || this.paused || this.muted || context.state !== 'running') return;
    if (this.settings.musicVolume <= 0) return;
    this.pruneVoices(now);
    if (now < this.nextNote) return;
    const mode: MusicMode = this.bossRequested ? 'boss' : this.intensity > 0.3 ? 'combat' : 'calm';
    const interval = mode === 'boss'
      ? 0.3 - this.intensity * 0.12
      : mode === 'combat'
        ? 0.36 - this.intensity * 0.16
        : 0.72 - this.intensity * 0.2;
    this.nextNote = now + interval;
    this.scheduleMusicNote(mode, now);
  }

  play(name: string, volume = 1): void {
    if (!this.context || !this.sfx || this.context.state !== 'running' || this.muted || !isSoundName(name)) return;
    const level = Number.isFinite(volume) ? Math.max(0, Math.min(1.5, volume)) : 1;
    if (level <= 0) return;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -10) < THROTTLE[name]) return;
    this.lastPlayed.set(name, now);
    this.pruneVoices(now);
    const sample = this.samples.get(name);
    if (sample) {
      this.playSample(name, sample, level);
      return;
    }
    this.synthesize(name, level);
  }

  private initialize(): void {
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.sfx = this.context.createGain();
      this.filter = this.context.createBiquadFilter();
      const limiter = this.context.createDynamicsCompressor();
      this.master.gain.value = 0;
      this.music.gain.value = 0;
      this.sfx.gain.value = 0;
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 300;
      limiter.threshold.value = -16;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      this.music.connect(this.filter).connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(limiter).connect(this.context.destination);
      this.applyVolumes();
      this.createMusicLayers();
      this.createNoise();
    } catch {
      this.context = undefined;
      this.master = undefined;
      this.music = undefined;
      this.sfx = undefined;
      this.filter = undefined;
      this.calmLayer = undefined;
      this.combatLayer = undefined;
      this.bossLayer = undefined;
    }
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.music || !this.sfx) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.settings.masterVolume, now, 0.02);
    this.music.gain.setTargetAtTime(this.paused ? 0 : this.settings.musicVolume, now, this.paused ? 0.08 : 0.12);
    this.sfx.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.02);
  }

  private async loadSamples(context: AudioContext): Promise<void> {
    await Promise.all(Object.entries(SAMPLE_PATHS).map(async ([name, path]) => {
      if (!path) return;
      try {
        const response = await fetch(path);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.samples.set(name as SoundName, buffer);
      } catch {
        return;
      }
    }));
  }

  private createMusicLayers(): void {
    if (!this.context || !this.music || !this.filter) return;
    const context = this.context;
    this.calmLayer = context.createGain();
    this.combatLayer = context.createGain();
    this.bossLayer = context.createGain();
    this.calmLayer.gain.value = 0;
    this.combatLayer.gain.value = 0;
    this.bossLayer.gain.value = 0;
    this.calmLayer.connect(this.music);
    this.combatLayer.connect(this.music);
    this.bossLayer.connect(this.music);

    const addOscillator = (
      destination: AudioNode,
      frequency: number,
      type: OscillatorType,
      level: number,
      detune = 0,
    ): void => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      gain.gain.value = level;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
    };

    addOscillator(this.calmLayer, 55, 'sine', 0.055);
    addOscillator(this.calmLayer, 82.41, 'triangle', 0.018);
    addOscillator(this.calmLayer, 110, 'sine', 0.012);

    const combatPulse = context.createGain();
    combatPulse.gain.value = 0.45;
    combatPulse.connect(this.combatLayer);
    addOscillator(combatPulse, 55, 'sawtooth', 0.04);
    addOscillator(combatPulse, 110, 'triangle', 0.022, 5);
    const combatLfo = context.createOscillator();
    const combatDepth = context.createGain();
    combatLfo.frequency.value = 3.8;
    combatDepth.gain.value = 0.35;
    combatLfo.connect(combatDepth).connect(combatPulse.gain);
    combatLfo.start();

    const bossPulse = context.createGain();
    bossPulse.gain.value = 0.5;
    bossPulse.connect(this.bossLayer);
    addOscillator(bossPulse, 41.2, 'sawtooth', 0.055);
    addOscillator(bossPulse, 61.74, 'square', 0.018, -7);
    const bossLfo = context.createOscillator();
    const bossDepth = context.createGain();
    bossLfo.frequency.value = 2.1;
    bossDepth.gain.value = 0.4;
    bossLfo.connect(bossDepth).connect(bossPulse.gain);
    bossLfo.start();

    const filterLfo = context.createOscillator();
    const filterDepth = context.createGain();
    filterLfo.frequency.value = 0.07;
    filterDepth.gain.value = 90;
    filterLfo.connect(filterDepth).connect(this.filter.frequency);
    filterLfo.start();
    this.updateMusicMix();
  }

  private updateMusicMix(): void {
    if (!this.context || !this.calmLayer || !this.combatLayer || !this.bossLayer) return;
    const now = this.context.currentTime;
    const calm = Math.max(0.12, 1 - this.intensity * 0.7) * (1 - this.bossAmount);
    const combat = smoothstep(0.16, 0.82, this.intensity) * (1 - this.bossAmount * 0.8);
    this.calmLayer.gain.setTargetAtTime(calm, now, 0.25);
    this.combatLayer.gain.setTargetAtTime(combat, now, 0.18);
    this.bossLayer.gain.setTargetAtTime(this.bossAmount, now, 0.22);
    if (this.filter) {
      this.filter.frequency.setTargetAtTime(260 + this.intensity * 680 + this.bossAmount * 140, now, 0.3);
    }
  }

  private scheduleMusicNote(mode: MusicMode, now: number): void {
    if (!this.context) return;
    const destination = mode === 'boss' ? this.bossLayer : mode === 'combat' ? this.combatLayer : this.calmLayer;
    if (!destination) return;
    const scales: Record<MusicMode, readonly number[]> = {
      calm: [0, 7, 12, 3, 10, 7, 15, 12],
      combat: [0, 3, 7, 10, 12, 10, 7, 3],
      boss: [0, 1, 7, 6, 0, 10, 6, 1],
    };
    const index = this.noteIndex;
    this.noteIndex = (this.noteIndex + 1) % 4096;
    const step = scales[mode][index % scales[mode].length] ?? 0;
    const base = mode === 'boss' ? 55 : 110;
    const duration = mode === 'calm' ? 1.05 : mode === 'combat' ? 0.34 : 0.42;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = mode === 'calm' ? 'sine' : mode === 'combat'
      ? index % 4 === 0 ? 'sawtooth' : 'triangle'
      : index % 2 === 0 ? 'square' : 'sawtooth';
    oscillator.frequency.value = base * Math.pow(2, step / 12);
    const level = mode === 'calm' ? 0.032 : 0.022 + this.intensity * 0.014;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + (mode === 'calm' ? 0.06 : 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(destination);
    this.scheduleVoice(oscillator, [oscillator, gain], now, now + duration + 0.03, 0, 'music');
  }

  private createNoise(): void {
    if (!this.context) return;
    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  }

  private playSample(name: SoundName, sample: AudioBuffer, volume: number): void {
    if (!this.context || !this.sfx) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const rate = name === 'laser' ? 0.94 + Math.random() * 0.12 : 1;
    source.buffer = sample;
    source.playbackRate.value = rate;
    gain.gain.value = volume * (name === 'laser' ? 0.22 : name === 'missile' ? 0.35 : 0.45);
    source.connect(gain).connect(this.sfx);
    this.scheduleVoice(
      source,
      [source, gain],
      now,
      now + sample.duration / rate + 0.03,
      PRIORITY[name] ?? 0,
      'sfx',
    );
  }

  private synthesize(name: SoundName, volume: number): void {
    const priority = PRIORITY[name] ?? 0;
    const noise = NOISE[name];
    if (noise) this.noiseBurst(noise, volume, priority);
    this.tone(TONES[name], volume, priority);
    if (name === 'beam') {
      this.tone({ from: 960, to: 720, duration: 0.3, type: 'sine', level: 0.025, attack: 0.02 }, volume, priority);
    } else if (name === 'shieldHit') {
      this.tone({ from: 1440, to: 860, duration: 0.13, type: 'sine', level: 0.04 }, volume, priority);
    }
  }

  private tone(spec: ToneSpec, volume: number, priority: number): void {
    if (!this.context || !this.sfx) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.from, now);
    if (spec.points) {
      for (const [offset, frequency] of spec.points) {
        oscillator.frequency.exponentialRampToValueAtTime(frequency, now + offset);
      }
    } else {
      oscillator.frequency.exponentialRampToValueAtTime(spec.to, now + spec.duration);
    }
    const level = Math.max(0.0001, spec.level * volume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + Math.min(spec.attack ?? 0.005, spec.duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    oscillator.connect(gain).connect(this.sfx);
    this.scheduleVoice(oscillator, [oscillator, gain], now, now + spec.duration + 0.03, priority, 'sfx');
  }

  private noiseBurst(spec: NoiseSpec, volume: number, priority: number): void {
    if (!this.context || !this.sfx || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = spec.filter;
    filter.frequency.setValueAtTime(spec.from, now);
    filter.frequency.exponentialRampToValueAtTime(spec.to, now + spec.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, spec.level * volume), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    source.connect(filter).connect(gain).connect(this.sfx);
    this.scheduleVoice(source, [source, filter, gain], now, now + spec.duration + 0.03, priority, 'sfx');
  }

  private scheduleVoice(
    source: OscillatorNode | AudioBufferSourceNode,
    nodes: AudioNode[],
    startAt: number,
    stopAt: number,
    priority: number,
    kind: VoiceKind,
  ): void {
    const voices = kind === 'music' ? this.musicVoices : this.sfxVoices;
    const limit = kind === 'music' ? MAX_MUSIC_VOICES : MAX_SFX_VOICES;
    if (voices.size >= limit) {
      let victim: ActiveVoice | undefined;
      if (kind === 'sfx') {
        for (const voice of voices) {
          if (voice.priority >= priority) continue;
          if (!victim || voice.priority < victim.priority
            || (voice.priority === victim.priority && voice.endTime < victim.endTime)) {
            victim = voice;
          }
        }
      }
      if (!victim) {
        for (const node of nodes) node.disconnect();
        return;
      }
      try {
        victim.source.stop();
      } catch {
        // Already stopped.
      }
      this.releaseVoice(victim);
    }
    const voice: ActiveVoice = { source, nodes, endTime: stopAt, priority, kind };
    voices.add(voice);
    source.onended = () => this.releaseVoice(voice);
    try {
      source.start(startAt);
      source.stop(stopAt);
    } catch {
      this.releaseVoice(voice);
    }
  }

  private pruneVoices(now: number): void {
    for (const voice of [...this.sfxVoices, ...this.musicVoices]) {
      if (voice.endTime <= now) this.releaseVoice(voice);
    }
  }

  private releaseVoice(voice: ActiveVoice): void {
    const voices = voice.kind === 'music' ? this.musicVoices : this.sfxVoices;
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }
}
