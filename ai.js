(() => {
  // デバッグログ（Worker内で安全）
  postMessage({ type: "debug", text: "ai.js loaded (LargeChain AI)" });

  // 設定（チューニング可）
  const ROLLOUTS = 12;            // 各候補でのランダムプレイアウト回数（多いほど精度↑、遅くなる）
  const MAX_ROLLOUT_TURNS = 200;  // ロールアウト内の手数上限（ゲームが長くなり過ぎないように）
  const TOP_K = 3;                // ロールアウト結果の上位k平均で候補評価（楽観的評価）

  // ヘルパー: 深いクローン（boardは小さいので問題なし）
  function cloneBoard(b) {
    return b.map(row => row.slice());
  }

  // ヘルパー: その盤面に対して与えられた pair と (x,rot) を置き、成功なら true（board は変更される）
  // ここでは engine.js の placePair(board, pair, move) を利用（mutate）
  // ただし placePair は {x, rot} を期待するため合わせる
  function tryPlaceOnClone(board, pair, x, rot) {
    const b = cloneBoard(board);
    const ok = placePair(b, pair, { x: x, rot: rot });
    return ok ? b : null;
  }

  // 有効手を列挙（戻り値: [{x, rot, boardAfter}]）
  function enumerateCandidates(board, pair) {
    const list = [];
    for (let x = 0; x < 6; x++) {
      for (let rot = 0; rot < 4; rot++) {
        const bAfter = tryPlaceOnClone(board, pair, x, rot);
        if (bAfter) {
          list.push({ x, rot, board: bAfter });
        }
      }
    }
    return list;
  }

  // ロールアウト：与えられた盤面からランダムに継続プレイして「そのロールアウト中に得られた最大連鎖数」を返す
  function rolloutMaxChain(startBoard) {
    const b = cloneBoard(startBoard);
    let maxChainSeen = 0;
    // 手数制限を置く（ロールアウト内での長時間停止防止）
    for (let turn = 0; turn < MAX_ROLLOUT_TURNS; turn++) {
      // ランダムツモ
      const pair = randomPair(); // engine.js 提供
      // 列挙してランダムに1手選ぶ（ランダムポリシー）
      const moves = [];
      for (let x = 0; x < 6; x++) for (let rot = 0; rot < 4; rot++) {
        const tmp = tryPlaceOnClone(b, pair, x, rot);
        if (tmp) moves.push({ x, rot, board: tmp });
      }
      if (moves.length === 0) break; // 置けない＝ゲームオーバー
      // 選択：ランダムに選ぶ（均一）
      const sel = moves[Math.floor(Math.random() * moves.length)];
      // apply move into real b (mutate)
      const applied = placePair(b, pair, { x: sel.x, rot: sel.rot });
      if (!applied) break; // 安全策
      // 連鎖判定（simulateChain は engine.js にある、戻り値は数値またはオブジェクト）
      const chains = (function() {
        const res = simulateChain(b);
        // engine.simulateChain 版は数値を返す実装もあるため安全に扱う
        if (typeof res === "number") return res;
        if (res && typeof res.chains === "number") return res.chains;
        return 0;
      })();
      if (chains > maxChainSeen) maxChainSeen = chains;
      // ゲームオーバー判定（engine 側と一致する条件）
      // engine uses board[12][2] !== 0 for over; height might be 13 -> index 12 is top visible
      if (b[12] && b[12][2] !== 0) break;
    }
    return maxChainSeen;
  }

  // 候補の期待評価（上位 K の平均を返す — 大連鎖狙いで楽観的）
  function evaluateCandidateByRollouts(boardAfter, rollouts = ROLLOUTS) {
    const results = [];
    for (let r = 0; r < rollouts; r++) {
      const m = rolloutMaxChain(boardAfter);
      results.push(m);
    }
    results.sort((a,b)=>b-a); // 降順
    // 平均をとるが上位 TOP_K を使う（楽観評価）
    const use = Math.min(TOP_K, results.length);
    if (use === 0) return 0;
    const top = results.slice(0, use);
    const avg = top.reduce((s,v)=>s+v,0)/use;
    return avg;
  }

  // メイン公開関数
  // board: 盤面配列（engine.js の形式） , pair: [mainColor, subColor] （randomPair と同形式）
  // 戻り値: { x, rot } のフォーマット（simulateOneGame の placePair と整合）
  function getBestMove(board, pair) {
    // 1) 候補列挙（初手）
    const candidates = enumerateCandidates(board, pair);
    if (candidates.length === 0) {
      // 置けない（ゲームオーバー）…安全なダミー
      return { x: 2, rot: 0 };
    }

    // 2) すぐに連鎖が発生する候補は超優先（即発火の可能性を無視しない）
    for (const c of candidates) {
      // simulate immediate chain
      const chains = (function() {
        const res = simulateChain(cloneBoard(c.board));
        if (typeof res === "number") return res;
        if (res && typeof res.chains === "number") return res.chains;
        return 0;
      })();
      if (chains >= 8) {
        // 既に大連鎖が起きるなら即選択（ショートカット）
        return { x: c.x, rot: c.rot };
      }
    }

    // 3) 各候補をロールアウトで評価（並列にはしていないが十分）
    let bestScore = -Infinity;
    let bestMove = { x: candidates[0].x, rot: candidates[0].rot };

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      // evaluate by rollouts
      const score = evaluateCandidateByRollouts(c.board, ROLLOUTS);
      // tie-breaker: 高さの分散や縦3の数を軽く考慮（補正）
      const bonus = (function(){
        // count vertical 3s in boardAfter
        let v3 = 0;
        for (let col=0; col<6; col++){
          let streak=1;
          for (let y=1;y<12;y++){
            if (c.board[y][col] && c.board[y][col] === c.board[y-1][col]) streak++;
            else {
              if (streak===3) v3++;
              streak=1;
            }
          }
        }
        return v3 * 0.5; // small bonus
      })();

      const totalScore = score + bonus;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = { x: c.x, rot: c.rot };
      }
    }

    return bestMove;
  }

  // エクスポート
  self.PuyoAI = { getBestMove };
})();
