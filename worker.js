// worker.js
onerror = e => {
  postMessage({
    type: "error",
    message: (e && e.message) ? e.message : "unknown error"
  });
};

importScripts("engine.js", "ai.js");

postMessage({ type: "debug", text: "worker.js loaded" });

onmessage = e => {
  const games = e.data.games;

  let played = 0;
  let sumMaxChain = 0;
  let over15Count = 0;
  let bestEver = 0;

  for (let i = 0; i < games; i++) {
    const maxChain = simulateOneGame();

    played++;
    sumMaxChain += maxChain;
    if (maxChain >= 15) over15Count++;
    if (maxChain > bestEver) bestEver = maxChain;

    // ★ 毎局送信
    postMessage({
      type: "progress",
      played,
      total: games,
      lastMax: maxChain,
      avg: sumMaxChain / played,
      rate15: over15Count / played * 100,
      best: bestEver
    });
  }

  postMessage({ type: "done" });
};
