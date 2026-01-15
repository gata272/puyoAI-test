(() => {
  postMessage({ type: "debug", text: "ai.js loaded (PatternBuilder+Fire AI)" });

  // --- 調整パラメータ ---
  const ROLLOUTS = 10;
  const MAX_ROLLOUT_TURNS = 160;
  const TOP_K = 3;
  const PATTERN_BONUS_WEIGHT = 6.0;
  const UNREGISTERED_GROWTH_BONUS = 3.0;
  const FIRE_THRESHOLD = 10; // 「想定連鎖数」がこれを超えたら発火モードに移行

  // --- ヘルパー ---
  function cloneBoard(b) { return b.map(r => r.slice()); }
  function getChainsFromSim(res) {
    if (typeof res === "number") return res;
    if (res && typeof res.chains === "number") return res.chains;
    return 0;
  }

  // --- パターン検出 ---
  function patternScore(board) {
    const H = board.length;
    const W = board[0].length;
    let score = 0;
    // 横トリプル
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= W - 3; x++) {
        const a = board[y][x], b = board[y][x+1], c = board[y][x+2];
        if (a && a === b && b === c) {
          const y1 = y + 1, y2 = y + 2;
          if (y2 < H) {
            const up1 = board[y1][x+1], up2 = board[y2][x+1];
            if (up1 && up2 && up2 === a && up1 !== a) score += 1;
          }
        }
      }
    }
    // 縦トリプル
    for (let x = 0; x < W; x++) {
      for (let y = 0; y <= H - 3; y++) {
        const a = board[y][x], b = board[y+1][x], c = board[y+2][x];
        if (a && a === b && b === c) {
          const y1 = y + 3, y2 = y + 4;
          if (y2 < H) {
            const up1 = board[y1][x], up2 = board[y2][x];
            if (up1 && up2 && up2 === a && up1 !== a) score += 1;
          }
        }
      }
    }
    return score;
  }

  function patternProgressScore(before, after) {
    return patternScore(after) - patternScore(before);
  }

  // --- 未登録ぷよの簡易カウント（改良余地あり） ---
  function countUnregistered(board) {
    const H = board.length;
    const W = board[0].length;
    let count = 0;
    // 横トリプルの近傍
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= W - 3; x++) {
        const a = board[y][x], b = board[y][x+1], c = board[y][x+2];
        if (a && a === b && b === c) {
          const y1 = y + 1, y2 = y + 2;
          if (y2 < H) {
            const up1 = board[y1][x+1], up2 = board[y2][x+1];
            if (up1 && up2 && up2 === a && up1 !== a) {
              if (y1 < H && board[y1][x] && board[y1][x] !== a) count++;
              if (y1 < H && board[y1][x+2] && board[y1][x+2] !== a) count++;
            }
          }
        }
      }
    }
    // 縦トリプルの近傍
    for (let x = 0; x < W; x++) {
      for (let y = 0; y <= H - 3; y++) {
        const a = board[y][x], b = board[y+1][x], c = board[y+2][x];
        if (a && a === b && b === c) {
          const y1 = y + 3, y2 = y + 4;
          if (y2 < H) {
            const up1 = board[y1][x], up2 = board[y2][x];
            if (up1 && up2 && up2 === a && up1 !== a) {
              if (x-1 >= 0 && board[y1][x-1] && board[y1][x-1] !== a) count++;
              if (x+1 < W && board[y1][x+1] && board[y1][x+1] !== a) count++;
            }
          }
        }
      }
    }
    return count;
  }

  // --- ロールアウト（ランダムプレイアウト） ---
  function rolloutMaxChain(startBoard) {
    const b = cloneBoard(startBoard);
    let maxChainSeen = 0;
    for (let turn = 0; turn < MAX_ROLLOUT_TURNS; turn++) {
      const pair = (typeof randomPair === "function") ? randomPair() : [1,1];
      const moves = [];
      for (let x = 0; x < 6; x++) for (let rot = 0; rot < 4; rot++) {
        const tmp = cloneBoard(b);
        if (typeof placePair === "function") {
          const ok = placePair(tmp, pair, { x, rot });
          if (ok) moves.push({ x, rot });
        }
      }
      if (moves.length === 0) break;
      const sel = moves[Math.floor(Math.random() * moves.length)];
      const applied = placePair(b, pair, { x: sel.x, rot: sel.rot });
      if (!applied) break;
      const chains = getChainsFromSim(simulateChain(b));
      if (chains > maxChainSeen) maxChainSeen = chains;
      if (b[12] && b[12][2] !== 0) break;
    }
    return maxChainSeen;
  }

  function evaluateCandidateByRollouts(boardAfter, rollouts = ROLLOUTS) {
    const results = [];
    const beforeUnreg = countUnregistered(boardAfter);
    for (let r = 0; r < rollouts; r++) {
      results.push(rolloutMaxChain(boardAfter));
    }
    results.sort((a,b)=>b-a);
    const use = Math.min(TOP_K, results.length);
    const top = results.slice(0, use);
    const avg = (top.length ? top.reduce((s,v)=>s+v,0)/top.length : 0);

    // probe for unregistered improvement (軽量)
    const probeBoard = cloneBoard(boardAfter);
    for (let t=0;t<10;t++){
      const pair = (typeof randomPair === "function") ? randomPair() : [1,1];
      const moves = [];
      for (let x=0;x<6;x++) for (let rot=0;rot<4;rot++){
        const tmp = cloneBoard(probeBoard);
        if (placePair(tmp, pair, { x, rot })) moves.push({ x, rot });
      }
      if (moves.length===0) break;
      const sel = moves[Math.floor(Math.random()*moves.length)];
      placePair(probeBoard, pair, { x: sel.x, rot: sel.rot });
    }
    const afterUnregProbe = countUnregistered(probeBoard);
    const unregImprovement = (beforeUnreg - afterUnregProbe);

    const total = avg + (UNREGISTERED_GROWTH_BONUS * Math.max(0, unregImprovement));
    return total;
  }

  // 列挙（候補手）
  function enumerateCandidates(board, pair) {
    const list = [];
    for (let x = 0; x < 6; x++) for (let rot = 0; rot < 4; rot++) {
      const b = cloneBoard(board);
      if (placePair(b, pair, { x, rot })) list.push({ x, rot, board: b });
    }
    return list;
  }

  // --- 発火用：即時連鎖を最大化する手を返す ---
  function getFireMove(board, pair) {
    let best = -Infinity;
    let bestMove = { x: 2, rot: 0 };
    for (let x = 0; x < 6; x++) for (let rot = 0; rot < 4; rot++) {
      const b = cloneBoard(board);
      if (!placePair(b, pair, { x, rot })) continue;
      const chains = getChainsFromSim(simulateChain(b));
      if (chains > best) {
        best = chains;
        bestMove = { x, rot };
      }
      // ショートカット: 即10鎖以上なら即返す
      if (best >= FIRE_THRESHOLD) return bestMove;
    }
    return bestMove;
  }

  // --- メイン：getBestMove（パターン優先 + 発火判定） ---
  function getBestMove(board, pair) {
    // 1) 候補を生成
    const candidates = enumerateCandidates(board, pair);
    if (candidates.length === 0) return { x: 2, rot: 0 };

    // 2) まず短期パターン進展だけ速く評価して、早期除外（高速）
    let bestShortIdx = -1;
    let bestShortVal = -Infinity;
    const shortValues = [];
    for (let i=0;i<candidates.length;i++){
      const c = candidates[i];
      const patProgress = patternProgressScore(board, c.board);
      const shortScore = patProgress * PATTERN_BONUS_WEIGHT;
      shortValues.push(shortScore);
      if (shortScore > bestShortVal) { bestShortVal = shortScore; bestShortIdx = i; }
    }

    // 3) 各候補についてロールアウト期待値を算出し、想定連鎖数を求める
    let bestExpected = -Infinity;
    let bestExpectedIdx = -1;
    const expectedVals = new Array(candidates.length).fill(0);
    for (let i=0;i<candidates.length;i++){
      const c = candidates[i];
      // ロールアウト数はパターン進展がある候補は軽めに（高速化）
      const rolloutsForThis = (shortValues[i] > 0) ? Math.max(4, Math.floor(ROLLOUTS/2)) : ROLLOUTS;
      const exp = evaluateCandidateByRollouts(c.board, rolloutsForThis);
      expectedVals[i] = exp;
      if (exp > bestExpected) { bestExpected = exp; bestExpectedIdx = i; }
    }

    // 4) 発火判定：期待値が閾値を超えたら発火モードへ（getFireMove）
    if (bestExpected >= FIRE_THRESHOLD) {
      // 発火優先（選択は即時連鎖最大化）
      return getFireMove(board, pair);
    }

    // 5) 通常選択：pattern ボーナス と expected を合成して選ぶ
    let bestScore = -Infinity;
    let bestMove = { x: candidates[0].x, rot: candidates[0].rot };
    for (let i=0;i<candidates.length;i++){
      const c = candidates[i];
      const totalScore = expectedVals[i] + shortValues[i];
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = { x: c.x, rot: c.rot };
      }
    }
    return bestMove;
  }

  // Export
  self.PuyoAI = { getBestMove };
})();
