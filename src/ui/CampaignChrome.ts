/** HTML nav / fight / epilogue over the campaign map — Phaser buttons miss clicks. */
import { STR } from '../config/strings';

const ID = 'campaign-chrome';

export function hideCampaignChrome(): void {
  document.getElementById(ID)?.remove();
}

export function showCampaignChrome(handlers: {
  onBack: () => void;
  onSettings: () => void;
  onFight: () => void;
  onEpilogueA: () => void;
  onEpilogueB: () => void;
}): void {
  hideCampaignChrome();
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'campaign-chrome';
  el.innerHTML = `
    <div class="campaign-nav">
      <button type="button" class="battle-chrome-btn" data-role="camp-back">${STR.back}</button>
      <button type="button" class="battle-chrome-btn" data-role="camp-settings">${STR.settings}</button>
    </div>
    <button type="button" class="campaign-fight" data-role="camp-fight" hidden>${STR.startMission}</button>
    <div class="campaign-epilogue" hidden>
      <button type="button" class="settings-btn settings-btn-light" data-role="epi-a">${STR.epilogueA}</button>
      <button type="button" class="settings-btn settings-btn-primary" data-role="epi-b">${STR.epilogueB}</button>
    </div>
  `;
  (document.getElementById('game-container') ?? document.body).appendChild(el);

  const bind = (role: string, fn: () => void) => {
    el.querySelector(`[data-role="${role}"]`)?.addEventListener('click', (event) => {
      event.stopPropagation();
      fn();
    });
  };
  bind('camp-back', handlers.onBack);
  bind('camp-settings', handlers.onSettings);
  bind('camp-fight', handlers.onFight);
  bind('epi-a', handlers.onEpilogueA);
  bind('epi-b', handlers.onEpilogueB);
}

export function setCampaignFightVisible(visible: boolean): void {
  const btn = document.querySelector('#campaign-chrome [data-role="camp-fight"]');
  if (btn instanceof HTMLElement) {
    btn.hidden = !visible;
  }
}

export function setCampaignEpilogueVisible(visible: boolean): void {
  const box = document.querySelector('#campaign-chrome .campaign-epilogue');
  if (box instanceof HTMLElement) {
    box.hidden = !visible;
  }
}
