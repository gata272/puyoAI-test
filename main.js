let worker = null;

const log = document.getElementById("log");
const runBtn = document.getElementById("run");

runBtn.onclick = () => {
  // 既存 Worker があれば停止
  if (worker) {
    worker.terminate();
  }

  worker = new Worker("worker.js");

  log.textContent = "計算開始...\n";
  runBtn.disabled = true;

  worker.postMessage({ games: 1000 });

  worker.onmessage = e => {
    const msg = e.data;

    // ★ エラー表示（ここでやる）
    if (msg.type === "error") {
      log.textContent += "\n❌ Worker Error:\n" + msg.message;
      runBtn.disabled = false;
      return;
    }

    if (msg.type === "progress") {
      log.textContent =
        `計算中: ${msg.current} / ${msg.total} 局 完了`;
    }

    if (msg.type === "result") {
      log.textContent += "\n" + msg.text;
    }

    if (msg.type === "progress" && msg.current === msg.total) {
      log.textContent += "\n\n完了";
      runBtn.disabled = false;
    }
  };
};
