import Phaser from 'phaser';

// Row indices in "Farming Plants v2 watered.png" to use as valid crops.
// Row 0 is a large crop (skipped). Row 7 appears to be a tall crop (skipped).
// Adjust this list if any crop still looks too big in-game.
const VALID_PLANT_TYPES = [19, 2, 3, 5, 6, 7, 10, 11, 13, 14];
const INVENTORY_SIZE = 6;
// Bump this string whenever VALID_PLANT_TYPES changes — clears stale saves automatically.
const SAVE_VERSION = 'v5';

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.load.tilemapTiledJSON('map', 'assets/maps/islandMap.json');

    this.load.image('water', 'assets/tilesets/Water.png');
    this.load.image('Grass', 'assets/tilesets/Grass.png');
    this.load.image('Tilled_Dirt_Wide', 'assets/tilesets/Tilled_Dirt_Wide.png');
    this.load.image('More_Dirt', 'assets/tilesets/Tilled_Dirt_Wide_v2.png');
    this.load.image('Paths', 'assets/tilesets/Paths.png');
    this.load.image('Basic Grass Biom things 1', 'assets/tilesets/Basic Grass Biom things 1.png');
    this.load.image('bridges', 'assets/tilesets/Wood_Bridge.png');
    this.load.image('small_House_light_with_grass', 'assets/tilesets/small_House_light_with_grass.png');
    this.load.image('Chest', 'assets/tilesets/Chest.png');
    this.load.image('Farming Plants v2 watered', 'assets/tilesets/Farming Plants v2 watered.png');
    this.load.image('Fences', 'assets/tilesets/Fences.png');
    this.load.image('inventoryBar', 'assets/tilesets/inventory_example_with_slots_2.png');

    this.load.spritesheet('plants', 'assets/tilesets/Farming Plants v2 watered.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet('player', 'assets/player.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.spritesheet('playerAction', 'assets/Basic Charakter Actions.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.image('dialogBox', 'assets/tilesets/dialog box.png');
  }

  // ─── PERSISTENCE ────────────────────────────────────────────────────────────

  loadFarmSave() {
    try {
      const raw = localStorage.getItem('farmSave');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  savePlot(key, plotData) {
    try {
      const save = this.loadFarmSave();
      save[key] = { plantType: plotData.plantType, stage: plotData.stage, watered: plotData.watered };
      localStorage.setItem('farmSave', JSON.stringify(save));
    } catch {}
  }

  deletePlotSave(key) {
    try {
      const save = this.loadFarmSave();
      delete save[key];
      localStorage.setItem('farmSave', JSON.stringify(save));
    } catch {}
  }

  loadInventorySave() {
    try {
      const raw = localStorage.getItem('inventorySave');
      const saved = raw ? JSON.parse(raw) : null;
      const result = Array(INVENTORY_SIZE).fill(null);
      if (Array.isArray(saved)) {
        saved.slice(0, INVENTORY_SIZE).forEach((item, i) => { result[i] = item; });
      }
      return result;
    } catch {
      return Array(INVENTORY_SIZE).fill(null);
    }
  }

  saveInventory() {
    try {
      localStorage.setItem('inventorySave', JSON.stringify(this.inventoryItems));
    } catch {}
  }

  // ────────────────────────────────────────────────────────────────────────────

  create() {
    // Always start fresh — clear any saved farm and inventory state.
    localStorage.removeItem('farmSave');
    localStorage.removeItem('inventorySave');

    const map = this.make.tilemap({ key: 'map' });

    const tilesets = [
      map.addTilesetImage('water', 'water'),
      map.addTilesetImage('Grass', 'Grass'),
      map.addTilesetImage('Tilled_Dirt_Wide', 'Tilled_Dirt_Wide'),
      map.addTilesetImage('More_Dirt', 'More_Dirt'),
      map.addTilesetImage('Paths', 'Paths'),
      map.addTilesetImage('Basic Grass Biom things 1', 'Basic Grass Biom things 1'),
      map.addTilesetImage('bridges', 'bridges'),
      map.addTilesetImage('small_House_light_with_grass', 'small_House_light_with_grass'),
      map.addTilesetImage('Chest', 'Chest'),
      map.addTilesetImage('Farming Plants v2 watered', 'Farming Plants v2 watered'),
      map.addTilesetImage('Fences', 'Fences'),
    ];

    const waterLayer = map.createLayer('Water', tilesets);
    // Scale up so edges dont show 
    waterLayer.setScale(1.1);
    waterLayer.setPosition(
  -(map.widthInPixels * 0.1) / 2,
  -(map.heightInPixels * 0.1) / 2
);
    this.tweens.add({
      targets: waterLayer,
      x: { from: -(map.widthInPixels * 0.1) / 2 - 2, to: -(map.widthInPixels * 0.1) / 2 + 2 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inout',
    });

    map.createLayer('Island', tilesets);
    map.createLayer('Dirt', tilesets);
    map.createLayer('Paths', tilesets);
    const treesLayer = map.createLayer('Trees/Plants/Bushes', tilesets);
    map.createLayer('Fence', tilesets);
    const playersHouseLayer = map.createLayer('Players_House', tilesets);
    const villagerHousesLayer = map.createLayer('Villager Houses', tilesets);

    this.farmLayer = map.createLayer('Players_Farm', tilesets);
    map.createLayer('Misc.', tilesets);

    // FARM SYSTEM
    this.plants   = this.add.group();
    this.farmData = {};
    this.tileSize = 16;

    // Full table: 33 rows × 7 frames each (112×528 spritesheet)
    this.plantTypes = Array.from({ length: 33 }, (_, row) => ({
      id:     row,
      stages: Array.from({ length: 6 }, (_, s) => row * 7 + s),
    }));

    // Restore saved crops — remap invalid types and resolve any duplicates
    const savedFarm = this.loadFarmSave();
    const restoredTypes = new Set();
    const resaveNeeded  = {};

    Object.entries(savedFarm).forEach(([key, saved]) => {
      let ptId = saved.plantType;

      // Migrate row 1 (old leafy crop) → row 19 without wiping the save
      if (ptId === 1) ptId = 19;
      // Map to a valid single-tile type
      if (!VALID_PLANT_TYPES.includes(ptId)) {
        ptId = VALID_PLANT_TYPES[ptId % VALID_PLANT_TYPES.length];
      }
      // Resolve duplicates — pick the first valid type not yet used
      if (restoredTypes.has(ptId)) {
        ptId = VALID_PLANT_TYPES.find(t => !restoredTypes.has(t)) ?? ptId;
      }
      restoredTypes.add(ptId);
      if (ptId !== saved.plantType) resaveNeeded[key] = ptId;

      const [tileX, tileY] = key.split(',').map(Number);
      const plantType = this.plantTypes[ptId];
      const stage = Math.min(saved.stage, plantType.stages.length - 1);
      this.farmLayer.removeTileAt(tileX, tileY);
      const plant = this.add.sprite(
        tileX * this.tileSize + 8,
        tileY * this.tileSize + 8,
        'plants',
        plantType.stages[stage]
      );
      this.plants.add(plant);
      this.farmData[key] = { sprite: plant, stage, plantType: ptId, watered: saved.watered };
    });

    // Pre-populate all farm tiles with fully-grown crops so the player can
    // immediately see which crop is which before receiving any requests.
    const usedTypes = new Set(Object.values(this.farmData).map(c => c.plantType));
    const farmTiles = [];
    this.farmLayer.forEachTile(tile => {
      if (tile && tile.index !== -1) farmTiles.push({ x: tile.x, y: tile.y });
    });
    farmTiles.forEach(({ x: tileX, y: tileY }) => {
      const key = `${tileX},${tileY}`;
      if (this.farmData[key]) return; // already placed by save restore

      const assignedType = VALID_PLANT_TYPES.find(t => !usedTypes.has(t))
        ?? VALID_PLANT_TYPES[Object.keys(this.farmData).length % VALID_PLANT_TYPES.length];
      usedTypes.add(assignedType);

      const plantType = this.plantTypes[assignedType];
      const maxStage  = plantType.stages.length - 1;

      this.farmLayer.removeTileAt(tileX, tileY);
      const plant = this.add.sprite(
        tileX * this.tileSize + 8,
        tileY * this.tileSize + 8,
        'plants',
        plantType.stages[maxStage]
      );
      this.plants.add(plant);
      this.farmData[key] = { sprite: plant, stage: maxStage, plantType: assignedType, watered: false };
    });

    // DELIVERY — house positions; bubbles are created AFTER camera setup
    this.housePositions = [
      { x: 6.5,  y: 2.5  },
      { x: 24.5, y: 2.5  },
      { x: 2.5,  y: 6.5  },
      { x: 26.5, y: 8.5  },
      { x: 9.5,  y: 15.5 },
      { x: 19.5, y: 14.5 },
    ];

    this.deliveryRequests = this.housePositions.map(house => ({
      house,
      cropType:     null,
      bubble:       null,
      iconSprite:   null,
      timerBarFill: null,
      active:       false,
      deadline:     0,
    }));

    this.completedDeliveries = 0;
    this.gameOver            = false;
    this.requestTimeLimit    = 45000; // ms per request before game over
    this.spawnDelay          = 18000; // ms between new request spawns

    // INVENTORY (6 slots)
    this.inventoryItems = this.loadInventorySave();
    this.selectedIndex  = 0;

    this.inventoryBar = this.add.image(0, 0, 'inventoryBar')
      .setScrollFactor(0)
      .setOrigin(1, 1)
      .setDepth(1000);

    this.inventoryIcons = this.inventoryItems.map(() =>
      this.add.sprite(0, 0, 'plants', 0)
        .setScrollFactor(0)
        .setDepth(1002)
        .setOrigin(0.5)
        .setVisible(false)
        .setScale(1.5)
    );

    this.inventorySelection = this.add.rectangle(0, 0, 40, 40)
      .setStrokeStyle(2, 0xffff00)
      .setScrollFactor(0)
      .setDepth(999)
      .setOrigin(0.5);

    // UI CAMERA — must be created before any world objects that call uiCamera.ignore
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);

    const uiObjects = [this.inventoryBar, this.inventorySelection, ...this.inventoryIcons];
    this.cameras.main.ignore(uiObjects);
    this.uiCamera.ignore(this.children.list.filter(obj => !uiObjects.includes(obj)));

    this.positionInventoryBar();
    this.updateInventoryDisplay();

    this.scale.on('resize', gameSize => {
      this.uiCamera.setSize(gameSize.width, gameSize.height);
      this.positionInventoryBar();
    });

    // PLAYER
    this.player = this.physics.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'player');
    this.player.setCollideWorldBounds(true);
    this.uiCamera.ignore(this.player);

    // Shrink physics body to the character's feet so movement near obstacles feels natural
    this.player.body.setSize(10, 10);
    this.player.body.setOffset(19, 34);

    // Tree collision
    treesLayer.setCollisionByExclusion([-1]);
    this.physics.add.collider(this.player, treesLayer);

    // House collision
    playersHouseLayer.setCollisionByExclusion([-1]);
    this.physics.add.collider(this.player, playersHouseLayer);
    villagerHousesLayer.setCollisionByExclusion([-1]);
    this.physics.add.collider(this.player, villagerHousesLayer);

    // Water boundary: one static zone per empty cell in the Island layer
    const waterColliders = this.physics.add.staticGroup();
    const islandData = map.getLayer('Island');
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        if (islandData.data[row][col].index === -1) {
          const zone = this.add.zone(col * 16 + 8, row * 16 + 8, 16, 16);
          this.physics.add.existing(zone, true);
          waterColliders.add(zone);
        }
      }
    }
    this.physics.add.collider(this.player, waterColliders);

    // ANIMATIONS
    this.anims.create({ key: 'walk-down',  frames: this.anims.generateFrameNumbers('player', { start: 0,  end: 3  }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk-up',    frames: this.anims.generateFrameNumbers('player', { start: 4,  end: 7  }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk-left',  frames: this.anims.generateFrameNumbers('player', { start: 8,  end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

    this.anims.create({ key: 'idle-down',  frames: [{ key: 'player', frame: 0  }] });
    this.anims.create({ key: 'idle-up',    frames: [{ key: 'player', frame: 4  }] });
    this.anims.create({ key: 'idle-left',  frames: [{ key: 'player', frame: 8  }] });
    this.anims.create({ key: 'idle-right', frames: [{ key: 'player', frame: 12 }] });

    this.anims.create({ key: 'tool1-down',  frames: this.anims.generateFrameNumbers('playerAction', { start: 0,  end: 1  }), frameRate: 10 });
    this.anims.create({ key: 'tool1-up',    frames: this.anims.generateFrameNumbers('playerAction', { start: 2,  end: 3  }), frameRate: 10 });
    this.anims.create({ key: 'tool1-left',  frames: this.anims.generateFrameNumbers('playerAction', { start: 4,  end: 5  }), frameRate: 10 });
    this.anims.create({ key: 'tool1-right', frames: this.anims.generateFrameNumbers('playerAction', { start: 6,  end: 7  }), frameRate: 10 });

    this.anims.create({ key: 'tool2-down',  frames: this.anims.generateFrameNumbers('playerAction', { start: 16, end: 17 }), frameRate: 10 });
    this.anims.create({ key: 'tool2-up',    frames: this.anims.generateFrameNumbers('playerAction', { start: 18, end: 19 }), frameRate: 10 });
    this.anims.create({ key: 'tool2-left',  frames: this.anims.generateFrameNumbers('playerAction', { start: 20, end: 21 }), frameRate: 10 });
    this.anims.create({ key: 'tool2-right', frames: this.anims.generateFrameNumbers('playerAction', { start: 22, end: 23 }), frameRate: 10 });

    this.tools            = ['tool1', 'tool2'];
    this.currentToolIndex = 0;
    this.lastDirection    = 'down';
    this.isActing         = false;

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(3);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.keyE     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyQ     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // Schedule initial requests (slow start: 1 early, 1 a bit later)
    this.time.delayedCall(4000,  () => this.trySpawnRequest());
    this.time.delayedCall(10000, () => this.trySpawnRequest());

    // Periodic spawn — gets faster as deliveries are completed
    this.spawnEvent = this.time.addEvent({
      delay:         this.spawnDelay,
      callback:      this.trySpawnRequest,
      callbackScope: this,
      loop:          true,
    });
  }

  // ─── INVENTORY UI ───────────────────────────────────────────────────────────

  positionInventoryBar() {
    const { width, height } = this.scale;
    const padding     = 16;
    const barX        = width  - padding;
    const barY        = height - padding;
    const slotSpacing = 48;
    const barLeft     = barX - this.inventoryBar.displayWidth;
    const startX      = barLeft + 30;
    const slotY       = barY - 43;

    this.inventoryBar.setPosition(barX, barY);
    this.inventoryIcons.forEach((icon, i) => icon.setPosition(startX + i * slotSpacing, slotY));
    this.inventorySelection.setPosition(startX + this.selectedIndex * slotSpacing, slotY);
  }

  updateInventoryDisplay() {
    this.inventoryItems.forEach((item, i) => {
      const icon = this.inventoryIcons[i];
      if (item !== null) {
        icon.setFrame(item.frame).setVisible(true);
      } else {
        icon.setVisible(false);
      }
    });
  }

  addToInventory(item) {
    const slot = this.inventoryItems.findIndex(s => s === null);
    if (slot === -1) return false;
    this.inventoryItems[slot] = item;
    this.saveInventory();
    this.updateInventoryDisplay();
    return true;
  }

  // ─── DELIVERY / REQUEST SYSTEM ──────────────────────────────────────────────

  trySpawnRequest() {
    if (this.gameOver) return;

    // Only request crop types currently planted in the farm
    const farmTypes = [...new Set(Object.values(this.farmData).map(c => c.plantType))];
    if (farmTypes.length === 0) return;

    const inactive    = this.deliveryRequests.filter(r => !r.active);
    if (inactive.length === 0) return;

    // Each active house must request a DIFFERENT crop
    const activeTypes = new Set(this.deliveryRequests.filter(r => r.active).map(r => r.cropType));
    const available   = farmTypes.filter(t => !activeTypes.has(t));
    if (available.length === 0) return;

    const request  = inactive[Math.floor(Math.random() * inactive.length)];
    const cropType = available[Math.floor(Math.random() * available.length)];

    request.cropType  = cropType;
    request.active    = true;
    request.deadline  = this.time.now + this.requestTimeLimit;
    this.showRequestBubble(request);
  }

  showRequestBubble(request) {
    const worldX = request.house.x * this.tileSize + 42;
    const worldY = request.house.y * this.tileSize + 15;

    const pt     = this.plantTypes[request.cropType];
    const bubble = this.add.image(0, 0, 'dialogBox').setOrigin(0.5).setScale(0.36);
    const icon   = this.add.sprite(0, 0, 'plants', pt.stages[pt.stages.length - 1])
      .setOrigin(0.5).setScale(0.5);

    // Timer bar: gray background + colored fill that shrinks left-to-right
    const barBg   = this.add.rectangle(0,   14, 20, 3, 0x333333).setOrigin(0.5, 0.5);
    const barFill = this.add.rectangle(-10, 14, 20, 3, 0x44ff44).setOrigin(0,   0.5);

    const container = this.add.container(worldX, worldY, [bubble, icon, barBg, barFill]).setDepth(100);
    this.uiCamera.ignore(container);

    request.bubble       = container;
    request.iconSprite   = icon;
    request.timerBarFill = barFill;
  }

  updateRequestTimers() {
    const now = this.time.now;
    for (const request of this.deliveryRequests) {
      if (!request.active || !request.timerBarFill) continue;

      const remaining = request.deadline - now;
      const fraction  = Math.max(0, remaining / this.requestTimeLimit);

      request.timerBarFill.setSize(20 * fraction, 3);
      const color = fraction > 0.5 ? 0x44ff44 : fraction > 0.25 ? 0xffaa00 : 0xff4444;
      request.timerBarFill.setFillStyle(color);

      if (remaining <= 0) {
        this.triggerGameOver();
        return;
      }
    }
  }

  triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;

    this.physics.pause();
    if (this.spawnEvent) this.spawnEvent.remove();

    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    const overlay = this.add.rectangle(cx, cy, width, height, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(900);
    const title = this.add.text(cx, cy - 40, 'GAME OVER', {
      font: 'bold 36px Arial', fill: '#ff4444',
      stroke: '#000000', strokeThickness: 5,
    }).setScrollFactor(0).setDepth(901).setOrigin(0.5);
    const score = this.add.text(cx, cy + 5, `Deliveries completed: ${this.completedDeliveries}`, {
      font: '18px Arial', fill: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(901).setOrigin(0.5);
    const hint = this.add.text(cx, cy + 38, 'Press R to play again', {
      font: '13px Arial', fill: '#cccccc',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(901).setOrigin(0.5);

    this.cameras.main.ignore([overlay, title, score, hint]);
    this.input.keyboard.addKey('R').once('down', () => this.scene.restart());
  }

  checkDelivery() {
    if (this.gameOver) return;
    const px = this.player.x / this.tileSize;
    const py = this.player.y / this.tileSize;

    const request = this.deliveryRequests.find(r =>
      r.active &&
      Math.abs(r.house.x - px) <= 2 &&
      Math.abs(r.house.y - py) <= 2
    );
    if (!request) return;

    const slotIndex = this.inventoryItems.findIndex(
      item => item !== null && item.plantType === request.cropType
    );
    if (slotIndex === -1) return;

    // Consume the delivered crop
    this.inventoryItems[slotIndex] = null;
    this.saveInventory();
    this.updateInventoryDisplay();

    // Clear this request slot
    if (request.bubble) request.bubble.destroy();
    request.bubble       = null;
    request.iconSprite   = null;
    request.timerBarFill = null;
    request.cropType     = null;
    request.active       = false;
    request.deadline     = 0;

    this.completedDeliveries++;

    // Speed up spawning (and slightly tighten time limit) as the game progresses
    this.spawnDelay      = Math.max(8000,  this.spawnDelay      - 1500);
    this.requestTimeLimit = Math.max(20000, this.requestTimeLimit - 1000);

    if (this.spawnEvent) {
      this.spawnEvent.remove();
      this.spawnEvent = this.time.addEvent({
        delay:         this.spawnDelay,
        callback:      this.trySpawnRequest,
        callbackScope: this,
        loop:          true,
      });
    }

    this.trySpawnRequest();
    this.showFloatingText(this.player.x, this.player.y - 20, 'Delivered!', '#00ff00');
  }

  // ─── UPDATE LOOP ────────────────────────────────────────────────────────────

  update() {
    if (this.gameOver) return;
    this.updateRequestTimers();

    const speed = 80;
    const { player, cursors, wasd } = this;

    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.currentToolIndex = (this.currentToolIndex + 1) % this.tools.length;
      this.selectedIndex    = this.currentToolIndex;
      this.positionInventoryBar();
    }

    const tool = this.tools[this.currentToolIndex];

    if (Phaser.Input.Keyboard.JustDown(this.keyE) && !this.isActing) {
      this.isActing = true;
      player.setVelocity(0);
      player.anims.play(`${tool}-${this.lastDirection}`);

      let tileX = Math.floor(player.x / this.tileSize);
      let tileY = Math.floor(player.y / this.tileSize);
      if (this.lastDirection === 'left')  tileX--;
      if (this.lastDirection === 'right') tileX++;
      if (this.lastDirection === 'up')    tileY--;
      if (this.lastDirection === 'down')  tileY++;

      const key  = `${tileX},${tileY}`;
      const tile = this.farmLayer.getTileAt(tileX, tileY);

      // ── HOE (tool1): harvest fully-grown crop, or plant seed ────────────────
      if (tool === 'tool1') {
        if (this.farmData[key]) {
          const crop      = this.farmData[key];
          const plantType = this.plantTypes[crop.plantType];
          const maxStage  = plantType.stages.length - 1;

          if (crop.stage >= maxStage) {
            // Try to add to inventory first
            const added = this.addToInventory({ plantType: crop.plantType, frame: plantType.stages[maxStage] });

            if (!added) {
              this.showFloatingText(
                tileX * this.tileSize + 8,
                tileY * this.tileSize,
                'Inventory Full!',
                '#ff4444'
              );
              player.once('animationcomplete', () => { this.isActing = false; });
              return;
            }

            // Harvest pop effect
            const pop = this.add.circle(tileX * this.tileSize + 8, tileY * this.tileSize + 8, 6, 0xffd166, 0.8);
            this.uiCamera.ignore(pop);
            this.tweens.add({ targets: pop, scale: 2, alpha: 0, duration: 250, onComplete: () => pop.destroy() });

            // Reset to seed so the plot can regrow
            crop.stage   = 0;
            crop.watered = false;
            crop.sprite.setFrame(plantType.stages[0]);
            this.savePlot(key, crop);
          }
          // Not fully grown — hoe does nothing
        } else if (tile && !this.farmData[key]) {
          // Plant a new seed on an empty farm tile — always pick a type not already in the farm
          const savedFarm  = this.loadFarmSave();
          const usedTypes  = new Set(Object.values(this.farmData).map(c => c.plantType));
          let assignedType;

          const prevSaved = savedFarm[key];
          if (prevSaved !== undefined && VALID_PLANT_TYPES.includes(prevSaved.plantType) && !usedTypes.has(prevSaved.plantType)) {
            // Re-use this plot's previous type if it doesn't conflict
            assignedType = prevSaved.plantType;
          } else {
            // Pick the first valid type not already growing in the farm
            assignedType = VALID_PLANT_TYPES.find(t => !usedTypes.has(t))
              ?? VALID_PLANT_TYPES[Object.keys(this.farmData).length % VALID_PLANT_TYPES.length];
          }

          this.farmLayer.removeTileAt(tileX, tileY);

          const plant = this.add.sprite(
            tileX * this.tileSize + 8,
            tileY * this.tileSize + 8,
            'plants',
            this.plantTypes[assignedType].stages[0]
          );
          this.uiCamera.ignore(plant);
          this.plants.add(plant);

          const cropData = { sprite: plant, stage: 0, plantType: assignedType, watered: false };
          this.farmData[key] = cropData;
          this.savePlot(key, cropData);

          // A new crop type may now be available — try to open a request for it
          this.trySpawnRequest();
        }
      }

      // ── WATER (tool2): advance crop one stage ───────────────────────────────
      if (tool === 'tool2') {
        if (this.farmData[key]) {
          const crop      = this.farmData[key];
          const plantType = this.plantTypes[crop.plantType];
          const maxStage  = plantType.stages.length - 1;

          const splash = this.add.circle(tileX * this.tileSize + 8, tileY * this.tileSize + 8, 5, 0x4aa3ff, 0.6);
          this.uiCamera.ignore(splash);
          this.tweens.add({ targets: splash, alpha: 0, scale: 1.8, duration: 300, ease: 'Quad.easeOut', onComplete: () => splash.destroy() });

          if (crop.stage < maxStage) {
            crop.stage++;
            crop.watered = true;
            crop.sprite.setFrame(plantType.stages[crop.stage]);
            this.savePlot(key, crop);
          }
        }
      }

      player.once('animationcomplete', () => { this.isActing = false; });
      return;
    }

    // Deliver — SPACE or ENTER near a house with matching crop in inventory
    if (Phaser.Input.Keyboard.JustDown(this.keySpace) || Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      this.checkDelivery();
    }

    if (this.isActing) return;

    player.setVelocity(0);

    if (cursors.left.isDown || wasd.left.isDown) {
      player.setVelocityX(-speed);
      player.anims.play('walk-left', true);
      this.lastDirection = 'left';
    } else if (cursors.right.isDown || wasd.right.isDown) {
      player.setVelocityX(speed);
      player.anims.play('walk-right', true);
      this.lastDirection = 'right';
    } else if (cursors.up.isDown || wasd.up.isDown) {
      player.setVelocityY(-speed);
      player.anims.play('walk-up', true);
      this.lastDirection = 'up';
    } else if (cursors.down.isDown || wasd.down.isDown) {
      player.setVelocityY(speed);
      player.anims.play('walk-down', true);
      this.lastDirection = 'down';
    } else {
      player.anims.play(`idle-${this.lastDirection}`, true);
    }
  }

  // ─── UTILITY ────────────────────────────────────────────────────────────────

  showFloatingText(x, y, message, color = '#ffffff') {
    const text = this.add.text(x, y, message, {
      font: '8px Arial',
      fill: color,
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(200).setOrigin(0.5);
    this.uiCamera.ignore(text);

    this.tweens.add({ targets: text, y: y - 16, alpha: 0, duration: 900, onComplete: () => text.destroy() });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#d8e9b2',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: GameScene,
});
