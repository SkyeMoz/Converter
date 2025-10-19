// COD with Bow — Mobile-ready w/ joystick, reload, weapons, sounds, damage effect
(() => {
  // ----- DOM -----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const healthEl = document.getElementById('health');
  const invSummaryEl = document.getElementById('inventorySummary');
  const weaponInfoEl = document.getElementById('weaponInfo');
  const interactHint = document.getElementById('interactHint');
  const chestUI = document.getElementById('chestUI');
  const chestTitle = document.getElementById('chestTitle');
  const chestItemsEl = document.getElementById('chestItems');
  const takeAllBtn = document.getElementById('takeAllBtn');
  const closeChestBtn = document.getElementById('closeChestBtn');
  const gameOverEl = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const restartBtn = document.getElementById('restartBtn');
  const damageOverlay = document.getElementById('damageOverlay');

  // mobile controls
  const joyOuter = document.getElementById('joyOuter');
  const joyThumb = document.getElementById('joyThumb');
  const fireBtn = document.getElementById('fireBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const wepBtns = Array.from(document.querySelectorAll('.wepBtn'));

  // ----- canvas sizing -----
  let W = window.innerWidth;
  let H = window.innerHeight;
  function resize(){ W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; }
  resize();
  window.addEventListener('resize', resize);

  // ----- Utilities -----
  const rand = (a,b) => a + Math.random()*(b-a);
  const dist = (a,b,c,d) => Math.hypot(a-c, b-d);
  const norm = (x,y) => { const m = Math.hypot(x,y) || 1; return [x/m, y/m]; };

  // ----- Game state -----
  const player = { x: W/2, y: H/2, r: 18, speed: 260, vx:0, vy:0, hp:100 };
  const inventory = { coins:0, keys:0, potions:0, arrows:0 };
  const input = { up:false, down:false, left:false, right:false, mouseX:W/2, mouseY:H/2, mouseDown:false, fireHeld:false };
  const arrows = [];
  const enemies = [];
  const chests = [];
  let score = 0;
  let running = true;
  let lastShot = 0;
  let spawnTimer = 0;
  let spawnRate = 1.2;
  let difficultyTimer = 0;
  const CHEST_INTERACT_DIST = 48;
  let nearbyChestIndex = -1;

  // ----- Weapons config -----
  const WEAPONS = {
    bow: { id:'bow', name:'Bow', ammo: Infinity, mag: Infinity, reloadTime:0, rate: 0.18, damage: 12, spread: 0, projectiles:1, sound:'settings/fire_bow.wav' },
    crossbow: { id:'crossbow', name:'Crossbow', ammo: 6, mag: 6, reloadTime: 1200, rate: 0.6, damage: 34, spread: 0.01, projectiles:1, sound:'settings/fire_crossbow.wav' },
    pistol: { id:'pistol', name:'Pistol', ammo: 12, mag: 12, reloadTime: 800, rate: 0.18, damage: 16, spread: 0.02, projectiles:1, sound:'settings/fire_pistol.wav' },
    shotgun: { id:'shotgun', name:'Shotgun', ammo: 6, mag: 6, reloadTime: 1100, rate: 0.9, damage: 8, spread: 0.35, projectiles:5, sound:'settings/fire_shotgun.wav' },
    minigun: { id:'minigun', name:'Minigun', ammo: 200, mag: 200, reloadTime: 1800, rate: 0.05, damage: 6, spread: 0.06, projectiles:1, sound:'settings/fire_minigun.wav' }
  };

  let currentWeapon = WEAPONS.bow;
  const weaponState = {};
  for(const k in WEAPONS){
    weaponState[k] = { ammo: WEAPONS[k].ammo, mag: WEAPONS[k].mag, reloading:false, reloadTimer:0 };
  }

  // ----- Audio (preload) -----
  const SFX = {};
  const sfxFiles = {
    fire_bow: 'settings/fire_bow.wav',
    fire_crossbow: 'settings/fire_crossbow.wav',
    fire_pistol: 'settings/fire_pistol.wav',
    fire_shotgun: 'settings/fire_shotgun.wav',
    fire_minigun: 'settings/fire_minigun.wav',
    reload: 'settings/reload.wav',
    damage: 'settings/damage.wav',
    kill: 'settings/kill.wav',
    loot_open: 'settings/loot_open.wav'
  };
  for(const k in sfxFiles){
    const a = new Audio(sfxFiles[k]);
    a.preload = 'auto';
    SFX[k] = a;
  }
  function play(name, vol=1){
    try{
      const s = SFX[name];
      if(!s) return;
      const clone = s.cloneNode();
      clone.volume = Math.max(0, Math.min(1, vol));
      clone.play().catch(()=>{ /* ignore autoplay blocks */ });
    }catch(e){}
  }

  // ----- Disallow overscroll/pull to refresh on mobile -----
  // CSS overscroll-behavior is set; additionally block touchmove when at top and dragging down
  let lastTouchY = 0;
  window.addEventListener('touchstart', e => { lastTouchY = e.touches[0]?.clientY || 0; }, { passive:false });
  window.addEventListener('touchmove', e => {
    const ty = e.touches[0]?.clientY || 0;
    const dy = ty - lastTouchY;
    lastTouchY = ty;
    // if pulling down at top of page, prevent (block pull-to-refresh)
    if(document.scrollingElement.scrollTop === 0 && dy > 0){
      e.preventDefault();
    }
  }, { passive:false });

  // prevent two-finger or weird gestures refresh
  window.addEventListener('gesturestart', e => e.preventDefault?.(), { passive:false });

  // ----- Joystick (touch) -----
  const JOY_RADIUS = 50;
  const JOY_MAX = 40;
  let joyCenter = { x: 18 + 65, y: window.innerHeight - 18 - 65 }; // center approximated (matches CSS)
  function updateJoyCenter(){ joyCenter = { x: joyOuter.getBoundingClientRect().left + joyOuter.clientWidth/2, y: joyOuter.getBoundingClientRect().top + joyOuter.clientHeight/2 }; }
  updateJoyCenter();
  window.addEventListener('resize', updateJoyCenter);

  let activeJoyId = null;
  let joyVal = { x:0, y:0 };

  function setThumb(pos){
    const dx = Math.max(-JOY_MAX, Math.min(JOY_MAX, pos.x));
    const dy = Math.max(-JOY_MAX, Math.min(JOY_MAX, pos.y));
    joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function resetThumb(){ joyThumb.style.transform = `translate(0px, 0px)`; joyVal = { x:0, y:0 }; }

  joyOuter.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    activeJoyId = t.identifier;
    const x = t.clientX - joyCenter.x;
    const y = t.clientY - joyCenter.y;
    const m = Math.hypot(x,y) || 1;
    joyVal.x = x/m; joyVal.y = y/m;
    setThumb({ x: x, y: y });
    e.preventDefault();
  }, { passive:false });

  joyOuter.addEventListener('touchmove', e => {
    for(const t of e.changedTouches){
      if(t.identifier === activeJoyId){
        const x = t.clientX - joyCenter.x;
        const y = t.clientY - joyCenter.y;
        const m = Math.hypot(x,y) || 1;
        const clampedX = (Math.abs(x) > JOY_MAX ? (x/m)*JOY_MAX : x);
        const clampedY = (Math.abs(y) > JOY_MAX ? (y/m)*JOY_MAX : y);
        joyVal.x = clampedX / JOY_MAX;
        joyVal.y = clampedY / JOY_MAX;
        setThumb({ x: clampedX, y: clampedY });
      }
    }
    e.preventDefault();
  }, { passive:false });

  joyOuter.addEventListener('touchend', e => {
    for(const t of e.changedTouches) if(t.identifier === activeJoyId){ activeJoyId = null; resetThumb(); }
  });

  // Also allow mouse control of joystick for testing
  let mouseJoyActive = false;
  joyOuter.addEventListener('mousedown', e => { mouseJoyActive = true; handleMouseJoy(e); e.preventDefault(); });
  window.addEventListener('mousemove', e => { if(mouseJoyActive) handleMouseJoy(e); });
  window.addEventListener('mouseup', ()=> { if(mouseJoyActive){ mouseJoyActive=false; resetThumb(); } });

  function handleMouseJoy(e){
    const x = e.clientX - joyCenter.x; const y = e.clientY - joyCenter.y;
    const m = Math.hypot(x,y) || 1;
    const clampedX = (Math.abs(x) > JOY_MAX ? (x/m)*JOY_MAX : x);
    const clampedY = (Math.abs(y) > JOY_MAX ? (y/m)*JOY_MAX : y);
    joyVal.x = clampedX / JOY_MAX; joyVal.y = clampedY / JOY_MAX;
    setThumb({ x: clampedX, y: clampedY });
  }

  // ----- Mobile fire/reload buttons -----
  fireBtn.addEventListener('touchstart', e => { input.fireHeld = true; input.mouseDown = true; e.preventDefault(); }, { passive:false });
  fireBtn.addEventListener('touchend', e => { input.fireHeld = false; input.mouseDown = false; e.preventDefault(); }, { passive:false });
  fireBtn.addEventListener('mousedown', e => { input.mouseDown = true; }, { passive:true });
  window.addEventListener('mouseup', e => { input.mouseDown = false; }, { passive:true });

  reloadBtn.addEventListener('click', () => startReload(currentWeapon.id));
  reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); startReload(currentWeapon.id); }, { passive:false });

  // weapon buttons (mobile)
  wepBtns.forEach(b => {
    b.addEventListener('click', ()=> switchWeapon(b.dataset.wep));
    b.addEventListener('touchstart', e=> { e.preventDefault(); switchWeapon(b.dataset.wep); }, { passive:false});
  });

  // ----- Input keyboard + mouse -----
  window.addEventListener('keydown', e => {
    if(e.key === 'w' || e.key==='W') input.up=true;
    if(e.key === 's' || e.key==='S') input.down=true;
    if(e.key === 'a' || e.key==='A') input.left=true;
    if(e.key === 'd' || e.key==='D') input.right=true;
    if(e.key === 'e' || e.key==='E') tryOpenNearbyChest();
    if(e.key === 'q' || e.key==='Q') usePotion();
    if(e.key === '1') switchWeapon('bow');
    if(e.key === '2') switchWeapon('crossbow');
    if(e.key === '3') switchWeapon('pistol');
    if(e.key === '4') switchWeapon('shotgun');
    if(e.key === '5') switchWeapon('minigun');
    if(e.key === 'r' || e.key === 'R') startReload(currentWeapon.id);
  });
  window.addEventListener('keyup', e => {
    if(e.key === 'w' || e.key==='W') input.up=false;
    if(e.key === 's' || e.key==='S') input.down=false;
    if(e.key === 'a' || e.key==='A') input.left=false;
    if(e.key === 'd' || e.key==='D') input.right=false;
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', e => { if(e.button===0) input.mouseDown = true; });
  window.addEventListener('mouseup', e => { if(e.button===0) input.mouseDown = false; });

  // touch aiming
  canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    input.mouseX = t.clientX; input.mouseY = t.clientY;
    // if tap near chest, interact
    for(let i=0;i<chests.length;i++){
      if(dist(chests[i].x, chests[i].y, input.mouseX, input.mouseY) <= CHEST_INTERACT_DIST){
        nearbyChestIndex = i; tryOpenNearbyChest(); return;
      }
    }
    input.mouseDown = true;
  }, { passive:false });

  canvas.addEventListener('touchmove', e => {
    const t = e.changedTouches[0];
    input.mouseX = t.clientX; input.mouseY = t.clientY;
  }, { passive:false });

  canvas.addEventListener('touchend', e => { input.mouseDown = false; }, { passive:false });

  // ----- Weapon & reload logic -----
  function switchWeapon(id){
    if(!WEAPONS[id]) return;
    currentWeapon = WEAPONS[id];
    updateWeaponUI();
  }
  function updateWeaponUI(){
    const ws = weaponState[currentWeapon.id];
    const ammoText = currentWeapon.mag === Infinity ? '∞' : `${ws.mag}/${ws.ammo}`;
    weaponInfoEl.textContent = `Weapon: ${currentWeapon.name} • Ammo: ${ammoText}`;
  }
  function startReload(id){
    const state = weaponState[id];
    const w = WEAPONS[id];
    if(!state || state.reloading) return;
    if(w.mag === Infinity) return; // infinite
    if(state.mag === state.ammo) return;
    state.reloading = true;
    state.reloadTimer = w.reloadTime || 900;
    play('reload', 0.9);
    // visual hint
    flashCenter(`Reloading ${w.name}...`);
  }
  function tickReload(dt){
    for(const k in weaponState){
      const s = weaponState[k];
      if(s.reloading){
        s.reloadTimer -= dt*1000;
        if(s.reloadTimer <= 0){
          // refill to mag or available ammo
          const w = WEAPONS[k];
          const needed = w.mag - s.mag;
          const take = Math.min(needed, s.ammo);
          s.mag += take;
          s.reloading = false;
          s.reloadTimer = 0;
        }
      }
    }
  }

  // ----- Fire arrow / projectile spawn -----
  function fireWeapon(w, px, py, tx, ty){
    if(weaponState[w.id].reloading) return;
    const st = weaponState[w.id];
    // check ammo
    if(w.mag !== Infinity && st.mag <= 0){
      flashHint('No ammo! Reload.');
      return;
    }
    // consume mag
    if(w.mag !== Infinity) st.mag = Math.max(0, st.mag - 1);

    playSoundForWeapon(w);

    // spawn projectiles
    for(let p=0; p < w.projectiles; p++){
      const aimX = tx - px;
      const aimY = ty - py;
      // add spread
      const spread = (Math.random()*2 - 1) * w.spread * (p+1);
      // rotate aim by small amount for spread
      const angle = Math.atan2(aimY, aimX) + spread;
      const dir = [Math.cos(angle), Math.sin(angle)];
      const speed = 900;
      arrows.push({
        x: px + dir[0]*(player.r+8),
        y: py + dir[1]*(player.r+8),
        vx: dir[0]*speed,
        vy: dir[1]*speed,
        r: 4,
        life: 2.2,
        damage: w.damage,
        ownerWeapon: w.id
      });
    }
    updateWeaponUI();
  }

  function playSoundForWeapon(w){
    if(w.id === 'bow') play('fire_bow', 0.95);
    if(w.id === 'crossbow') play('fire_crossbow', 0.95);
    if(w.id === 'pistol') play('fire_pistol', 0.9);
    if(w.id === 'shotgun') play('fire_shotgun', 0.95);
    if(w.id === 'minigun') play('fire_minigun', 0.95);
  }

  // ----- Chest system (same as before, with loot sounds) -----
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
    chests.push({ x,y, r:20, locked:!!locked, opened:false, contents:generateChestContents(), openAnim:0, respawnTimer:0 });
  }
  for(let i=0;i<5;i++) spawnChest(rand(80, W-80), rand(80, H-80), Math.random() < 0.35);

  function findNearbyChest(){
    nearbyChestIndex = -1;
    for(let i=0;i<chests.length;i++){
      const c = chests[i];
      if(!c.opened && dist(player.x,player.y,c.x,c.y) <= CHEST_INTERACT_DIST){
        nearbyChestIndex = i; return i;
      }
    }
    return -1;
  }
  function tryOpenNearbyChest(){
    if(nearbyChestIndex === -1) return;
    const c = chests[nearbyChestIndex];
    if(c.locked){
      if(inventory.keys > 0){
        inventory.keys -= 1; updateInventoryUI();
        c.locked = false;
        openChest(nearbyChestIndex);
      } else { flashHint('Locked — need a Key!'); }
    } else openChest(nearbyChestIndex);
  }
  function openChest(i){
    const c = chests[i];
    if(!c || c.opened) return;
    c.opened = true; c.openAnim = 1;
    play('loot_open', 0.95);
    showChestUI(c, i);
  }
  function showChestUI(chest, index){
    chestTitle.textContent = chest.locked ? 'Locked Chest' : 'Chest';
    chestItemsEl.innerHTML = '';
    for(let i=0;i<8;i++){
      const slot = document.createElement('div');
      slot.className = 'itemSlot';
      if(i < chest.contents.length){
        const it = chest.contents[i];
        let label = '';
        if(it.kind === 'coins') label = `${it.amount} COINS`;
        if(it.kind === 'key') label = `KEY x${it.amount}`;
        if(it.kind === 'potion') label = `Potion x${it.amount}`;
        if(it.kind === 'arrows') label = `Arrows x${it.amount}`;
        slot.innerHTML = `<div>${label}</div><small>Take</small>`;
        slot.addEventListener('click', ()=> { takeItem(index, i); });
      } else { slot.innerHTML = `<div>—</div><small>Empty</small>`; slot.style.opacity = '0.55'; }
      chestItemsEl.appendChild(slot);
    }
    chestUI.classList.remove('hidden');
  }
  function takeItem(chestIdx, slotIdx){
    const c = chests[chestIdx];
    if(!c) return;
    if(slotIdx < 0 || slotIdx >= c.contents.length) return;
    const it = c.contents.splice(slotIdx,1)[0];
    if(it.kind === 'coins') inventory.coins += it.amount;
    if(it.kind === 'key') inventory.keys += it.amount;
    if(it.kind === 'potion') inventory.potions += it.amount;
    if(it.kind === 'arrows') inventory.arrows += it.amount;
    updateInventoryUI();
    showChestUI(c, chestIdx);
  }
  takeAllBtn.addEventListener('click', () => {
    if(nearbyChestIndex === -1) return;
    const c = chests[nearbyChestIndex];
    if(!c) return;
    while(c.contents.length>0){
      const it = c.contents.pop();
      if(it.kind === 'coins') inventory.coins += it.amount;
      if(it.kind === 'key') inventory.keys += it.amount;
      if(it.kind === 'potion') inventory.potions += it.amount;
      if(it.kind === 'arrows') inventory.arrows += it.amount;
    }
    updateInventoryUI();
    showChestUI(c, nearbyChestIndex);
  });
  closeChestBtn.addEventListener('click', ()=> { if(nearbyChestIndex !== -1) closeChest(nearbyChestIndex); else chestUI.classList.add('hidden'); });
  function closeChest(i){
    const c = chests[i];
    if(!c) return;
    if(c.contents.length === 0){ c.respawnTimer = 18 + Math.random()*20; }
    chestUI.classList.add('hidden');
  }

  function updateInventoryUI(){ invSummaryEl.textContent = `Coins: ${inventory.coins} • Keys: ${inventory.keys} • Potions: ${inventory.potions}`; updateWeaponUI(); }

  function usePotion(){
    if(inventory.potions <= 0) return flashHint('No potions!');
    inventory.potions -= 1; player.hp = Math.min(100, player.hp+28); updateInventoryUI(); flashHint('Used Potion +28 HP');
  }

  // ----- Damage / screen effect -----
  function applyDamage(amount){
    player.hp -= amount;
    if(player.hp <= 0){ player.hp = 0; die(); }
    // flash & sound & camera shake
    damageOverlay.classList.add('show');
    setTimeout(()=> damageOverlay.classList.remove('show'), 260);
    play('damage', 0.9);
    cameraShake(6, 180);
  }
  function cameraShake(strength=6, time=180){
    const start = performance.now();
    const orig = { x:0, y:0 };
    function tick(now){
      const t = now - start;
      const p = Math.max(0, 1 - t/time);
      const x = (Math.random()*2 -1) * strength * p;
      const y = (Math.random()*2 -1) * strength * p;
      ctx.setTransform(1,0,0,1,x,y);
      if(t < time) requestAnimationFrame(tick);
      else ctx.setTransform(1,0,0,1,0,0);
    }
    requestAnimationFrame(tick);
  }

  // ----- Enemies & collisions -----
  function spawnEnemy(){
    const edge = Math.floor(rand(0,4));
    let x,y;
    if(edge===0){ x=rand(-60,W+60); y=-60; }
    else if(edge===1){ x=rand(-60,W+60); y=H+60; }
    else if(edge===2){ x=-60; y=rand(-60,H+60); }
    else { x=W+60; y=rand(-60,H+60); }
    const size = rand(12,28);
    enemies.push({ x,y, r:size, speed: rand(40,95), hp: Math.round(size/5)+1, colorSeed: Math.random() });
  }

  for(let i=0;i<3;i++) spawnEnemy();

  // ----- Main loop -----
  let last = performance.now();
  function update(now){
    const dt = Math.min((now-last)/1000, 0.05);
    last = now;
    if(!running) return;

    // movement from joystick + keyboard
    const mx = (joyVal.x) || (input.left ? -1 : (input.right ? 1 : 0));
    const my = (joyVal.y) || (input.up ? -1 : (input.down ? 1 : 0));
    const [nx, ny] = norm(mx, my);
    player.vx = nx * player.speed;
    player.vy = ny * player.speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(player.r, Math.min(W-player.r, player.x));
    player.y = Math.max(player.r, Math.min(H-player.r, player.y));

    // shooting (rate-limited)
    lastShot += dt;
    const rate = currentWeapon.rate;
    if((input.mouseDown || input.fireHeld) && lastShot >= rate){
      fireWeapon(currentWeapon, player.x, player.y, input.mouseX, input.mouseY);
      lastShot = 0;
    }

    // update arrows
    for(let i=arrows.length-1;i>=0;i--){
      const a = arrows[i];
      a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
      if(a.life <= 0 || a.x < -200 || a.x > W+200 || a.y < -200 || a.y > H+200) arrows.splice(i,1);
    }

    // enemies movement & collisions
    for(let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      const [dx,dy] = norm(player.x - e.x, player.y - e.y);
      e.x += dx * e.speed * dt; e.y += dy * e.speed * dt;

      // hit by arrows
      for(let j=arrows.length-1;j>=0;j--){
        const a = arrows[j];
        if(dist(e.x,e.y,a.x,a.y) < e.r + a.r){
          e.hp -= a.damage || 1;
          arrows.splice(j,1);
          if(e.hp <= 0){
            score += Math.round(e.r*1.5);
            play('kill', 0.9);
            // chance to spawn small loot drop (coin)
            if(Math.random() < 0.45){
              inventory.coins += Math.round(rand(2,8));
              updateInventoryUI();
            }
            enemies.splice(i,1);
            break;
          }
        }
      }

      // enemy hits player
      if(dist(e.x,e.y,player.x,player.y) < e.r + player.r){
        const dmg = Math.round(6 + e.r*0.18);
        applyDamage(dmg);
        // knockback
        const [kx,ky] = norm(player.x - e.x, player.y - e.y);
        player.x += kx * 20; player.y += ky * 20;
        enemies.splice(i,1);
      }
    }

    // spawn logic
    spawnTimer += dt; difficultyTimer += dt;
    if(difficultyTimer > 12){ difficultyTimer = 0; spawnRate = Math.max(0.45, spawnRate*0.88); }
    if(spawnTimer >= spawnRate){ spawnTimer = 0; const n = Math.random() < 0.12 ? 2 : 1; for(let k=0;k<n;k++) spawnEnemy(); }

    // chest respawn
    for(const c of chests){
      if(c.opened && c.contents.length===0 && c.respawnTimer > 0){
        c.respawnTimer -= dt;
        if(c.respawnTimer <= 0){
          c.locked = Math.random() < 0.35;
          c.opened = false;
          c.contents = generateChestContents();
          c.respawnTimer = 0; c.openAnim = 0;
        }
      }
    }

    // reload ticking
    tickReload(dt);

    // nearby chest detection
    findNearbyChest();
    if(nearbyChestIndex !== -1) interactHint.classList.remove('hidden'); else interactHint.classList.add('hidden');

    // UI
    scoreEl.textContent = `Score: ${score}`;
    healthEl.textContent = `HP: ${Math.max(0, Math.round(player.hp))}`;
    updateInventoryUI();

    draw();
    requestAnimationFrame(update);
  }

  // ----- Draw -----
  function draw(){
    // clear
    ctx.fillStyle = '#071021';
    ctx.fillRect(0,0,W,H);

    // subtle grid
    const gridSize = 48;
    ctx.save(); ctx.globalAlpha = 0.04; ctx.strokeStyle = '#79a7c7'; ctx.lineWidth = 1;
    for(let x = -(player.x % gridSize); x < W; x += gridSize){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y = -(player.y % gridSize); y < H; y += gridSize){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    // chests
    for(const c of chests){
      ctx.save();
      const wob = Math.sin((performance.now()/600) + (c.x*0.01))*1.2;
      const openOffset = c.opened ? 8 : 0;
      ctx.fillStyle = c.locked ? '#7a4f2f' : '#8b5a35';
      ctx.fillRect(c.x - c.r, c.y - c.r + openOffset - wob, c.r*2, c.r*1.2);
      ctx.fillStyle = '#a67c52';
      const lidH = c.opened ? -10 : 0;
      ctx.fillRect(c.x - c.r, c.y - c.r - 6 + lidH - wob, c.r*2, 8);
      if(c.locked){
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(c.x, c.y - 2 - wob, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffd47a'; ctx.fillRect(c.x-2, c.y - 6 - wob, 4, 6);
      }
      if(dist(player.x,player.y,c.x,c.y) <= CHEST_INTERACT_DIST){
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(c.x - c.r - 6, c.y - c.r - 10, c.r*2 + 12, c.r*1.2 + 20); ctx.stroke();
      }
      ctx.restore();
    }

    // player
    ctx.save();
    ctx.beginPath(); ctx.fillStyle = '#bfefff'; ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    const ang = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
    ctx.translate(player.x, player.y); ctx.rotate(ang);
    ctx.fillStyle = '#7fd1ff'; ctx.fillRect(12, -6, 18, 12);
    ctx.fillStyle = '#ffefc4'; ctx.fillRect(22, -3, 18, 6);
    ctx.restore();

    // arrows / bullets
    for(const a of arrows){
      ctx.save();
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
      ctx.beginPath(); ctx.arc(e.x - e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2);
      ctx.arc(e.x + e.r/3, e.y - e.r/4, Math.max(1, e.r/6), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // crosshair
    ctx.save();
    ctx.beginPath(); ctx.strokeStyle = '#dbe9ff'; ctx.lineWidth = 1.5;
    ctx.moveTo(input.mouseX - 8, input.mouseY); ctx.lineTo(input.mouseX + 8, input.mouseY);
    ctx.moveTo(input.mouseX, input.mouseY - 8); ctx.lineTo(input.mouseX, input.mouseY + 8);
    ctx.stroke(); ctx.restore();
  }

  // ----- Game Over -----
  function die(){ running=false; gameOverEl.classList.remove('hidden'); finalScoreEl.textContent = `Score: ${score}`; play('kill',0.9); }

  restartBtn.addEventListener('click', () => {
    enemies.length = 0; arrows.length = 0;
    player.x = W/2; player.y = H/2; player.hp = 100;
    score = 0; spawnRate = 1.2; spawnTimer = 0; difficultyTimer = 0;
    lastShot = 0; running = true; gameOverEl.classList.add('hidden'); last = performance.now(); requestAnimationFrame(update);
  });

  // ----- Misc helpers -----
  function flashHint(text, duration=1000){
    const hint = document.getElementById('centerHint');
    const prev = hint.textContent;
    hint.textContent = text;
    setTimeout(()=> hint.textContent = prev, duration);
  }
  function flashCenter(text, duration=1200){ flashHint(text,duration); }

  function flashHintSmall(text, duration=900){
    const hint = document.getElementById('centerHint');
    const prev = hint.textContent;
    hint.textContent = text;
    setTimeout(()=> hint.textContent = prev, duration);
  }

  function play(name, vol=1){ try{ const s = SFX[name]; if(!s) return; const c = s.cloneNode(); c.volume = vol; c.play().catch(()=>{}); }catch(e){} }

  function flashScreenDamage(){ damageOverlay.classList.add('show'); setTimeout(()=> damageOverlay.classList.remove('show'), 260); }

  // ----- SFX map hack for play() inside functions -----
  // (we must expose SFX here — earlier SFX is defined above)
  // (already available)

  // ----- Start loop -----
  requestAnimationFrame(update);

  // expose debug helpers
  window.__GAME = { chests, inventory, spawnChest, generateChestContents, enemies, arrows };

})();
