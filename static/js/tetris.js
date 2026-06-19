/**
 * Tetris Game - Complete implementation
 */

class Tetris {
  constructor() {
    // Canvas setup
    this.canvas = document.getElementById('tetrisCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById('nextCanvas');
    this.nextCtx = this.nextCanvas.getContext('2d');
    
    // Game constants
    this.cols = 10;
    this.rows = 20;
    this.blockSize = 30;
    
    // Game state
    this.board = [];
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    
    // Current piece
    this.currentPiece = null;
    this.nextPiece = null;
    this.currentX = 0;
    this.currentY = 0;
    
    // Timing
    this.dropCounter = 0;
    this.dropInterval = 1000;
    this.lastTime = 0;
    
    // Tetromino shapes
    this.pieces = [
      // I
      [[1, 1, 1, 1]],
      // O
      [[1, 1], [1, 1]],
      // T
      [[0, 1, 0], [1, 1, 1]],
      // S
      [[0, 1, 1], [1, 1, 0]],
      // Z
      [[1, 1, 0], [0, 1, 1]],
      // J
      [[1, 0, 0], [1, 1, 1]],
      // L
      [[0, 0, 1], [1, 1, 1]]
    ];
    
    // Colors for each piece type
    this.colors = [
      '#00f0f0', // I - Cyan
      '#f0f000', // O - Yellow
      '#a000f0', // T - Purple
      '#00f000', // S - Green
      '#f00000', // Z - Red
      '#0000f0', // J - Blue
      '#f0a000'  // L - Orange
    ];
    
    // UI elements
    this.scoreEl = document.getElementById('score');
    this.levelEl = document.getElementById('level');
    this.linesEl = document.getElementById('lines');
    this.highScoreEl = document.getElementById('highScore');
    this.overlay = document.getElementById('gameOverlay');
    this.overlayTitle = document.getElementById('overlayTitle');
    this.overlayMessage = document.getElementById('overlayMessage');
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.restartBtn = document.getElementById('restartBtn');
    
    // Mobile touch controls
    this.btnLeft = document.getElementById('btnLeft');
    this.btnRight = document.getElementById('btnRight');
    this.btnDown = document.getElementById('btnDown');
    this.btnRotate = document.getElementById('btnRotate');
    this.btnDrop = document.getElementById('btnDrop');
    this.tetrisBoard = document.getElementById('tetrisBoard');
    
    // Touch state
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.longPressTimer = null;
    this.longPressInterval = null;
    
    this.init();
  }

  init() {
    // Load high score
    this.highScore = parseInt(localStorage.getItem('tetrisHighScore') || '0');
    this.highScoreEl.textContent = this.highScore;
    
    // Initialize board
    this.resetBoard();
    
    // Event listeners - buttons
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.restartBtn.addEventListener('click', () => this.restart());
    
    document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    
    // Mobile touch controls
    this.setupTouchControls();
    
    // Draw initial state
    this.draw();
  }

  resetBoard() {
    this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(0));
  }

  start() {
    this.started = true;
    this.gameOver = false;
    this.paused = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropInterval = 1000;
    
    this.resetBoard();
    this.spawnPiece();
    this.nextPiece = this.getRandomPiece();
    
    this.overlay.classList.add('hidden');
    this.updateUI();
    
    this.lastTime = performance.now();
    this.gameLoop();
  }

  restart() {
    this.start();
  }

  togglePause() {
    if (!this.started || this.gameOver) return;
    
    this.paused = !this.paused;
    if (this.paused) {
      this.showOverlay('暂停', '按空格键继续');
    } else {
      this.overlay.classList.add('hidden');
      this.lastTime = performance.now();
      this.gameLoop();
    }
  }

  getRandomPiece() {
    const type = Math.floor(Math.random() * this.pieces.length);
    return {
      shape: this.pieces[type],
      color: this.colors[type],
      type: type
    };
  }

  spawnPiece() {
    if (this.nextPiece) {
      this.currentPiece = this.nextPiece;
    } else {
      this.currentPiece = this.getRandomPiece();
    }
    
    this.nextPiece = this.getRandomPiece();
    this.currentX = Math.floor((this.cols - this.currentPiece.shape[0].length) / 2);
    this.currentY = 0;
    
    // Check if game over
    if (this.collides(this.currentX, this.currentY, this.currentPiece.shape)) {
      this.endGame();
    }
    
    this.drawNextPiece();
  }

