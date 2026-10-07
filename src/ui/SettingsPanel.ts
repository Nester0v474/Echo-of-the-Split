/**
 * HTML overlay for settings. Sits above the Phaser canvas on menu, map and battle.
 */
import Phaser from 'phaser';
import { STR } from '../config/strings';
import { applyAudioVolume, playSfx } from '../systems/Audio';
import { getSettings, updateSettings, type Difficulty } from '../systems/Settings';
import { enterAppFullscreen, exitAppFullscreen, isAppFullscreen, onFullscreenChange } from './Fullscreen';

const OVERLAY_ID = 'settings-overlay';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

const ICON_FULLSCREEN = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H4v4M16 3h4v4M8 21H4v-4M20 21h-4v-4"/></svg>`;
const ICON_FULLSCREEN_EXIT = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v4H5M15 3v4h4M9 21v-4H5M19 21v-4h-4"/></svg>`;

export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private readonly overlay: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly soundToggle: HTMLButtonElement;
  private unbindFullscreen: (() => void) | null = null;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    document.getElementById(OVERLAY_ID)?.remove();
    this.overlay = this.mount();
    this.toggle = this.overlay.querySelector<HTMLButtonElement>('[data-role="paths-toggle"]')!;
    this.soundToggle = this.overlay.querySelector<HTMLButtonElement>('[data-role="sound-toggle"]')!;
    this.bind();
    this.refresh();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  show(): void {
    this.refresh();
    this.overlay.classList.add('is-open');
    this.overlay.setAttribute('aria-hidden', 'false');
    window.addEventListener('keydown', this.onKeyDown);
  }

  hide(): void {
    this.overlay.classList.remove('is-open');
    this.overlay.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', this.onKeyDown);
  }

  isOpen(): boolean {
    return this.overlay.classList.contains('is-open');
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    this.unbindFullscreen?.();
    this.unbindFullscreen = null;
    this.overlay.remove();
  }

  private mount(): HTMLElement {
    const host = document.getElementById('game-container') ?? document.body;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'settings-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title" class="settings-title">${STR.settingsTitle}</h2>
        <p class="settings-hint">${STR.difficultyHint}</p>

        <div class="settings-block">
          <div class="settings-label">${STR.difficulty}</div>
          <div class="settings-segment" role="group" aria-label="${STR.difficulty}">
            ${DIFFICULTIES.map(
              (d) =>
                `<button type="button" class="settings-chip" data-difficulty="${d}">${STR.difficultyNames[d]}</button>`,
            ).join('')}
          </div>
        </div>

        <button type="button" class="settings-toggle-row" data-role="sound-toggle" aria-pressed="true">
          <span>${STR.sound}</span>
          <span class="settings-switch" aria-hidden="true"></span>
        </button>

        <button type="button" class="settings-toggle-row" data-role="paths-toggle" aria-pressed="true">
          <span>${STR.showPaths}</span>
          <span class="settings-switch" aria-hidden="true"></span>
        </button>

        <button type="button" class="settings-btn settings-btn-light" data-role="fullscreen">
          ${ICON_FULLSCREEN}
          <span>${STR.fullscreen}</span>
        </button>

        <button type="button" class="settings-btn settings-btn-light" data-role="fullscreen-exit">
          ${ICON_FULLSCREEN_EXIT}
          <span>${STR.fullscreenExit}</span>
        </button>

        <button type="button" class="settings-btn settings-btn-primary" data-role="close">${STR.close}</button>
      </div>
    `;
    host.appendChild(overlay);
    return overlay;
  }

  private bind(): void {
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateSettings({ difficulty: btn.dataset.difficulty as Difficulty });
        playSfx('ui');
        this.refresh();
      });
    });

    this.soundToggle.addEventListener('click', () => {
      const on = getSettings().volume > 0.01;
      updateSettings({ volume: on ? 0 : 0.7 });
      applyAudioVolume();
      playSfx('ui');
      this.refresh();
    });

    this.toggle.addEventListener('click', () => {
      updateSettings({ showPaths: !getSettings().showPaths });
      playSfx('ui');
      this.refresh();
    });

    this.overlay.querySelector('[data-role="fullscreen"]')?.addEventListener('click', () => {
      playSfx('ui');
      void enterAppFullscreen()
        .catch(() => undefined)
        .then(() => {
          this.scene.scale.refresh();
          this.refresh();
        });
    });

    this.overlay.querySelector('[data-role="fullscreen-exit"]')?.addEventListener('click', () => {
      playSfx('ui');
      void exitAppFullscreen()
        .catch(() => undefined)
        .then(() => {
          this.scene.scale.refresh();
          this.refresh();
        });
    });

    this.unbindFullscreen = onFullscreenChange(() => {
      this.scene.scale.refresh();
      this.refresh();
    });
    this.overlay.querySelector('[data-role="close"]')?.addEventListener('click', () => this.hide());
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide();
    }
  };

  private refresh(): void {
    const settings = getSettings();
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.difficulty === settings.difficulty);
    });
    this.toggle.classList.toggle('is-on', settings.showPaths);
    this.toggle.setAttribute('aria-pressed', String(settings.showPaths));
    const soundOn = settings.volume > 0.01;
    this.soundToggle.classList.toggle('is-on', soundOn);
    this.soundToggle.setAttribute('aria-pressed', String(soundOn));
    const fullscreen = isAppFullscreen();
    const enter = this.overlay.querySelector<HTMLButtonElement>('[data-role="fullscreen"]');
    const exit = this.overlay.querySelector<HTMLButtonElement>('[data-role="fullscreen-exit"]');
    if (enter) {
      enter.disabled = fullscreen;
    }
    if (exit) {
      exit.disabled = !fullscreen;
    }
  }
}
