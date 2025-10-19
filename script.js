// COD with Bow — quick top-down bow shooter
// Controls: WASD to move, mouse to aim, left-click to shoot.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const healthEl = document.getElementById('health');
  const gameOverEl = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const restartBtn = document.getElementById('restartBtn');

  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W; canvas.height = H;

  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
  });

  // Utils
  const rand = (a,b) => a + Math.random()*(b-a);
  const dist = (a,b,c,d) => Math.hypot(a-c, b-d);
  const norm = (x,y) => {
    const m = Math.hypot(x,y) || 1; return [x/m, y/m];
  };

  // Player
  const player = {
    x: W/2,
    y: H/2,
    r: 18,
    speed: 260,
    vx:0, vy:0,
    hp: 100
  };

  const input = { up:false, down:false, left:false, right:false, mouseX:W/2, mouseY:H/2, mouseDown:false };

  window.addEventListener('keydown', e => {
    if(e.key === 'w') input.up = true;
    if(e.key === 's') input.down = true;
    if(e.key === 'a') input.left = true;
    if(e.key === 'd') input.right = true;
    if(e.key === 'W') input.up = true;
    if(e.key === 'S') input.down = true;
    if(e.key === 'A') input.left = true;
    if(e.key === 'D') input.right = true;
  });
  window.addEventListener('keyup', e => {
    if(e.key === 'w') input.up = false;
    if(e.key === 's') input.down = false;
    if(e.key === 'a') input.left = false;
    if(e.key === 'd') input.right = false;
    if(e.key === 'W') input.up = false;
    if(e.key === 'S') input.down = false;
    if(e.key === 'A') input.left = false;
    if(e.key === 'D') input.right = false;
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', e => {
    if(e.button === 0) input.mouseDown = true;
  });
  window.addEventListener('mouseup', e => {
    if(e.button === 0) input.mouseDown = false;
  });

  // Entities
  const arrows = [];
  const enemies = [];
  let lastShot = 0;
  let score = 0;
  let running = true;

  // Spawning
  let spawnTimer = 0;
  let spawnRate = 1.2; // seconds
  let difficultyTimer = 0;

  // Arrow prototype
  function fireArrow(px,py,tx,ty) {
    const [nx, ny] = norm(tx-px, ty-py);
    const speed = 900;
    arrows.push({
      x: px + nx*(player.r+8),
      y: py + ny*(player.r+8),
      vx: nx*speed,
      vy: ny*speed,
      r: 4,
      life: 2.2
    });
  }

  // Enemy spawn at edge
  function spawnEnemy() {
    const edge = Math.floor(rand(0,4));
    let x,y;
    if(edge === 0){ x = rand(-60, W+60); y = -60; }
    else if(edge === 1){ x = rand(-60, W+60); y = H+60; }
    else if(edge === 2){ x = -60; y = rand(-60, H+60); }
    else { x = W+60; y = rand(-60, H+60); }
    const size = rand(12, 26);
    enemies.push({
      x,y,
      r: size,
      speed: rand(40, 95),
      hp: Math.round(size/6) + 1,
      colorSeed: Math.random()
    });
  }

  // Basic collision
  function circleHit(a,b){
    return dist(a.x,a.y,b.x,b.y) < a.r + b.r;
  }

  // Game loop
  let last = performance.now();
  function update(now) {
    const dt = Math.min((now - last)/1000, 0.05);
    last = now;
    if(!running) return;

    // Movement
    let mx = 0, my = 0;
    if(input.up) my -= 1;
    if(input.down) my += 1;
    if(input.left) mx -= 1;
    if(input.right) mx += 1;
    const [nx, ny] = norm(mx, my);
    player.vx = nx * player.speed;
    player.vy = ny * player.speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // clamp to screen
    player.x = Math.max(player.r, Math.min(W-player.r, player.x));
    player.y = Math.max(player.r, Math.min(H-player.r, player.y));

    // Shooting (rate-limited)
    lastShot += dt;
    const shotDelay = 0.18; // seconds per arrow
    if(input.mouseDown && lastShot >= shotDelay){
      fireArrow(player.x, player.y, input.mouseX, input.mouseY);
      lastShot = 0;
    }

    // Update arrows
    for(let i = arrows.length-1; i>=0; i--){
      const a = arrows[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      if(a.life <= 0 || a.x < -100 || a.x > W+100 || a.y < -100 || a.y > H+100){
        arrows.splice(i,1);
      }
    }

    // Update enemies
    for(let i = enemies.length-1; i>=0; i--){
      const e = enemies[i];
      // Move toward player
      const [dx,dy] = norm(player.x - e.x, player.y - e.y);
      e.x += dx * e.speed * dt;
      e.y += dy * e.speed * dt;

      // Enemy hit by arrows
      for(let j = arrows.length-1; j>=0; j--){
        const a = arrows[j];
        if(dist(e.x,e.y,a.x,a.y) < e.r + a.r){
          e.hp -= 1;
          arrows.splice(j,1);
          if(e.hp <= 0){
            // dead
            score += Math.round(e.r*1.2);
            enemies.splice(i,1);
            break;
          }
        }
      }

      // Enemy hits player
      if(dist(e.x,e.y,player.x,player.y) < e.r + player.r){
        // damage and knockback
        player.hp -= Math.round(8 + e.r*0.2);
        // knockback
        const [kx,ky] = norm(player.x - e.x, player.y - e.y);
        player.x += kx * 18;
        player.y += ky * 18;
        enemies.splice(i,1);
        if(player.hp <= 0){
          die();
          return;
        }
      }
    }

    // Spawning logic
    spawnTimer += dt;
    difficultyTimer += dt;
    if(difficultyTimer > 12){
      difficultyTimer = 0;
      // escalate
      spawnRate = Math.max(0.45, spawnRate * 0.88);
    }
    if(spawnTimer >= spawnRate){
      spawnTimer = 0;
      // spawn multiple based on difficulty
      const n = Math.random() < 0.12 ? 2 : 1;
      for(let k=0;k<n;k++) spawnEnemy();
    }

    // Update HUD
    scoreEl.textContent = `Score: ${score}`;
    healthEl.textContent = `HP: ${player.hp}`;

    // draw
    draw();

    requestAnimationFrame(update);
  }

  function draw() {
    ctx.clearRect(0,0,W,H);

    // background subtle grid
    const gridSize = 48;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#9fb7d8';
    ctx.lineWidth = 1;
    for(let x = - (player.x % gridSize); x < W; x += gridSize){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for(let y = - (player.y % gridSize); y < H; y += gridSize){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    ctx.restore();

    // draw player
    ctx.save();
    // body
    ctx.beginPath();
    ctx.fillStyle = '#bfefff';
    ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    ctx.fill();

    // aim direction
    const [ax,ay] = [input.mouseX, input.mouseY];
    const ang = Math.atan2(ay - player.y, ax - player.x);
    // bow limb (simple)
    ctx.translate(player.x, player.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#7fd1ff';
    ctx.fillRect(12, -6, 18, 12); // quiver hint
    // arrow nock
    ctx.fillStyle = '#ffefc4';
    ctx.fillRect(22, -3, 18, 6);
    ctx.restore();

    // arrows
    for(const a of arrows){
      ctx.save();
      ctx.beginPath();
      ctx.translate(a.x, a.y);
      const dir = Math.atan2(a.vy, a.vx);
      ctx.rotate(dir);
      ctx.fillStyle = '#ffd8a8';
      ctx.fillRect(-10, -2, 16, 4); // shaft
      // arrowhead
      ctx.beginPath();
      ctx.moveTo(6,-5); ctx.lineTo(12,0); ctx.lineTo(6,5); ctx.fill();
      ctx.restore();
    }

    // enemies
    for(const e of enemies){
      ctx.save();
      // color variation
      const c = Math.floor(120 + e.colorSeed * 120);
      ctx.fillStyle = `rgb(${c}, ${60}, ${80})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(e.x - e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2);
      ctx.arc(e.x + e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }

    // crosshair
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#dbe9ff';
    ctx.lineWidth = 1.5;
    ctx.moveTo(input.mouseX - 8, input.mouseY);
    ctx.lineTo(input.mouseX + 8, input.mouseY);
    ctx.moveTo(input.mouseX, input.mouseY - 8);
    ctx.lineTo(input.mouseX, input.mouseY + 8);
    ctx.stroke();
    ctx.restore();
  }

  function die(){
    running = false;
    gameOverEl.classList.remove('hidden');
    finalScoreEl.textContent = `Score: ${score}`;
  }

  restartBtn.addEventListener('click', () => {
    // reset game
    enemies.length = 0;
    arrows.length = 0;
    player.x = W/2; player.y = H/2; player.hp = 100;
    score = 0;
    spawnRate = 1.2;
    spawnTimer = 0; difficultyTimer = 0;
    lastShot = 0; running = true;
    gameOverEl.classList.add('hidden');
    last = performance.now();
    requestAnimationFrame(update);
  });

  // seed initial enemies
  for(let i=0;i<3;i++) spawnEnemy();

  // start
  requestAnimationFrame(update);

  // small touch: mobile support - on-screen shoot button
  if('ontouchstart' in window){
    const hint = document.getElementById('centerHint');
    hint.textContent = 'Tap to shoot • Drag to aim • WASD/virtual d-pad recommended';
    // simple touch aiming
    let touchId = null;
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      touchId = t.identifier;
      input.mouseX = t.clientX; input.mouseY = t.clientY;
      input.mouseDown = true;
      setTimeout(()=> input.mouseDown = false, 120); // quick shot
    });
    canvas.addEventListener('touchmove', e => {
      for(const t of e.changedTouches){
        if(t.identifier === touchId){
          input.mouseX = t.clientX; input.mouseY = t.clientY;
        }
      }
    });
    canvas.addEventListener('touchend', e => { input.mouseDown = false; touchId = null; });
  }

})();
