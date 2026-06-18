const SIZE = 4;
const WIN_VALUE = 2048;
const STORAGE_KEY = "twenty48-bloom-best";
const MOVE_MS = 170;

const boardEl = document.querySelector("#board");
const gridEl = document.querySelector(".grid");
const tileLayer = document.querySelector("#tile-layer");
const scoreEl = document.querySelector("#score");
const bestScoreEl = document.querySelector("#best-score");
const newGameButton = document.querySelector("#new-game");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const keepPlayingButton = document.querySelector("#keep-playing");
const modalNewGameButton = document.querySelector("#modal-new-game");

let board = [];
let tiles = new Map();
let nextTileId = 1;
let score = 0;
let bestScore = Number(localStorage.getItem(STORAGE_KEY)) || 0;
let hasWon = false;
let keepPlaying = false;
let locked = false;
let touchStart = null;

const directions = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  a: "left",
  A: "left",
  s: "down",
  S: "down",
  d: "right",
  D: "right"
};

function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function createTile(value, row, col) {
  return {
    id: nextTileId++,
    value,
    row,
    col,
    previousRow: row,
    previousCol: col,
    merged: false,
    fresh: true
  };
}

function setupGrid() {
  gridEl.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    gridEl.append(cell);
  }
}

function startGame() {
  board = createEmptyBoard();
  tiles = new Map();
  nextTileId = 1;
  score = 0;
  hasWon = false;
  keepPlaying = false;
  locked = false;
  hideModal();
  addRandomTile();
  addRandomTile();
  updateScore();
  render();
  boardEl.focus({ preventScroll: true });
}

function addRandomTile() {
  const emptyCells = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!board[row][col]) emptyCells.push({ row, col });
    }
  }

  if (!emptyCells.length) return;
  const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const tile = createTile(Math.random() < 0.9 ? 2 : 4, cell.row, cell.col);
  board[cell.row][cell.col] = tile;
  tiles.set(tile.id, tile);
}

function render() {
  tileLayer.innerHTML = "";
  const orderedTiles = [...tiles.values()].sort((a, b) => a.id - b.id);

  for (const tile of orderedTiles) {
    const tileEl = document.createElement("div");
    tileEl.className = "tile";
    if (tile.fresh) tileEl.classList.add("spawn");
    if (tile.merged) tileEl.classList.add("merge");
    tileEl.dataset.value = String(tile.value);
    const startCol = tile.fresh ? tile.col : tile.previousCol;
    const startRow = tile.fresh ? tile.row : tile.previousRow;
    tileEl.style.setProperty("--x", startCol);
    tileEl.style.setProperty("--y", startRow);
    tileEl.innerHTML = `<span>${tile.value}</span>`;
    tileLayer.append(tileEl);
    if (!tile.fresh && (startCol !== tile.col || startRow !== tile.row)) {
      requestAnimationFrame(() => {
        tileEl.style.setProperty("--x", tile.col);
        tileEl.style.setProperty("--y", tile.row);
      });
    }
    tile.fresh = false;
    tile.merged = false;
  }
}

function updateScore() {
  scoreEl.textContent = String(score);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(STORAGE_KEY, String(bestScore));
  }
  bestScoreEl.textContent = String(bestScore);
}

function move(direction) {
  if (locked || isModalBlocking()) return;
  const result = buildMove(direction);
  if (!result.moved) return;

  locked = true;
  board = result.board;
  score += result.scoreGain;
  updateScore();
  render();

  window.setTimeout(() => {
    addRandomTile();
    render();
    locked = false;
    checkGameState();
  }, MOVE_MS);
}

