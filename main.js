const worker = new Worker("worker.js");
const log = document.getElementById("log");

document.getElementById("run").onclick = () => {
  log.textContent = "計算中...\n";
  worker.postMessage({ games: 1000 });
};

worker.onmessage = e => {
  log.textContent += e.data + "\n";
};
