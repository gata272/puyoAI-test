// ===== worker.js =====

// Worker 起動確認
postMessage({ type: "debug", text: "worker.js 起動" });

// Worker 内エラー捕捉（importScripts 以外）
onerror = e => {
  postMessage({
    type: "error",
    message: String(e.message || "unknown error")
  });
};

// engine.js / ai.js 読み込み
postMessage({ type: "debug", text: "importScripts 前" });
importScripts("engine.js");
importScripts("ai.js");
postMessage({ type: "debug", text: "importScripts 後" });

onmessage = e => {
  const games = e.data.games || 0;
  let maxChains = [];

  for (let i = 0; i < games; i++) {
    let c = 0;
    try {
      c = simulateOneGame(); // engine.js に定義されている前提
    } catch (err) {
      postMessage({
        type: "error",
        message: "simulateOneGame error: " + err.message
      });
      return;
    }

    maxChains.push(c);

    // 進捗通知（毎局）
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

  postMessage({ type: "done" });
};