function buildMove(direction) {
  const nextBoard = createEmptyBoard();
  const mergedSources = new Set();
  const scoreGain = { value: 0 };
  let moved = false;
  const lines = getLines(direction);

  for (const line of lines) {
    const compacted = [];

    for (const position of line) {
      const tile = board[position.row][position.col];
      if (!tile) continue;
      tile.previousRow = tile.row;
      tile.previousCol = tile.col;

      const last = compacted[compacted.length - 1];
      if (last && last.value === tile.value && !last.mergeTarget) {
        last.mergeTarget = tile;
        tile.removeAfterMove = true;
        mergedSources.add(tile.id);
        last.value *= 2;
        last.merged = true;
        scoreGain.value += last.value;
      } else {
        compacted.push(tile);
      }
    }

    compacted.forEach((tile, index) => {
      const destination = line[index];
      if (tile.row !== destination.row || tile.col !== destination.col) moved = true;
      tile.row = destination.row;
      tile.col = destination.col;
      nextBoard[destination.row][destination.col] = tile;
    });
  }

  for (const tile of tiles.values()) {
    if (tile.removeAfterMove) {
      moved = true;
      tiles.delete(tile.id);
    }
    delete tile.removeAfterMove;
    delete tile.mergeTarget;
  }

  if (!moved) {
    for (const tile of tiles.values()) {
      tile.row = tile.previousRow;
      tile.col = tile.previousCol;
      tile.merged = false;
    }
    return { moved: false, board, scoreGain: 0 };
  }

  return { moved, board: nextBoard, scoreGain: scoreGain.value, mergedSources };
}

function getLines(direction) {
  const lines = [];
  const indexes = Array.from({ length: SIZE }, (_, index) => index);
  const reversed = [...indexes].reverse();

  if (direction === "left" || direction === "right") {
    for (let row = 0; row < SIZE; row += 1) {
      const cols = direction === "left" ? indexes : reversed;
      lines.push(cols.map((col) => ({ row, col })));
    }
  }

  if (direction === "up" || direction === "down") {
    for (let col = 0; col < SIZE; col += 1) {
      const rows = direction === "up" ? indexes : reversed;
      lines.push(rows.map((row) => ({ row, col })));
    }
  }

  return lines;
}

function checkGameState() {
  const wonNow = [...tiles.values()].some((tile) => tile.value >= WIN_VALUE);
  if (wonNow && !hasWon && !keepPlaying) {
    hasWon = true;
    showModal("You Win!", "You reached 2048. Keep going to beat your best score.", true);
    return;
  }

  if (!hasAvailableMoves()) {
    showModal("Garden Full", `Final score: ${score}. Start a fresh board and try another route.`, false);
  }
}

function hasAvailableMoves() {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const tile = board[row][col];
      if (!tile) return true;
      const right = col < SIZE - 1 ? board[row][col + 1] : null;
      const down = row < SIZE - 1 ? board[row + 1][col] : null;
      if ((right && right.value === tile.value) || (down && down.value === tile.value)) return true;
    }
  }
  return false;
}

function showModal(title, message, canContinue) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  keepPlayingButton.hidden = !canContinue;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  const target = canContinue ? keepPlayingButton : modalNewGameButton;
  target.focus({ preventScroll: true });
}

function hideModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function isModalBlocking() {
  return modal.classList.contains("show");
}

function handleKeydown(event) {
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  move(direction);
}

function handleTouchStart(event) {
  if (!event.changedTouches.length) return;
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}

function handleTouchMove(event) {
  if (touchStart) event.preventDefault();
}

function handleTouchEnd(event) {
  if (!touchStart || !event.changedTouches.length) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 32) return;
  move(absX > absY ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
}

newGameButton.addEventListener("click", startGame);
modalNewGameButton.addEventListener("click", startGame);
keepPlayingButton.addEventListener("click", () => {
  keepPlaying = true;
  hideModal();
  boardEl.focus({ preventScroll: true });
});

window.addEventListener("keydown", handleKeydown);
boardEl.addEventListener("touchstart", handleTouchStart, { passive: true });
boardEl.addEventListener("touchmove", handleTouchMove, { passive: false });
boardEl.addEventListener("touchend", handleTouchEnd, { passive: true });

setupGrid();
startGame();
