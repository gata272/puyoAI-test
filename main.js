// main.js
let worker = null;

const log = document.getElementById("log");
const runBtn = document.getElementById("run");

runBtn.onclick = () => {
  if (worker) worker.terminate();

  worker = new Worker("worker.js");

  log.textContent = "計算開始...\n";
  runBtn.disabled = true;

  worker.postMessage({ games: 1000 });

  worker.onmessage = e => {
    const msg = e.data;

    if (msg.type === "debug") {
      log.textContent += "[DEBUG] " + msg.text + "\n";
      return;
    }

    if (msg.type === "progress") {
      log.textContent =
        `進行: ${msg.played} / ${msg.total} 局\n` +
        `今回の最大連鎖: ${msg.lastMax}\n` +
        `平均最大連鎖: ${msg.avg.toFixed(2)}\n` +
        `15連鎖以上率: ${msg.rate15.toFixed(2)}%\n` +
        `最高記録: ${msg.best}\n`;
      return;
    }

    if (msg.type === "done") {
      log.textContent += "\n完了";
      runBtn.disabled = false;
      return;
    }

    if (msg.type === "error") {
      log.textContent += "\n❌ Worker Error:\n" + msg.message;
      runBtn.disabled = false;
    }
  };
};
