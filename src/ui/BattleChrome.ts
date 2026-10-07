/** Always-clickable HTML controls over the battle canvas. */
import { STR } from '../config/strings';

const ID = 'battle-chrome';

export interface BattleChromeState {
  energy: number;
  phaseLabel: string;
  waveText: string;
  fleetOpen: boolean;
  canEndTurn: boolean;
}

export function hideBattleChrome(): void {
  document.getElementById(ID)?.remove();
}

export function showBattleChrome(handlers: {
  onSettings: () => void;
  onMenu: () => void;
  onEndTurn: () => void;
  onFleet: () => void;
}): void {
  hideBattleChrome();
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'battle-chrome';
  el.innerHTML = `
    <div class="battle-status">
      <div class="battle-status-main" data-role="chrome-status"></div>
      <div class="battle-status-wave" data-role="chrome-wave"></div>
    </div>
    <div class="battle-chrome-left">
      <button type="button" class="battle-chrome-btn" data-role="chrome-settings">${STR.settings}</button>
      <button type="button" class="battle-chrome-btn" data-role="chrome-menu">${STR.toMenu}</button>
    </div>
    <button type="button" class="battle-chrome-btn battle-chrome-fleet" data-role="chrome-fleet">${STR.fleetOpen}</button>
    <button type="button" class="battle-chrome-end" data-role="chrome-end">${STR.endTurn}</button>
  `;
  (document.getElementById('game-container') ?? document.body).appendChild(el);

  const bind = (role: string, fn: () => void) => {
    el.querySelector(`[data-role="${role}"]`)?.addEventListener('click', (event) => {
      event.stopPropagation();
      fn();
    });
  };
  bind('chrome-settings', handlers.onSettings);
  bind('chrome-menu', handlers.onMenu);
  bind('chrome-end', handlers.onEndTurn);
  bind('chrome-fleet', handlers.onFleet);
}

export function updateBattleChrome(state: BattleChromeState): void {
  const root = document.getElementById(ID);
  if (!root) {
    return;
  }
  const status = root.querySelector('[data-role="chrome-status"]');
  const wave = root.querySelector('[data-role="chrome-wave"]');
  const fleet = root.querySelector('[data-role="chrome-fleet"]');
  const end = root.querySelector('[data-role="chrome-end"]');
  if (status) {
    status.textContent = `${state.energy} ${STR.energyUnit}    ${state.phaseLabel}`;
  }
  if (wave instanceof HTMLElement) {
    wave.textContent = state.waveText;
    wave.hidden = !state.waveText;
  }
  if (fleet) {
    fleet.textContent = state.fleetOpen ? STR.fleetOpen : STR.fleetClose;
  }
  if (end instanceof HTMLButtonElement) {
    end.disabled = !state.canEndTurn;
  }
}
