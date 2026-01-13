postMessage({ type: "debug", text: "engine.js loaded" });

const WIDTH = 6;
const HEIGHT = 13;
const COLORS = [1,2,3,4];

function createBoard() {
  return Array.from({ length: HEIGHT }, () =>
    Array(WIDTH).fill(0)
  );
}

function randomPair() {
  return [
    COLORS[Math.floor(Math.random()*4)],
    COLORS[Math.floor(Math.random()*4)]
  ];
}

function cloneBoard(b) {
  return b.map(r => r.slice());
}

function simulateOneGame() {
  let board = createBoard();
  let maxChain = 0;

  for (let turn = 0; turn < 300; turn++) {
    const pair = randomPair();
    const move = PuyoAI.getBestMove(board, pair);
    if (!move) break;

    if (!placePair(board, pair, move)) break;

    const c = simulateChain(board);
    maxChain = Math.max(maxChain, c);

    if (board[12][2] !== 0) break;
  }
  return maxChain;
}

/* ---------- 落下・連鎖 ---------- */

function placePair(board, pair, move) {
  const { x, rot } = move;
  let cells = [{ x, y: 12, c: pair[0] }];

  if (rot === 0) cells.push({ x, y: 13, c: pair[1] });
  if (rot === 1) cells.push({ x:x+1, y:12, c: pair[1] });
  if (rot === 2) cells.push({ x, y:11, c: pair[1] });
  if (rot === 3) cells.push({ x:x-1, y:12, c: pair[1] });

  for (const p of cells) {
    if (p.x < 0 || p.x >= WIDTH) return false;
    let y = p.y;
    while (y > 0 && board[y-1][p.x] === 0) y--;
    if (y >= HEIGHT) return false;
    board[y][p.x] = p.c;
  }

  return true;
}

function simulateChain(board) {
  let chain = 0;
  while (true) {
    const removed = erase(board);
    if (!removed) break;
    fall(board);
    chain++;
  }
  return chain;
}

function erase(board) {
  const seen = Array.from({length:HEIGHT},
    ()=>Array(WIDTH).fill(false));
  let erased = false;

  for (let y=0;y<HEIGHT;y++){
    for (let x=0;x<WIDTH;x++){
      if (board[y][x] && !seen[y][x]) {
        const q=[[x,y]];
        const g=[];
        seen[y][x]=true;
        while(q.length){
          const [cx,cy]=q.pop();
          g.push([cx,cy]);
          [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{
            const nx=cx+dx, ny=cy+dy;
            if(nx>=0&&nx<WIDTH&&ny>=0&&ny<HEIGHT){
              if(!seen[ny][nx]&&board[ny][nx]===board[y][x]){
                seen[ny][nx]=true;
                q.push([nx,ny]);
              }
            }
          });
        }
        if(g.length>=4){
          erased=true;
          g.forEach(([gx,gy])=>board[gy][gx]=0);
        }
      }
    }
  }
  return erased;
}

function fall(board) {
  for (let x=0;x<WIDTH;x++){
    let w=0;
    for(let y=0;y<HEIGHT;y++){
      if(board[y][x]){
        board[w][x]=board[y][x];
        if(w!==y) board[y][x]=0;
        w++;
      }
    }
  }
}
