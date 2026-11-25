// Schach – Computergegner im Hintergrund, damit die Oberfläche flüssig bleibt.
importScripts('engine.js');

self.onmessage = function (e) {
  const d = e.data;
  const engine = new Engine();
  const move = engine.findBest(Position.fromObj(d.pos), d.depth, d.time, d.noise);
  self.postMessage({ id: d.id, move: move, depth: engine.lastDepth, nodes: engine.nodes });
};
