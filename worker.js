importScripts("engine.js", "ai.js");

onmessage = e => {
  const games = e.data.games;
  let maxChains = [];

  for (let i = 0; i < games; i++) {
    const c = simulateOneGame();
    maxChains.push(c);

    // ★ 進捗通知（毎局）
    postMessage({
      type: "progress",
      current: i + 1,
      total: games
    });
  }

  const avg =
    maxChains.reduce((a, b) => a + b, 0) / games;

  const over15 =
    maxChains.filter(v => v >= 15).length;

  postMessage({
    type: "result",
    text: `平均最大連鎖: ${avg.toFixed(2)}`
  });

  postMessage({
    type: "result",
    text: `15連鎖以上率: ${(over15 / games * 100).toFixed(2)}%`
  });
};
