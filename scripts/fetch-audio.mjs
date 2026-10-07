import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const destDir = resolve('assets/audio');
mkdirSync(destDir, { recursive: true });

const files = [
  {
    out: 'ui.wav',
    urls: [
      'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/click_002.wav',
    ],
  },
  {
    out: 'select.wav',
    urls: [
      'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/switch_001.wav',
    ],
  },
  {
    out: 'hire.wav',
    urls: [
      'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/confirmation_002.wav',
    ],
  },
  {
    out: 'win.wav',
    urls: [
      'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/confirmation_004.wav',
    ],
  },
  {
    out: 'lose.wav',
    urls: [
      'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/close_001.wav',
    ],
  },
  {
    out: 'move.ogg',
    urls: [
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/thruster_small_000.ogg',
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/thrusterFire_000.ogg',
      'https://gamesounds.xyz/Kenney%27s%20Sound%20Pack/Sci-Fi%20Sounds/thrusterFire_000.ogg',
    ],
  },
  {
    out: 'attack.ogg',
    urls: [
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/laser_small_000.ogg',
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/laserSmall_000.ogg',
      'https://gamesounds.xyz/Kenney%27s%20Sound%20Pack/Sci-Fi%20Sounds/laserSmall_000.ogg',
    ],
  },
  {
    out: 'explode.ogg',
    urls: [
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/explosion_crunch_000.ogg',
      'https://raw.githubusercontent.com/Reptarus/five-parsecs-campaign-manager/master/assets/kenney%20sci-fi%20sounds/explosionCrunch_000.ogg',
      'https://gamesounds.xyz/Kenney%27s%20Sound%20Pack/Sci-Fi%20Sounds/explosionCrunch_000.ogg',
    ],
  },
];

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 400) {
    throw new Error(`too small ${buf.length} ${url}`);
  }
  return buf;
}

for (const file of files) {
  let lastError = null;
  let saved = false;
  for (const url of file.urls) {
    try {
      const buf = await download(url);
      const dest = resolve(destDir, file.out);
      writeFileSync(dest, buf);
      console.log(`${file.out} ${statSync(dest).size} <- ${url}`);
      saved = true;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`fail ${url}: ${error.message}`);
    }
  }
  if (!saved) {
    throw lastError ?? new Error(`could not fetch ${file.out}`);
  }
}
