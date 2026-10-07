/** Full-screen “rotate the device” overlay for portrait phones. */
import { STR } from '../config/strings';

const ID = 'rotate-device';

export function mountOrientationGuard(): void {
  if (document.getElementById(ID)) {
    return;
  }
  const el = document.createElement('div');
  el.id = ID;
  el.className = 'rotate-device';
  el.innerHTML = `<div class="rotate-device-card"><div class="rotate-device-icon" aria-hidden="true">▭</div><p>${STR.rotateDevice}</p></div>`;
  document.body.appendChild(el);

  const sync = () => {
    const portrait = window.innerHeight > window.innerWidth + 40;
    el.classList.toggle('is-on', portrait);
  };
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
}
