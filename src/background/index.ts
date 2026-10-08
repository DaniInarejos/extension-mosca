import {
  DEFAULT_CONFIG,
  IDLE_STATUS,
  type ExtensionConfig,
  type ExtensionMessage,
  type RunnerStatus,
} from '../shared';

const OFFSCREEN_PATH = 'offscreen.html';
let creating: Promise<void> | undefined;

async function config(): Promise<ExtensionConfig> {
  const saved = await chrome.storage.local.get('config');
  return {
    ...DEFAULT_CONFIG,
    ...(saved.config as Partial<ExtensionConfig> | undefined),
  };
}

async function status(): Promise<RunnerStatus> {
  const saved = await chrome.storage.local.get('status');
  return (saved.status as RunnerStatus | undefined) ?? IDLE_STATUS;
}

async function flySnapshot() {
  if (!(await hasOffscreen())) return undefined;
  try {
    return await chrome.runtime.sendMessage({
      type: 'RUNNER_SNAPSHOT',
    } satisfies ExtensionMessage);
  } catch {
    return undefined;
  }
}

async function hasOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Ejecutar el cerebro FlyWire y la física de la mosca.',
      })
      .finally(() => {
        creating = undefined;
      });
  }
  await creating;
}

async function start(next: ExtensionConfig) {
  await chrome.storage.local.set({ config: next });
  await ensureOffscreen();
  await chrome.runtime.sendMessage({
    type: 'RUNNER_START',
    config: next,
  } satisfies ExtensionMessage);
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.url?.endsWith(OFFSCREEN_PATH) && message.type === 'RUNNER_STATUS') {
    void chrome.storage.local.set({ status: message.status });
    return;
  }
  void (async () => {
    if (message.type === 'GET_STATE')
      return {
        config: await config(),
        status: await status(),
        fly: await flySnapshot(),
      };
    if (message.type === 'START') {
      const next = { ...message.config, enabled: true };
      await start(next);
      return { ok: true };
    }
    if (message.type === 'STOP') {
      const next = { ...(await config()), enabled: false };
      await chrome.storage.local.set({ config: next, status: IDLE_STATUS });
      if (await hasOffscreen()) {
        await chrome.runtime.sendMessage({
          type: 'RUNNER_STOP',
        } satisfies ExtensionMessage);
        await chrome.offscreen.closeDocument();
      }
      return { ok: true };
    }
  })().then(sendResponse, (error: unknown) => sendResponse({ error: String(error) }));
  return true;
});

async function resume() {
  const saved = await config();
  if (saved.enabled && saved.token) await start(saved);
}

chrome.runtime.onStartup.addListener(() => void resume());
chrome.runtime.onInstalled.addListener(() => void resume());
void resume();
