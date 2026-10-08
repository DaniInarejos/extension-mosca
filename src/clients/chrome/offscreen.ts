import { MoskaRunner } from '../../core/runner';
import { webClock } from '../../adapters/web/clock';
import { webDeviceClient } from '../../adapters/web/device-client';
import { FlyWireAdapter } from '../../adapters/web/flywire';
import { volunteerCapacity } from '../../adapters/web/volunteer-capacity';
import type { ExtensionMessage } from './messages';

const runner = new MoskaRunner({
  device: webDeviceClient,
  clock: webClock,
  createBrain: (tickRate) => new FlyWireAdapter((path) => chrome.runtime.getURL(path), tickRate),
  volunteerCapacity: volunteerCapacity(),
  onStatus: async (status) => {
    await chrome.runtime.sendMessage({ type: 'RUNNER_STATUS', status } satisfies ExtensionMessage);
  },
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'RUNNER_START') void runner.start(message.config);
  if (message.type === 'RUNNER_STOP') runner.stop();
  if (message.type === 'RUNNER_SNAPSHOT') sendResponse(runner.snapshot());
});
