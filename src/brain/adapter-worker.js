// Appended after the MIT-licensed upstream worker. The LIF kernel is unchanged.
// No behavioral state machine or sensory-to-body bypass is used here.
var flyworldSides = null;
var flyworldMotor = { forward: 0, turn: 0, lift: 0, feed: 0 };
var flyworldFeatureTrace = null;
var flyworldTasteTrace = 0;
var flyworldContext = {};
var upstreamHandler = self.onmessage;
var upstreamPost = self.postMessage.bind(self);
var flyworldTickStartedAt = 0;
var flyworldRequestedRate = targetTickRate;
var flyworldAverageTickMs = 0;
var upstreamTick = tick;
tick = function () {
  flyworldTickStartedAt = performance.now();
  upstreamTick();
  var elapsed = performance.now() - flyworldTickStartedAt;
  flyworldAverageTickMs = flyworldAverageTickMs * 0.9 + elapsed * 0.1;
  // Leave roughly half the worker's time idle on slower devices; never queue catch-up ticks.
  targetTickRate = Math.min(
    flyworldRequestedRate,
    Math.max(1, 1000 / Math.max(1, flyworldAverageTickMs * 2)),
  );
};
self.onmessage = function (e) {
  // Change wall-clock cadence only; the upstream LIF equations and per-tick readout stay intact.
  if (e.data.type === 'setParams' && Number.isFinite(e.data.tickRate)) {
    flyworldRequestedRate = targetTickRate = Math.max(2, Math.min(30, e.data.tickRate));
  }
  if (e.data.type === 'sensory') {
    var input = e.data.input,
      indices = [],
      intensities = [];
    flyworldContext = input;
    var wakefulness = typeof input.wakefulness === 'number' ? input.wakefulness : 1;
    for (var i = 0; i < N; i++) {
      var s = flyworldSides[i],
        left = s === 1;
      var gain = 0;
      switch (groupId[i]) {
        case 0:
          gain =
            0.004 +
            0.006 *
              (left ? input.lightLeft || input.light : input.lightRight || input.light) *
              wakefulness +
            (left ? input.visionLeft : input.visionRight) * 0.02 +
            (left ? input.dangerLeft || 0 : input.dangerRight || 0) * 0.04;
          break;
        case 6:
          // Encode concentration and bilateral contrast below the firing ceiling.
          var meanOdor = (input.odorLeft + input.odorRight) * 0.5;
          var contrast = (left ? 1 : -1) * (input.odorLeft - input.odorRight);
          var socialL = input.socialLeft || 0,
            socialR = input.socialRight || 0;
          var explorationL = input.explorationLeft || 0,
            explorationR = input.explorationRight || 0;
          var habitatL = input.habitatLeft || 0,
            habitatR = input.habitatRight || 0;
          gain = Math.max(
            0,
            Math.min(
              0.06,
              0.002 +
                meanOdor * 0.028 +
                contrast * 0.12 +
                (socialL + socialR) * 0.006 +
                (left ? 1 : -1) * (socialL - socialR) * 0.04 +
                (explorationL + explorationR) * 0.008 +
                (left ? 1 : -1) * (explorationL - explorationR) * 0.04 +
                (habitatL + habitatR) * 0.01 +
                (left ? 1 : -1) * (habitatL - habitatR) * 0.05,
            ),
          );
          break;
        case 10:
          // Bilateral near-contact afferents; still propagate through the real kernel.
          gain = Math.min(
            0.28,
            input.touch * 0.22 +
              (left ? input.socialContactLeft || 0 : input.socialContactRight || 0) * 0.1 +
              (left ? input.dangerLeft || 0 : input.dangerRight || 0) * 0.16 +
              (input.disturbance || 0) * 0.035,
          );
          break;
        case 11:
          gain =
            input.wind * 0.065 +
            (left ? input.windLeft || 0 : input.windRight || 0) * 0.08 +
            (input.disturbance || 0) * 0.06;
          break;
        case 32:
          gain = input.taste * 0.25;
          break;
        case 14:
          gain = Math.max(0, input.temperature - 24) * 0.02;
          break;
      }
      if (gain > 0) {
        indices.push(i);
        intensities.push(gain);
      }
    }
    sustainedIndices = new Uint32Array(indices);
    sustainedIntensities = new Float32Array(intensities);
    return;
  }
  if (e.data.type === 'laterality') {
    flyworldSides = new Uint8Array(e.data.buffer);
    return;
  }
  if (e.data.type === 'reset') {
    flyworldMotor = { forward: 0, turn: 0, lift: 0, feed: 0 };
    flyworldFeatureTrace = null;
    flyworldTasteTrace = 0;
    flyworldContext = {};
  }
  upstreamHandler(e);
};
self.postMessage = function (message) {
  if (message.type === 'tick') {
    var countL = 0,
      countR = 0,
      spikeL = 0,
      spikeR = 0;
    // GNG_DESC contains the actual annotated descending neurons.
    for (var i = groupOffset[35]; i < groupOffset[36]; i++) {
      if (flyworldSides[i] === 1) {
        countL++;
        spikeL += fired[i];
      }
      if (flyworldSides[i] === 2) {
        countR++;
        spikeR += fired[i];
      }
    }
    var left = spikeL / Math.max(1, countL),
      right = spikeR / Math.max(1, countR);
    var rawForward = Math.min(1, (left + right) * 240);
    var rawTurn = Math.max(-1, Math.min(1, (left - right) * 180));
    var decoded = [0, 0, 0, 0];
    if (typeof flyworldReadout !== 'undefined' && flyworldReadout) {
      var model = flyworldReadout;
      if (!flyworldFeatureTrace) flyworldFeatureTrace = new Float32Array(model.indices.length);
      var drive = 0;
      for (var j = 0; j < model.indices.length; j++) {
        var index = groupOffset[35] + model.indices[j];
        var feature = Math.max(0, V[index]) / threshold + fired[index];
        drive += feature;
        flyworldFeatureTrace[j] = flyworldFeatureTrace[j] * 0.9 + feature * 0.1;
      }
      for (var channel = 0; channel < 4; channel++) {
        var value = model.weights[channel][0];
        for (var j = 0; j < model.indices.length; j++)
          value +=
            (model.weights[channel][j + 1] * (flyworldFeatureTrace[j] - model.means[j])) /
            model.scales[j];
        decoded[channel] = Math.max(0, Math.min(1, value));
      }
      // An engineered motor decoder of real descending activity, not a waypoint controller.
      // No world positions or raw sensory values enter this readout.
      var obstacle = Math.max(decoded[2], decoded[3]);
      rawForward =
        drive > 0.00001 ? (0.2 + (decoded[0] + decoded[1]) * 0.35) * (1 - obstacle * 0.4) : 0;
      rawTurn =
        drive > 0.00001
          ? Math.max(
              -0.65,
              Math.min(0.65, (decoded[1] - decoded[0]) * 6 + (decoded[2] - decoded[3]) * 1.5),
            )
          : 0;
    }
    flyworldMotor.forward = flyworldMotor.forward * 0.75 + rawForward * 0.25;
    flyworldMotor.turn = flyworldMotor.turn * 0.75 + rawTurn * 0.25;
    // These are engineered readouts, not a reconstruction of the VNC.
    // Feeding receives subthreshold synaptic activity in the filtered graph.
    // Decode membrane potential as well as spikes, gated by gustatory activity.
    var feedingPotential = 0;
    for (var i = groupOffset[29]; i < groupOffset[30]; i++) feedingPotential += Math.max(0, V[i]);
    var feedingDrive =
      feedingPotential / Math.max(1, groupOffset[30] - groupOffset[29]) / threshold;
    var tasteRate = message.groupSpikeCounts[32] / Math.max(1, groupOffset[33] - groupOffset[32]);
    flyworldTasteTrace = Math.max(flyworldTasteTrace * 0.85, Math.min(1, tasteRate * 8));
    var rawFeed = Math.min(1, feedingDrive * 400) * flyworldTasteTrace;
    flyworldMotor.feed = flyworldMotor.feed * 0.85 + rawFeed * 0.15;
    flyworldMotor.lift = 0; // FAFB does not include a validated flight motor circuit.
    // Additional normalized neural readings; engineering proxies, not named biological behaviors.
    var rate = function (group) {
      return (
        message.groupSpikeCounts[group] / Math.max(1, groupOffset[group + 1] - groupOffset[group])
      );
    };
    flyworldMotor.neural = {
      drive: Math.min(1, (typeof drive === 'number' ? drive : left + right) * 6),
      arousal: Math.min(1, Math.max(decoded[2], decoded[3]) * 0.8 + rate(10) * 2),
      tactile: Math.min(1, rate(10) * 2),
      wind: Math.min(1, rate(11) * 2),
      odorLeft: decoded[0],
      odorRight: decoded[1],
      obstacleLeft: decoded[2],
      obstacleRight: decoded[3],
      // Context-gated readings of propagated activity, not direct sensory motor orders.
      socialLeft: decoded[0] * Math.min(1, (flyworldContext.socialLeft || 0) * 2),
      socialRight: decoded[1] * Math.min(1, (flyworldContext.socialRight || 0) * 2),
      socialContact:
        Math.min(1, rate(10) * 3 + (left + right) * 4) * (flyworldContext.socialNear || 0),
      threat:
        Math.min(1, rate(10) * 3 + Math.max(decoded[2], decoded[3]) * 2) *
        Math.min(1, (flyworldContext.dangerLeft || 0) + (flyworldContext.dangerRight || 0)),
      startle: Math.min(1, rate(11) * 3 + rate(10) * 2) * (flyworldContext.disturbance || 0),
      sleepPressure:
        Math.min(1, rate(0) * 2 + (left + right) * 2) * (flyworldContext.sleepPressure || 0),
      heightPreference:
        Math.min(1, (typeof drive === 'number' ? drive : left + right) * 8) *
        (flyworldContext.heightPreference || 0),
    };
    var now = performance.now();
    upstreamPost({
      type: 'activity',
      tick: message.tickCount,
      fired: message.firedNeurons,
      neurons: N,
      edges: edgeCount,
      tickMs: now - flyworldTickStartedAt,
      groups: Array.from(message.groupSpikeCounts),
      // Expose the kernel's cheap group gate so the UI can distinguish a
      // propagated subthreshold signal from complete silence.
      groupActive: Array.from(groupActive),
      motor: { ...flyworldMotor },
      decoded: {
        odorLeft: decoded[0],
        odorRight: decoded[1],
        obstacleLeft: decoded[2],
        obstacleRight: decoded[3],
      },
    });
  } else upstreamPost(message);
};
