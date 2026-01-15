(() => {
  postMessage({ type: "debug", text: "ai.js loaded (PatternBuilder AI)" });

  // 基本設定（チューニング可）
  const ROLLOUTS = 10;
  const MAX_ROLLOUT_TURNS = 160;
  const TOP_K = 3;
  const PATTERN_BONUS_WEIGHT = 6.0; // パターン進展をどれだけ重視するか（大きいほどパターン優先）
  const UNREGISTERED_GROWTH_BONUS = 3.0; // 未登録育成をロールアウト評価で追加する倍率

  // ヘルパー: クローン
  function cloneBoard(b) { return b.map(r => r.slice()); }

  // --- パターン検出 / 進展スコア ---
  // ここでの「トリプル」は横または縦に連続する3個の同色
  // 「パターン成立」は：トリプルの真上(同列)に別色(B)、その上に同色(A)が置かれている構造
  // patternScore(board) は既に成立しているパターンの数を返す（大きいほど良）
  function patternScore(board) {
    const H = board.length;
    const W = board[0].length;
    let score = 0;

    // 横トリプルチェック
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= W - 3; x++) {
        const a = board[y][x], b = board[y][x+1], c = board[y][x+2];
        if (a && a === b && b === c) {
          // 中央列 x+1 上方に B (!=a) とその上に a があるか
          const y1 = y + 1, y2 = y + 2;
          if (y2 < H) {
            const up1 = board[y1][x+1], up2 = board[y2][x+1];
            if (up1 && up2 && up2 === a && up1 !== a) score += 1;
          }
        }
      }
    }

    // 縦トリプルチェック（同じ列で3つ）
    for (let x = 0; x < W; x++) {
      for (let y = 0; y <= H - 3; y++) {
        const a = board[y][x], b = board[y+1][x], c = board[y+2][x];
        if (a && a === b && b === c) {
          // 上方に B とその上に a があるか
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

  // patternProgressScore(before, after): after が before に比べてパターンにどれだけ近づいたか
  function patternProgressScore(before, after) {
    const beforeS = patternScore(before);
    const afterS = patternScore(after);
    return afterS - beforeS;
  }

  // --- 未登録ぷよの検出と育成度評価 ---
  // 定義（簡略）: 「トリプルとその上のAとの間に挟まれているセル」を未登録とみなす
  // 未登録の個数がロールアウトで減少するほど育成が進んだとみなす。
  function countUnregistered(board) {
    const H = board.length;
    const W = board[0].length;
    let count = 0;

    // 横トリプルの上部をスキャンして間に挟まれたセルをカウント
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= W - 3; x++) {
        const a = board[y][x], b = board[y][x+1], c = board[y][x+2];
        if (a && a === b && b === c) {
          const y1 = y + 1, y2 = y + 2;
          if (y2 < H) {
            const up1 = board[y1][x+1], up2 = board[y2][x+1];
            if (up1 && up2 && up2 === a && up1 !== a) {
              // between: none in this simple model (we consider the immediate one as already B)
              // We instead count cells in a small neighborhood above the triple that are not matching
              // (treat them as "未登録")
              if (y1 < H && board[y1][x] && board[y1][x] !== a) count++;
              if (y1 < H && board[y1][x+2] && board[y1][x+2] !== a) count++;
            }
          }
        }
      }
    }

    // 縦トリプルの場合も類似の処理（簡略）
    for (let x = 0; x < W; x++) {
      for (let y = 0; y <= H - 3; y++) {
        const a = board[y][x], b = board[y+1][x], c = board[y+2][x];
        if (a && a === b && b === c) {
          const y1 = y + 3, y2 = y + 4;
          if (y2 < H) {
            const up1 = board[y1][x], up2 = board[y2][x];
            if (up1 && up2 && up2 === a && up1 !== a) {
              // count adjacent columns' cells at y+3 as unregistered candidates
              if (x-1 >= 0 && board[y1][x-1] && board[y1][x-1] !== a) count++;
              if (x+1 < W && board[y1][x+1] && board[y1][x+1] !== a) count++;
            }
          }
        }
      }
    }

    return count;
  }

  // --- 既存のロールアウト（ランダムプレイアウト）を使う ---
  function rolloutMaxChain(startBoard) {
    const b = cloneBoard(startBoard);
    let maxChainSeen = 0;
    for (let turn = 0; turn < MAX_ROLLOUT_TURNS; turn++) {
      const pair = randomPair();
      // 列挙可能手
      const moves = [];
      for (let x = 0; x < 6; x++) for (let rot = 0; rot < 4; rot++) {
        const tmp = cloneBoard(b);
        const ok = placePair(tmp, pair, { x: x, rot: rot });
        if (ok) moves.push({ x, rot });
      }
      if (moves.length === 0) break;
      const sel = moves[Math.floor(Math.random() * moves.length)];
      const applied = placePair(b, pair, { x: sel.x, rot: sel.rot });
      if (!applied) break;
      const chains = (function() {
        const res = simulateChain(b);
        if (typeof res === "number") return res;
        if (res && typeof res.chains === "number") return res.chains;
        return 0;
      })();
      if (chains > maxChainSeen) maxChainSeen = chains;
      if (b[12] && b[12][2] !== 0) break;
    }
    return maxChainSeen;
  }

  // evaluate candidate by rollouts but incorporate "未登録育成" improvement score
  function evaluateCandidateByRollouts(boardAfter, rollouts = ROLLOUTS) {
    const results = [];
    const beforeUnreg = countUnregistered(boardAfter);
    for (let r = 0; r < rollouts; r++) {
      const m = rolloutMaxChain(boardAfter);
      results.push(m);
    }
    results.sort((a,b)=>b-a);
    const use = Math.min(TOP_K, results.length);
    const top = results.slice(0, use);
    const avg = (top.length ? top.reduce((s,v)=>s+v,0)/top.length : 0);

    // ロールアウトのうち未登録の変化も評価（簡易）
    // Run a short randomized attempt to see whether unregistered decreases
    let unregImprovement = 0;
    // 1 quick probe
    const probeBoard = cloneBoard(boardAfter);
    // simulate a few random moves
    for (let t=0;t<20;t++){
      const pair = randomPair();
      const moves = [];
      for (let x=0;x<6;x++) for (let rot=0;rot<4;rot++){
        const tmp = cloneBoard(probeBoard);
        if (placePair(tmp, pair, {x, rot})) moves.push({x,rot});
      }
      if (moves.length===0) break;
      const sel = moves[Math.floor(Math.random()*moves.length)];
      placePair(probeBoard, randomPair(), {x: sel.x, rot: sel.rot}); // note: using randomPair again to simulate variance
    }
    const afterUnregProbe = countUnregistered(probeBoard);
    unregImprovement = (beforeUnreg - afterUnregProbe); // positive => improved

    // combine: avg chains + bonus for unregistered improvement
    const total = avg + (UNREGISTERED_GROWTH_BONUS * Math.max(0, unregImprovement));
    return total;
  }

  // enumerate candidates (try place on clone)
  function enumerateCandidates(board, pair) {
    const list = [];
    for (let x = 0; x < 6; x++) {
      for (let rot = 0; rot < 4; rot++) {
        const b = cloneBoard(board);
        const ok = placePair(b, pair, { x, rot });
        if (ok) list.push({ x, rot, board: b });
      }
    }
    return list;
  }

  // getBestMove: pattern-優先の総合ロジック
  function getBestMove(board, pair) {
    const candidates = enumerateCandidates(board, pair);
    if (candidates.length === 0) return { x: 2, rot: 0 };

    // まずパターン進展の即時評価（高速）
    let bestScore = -Infinity;
    let bestMove = { x: candidates[0].x, rot: candidates[0].rot };

    for (const c of candidates) {
      const patProgress = patternProgressScore(board, c.board);
      // 簡易短期スコア：即時のパターン進展が大きければ強く選ぶ
      let shortScore = patProgress * PATTERN_BONUS_WEIGHT;

      // もしパターン進展が顕著なら、ロールアウト数を減らしてでも優先
      let rolloutsForThis = (patProgress > 0) ? Math.max(4, Math.floor(ROLLOUTS/2)) : ROLLOUTS;

      const rolloutScore = evaluateCandidateByRollouts(c.board, rolloutsForThis);

      // combine
      const totalScore = shortScore + rolloutScore;

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