  collides(x, y, shape) {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const newX = x + col;
          const newY = y + row;
          
          if (newX < 0 || newX >= this.cols || newY >= this.rows) {
            return true;
          }
          
          if (newY >= 0 && this.board[newY][newX]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  merge() {
    const shape = this.currentPiece.shape;
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const y = this.currentY + row;
          const x = this.currentX + col;
          if (y >= 0) {
            this.board[y][x] = this.currentPiece.color;
          }
        }
      }
    }
  }

  rotate(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const rotated = Array(cols).fill(null).map(() => Array(rows).fill(0));
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        rotated[col][rows - 1 - row] = shape[row][col];
      }
    }
    return rotated;
  }

  clearLines() {
    let linesCleared = 0;
    
    for (let row = this.rows - 1; row >= 0; row--) {
      if (this.board[row].every(cell => cell !== 0)) {
        this.board.splice(row, 1);
        this.board.unshift(Array(this.cols).fill(0));
        linesCleared++;
        row++; // Check the same row again
      }
    }
    
    if (linesCleared > 0) {
      this.lines += linesCleared;
      this.score += [0, 100, 300, 500, 800][linesCleared] * this.level;
      this.level = Math.floor(this.lines / 10) + 1;
      this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
      this.updateUI();
    }
  }

  drop() {
    if (!this.collides(this.currentX, this.currentY + 1, this.currentPiece.shape)) {
      this.currentY++;
    } else {
      this.merge();
      this.clearLines();
      this.spawnPiece();
    }
    this.dropCounter = 0;
  }

  move(dir) {
    if (!this.collides(this.currentX + dir, this.currentY, this.currentPiece.shape)) {
      this.currentX += dir;
    }
  }

  rotatePiece() {
    const rotated = this.rotate(this.currentPiece.shape);
    if (!this.collides(this.currentX, this.currentY, rotated)) {
      this.currentPiece.shape = rotated;
    }
  }

  handleKeyPress(e) {
    if (!this.started || this.gameOver) {
      if (e.code === 'Space') {
        e.preventDefault();
        this.start();
      }
      return;
    }
    
    if (e.code === 'Space') {
      e.preventDefault();
      this.togglePause();
      return;
    }
    
    if (this.paused) return;
    
    switch (e.code) {
      case 'ArrowLeft':
        e.preventDefault();
        this.move(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.move(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.drop();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.rotatePiece();
        break;
    }
    
    this.draw();
  }

  setupTouchControls() {
    // Button controls with long-press support
    const setupButton = (btn, action, repeatDelay = 150) => {
      if (!btn) return;
      
      let timer = null;
      let interval = null;
      
      const startAction = (e) => {
        e.preventDefault();
        if (!this.started || this.gameOver) {
          if (action === 'drop' || action === 'rotate') this.start();
          return;
        }
        if (this.paused) return;
        
        action === 'left' && this.move(-1);
        action === 'right' && this.move(1);
        action === 'down' && this.drop();
        action === 'rotate' && this.rotatePiece();
        action === 'drop' && this.hardDrop();
        this.draw();
        
        // Long press repeat for directional buttons
        if (['left', 'right', 'down'].includes(action)) {
          timer = setTimeout(() => {
            interval = setInterval(() => {
              if (this.paused || !this.started) {
                clearInterval(interval);
                return;
              }
              action === 'left' && this.move(-1);
              action === 'right' && this.move(1);
              action === 'down' && this.drop();
              this.draw();
            }, repeatDelay);
          }, 300);
        }
      };
      
      const stopAction = (e) => {
        e.preventDefault();
        clearTimeout(timer);
        clearInterval(interval);
      };
      
      btn.addEventListener('touchstart', startAction, { passive: false });
      btn.addEventListener('touchend', stopAction, { passive: false });
      btn.addEventListener('touchcancel', stopAction, { passive: false });
      btn.addEventListener('mousedown', startAction);
      btn.addEventListener('mouseup', stopAction);
      btn.addEventListener('mouseleave', stopAction);
    };
    
    setupButton(this.btnLeft, 'left');
    setupButton(this.btnRight, 'right');
    setupButton(this.btnDown, 'down');
    setupButton(this.btnRotate, 'rotate');
    setupButton(this.btnDrop, 'drop');
    
    // Swipe gestures on game board
    if (this.tetrisBoard) {
      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let isSwiping = false;
      
      this.tetrisBoard.addEventListener('touchstart', (e) => {
        if (!this.started || this.gameOver || this.paused) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        isSwiping = true;
      }, { passive: true });
      
      this.tetrisBoard.addEventListener('touchmove', (e) => {
        if (!isSwiping || !this.started || this.paused) return;
        e.preventDefault();
      }, { passive: false });
      
      this.tetrisBoard.addEventListener('touchend', (e) => {
        if (!isSwiping || !this.started || this.gameOver || this.paused) {
          isSwiping = false;
          return;
        }
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const deltaTime = Date.now() - startTime;
        const minSwipe = 30;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          if (Math.abs(deltaX) > minSwipe) {
            this.move(deltaX > 0 ? 1 : -1);
            this.draw();
          }
        } else {
          // Vertical swipe
          if (deltaY > minSwipe && deltaTime < 300) {
            // Quick swipe down = hard drop
            this.hardDrop();
            this.draw();
          } else if (deltaY > minSwipe) {
            this.drop();
            this.draw();
          } else if (deltaY < -minSwipe) {
            // Swipe up = rotate
            this.rotatePiece();
            this.draw();
          }
        }
        
        isSwiping = false;
      }, { passive: true });
      
      // Double tap to rotate
      let lastTap = 0;
      this.tetrisBoard.addEventListener('touchend', (e) => {
        if (!this.started || this.gameOver || this.paused) return;
        const now = Date.now();
        if (now - lastTap < 300) {
          this.rotatePiece();
          this.draw();
        }
        lastTap = now;
      }, { passive: true });
    }
  }

  hardDrop() {
    while (!this.collides(this.currentX, this.currentY + 1, this.currentPiece.shape)) {
      this.currentY++;
      this.score += 2;
    }
    this.merge();
    this.clearLines();
    this.spawnPiece();
    this.updateUI();
  }

  endGame() {
    this.gameOver = true;
    this.started = false;
    
    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('tetrisHighScore', this.highScore.toString());
      this.highScoreEl.textContent = this.highScore;
    }
    
    this.showOverlay('游戏结束', `最终得分: ${this.score}`);
  }

  showOverlay(title, message) {
    this.overlayTitle.textContent = title;
    this.overlayMessage.textContent = message;
    this.overlay.classList.remove('hidden');
  }

  updateUI() {
    this.scoreEl.textContent = this.score;
    this.levelEl.textContent = this.level;
    this.linesEl.textContent = this.lines;
  }

  draw() {
    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw board
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.board[row][col]) {
          this.drawBlock(this.ctx, col, row, this.board[row][col]);
        }
      }
    }
    
    // Draw current piece
    if (this.currentPiece) {
      const shape = this.currentPiece.shape;
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            this.drawBlock(this.ctx, this.currentX + col, this.currentY + row, this.currentPiece.color);
          }
        }
      }
    }
    
    // Draw grid lines
    this.ctx.strokeStyle = '#222';
    this.ctx.lineWidth = 1;
    for (let row = 0; row <= this.rows; row++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, row * this.blockSize);
      this.ctx.lineTo(this.canvas.width, row * this.blockSize);
      this.ctx.stroke();
    }
    for (let col = 0; col <= this.cols; col++) {
      this.ctx.beginPath();
      this.ctx.moveTo(col * this.blockSize, 0);
      this.ctx.lineTo(col * this.blockSize, this.canvas.height);
      this.ctx.stroke();
    }
  }

  drawBlock(ctx, x, y, color) {
    const px = x * this.blockSize;
    const py = y * this.blockSize;
    
    ctx.fillStyle = color;
    ctx.fillRect(px, py, this.blockSize, this.blockSize);
    
    // Add highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(px, py, this.blockSize, 2);
    ctx.fillRect(px, py, 2, this.blockSize);
    
    // Add shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(px + this.blockSize - 2, py, 2, this.blockSize);
    ctx.fillRect(px, py + this.blockSize - 2, this.blockSize, 2);
  }

  drawNextPiece() {
    this.nextCtx.fillStyle = '#000';
    this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    
    if (!this.nextPiece) return;
    
    const shape = this.nextPiece.shape;
    const blockSize = 25;
    const offsetX = (this.nextCanvas.width - shape[0].length * blockSize) / 2;
    const offsetY = (this.nextCanvas.height - shape.length * blockSize) / 2;
    
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const px = offsetX + col * blockSize;
          const py = offsetY + row * blockSize;
          
          this.nextCtx.fillStyle = this.nextPiece.color;
          this.nextCtx.fillRect(px, py, blockSize, blockSize);
          
          // Highlight
          this.nextCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          this.nextCtx.fillRect(px, py, blockSize, 2);
          this.nextCtx.fillRect(px, py, 2, blockSize);
          
          // Shadow
          this.nextCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          this.nextCtx.fillRect(px + blockSize - 2, py, 2, blockSize);
          this.nextCtx.fillRect(px, py + blockSize - 2, blockSize, 2);
        }
      }
    }
  }

  gameLoop(time = 0) {
    if (!this.started || this.paused || this.gameOver) return;
    
    const deltaTime = time - this.lastTime;
    this.lastTime = time;
    this.dropCounter += deltaTime;
    
    if (this.dropCounter > this.dropInterval) {
      this.drop();
    }
    
    this.draw();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Tetris();
});
