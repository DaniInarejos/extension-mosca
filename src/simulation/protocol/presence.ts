/** Presence visible to the garden, whether driven by its owner, a host or a companion device. */
export function flyIsOnline(fly: {
  connected: boolean;
  hosted?: boolean;
  companionConnected?: boolean;
}) {
  return fly.connected || fly.hosted === true || fly.companionConnected === true;
}
