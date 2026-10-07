/** File-based SFX and music. Kenney / yd packs are CC0 (commercial OK). */
import { getSettings } from './Settings';

export type SfxKind = 'ui' | 'select' | 'move' | 'attack' | 'hire' | 'win' | 'lose' | 'explode';

const SFX_FILES: Record<SfxKind, string> = {
  ui: 'assets/audio/ui.wav',
  select: 'assets/audio/select.wav',
  move: 'assets/audio/move.ogg',
  attack: 'assets/audio/attack.ogg',
  hire: 'assets/audio/hire.wav',
  win: 'assets/audio/win.wav',
  lose: 'assets/audio/lose.wav',
  explode: 'assets/audio/explode.ogg',
};

const MUSIC_FILE = 'assets/audio/music.ogg';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let suspended = false;
let loadPromise: Promise<void> | null = null;
const buffers = new Map<string, AudioBuffer>();

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!ctx) {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    ctx = new Ctor();
    master = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain.connect(master);
    master.connect(ctx.destination);
    applyAudioVolume();
  }
  return ctx;
}

export function unlockAudio(): void {
  const ac = audioContext();
  if (ac?.state === 'suspended') {
    void ac.resume();
  }
  void loadAudio();
}

export function loadAudio(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    const ac = audioContext();
    if (!ac) {
      return;
    }
    const paths = [...new Set([...Object.values(SFX_FILES), MUSIC_FILE])];
    await Promise.all(
      paths.map(async (path) => {
        const res = await fetch(path);
        if (!res.ok) {
          throw new Error(`${res.status} ${path}`);
        }
        const raw = await res.arrayBuffer();
        const decoded = await ac.decodeAudioData(raw.slice(0));
        buffers.set(path, decoded);
      }),
    );
  })().catch((error) => {
    console.warn('[audio] failed to load files, using fallback tones', error);
  });
  return loadPromise;
}

export function applyAudioVolume(): void {
  if (!ctx || !master || !sfxGain || !musicGain) {
    return;
  }
  const volume = suspended ? 0 : getSettings().volume;
  master.gain.setTargetAtTime(volume > 0.01 ? 1 : 0, ctx.currentTime, 0.02);
  sfxGain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.02);
  musicGain.gain.setTargetAtTime(0.28, ctx.currentTime, 0.02);
}

export function setAudioSuspended(next: boolean): void {
  suspended = next;
  applyAudioVolume();
  if (next) {
    void ctx?.suspend();
  } else {
    void ctx?.resume();
  }
}

const TONES: Record<SfxKind, { freq: number; dur: number; type: OscillatorType; gain: number }> = {
  ui: { freq: 520, dur: 0.05, type: 'triangle', gain: 0.08 },
  select: { freq: 440, dur: 0.06, type: 'sine', gain: 0.07 },
  move: { freq: 280, dur: 0.08, type: 'sine', gain: 0.06 },
  attack: { freq: 160, dur: 0.12, type: 'square', gain: 0.05 },
  hire: { freq: 660, dur: 0.1, type: 'triangle', gain: 0.07 },
  win: { freq: 523, dur: 0.22, type: 'triangle', gain: 0.09 },
  lose: { freq: 140, dur: 0.28, type: 'sawtooth', gain: 0.05 },
  explode: { freq: 90, dur: 0.2, type: 'sawtooth', gain: 0.06 },
};

function playTone(kind: SfxKind): void {
  const ac = audioContext();
  if (!ac || !sfxGain) {
    return;
  }
  const tone = TONES[kind];
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = tone.type;
  osc.frequency.value = tone.freq;
  gain.gain.setValueAtTime(tone.gain, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + tone.dur);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start();
  osc.stop(ac.currentTime + tone.dur);
}

export function playSfx(kind: SfxKind): void {
  if (suspended || getSettings().volume <= 0.01) {
    return;
  }
  const ac = audioContext();
  if (!ac) {
    return;
  }
  if (ac.state === 'suspended') {
    void ac.resume();
  }
  const buf = buffers.get(SFX_FILES[kind]);
  if (buf && sfxGain) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(sfxGain);
    src.start();
    return;
  }
  playTone(kind);
}

export function stopMusic(): void {
  if (musicSource) {
    try {
      musicSource.stop();
    } catch {
      /* already stopped */
    }
    musicSource = null;
  }
}

export function playMusic(): void {
  const ac = audioContext();
  const buf = buffers.get(MUSIC_FILE);
  if (!ac || !musicGain || !buf) {
    return;
  }
  if (ac.state === 'suspended') {
    void ac.resume();
  }
  stopMusic();
  musicSource = ac.createBufferSource();
  musicSource.buffer = buf;
  musicSource.loop = true;
  musicSource.connect(musicGain);
  musicSource.start();
}

export function ensureMusic(): void {
  if (musicSource) {
    return;
  }
  playMusic();
}
