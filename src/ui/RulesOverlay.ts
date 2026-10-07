/** Full rules sheet. Opened from the main menu. */
import { STR } from '../config/strings';

const ID = 'rules-overlay';

export function hideRules(): void {
  document.getElementById(ID)?.remove();
}

export function showRules(): void {
  hideRules();
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'rules-overlay is-open';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'rules-title');
  el.innerHTML = `
    <div class="rules-panel">
      <h2 id="rules-title" class="settings-title">${STR.rulesTitle}</h2>
      <div class="rules-scroll">
        ${STR.rulesSections
          .map(
            (section) =>
              `<section class="rules-section"><h3>${section.title}</h3><p>${section.body}</p></section>`,
          )
          .join('')}
      </div>
      <button type="button" class="settings-btn settings-btn-primary" data-role="rules-close">${STR.close}</button>
    </div>
  `;
  (document.getElementById('game-container') ?? document.body).appendChild(el);
  const close = () => hideRules();
  el.querySelector('[data-role="rules-close"]')?.addEventListener('click', close);
  el.addEventListener('click', (event) => {
    if (event.target === el) {
      close();
    }
  });
}
