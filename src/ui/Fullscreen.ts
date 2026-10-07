/** Fullscreen the game container so Phaser canvas and HTML overlays stay aligned. */

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenHost(): HTMLElement {
  return document.getElementById('game-container') ?? document.documentElement;
}

export function isAppFullscreen(): boolean {
  const doc = document as FsDoc;
  const current = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (!current) {
    return false;
  }
  const host = getFullscreenHost();
  return current === host || current === document.documentElement || current === document.body;
}

export async function enterAppFullscreen(): Promise<void> {
  if (isAppFullscreen()) {
    return;
  }
  const host = getFullscreenHost() as FsEl;
  const fallbacks: FsEl[] = [host, document.documentElement as FsEl];
  let lastError: unknown;
  for (const el of fallbacks) {
    const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!request) {
      continue;
    }
    try {
      await Promise.resolve(request());
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
}

export async function exitAppFullscreen(): Promise<void> {
  const doc = document as FsDoc;
  if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
    return;
  }
  const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc);
  if (!exit) {
    return;
  }
  await Promise.resolve(exit());
}

export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
