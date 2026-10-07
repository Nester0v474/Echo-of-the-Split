/** HTML end-of-battle card — Phaser text buttons miss clicks after scale/fullscreen. */
import { STR } from '../config/strings';

const ID = 'battle-end-overlay';

export function hideBattleEnd(): void {
  document.getElementById(ID)?.remove();
}

export function showBattleEnd(options: {
  title: string;
  won: boolean;
  campaign: boolean;
  onCampaign?: () => void;
  onRetry: () => void;
  onMenu: () => void;
}): void {
  hideBattleEnd();
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'battle-end-overlay';
  el.innerHTML = `
    <div class="battle-end-card">
      <h2 class="${options.won ? 'is-win' : 'is-lose'}">${options.title}</h2>
      <div class="battle-end-actions">
        ${
          options.campaign
            ? `<button type="button" class="settings-btn settings-btn-light" data-role="end-map">${STR.toCampaign}</button>`
            : ''
        }
        <button type="button" class="settings-btn settings-btn-light" data-role="end-retry">${STR.retry}</button>
        <button type="button" class="settings-btn settings-btn-primary" data-role="end-menu">${STR.toMenu}</button>
      </div>
    </div>
  `;
  (document.getElementById('game-container') ?? document.body).appendChild(el);
  el.querySelector('[data-role="end-map"]')?.addEventListener('click', () => options.onCampaign?.());
  el.querySelector('[data-role="end-retry"]')?.addEventListener('click', options.onRetry);
  el.querySelector('[data-role="end-menu"]')?.addEventListener('click', options.onMenu);
}
