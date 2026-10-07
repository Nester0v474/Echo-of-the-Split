/** First-battle how-to. Shown once, then remembered in platform storage. */
import { STR } from '../config/strings';
import { persistGet, persistSet } from '../platform/persist';

const KEY = 'hex-tactics.tutorial.v2';
const ID = 'battle-tutorial';

export function hasSeenTutorial(): boolean {
  return persistGet(KEY) === '1';
}

export function markTutorialSeen(): void {
  persistSet(KEY, '1');
}

export function showTutorial(onClose?: () => void): void {
  document.getElementById(ID)?.remove();
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'battle-tutorial';
  el.innerHTML = `
    <div class="battle-tutorial-card" role="dialog" aria-labelledby="tutorial-title">
      <h2 id="tutorial-title">${STR.tutorialTitle}</h2>
      <ol>
        ${STR.tutorialSteps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
      <button type="button" class="settings-btn settings-btn-primary" data-role="tutorial-ok">${STR.tutorialOk}</button>
    </div>
  `;
  (document.getElementById('game-container') ?? document.body).appendChild(el);
  el.querySelector('[data-role="tutorial-ok"]')?.addEventListener('click', () => {
    markTutorialSeen();
    el.remove();
    onClose?.();
  });
}
