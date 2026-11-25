// Dame – Computer rechnet im Hintergrund, damit die Oberfläche flüssig bleibt.
importScripts('dame.js');
self.onmessage = e => {
  const { id, pos, depth, time, noise } = e.data;
  self.postMessage({ id, move: Dame.findBest(pos, depth, time, noise) });
};
