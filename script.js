// COD with Bow — chest system integrated
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const healthEl = document.getElementById('health');
  const invSummaryEl = document.getElementById('inventorySummary');
  const interactHint = document.getElementById('interactHint');
  const chestUI = document.getElementById('chestUI');
  const chestTitle = document.getElementById('chestTitle');
  const chestItemsEl = document.getElementById('chestItems');
  const takeAllBtn = document.getElementById('takeAllBtn');
  const closeChestBtn = document.getElementById('closeChestBtn');
  const gameOverEl = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const restartBtn = document.getElementById('restartBtn');

  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; });

  // Utils
  const rand = (a,b) => a + Math.random()*(b-a);
  const dist = (a,b,c,d) => Math.hypot(a-c, b-d);
  const norm = (x,y) => { const m = Math.hypot(x,y) || 1; return [x/m, y/m]; };

  // Player
  const player = { x: W/2, y: H/2, r: 18, speed: 260, vx:0, vy:0, hp: 100 };
  const inventory = { coins: 0, keys: 0, potions: 0, arrows: 0 };

  const input = { up:false, down:false, left:false, right:false, mouseX:W/2, mouseY:H/2, mouseDown:false };
  window.addEventListener('keydown', e => {
    if(e.key === 'w' || e.key === 'W') input.up = true;
    if(e.key === 's' || e.key === 'S') input.down = true;
    if(e.key === 'a' || e.key === 'A') input.left = true;
    if(e.key === 'd' || e.key === 'D') input.right = true;
    if(e.key === 'e' || e.key === 'E') tryOpenNearbyChest();
  });
  window.addEventListener('keyup', e => {
    if(e.key === 'w' || e.key === 'W') input.up = false;
    if(e.key === 's' || e.key === 'S') input.down = false;
    if(e.key === 'a' || e.key === 'A') input.left = false;
    if(e.key === 'd' || e.key === 'D') input.right = false;
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', e => { if(e.button === 0) input.mouseDown = true; });
  window.addEventListener('mouseup', e => { if(e.button === 0) input.mouseDown = false; });

  // Entities
  const arrows = [];
  const enemies = [];
  let lastShot = 0;
  let score = 0;
  let running = true;

  // Chests
  const chests = []; // {x,y,r,locked,opened,contents,openTimer,respawnTime}
  const CHEST_INTERACT_DIST = 48;

  // Spawning
  let spawnTimer = 0;
  let spawnRate = 1.2;
  let difficultyTimer = 0;

  // Misc
  function updateInventoryUI(){ invSummaryEl.textContent = `Coins: ${inventory.coins} • Keys: ${inventory.keys} • Potions: ${inventory.potions}`; }

  // Arrow prototype
  function fireArrow(px,py,tx,ty){
    const [nx, ny] = norm(tx-px, ty-py);
    const speed = 900;
    arrows.push({ x: px + nx*(player.r+8), y: py + ny*(player.r+8), vx: nx*speed, vy: ny*speed, r: 4, life: 2.2 });
  }

  // Enemy spawn at edge
  function spawnEnemy(){
    const edge = Math.floor(rand(0,4));
    let x,y;
    if(edge === 0){ x = rand(-60, W+60); y = -60; }
    else if(edge === 1){ x = rand(-60, W+60); y = H+60; }
    else if(edge === 2){ x = -60; y = rand(-60, H+60); }
    else { x = W+60; y = rand(-60, H+60); }
    const size = rand(12, 26);
    enemies.push({ x,y, r: size, speed: rand(40, 95), hp: Math.round(size/6) + 1, colorSeed: Math.random() });
  }

  // Chest creation / loot
  const LOOT_TABLE = [
    { type: 'coins', min: 10, max: 60, weight: 40 },
    { type: 'coins', min: 80, max: 180, weight: 10 },
    { type: 'key', count:1, weight: 12 },
    { type: 'potion', count:1, weight: 14 },
    { type: 'arrows', min: 5, max: 30, weight: 24 }
  ];
  function weightedPick(){
    const total = LOOT_TABLE.reduce((s,i)=>s+i.weight,0);
    let r = Math.random()*total;
    for(const item of LOOT_TABLE){
      if(r < item.weight) return item;
      r -= item.weight;
    }
    return LOOT_TABLE[0];
  }
  function generateChestContents(){
    // chest will have 2-4 random drops
    const n = Math.floor(rand(2,5));
    const contents = [];
    for(let i=0;i<n;i++){
      const pick = weightedPick();
      if(pick.type === 'coins') contents.push({ kind:'coins', amount: Math.round(rand(pick.min, pick.max)) });
      if(pick.type === 'key') contents.push({ kind:'key', amount: pick.count || 1 });
      if(pick.type === 'potion') contents.push({ kind:'potion', amount: pick.count || 1 });
      if(pick.type === 'arrows') contents.push({ kind:'arrows', amount: Math.round(rand(pick.min, pick.max)) });
    }
    return contents;
  }

  function spawnChest(x,y,locked=false){
    chests.push({
      x,y,
      r: 20,
      locked: !!locked,
      opened: false,
      contents: generateChestContents(),
      openAnim: 0, // 0..1 anim
      respawnTimer: 0 // if emptied, respawn logic
    });
  }

  // Initially spawn a few chests
  for(let i=0;i<5;i++){
    spawnChest(rand(80, W-80), rand(80, H-80), Math.random() < 0.35);
  }

  // Interaction
  let nearbyChestIndex = -1;
  function findNearbyChest(){
    nearbyChestIndex = -1;
    for(let i=0;i<chests.length;i++){
      const c = chests[i];
      if(!c.opened && dist(player.x,player.y,c.x,c.y) <= CHEST_INTERACT_DIST){
        nearbyChestIndex = i;
        return i;
      }
    }
    return -1;
  }

  function tryOpenNearbyChest(){
    if(nearbyChestIndex === -1) return;
    const c = chests[nearbyChestIndex];
    if(c.locked){
      // if player has key, consume and open; else show locked text
      if(inventory.keys > 0){
        inventory.keys -= 1;
        updateInventoryUI();
        c.locked = false;
        openChest(nearbyChestIndex);
      } else {
        // show locked hint briefly
        flashHint('Locked — need a Key!');
      }
    } else {
      openChest(nearbyChestIndex);
    }
  }

  let flashTimeout = null;
  function flashHint(text, duration=900){
    const hint = document.getElementById('centerHint');
    const prev = hint.textContent;
    hint.textContent = text;
    setTimeout(()=> hint.textContent = prev, duration);
  }

  function openChest(i){
    const c = chests[i];
    if(!c || c.opened) return;
    c.opened = true;
    c.openAnim = 1; // open animation value (used visually)
    // show UI
    showChestUI(c, i);
  }

  function closeChest(i){
    const c = chests[i];
    if(!c) return;
    // mark emptied chests to respawn later
    if(c.contents.length === 0){
      c.respawnTimer = 18 + Math.random()*20; // 18-38 sec before respawn
    }
    chestUI.classList.add('hidden');
  }

  function showChestUI(chest, index){
    chestTitle.textContent = chest.locked ? 'Locked Chest' : 'Chest';
    chestItemsEl.innerHTML = '';
    // fill UI with item slots
    for(let i=0;i<8;i++){
      const slot = document.createElement('div');
      slot.className = 'itemSlot';
      if(i < chest.contents.length){
        const it = chest.contents[i];
        // friendly label
        let label = '';
        if(it.kind === 'coins') label = `${it.amount} COINS`;
        if(it.kind === 'key') label = `KEY x${it.amount}`;
        if(it.kind === 'potion') label = `Potion x${it.amount}`;
        if(it.kind === 'arrows') label = `Arrows x${it.amount}`;
        slot.innerHTML = `<div>${label}</div><small>Take</small>`;
        slot.addEventListener('click', ()=> {
          takeItem(index, i);
        });
      } else {
        slot.innerHTML = `<div>—</div><small>Empty</small>`;
        slot.style.opacity = '0.55';
      }
      chestItemsEl.appendChild(slot);
    }
    chestUI.classList.remove('hidden');
  }

  function takeItem(chestIdx, slotIdx){
    const c = chests[chestIdx];
    if(!c) return;
    if(slotIdx < 0 || slotIdx >= c.contents.length) return;
    const it = c.contents.splice(slotIdx,1)[0];
    // apply the item
    if(it.kind === 'coins') inventory.coins += it.amount;
    if(it.kind === 'key') inventory.keys += it.amount;
    if(it.kind === 'potion') inventory.potions += it.amount;
    if(it.kind === 'arrows') inventory.arrows += it.amount;
    updateInventoryUI();
    // refresh UI
    showChestUI(c, chestIdx);
  }

  takeAllBtn.addEventListener('click', () => {
    if(nearbyChestIndex === -1) return;
    const c = chests[nearbyChestIndex];
    if(!c) return;
    while(c.contents.length > 0){
      const it = c.contents.pop();
      if(it.kind === 'coins') inventory.coins += it.amount;
      if(it.kind === 'key') inventory.keys += it.amount;
      if(it.kind === 'potion') inventory.potions += it.amount;
      if(it.kind === 'arrows') inventory.arrows += it.amount;
    }
    updateInventoryUI();
    showChestUI(c, nearbyChestIndex);
  });
  closeChestBtn.addEventListener('click', ()=> {
    if(nearbyChestIndex !== -1) closeChest(nearbyChestIndex);
    else chestUI.classList.add('hidden');
  });

  // Small function to simulate using a potion
  function usePotion(){
    if(inventory.potions <= 0) return flashHint('No potions!');
    inventory.potions -= 1;
    player.hp = Math.min(100, player.hp + 28);
    updateInventoryUI();
    flashHint('Used Potion +28 HP');
  }
  // bind key Q to use potion
  window.addEventListener('keydown', e => { if(e.key === 'q' || e.key === 'Q') usePotion(); });

  // Update / draw loop
  let last = performance.now();
  function update(now){
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
    player.x = Math.max(player.r, Math.min(W-player.r, player.x));
    player.y = Math.max(player.r, Math.min(H-player.r, player.y));

    // Shooting
    lastShot += dt;
    const shotDelay = 0.18;
    if(input.mouseDown && lastShot >= shotDelay){
      fireArrow(player.x, player.y, input.mouseX, input.mouseY);
      lastShot = 0;
    }

    // Arrows
    for(let i = arrows.length-1; i>=0; i--){
      const a = arrows[i];
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.life -= dt;
      if(a.life <= 0 || a.x < -100 || a.x > W+100 || a.y < -100 || a.y > H+100) arrows.splice(i,1);
    }

    // Enemies
    for(let i = enemies.length-1; i>=0; i--){
      const e = enemies[i];
      const [dx,dy] = norm(player.x - e.x, player.y - e.y);
      e.x += dx * e.speed * dt; e.y += dy * e.speed * dt;

      for(let j = arrows.length-1; j>=0; j--){
        const a = arrows[j];
        if(dist(e.x,e.y,a.x,a.y) < e.r + a.r){
          e.hp -= 1; arrows.splice(j,1);
          if(e.hp <= 0){ score += Math.round(e.r*1.2); enemies.splice(i,1); break; }
        }
      }
      if(dist(e.x,e.y,player.x,player.y) < e.r + player.r){
        player.hp -= Math.round(8 + e.r*0.2);
        const [kx,ky] = norm(player.x - e.x, player.y - e.y);
        player.x += kx * 18; player.y += ky * 18;
        enemies.splice(i,1);
        if(player.hp <= 0){ die(); return; }
      }
    }

    // Spawning enemies
    spawnTimer += dt; difficultyTimer += dt;
    if(difficultyTimer > 12){ difficultyTimer = 0; spawnRate = Math.max(0.45, spawnRate * 0.88); }
    if(spawnTimer >= spawnRate){ spawnTimer = 0; const n = Math.random() < 0.12 ? 2 : 1; for(let k=0;k<n;k++) spawnEnemy(); }

    // Chest respawn timers
    for(const c of chests){
      if(c.opened && c.contents.length === 0 && c.respawnTimer > 0){
        c.respawnTimer -= dt;
        if(c.respawnTimer <= 0){
          // respawn chest (reset locked sometimes)
          c.locked = Math.random() < 0.35;
          c.opened = false;
          c.contents = generateChestContents();
          c.respawnTimer = 0;
          c.openAnim = 0;
        }
      }
    }

    // find nearby chest for interaction
    findNearbyChest();
    if(nearbyChestIndex !== -1){
      interactHint.classList.remove('hidden');
      interactHint.style.display = 'block';
    } else {
      interactHint.classList.add('hidden');
    }

    scoreEl.textContent = `Score: ${score}`;
    healthEl.textContent = `HP: ${player.hp}`;
    updateInventoryUI();
    draw();
    requestAnimationFrame(update);
  }

  // Draw function with chests
  function draw(){
    ctx.clearRect(0,0,W,H);

    // subtle background
    const gridSize = 48;
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#9fb7d8'; ctx.lineWidth = 1;
    for(let x = - (player.x % gridSize); x < W; x += gridSize){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y = - (player.y % gridSize); y < H; y += gridSize){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    // chests
    for(const c of chests){
      ctx.save();
      // chest base
      ctx.beginPath();
      const wob = Math.sin((performance.now()/600) + (c.x*0.01))*1.2;
      const openOffset = c.opened ? 8 : 0;
      ctx.fillStyle = c.locked ? '#7a4f2f' : '#8b5a35';
      ctx.fillRect(c.x - c.r, c.y - c.r + openOffset - wob, c.r*2, c.r*1.2);
      // lid (simple open animation)
      ctx.fillStyle = '#a67c52';
      const lidH = c.opened ? -10 : 0;
      ctx.fillRect(c.x - c.r, c.y - c.r - 6 + lidH - wob, c.r*2, 8);
      // lock
      if(c.locked){
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(c.x, c.y - 2 - wob, 6, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#ffd47a';
        ctx.fillRect(c.x-2, c.y - 6 - wob, 4, 6);
      }
      // highlight when player near
      if(dist(player.x,player.y,c.x,c.y) <= CHEST_INTERACT_DIST){
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(c.x - c.r - 6, c.y - c.r - 10, c.r*2 + 12, c.r*1.2 + 20); ctx.stroke();
      }
      ctx.restore();
    }

    // player
    ctx.save();
    ctx.beginPath(); ctx.fillStyle = '#bfefff'; ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    // aim & bow
    const ang = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
    ctx.translate(player.x, player.y); ctx.rotate(ang);
    ctx.fillStyle = '#7fd1ff'; ctx.fillRect(12, -6, 18, 12);
    ctx.fillStyle = '#ffefc4'; ctx.fillRect(22, -3, 18, 6);
    ctx.restore();

    // arrows
    for(const a of arrows){
      ctx.save();
      ctx.beginPath();
      ctx.translate(a.x, a.y);
      const dir = Math.atan2(a.vy, a.vx);
      ctx.rotate(dir);
      ctx.fillStyle = '#ffd8a8';
      ctx.fillRect(-10, -2, 16, 4);
      ctx.beginPath(); ctx.moveTo(6,-5); ctx.lineTo(12,0); ctx.lineTo(6,5); ctx.fill();
      ctx.restore();
    }

    // enemies
    for(const e of enemies){
      ctx.save();
      const c = Math.floor(120 + e.colorSeed * 120);
      ctx.fillStyle = `rgb(${c}, ${60}, ${80})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(e.x - e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2); ctx.arc(e.x + e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2);
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

  function die(){ running = false; gameOverEl.classList.remove('hidden'); finalScoreEl.textContent = `Score: ${score}`; }

  restartBtn.addEventListener('click', () => {
    enemies.length = 0; arrows.length = 0;
    player.x = W/2; player.y = H/2; player.hp = 100;
    score = 0; spawnRate = 1.2; spawnTimer = 0; difficultyTimer = 0;
    lastShot = 0; running = true; gameOverEl.classList.add('hidden'); last = performance.now(); requestAnimationFrame(update);
  });

  // Mobile touch: allow tap to open chest when tapping near chest
  if('ontouchstart' in window){
    const hint = document.getElementById('centerHint');
    hint.textContent = 'Tap to shoot • Tap Chest to open • Drag to aim';
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      input.mouseX = t.clientX; input.mouseY = t.clientY;
      input.mouseDown = true;
      // check chests
      for(let i=0;i<chests.length;i++){
        if(dist(chests[i].x,chests[i].y, input.mouseX, input.mouseY) <= CHEST_INTERACT_DIST){
          nearbyChestIndex = i;
          tryOpenNearbyChest();
          return;
        }
      }
      setTimeout(()=> input.mouseDown = false, 120);
    });
  }

  // start loop
  for(let i=0;i<3;i++) spawnEnemy();
  requestAnimationFrame(update);

  // Expose a quick console helper for debugging:
  window.__GAME = { chests, inventory, spawnChest, generateChestContents };

})();
