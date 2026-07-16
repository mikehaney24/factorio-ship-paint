import { generateBlueprint } from './blueprint.js';
import { recomputeEntities as pathfindingRecompute } from './pathfinding.js';

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // CONFIGURATION & CONSTANTS
    // ==========================================
    const CONFIG = {
        TILE_SIZE: 20,
        BG: {
            SIZE: 1024,
            NEBULA_PARALLAX: 0.15,
            NEBULA_SPEED: 20,
            STAR_PARALLAX: 0.02,
            STAR_SPEED: 3,
            COLOR: '#050510'
        },
        GRID_COLOR: '#334155',
        COLORS: {
            WALL_FALLBACK: '#94a3b8',
            BELT_FALLBACK: '#3b82f6',
            FOUNDATION_FALLBACK: '#eab308'
        }
    };
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    
    // UI Elements
    const widthInput = document.getElementById('gridWidth');
    const heightInput = document.getElementById('gridHeight');
    
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    const clearBtn = document.getElementById('clearBtn');
    const brushSizeInput = document.getElementById('brushSize');
    const brushSizeNumber = document.getElementById('brushSizeNumber');
    const brushShapeSelect = document.getElementById('brushShape');
    const brushRotationInput = document.getElementById('brushRotation');
    const brushRotationNumber = document.getElementById('brushRotationNumber');
    const addWallsCheckbox = document.getElementById('addWallsCheckbox');
    
    const exportBtn = document.getElementById('exportBtn');
    const shareBtn = document.getElementById('shareBtn');
    
    // State
    let gridWidth = parseInt(widthInput.value, 10);
    let gridHeight = parseInt(heightInput.value, 10);
    let tileSize = 10;
    let addWalls = addWallsCheckbox.checked;
    
    let isMouseDown = false;
    let currentButton = null; // 0 for left, 2 for right
    let touchMode = 0; // 0 for draw, 2 for erase, 3 for pan
    let currentBrushSize = parseInt(brushSizeInput.value, 10);
    let currentBrushShape = brushShapeSelect.value;
    let currentBrushRotation = parseInt(brushRotationInput.value, 10) || 0;
    let hoverCoords = null;
    let lastInteractCoords = null;
    
    let undoStack = [];
    let redoStack = [];
    let currentStateSnapshot = null;
    
    let activePointers = new Map();
    
    let cameraX = 0;
    let cameraY = 0;
    let cameraZoom = 1.0;
    let cameraInitialized = false;
    let isPanning = false;
    let lastPanX = 0;
    let lastPanY = 0;
    let isPinching = false;
    let lastPinchDist = 0;
    
    // Use a Set to store filled coordinates "x,y"
    let filledTiles = new Set();
    
    let computedWalls = new Set();
    let computedBelts = new Map();
    
    // Background generation
    const starfieldCanvas = document.createElement('canvas');
    starfieldCanvas.width = 1024;
    starfieldCanvas.height = 1024;
    const sCtx = starfieldCanvas.getContext('2d');
    
    const nebulaCanvas = document.createElement('canvas');
    nebulaCanvas.width = 1024;
    nebulaCanvas.height = 1024;
    const nCtx = nebulaCanvas.getContext('2d');
    
    // Clouds
    for (let i = 0; i < 15; i++) {
        const cx = Math.random() * 1024;
        const cy = Math.random() * 1024;
        const r = 100 + Math.random() * 200;
        const hue = 200 + Math.random() * 40; // cool blue hues (less purple)
        const sat = 5 + Math.random() * 10; // 5%-15% saturation (mostly greyscale)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const drawX = cx + dx * 1024;
                const drawY = cy + dy * 1024;
                const grad = nCtx.createRadialGradient(drawX, drawY, 0, drawX, drawY, r);
                grad.addColorStop(0, `hsla(${hue}, ${sat}%, 50%, 0.1)`);
                grad.addColorStop(1, `hsla(${hue}, ${sat}%, 50%, 0)`);
                nCtx.fillStyle = grad;
                nCtx.beginPath();
                nCtx.arc(drawX, drawY, r, 0, Math.PI * 2);
                nCtx.fill();
            }
        }
    }
    
    // Stars
    for (let i = 0; i < 500; i++) {
        const cx = Math.random() * 1024;
        const cy = Math.random() * 1024;
        const r = 0.5 + Math.random() * 1.5;
        const a = 0.2 + Math.random() * 0.8;
        sCtx.fillStyle = `rgba(255, 255, 255, ${a})`;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                sCtx.beginPath();
                sCtx.arc(cx + dx * 1024, cy + dy * 1024, r, 0, Math.PI * 2);
                sCtx.fill();
            }
        }
    }
    
    const foundationImg = new Image();
    foundationImg.src = 'assets/foundation.png?v=3';
    foundationImg.onload = () => { if (typeof render === 'function') render(); };
    
    const wallImg = new Image();
    wallImg.src = 'assets/wall.png?v=2';
    wallImg.onload = () => { if (typeof render === 'function') render(); };
    
    const beltImg = new Image();
    beltImg.src = 'assets/belt.png?v=3';
    beltImg.onload = () => { if (typeof render === 'function') render(); };
    
    function recomputeEntities() {
        const numBeltsElem = document.getElementById('numBelts');
        const numBelts = numBeltsElem ? parseInt(numBeltsElem.value, 10) : 0;
        pathfindingRecompute(filledTiles, addWalls, numBelts, computedWalls, computedBelts);
    }
    
    function saveToStorage() {
        try {
            localStorage.setItem('factorio-ship-paint-grid', JSON.stringify({ w: gridWidth, h: gridHeight }));
            localStorage.setItem('factorio-ship-paint-tiles', JSON.stringify([...filledTiles]));
            localStorage.setItem('factorio-ship-paint-brush', JSON.stringify({ size: currentBrushSize, shape: currentBrushShape, rotation: currentBrushRotation }));
            localStorage.setItem('factorio-ship-paint-walls', addWallsCheckbox.checked);
            
            const numBeltsElem = document.getElementById('numBelts');
            if (numBeltsElem) {
                localStorage.setItem('factorio-ship-paint-belts', numBeltsElem.value);
            }
        } catch (e) {
            console.error('Failed to save state to localStorage:', e);
        }
        
        try {
            updateUrlHash();
        } catch (e) {
            console.error('Failed to update URL hash:', e);
        }
    }

    function updateUrlHash() {
        if (filledTiles.size === 0) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            return;
        }
        
        // Custom binary format:
        // Byte 0-1: gridWidth
        // Byte 2-3: gridHeight
        // Byte 4+: packed bitset of filledTiles
        const totalTiles = gridWidth * gridHeight;
        const packedByteLength = Math.ceil(totalTiles / 8);
        const buffer = new Uint8Array(4 + packedByteLength);
        
        buffer[0] = (gridWidth >> 8) & 0xFF;
        buffer[1] = gridWidth & 0xFF;
        buffer[2] = (gridHeight >> 8) & 0xFF;
        buffer[3] = gridHeight & 0xFF;
        
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
                const idx = ty * gridWidth + tx;
                const byteIdx = 4 + Math.floor(idx / 8);
                const bitIdx = idx % 8;
                buffer[byteIdx] |= (1 << bitIdx);
            }
        }
        
        const deflated = pako.deflate(buffer);
        let binaryString = '';
        for (let i = 0; i < deflated.length; i++) {
            binaryString += String.fromCharCode(deflated[i]);
        }
        const base64 = btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        history.replaceState(null, '', '#v1=' + base64);
    }

    function loadFromUrl() {
        if (!window.location.hash) return false;
        
        try {
            if (window.location.hash.startsWith('#s=')) {
                // legacy JSON-based format
                let base64 = window.location.hash.substring(3);
                // restore base64 padding if needed
                base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4) base64 += '=';
                
                const binaryString = atob(base64);
                const deflated = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    deflated[i] = binaryString.charCodeAt(i);
                }
                const jsonStr = pako.inflate(deflated, { to: 'string' });
                const state = JSON.parse(jsonStr);
                
                if (state.w && state.h) {
                    gridWidth = state.w;
                    gridHeight = state.h;
                    widthInput.value = gridWidth;
                    heightInput.value = gridHeight;
                }
                if (state.t && Array.isArray(state.t)) {
                    filledTiles = new Set(state.t);
                }
                
                // Immediately upgrade to new format
                setTimeout(updateUrlHash, 100);
                return true;
                
            } else if (window.location.hash.startsWith('#v1=')) {
                // new binary packed format
                let base64 = window.location.hash.substring(4);
                base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4) base64 += '=';
                
                const binaryString = atob(base64);
                const deflated = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    deflated[i] = binaryString.charCodeAt(i);
                }
                const buffer = pako.inflate(deflated);
                
                if (buffer.length >= 4) {
                    gridWidth = (buffer[0] << 8) | buffer[1];
                    gridHeight = (buffer[2] << 8) | buffer[3];
                    widthInput.value = gridWidth;
                    heightInput.value = gridHeight;
                    
                    filledTiles.clear();
                    const totalTiles = gridWidth * gridHeight;
                    for (let idx = 0; idx < totalTiles; idx++) {
                        const byteIdx = 4 + Math.floor(idx / 8);
                        if (byteIdx < buffer.length) {
                            const bitIdx = idx % 8;
                            if (buffer[byteIdx] & (1 << bitIdx)) {
                                const tx = idx % gridWidth;
                                const ty = Math.floor(idx / gridWidth);
                                filledTiles.add(`${tx},${ty}`);
                            }
                        }
                    }
                }
                return true;
            }
        } catch (e) {
            console.error('Failed to load from URL:', e);
        }
        return false;
    }

    function loadFromStorage() {
        try {
            const brushStr = localStorage.getItem('factorio-ship-paint-brush');
            if (brushStr) {
                const brush = JSON.parse(brushStr);
                if (brush.size) {
                    currentBrushSize = brush.size;
                    brushSizeInput.value = brush.size;
                    brushSizeNumber.value = brush.size;
                }
                if (brush.shape) {
                    currentBrushShape = brush.shape;
                    brushShapeSelect.value = brush.shape;
                }
                if (brush.rotation !== undefined) {
                    currentBrushRotation = brush.rotation;
                    brushRotationInput.value = brush.rotation;
                    brushRotationNumber.value = brush.rotation;
                }
            }
            
            const wallsStr = localStorage.getItem('factorio-ship-paint-walls');
            if (wallsStr !== null) {
                addWalls = wallsStr === 'true';
                addWallsCheckbox.checked = addWalls;
            }
            
            const beltsStr = localStorage.getItem('factorio-ship-paint-belts');
            const numBeltsElem = document.getElementById('numBelts');
            if (beltsStr !== null && numBeltsElem) {
                numBeltsElem.value = beltsStr;
            }
            
            // Try loading core state from URL first
            if (loadFromUrl()) {
                recomputeEntities();
                return;
            }
            
            const gridStr = localStorage.getItem('factorio-ship-paint-grid');
            if (gridStr) {
                const grid = JSON.parse(gridStr);
                if (grid.w && grid.h) {
                    gridWidth = grid.w;
                    gridHeight = grid.h;
                    widthInput.value = gridWidth;
                    heightInput.value = gridHeight;
                }
            }
            
            const tilesStr = localStorage.getItem('factorio-ship-paint-tiles');
            if (tilesStr) {
                const tiles = JSON.parse(tilesStr);
                if (Array.isArray(tiles)) {
                    filledTiles = new Set(tiles);
                }
            }
            recomputeEntities();
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }
    
    function updateUndoRedoButtons() {
        undoBtn.disabled = undoStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
    }
    
    function saveSnapshot() {
        currentStateSnapshot = new Set(filledTiles);
    }
    
    function commitSnapshot() {
        if (!currentStateSnapshot) return;
        if (currentStateSnapshot.size !== filledTiles.size || ![...currentStateSnapshot].every(t => filledTiles.has(t))) {
            undoStack.push(currentStateSnapshot);
            redoStack = [];
            updateUndoRedoButtons();
            saveToStorage();
            recomputeEntities();
        }
        currentStateSnapshot = null;
    }
    
    function undo() {
        if (undoStack.length === 0) return;
        redoStack.push(new Set(filledTiles));
        filledTiles = undoStack.pop();
        recomputeEntities();
        render();
        updateUndoRedoButtons();
        saveToStorage();
    }
    
    function redo() {
        if (redoStack.length === 0) return;
        undoStack.push(new Set(filledTiles));
        filledTiles = redoStack.pop();
        recomputeEntities();
        render();
        updateUndoRedoButtons();
        saveToStorage();
    }
    
    function isTileInBrush(dx, dy, radius, shape, rotation = 0) {
        const theta = rotation * Math.PI / 180;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        
        const rx = dx * cos + dy * sin;
        const ry = -dx * sin + dy * cos;

        if (shape === 'circle') {
            return rx*rx + ry*ry <= radius * radius;
        } else if (shape === 'square') {
            return Math.abs(rx) <= radius && Math.abs(ry) <= radius;
        } else if (shape === 'diamond') {
            return Math.abs(rx) + Math.abs(ry) <= radius;
        } else if (shape === 'rectangle') {
            return Math.abs(rx) <= radius && Math.abs(ry) <= Math.max(1, Math.floor(radius / 2));
        } else if (shape === 'triangle') {
            return ry >= (2 * Math.abs(rx) - radius) && ry <= radius;
        } else if (shape === 'half-circle') {
            return rx*rx + ry*ry <= radius * radius && ry >= 0;
        }
        return false;
    }

    function initCanvas() {
        const wrapper = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        // Setup high-DPI canvas
        canvas.width = wrapper.clientWidth * dpr;
        canvas.height = wrapper.clientHeight * dpr;
        canvas.style.width = `${wrapper.clientWidth}px`;
        canvas.style.height = `${wrapper.clientHeight}px`;
        
        // Reset scale before applying new one
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        // Logical size used for zooming calculations
        const logicalWidth = wrapper.clientWidth;
        const logicalHeight = wrapper.clientHeight;
        
        tileSize = CONFIG.TILE_SIZE;
        
        if (!cameraInitialized) {
            const gridPixelWidth = gridWidth * tileSize;
            const gridPixelHeight = gridHeight * tileSize;
            
            const scaleX = (logicalWidth - 100) / gridPixelWidth; // 100px padding
            const scaleY = (logicalHeight - 100) / gridPixelHeight;
            cameraZoom = Math.min(scaleX, scaleY, 2.0);
            
            cameraX = (logicalWidth - gridPixelWidth * cameraZoom) / 2;
            cameraY = (logicalHeight - gridPixelHeight * cameraZoom) / 2;
            cameraInitialized = true;
        }
        
        // Dynamically update brush size max to fit the largest canvas dimension
        const maxDim = Math.max(gridWidth, gridHeight);
        brushSizeInput.max = maxDim;
        brushSizeNumber.max = maxDim;
        if (currentBrushSize > maxDim) {
            currentBrushSize = maxDim;
            brushSizeInput.value = currentBrushSize;
            brushSizeNumber.value = currentBrushSize;
        }
        
        render();
    }
    function render() {
        // no-op, for compatibility with existing calls
    }
    
    function gameLoop() {
        drawCanvas();
        requestAnimationFrame(gameLoop);
    }
    
    // Start continuous animation loop
    requestAnimationFrame(gameLoop);
    
    function drawCanvas() {
        // Draw Parallax Background layers
        const bgSize = CONFIG.BG.SIZE;
        const t = performance.now() / 1000;
        
        ctx.fillStyle = CONFIG.BG.COLOR;
        // canvas.width/height is physical, but ctx is scaled to logical by dpr.
        // We use wrapper client sizes for logical filling
        const logicalWidth = canvas.parentElement.clientWidth;
        const logicalHeight = canvas.parentElement.clientHeight;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        
        // Nebula layer
        let nebulaX = (cameraX * CONFIG.BG.NEBULA_PARALLAX) % bgSize;
        if (nebulaX > 0) nebulaX -= bgSize;
        let nebulaY = ((cameraY * CONFIG.BG.NEBULA_PARALLAX) + t * CONFIG.BG.NEBULA_SPEED) % bgSize;
        if (nebulaY > 0) nebulaY -= bgSize;
        
        for (let x = nebulaX; x < logicalWidth; x += bgSize) {
            for (let y = nebulaY; y < logicalHeight; y += bgSize) {
                ctx.drawImage(nebulaCanvas, x, y);
            }
        }
        
        // Stars layer
        let starX = (cameraX * CONFIG.BG.STAR_PARALLAX) % bgSize;
        if (starX > 0) starX -= bgSize;
        let starY = ((cameraY * CONFIG.BG.STAR_PARALLAX) + t * CONFIG.BG.STAR_SPEED) % bgSize;
        if (starY > 0) starY -= bgSize;
        
        for (let x = starX; x < logicalWidth; x += bgSize) {
            for (let y = starY; y < logicalHeight; y += bgSize) {
                ctx.drawImage(starfieldCanvas, x, y);
            }
        }
        
        ctx.save();
        ctx.translate(cameraX, cameraY);
        ctx.scale(cameraZoom, cameraZoom);
        
        // Draw grid lines
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 0.5 / cameraZoom;
        ctx.beginPath();
        for (let x = 0; x <= gridWidth; x++) {
            ctx.moveTo(x * tileSize, 0);
            ctx.lineTo(x * tileSize, gridHeight * tileSize);
        }
        for (let y = 0; y <= gridHeight; y++) {
            ctx.moveTo(0, y * tileSize);
            ctx.lineTo(gridWidth * tileSize, y * tileSize);
        }
        ctx.stroke();

        // Draw filled tiles (foundation)
        ctx.beginPath();
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            if (foundationImg.complete && foundationImg.naturalWidth !== 0) {
                // Pseudo-random deterministic hash based on coordinates to pick 1 of 16 variations
                let h = tx * 374761393 + ty * 668265263;
                h = (h ^ (h >> 13)) * 1274126177;
                const variant = Math.abs(h ^ (h >> 16)) % 16;
                
                const sx = variant * 64;
                ctx.drawImage(foundationImg, sx, 0, 64, 64, tx * tileSize, ty * tileSize, tileSize, tileSize);
            } else {
                ctx.fillStyle = CONFIG.COLORS.FOUNDATION_FALLBACK;
                ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
            }
        }
        
        // Draw walls
        for (const wall of computedWalls) {
            const commaIdx = wall.indexOf(',');
            const tx = +wall.substring(0, commaIdx);
            const ty = +wall.substring(commaIdx + 1);
            if (wallImg.complete && wallImg.naturalWidth !== 0) {
                // wall-single.png is 128x86 for a 64x64 tile.
                // 128/64 = 2 width ratio. 86/64 = 1.34375 height ratio.
                // Center horizontally, align bottom with tile bottom.
                const w = tileSize * 2;
                const h = tileSize * (86 / 64);
                const drawX = tx * tileSize - (tileSize / 2);
                const drawY = ty * tileSize - (tileSize * (22 / 64));
                ctx.drawImage(wallImg, drawX, drawY, w, h);
            } else {
                ctx.fillStyle = CONFIG.COLORS.WALL_FALLBACK;
                ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
            }
        }
        
        // Draw belts
        for (const [key, dir] of computedBelts.entries()) {
            const commaIdx = key.indexOf(',');
            const tx = +key.substring(0, commaIdx);
            const ty = +key.substring(commaIdx + 1);
            if (beltImg.complete && beltImg.naturalWidth !== 0) {
                ctx.save();
                ctx.translate(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
                // Subtract Math.PI/2 (90 degrees) to correct for the base icon orientation
                let angle = -Math.PI / 2; // North (0)
                if (dir === 2) angle = 0; // East
                else if (dir === 4) angle = Math.PI / 2; // South
                else if (dir === 6) angle = Math.PI; // West
                ctx.rotate(angle);
                // express-transport-belt icon is 120x64 because it includes mipmaps.
                // We only want to draw the first 64x64 block (the main icon).
                ctx.drawImage(beltImg, 0, 0, 64, 64, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
                ctx.restore();
            } else {
                ctx.fillStyle = CONFIG.COLORS.BELT_FALLBACK;
                ctx.fillRect(tx * tileSize + tileSize/4, ty * tileSize + tileSize/4, tileSize/2, tileSize/2);
            }
        }
        
        // Draw center axes slightly brighter
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1 / cameraZoom;
        const cx = Math.floor(gridWidth / 2) * tileSize;
        const cy = Math.floor(gridHeight / 2) * tileSize;
        
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, gridHeight * tileSize);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(gridWidth * tileSize, cy);
        ctx.stroke();

        // Draw brush preview
        if (hoverCoords && !isPanning && !isPinching) {
            if (isMouseDown) {
                ctx.fillStyle = currentButton === 0 ? 'rgba(59, 130, 246, 0.5)' : 'rgba(239, 68, 68, 0.5)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            }
            const radius = currentBrushSize / 2;
            const centerTx = hoverCoords.tx;
            const centerTy = hoverCoords.ty;

            const startX = Math.floor(centerTx - radius);
            const endX = Math.ceil(centerTx + radius);
            const startY = Math.floor(centerTy - radius);
            const endY = Math.ceil(centerTy + radius);

            ctx.beginPath();
            for (let x = startX; x <= endX; x++) {
                for (let y = startY; y <= endY; y++) {
                    if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                        const dx = x - centerTx;
                        const dy = y - centerTy;
                        if (isTileInBrush(dx, dy, radius, currentBrushShape, currentBrushRotation)) {
                            ctx.rect(x * tileSize, y * tileSize, tileSize, tileSize);
                        }
                    }
                }
            }
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    function resetHoverToCenter() {
        const viewCenterX = canvas.clientWidth / 2;
        const viewCenterY = canvas.clientHeight / 2;
        const worldX = (viewCenterX - cameraX) / cameraZoom;
        const worldY = (viewCenterY - cameraY) / cameraZoom;
        hoverCoords = { 
            tx: Math.floor(worldX / tileSize), 
            ty: Math.floor(worldY / tileSize) 
        };
    }

    function getTileCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const worldX = (mouseX - cameraX) / cameraZoom;
        const worldY = (mouseY - cameraY) / cameraZoom;
        
        const tx = Math.floor(worldX / tileSize);
        const ty = Math.floor(worldY / tileSize);
        
        if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
            return { tx, ty };
        }
        return null;
    }
    
    function interact(e) {
        const coords = getTileCoords(e);
        if (!coords) return;
        
        // Prevent redundant processing if mouse is still in the same tile during drag
        if (lastInteractCoords && lastInteractCoords.tx === coords.tx && lastInteractCoords.ty === coords.ty) {
            return;
        }
        lastInteractCoords = coords;
        
        const radius = currentBrushSize / 2;
        const centerTx = coords.tx;
        const centerTy = coords.ty;

        const startX = Math.floor(centerTx - radius);
        const endX = Math.ceil(centerTx + radius);
        const startY = Math.floor(centerTy - radius);
        const endY = Math.ceil(centerTy + radius);

        let changed = false;
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                    const dx = x - centerTx;
                    const dy = y - centerTy;
                    if (isTileInBrush(dx, dy, radius, currentBrushShape, currentBrushRotation)) {
                        const key = `${x},${y}`;
                        if (currentButton === 0) { // Left click
                            if (!filledTiles.has(key)) {
                                filledTiles.add(key);
                                changed = true;
                            }
                        } else if (currentButton === 2) { // Right click
                            if (filledTiles.has(key)) {
                                filledTiles.delete(key);
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Prevent context menu to allow right click to erase
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Pointer Events for Draw, Pan, Zoom
    canvas.addEventListener('pointerdown', (e) => {
        activePointers.set(e.pointerId, e);
        
        if (activePointers.size === 2) {
            // Start pinch
            if (isMouseDown && currentStateSnapshot) {
                // Revert accidental drawing from the first finger of the pinch
                filledTiles = new Set(currentStateSnapshot);
                currentStateSnapshot = null;
            }
            
            isMouseDown = false;
            currentButton = null;
            isPinching = true;
            isPanning = false;
            
            const pts = Array.from(activePointers.values());
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            lastPinchDist = Math.sqrt(dx*dx + dy*dy);
            
            lastPanX = (pts[0].clientX + pts[1].clientX) / 2;
            lastPanY = (pts[0].clientY + pts[1].clientY) / 2;
            return;
        }
        
        if (activePointers.size > 2) return;
        
        if (e.button === 1 || (e.pointerType === 'touch' && touchMode === 3)) { 
            // Middle click pan (or touch pan if we had a mode for it)
            isPanning = true;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
            return;
        }
        
        // Draw / Erase
        if (e.button === 0 || e.button === 2 || e.pointerType === 'touch') {
            isMouseDown = true;
            if (e.pointerType === 'touch') {
                currentButton = touchMode;
            } else {
                currentButton = e.button;
            }
            lastInteractCoords = null;
            canvas.setPointerCapture(e.pointerId);
            saveSnapshot();
            interact(e);
            render();
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (activePointers.has(e.pointerId)) {
            activePointers.set(e.pointerId, e);
        }
        
        if (isPinching && activePointers.size === 2) {
            const pts = Array.from(activePointers.values());
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            const zoomFactor = dist / lastPinchDist;
            lastPinchDist = dist;
            
            const midX = (pts[0].clientX + pts[1].clientX) / 2;
            const midY = (pts[0].clientY + pts[1].clientY) / 2;
            
            const panDx = midX - lastPanX;
            const panDy = midY - lastPanY;
            
            lastPanX = midX;
            lastPanY = midY;
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = midX - rect.left;
            const mouseY = midY - rect.top;
            const oldWorldX = (mouseX - cameraX) / cameraZoom;
            const oldWorldY = (mouseY - cameraY) / cameraZoom;
            
            cameraZoom *= zoomFactor;
            cameraZoom = Math.max(0.1, Math.min(cameraZoom, 5.0));
            
            cameraX = mouseX - oldWorldX * cameraZoom + panDx;
            cameraY = mouseY - oldWorldY * cameraZoom + panDy;
            
            render();
            return;
        }
        
        if (isPanning) {
            const panDx = e.clientX - lastPanX;
            const panDy = e.clientY - lastPanY;
            cameraX += panDx;
            cameraY += panDy;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
            render();
            return;
        }
        
        hoverCoords = getTileCoords(e);
        if (isMouseDown) {
            interact(e);
        }
        render();
    });

    canvas.addEventListener('pointerup', (e) => {
        activePointers.delete(e.pointerId);
        
        if (activePointers.size < 2) {
            isPinching = false;
        }
        
        if (isPanning && activePointers.size === 0) {
            isPanning = false;
        }
        
        if (isMouseDown && activePointers.size === 0) {
            isMouseDown = false;
            currentButton = null;
            lastInteractCoords = null;
            commitSnapshot();
            render();
        }
    });

    canvas.addEventListener('pointercancel', (e) => {
        activePointers.delete(e.pointerId);
        
        if (activePointers.size < 2) {
            isPinching = false;
        }
        
        if (activePointers.size === 0) {
            isPanning = false;
            isMouseDown = false;
            currentButton = null;
            lastInteractCoords = null;
            render();
        }
    });
    
    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const direction = Math.sign(e.deltaY);
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const oldWorldX = (mouseX - cameraX) / cameraZoom;
        const oldWorldY = (mouseY - cameraY) / cameraZoom;

        if (direction > 0) {
            cameraZoom /= zoomFactor;
        } else {
            cameraZoom *= zoomFactor;
        }
        
        // Clamp zoom
        cameraZoom = Math.max(0.1, Math.min(cameraZoom, 5.0));

        cameraX = mouseX - oldWorldX * cameraZoom;
        cameraY = mouseY - oldWorldY * cameraZoom;
        
        // Also update hover coords since mouse didn't move but world did
        hoverCoords = getTileCoords(e);
        
        render();
    }, { passive: false });
    
    // Touch Mode buttons
    const drawBtn = document.getElementById('drawBtn');
    const eraseBtn = document.getElementById('eraseBtn');
    const panBtn = document.getElementById('panBtn');
    
    // touchMode: 0 = Draw, 2 = Erase, 3 = Pan
    
    if (drawBtn && eraseBtn && panBtn) {
        drawBtn.addEventListener('click', () => {
            touchMode = 0;
            drawBtn.classList.add('active');
            eraseBtn.classList.remove('active');
            panBtn.classList.remove('active');
        });
        
        eraseBtn.addEventListener('click', () => {
            touchMode = 2;
            eraseBtn.classList.add('active');
            drawBtn.classList.remove('active');
            panBtn.classList.remove('active');
        });
        
        panBtn.addEventListener('click', () => {
            touchMode = 3;
            panBtn.classList.add('active');
            drawBtn.classList.remove('active');
            eraseBtn.classList.remove('active');
        });
    }

    brushSizeInput.addEventListener('input', (e) => {
        currentBrushSize = parseInt(e.target.value, 10);
        brushSizeNumber.value = currentBrushSize;
        saveToStorage();
        resetHoverToCenter();
        render();
    });

    brushSizeNumber.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) return; // Allow typing
        
        // Clamp value
        const maxDim = Math.max(gridWidth, gridHeight);
        if (val > maxDim) val = maxDim;
        if (val < 1) val = 1;
        
        currentBrushSize = val;
        brushSizeInput.value = currentBrushSize;
        saveToStorage();
        resetHoverToCenter();
        render();
    });
    
    // In case they leave the field empty or invalid, correct it on blur
    brushSizeNumber.addEventListener('blur', (e) => {
        if (isNaN(parseInt(e.target.value, 10))) {
            brushSizeNumber.value = currentBrushSize;
            saveToStorage();
        }
    });

    brushShapeSelect.addEventListener('change', (e) => {
        currentBrushShape = e.target.value;
        saveToStorage();
        resetHoverToCenter();
        render();
    });
    
    brushRotationInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 0;
        currentBrushRotation = val;
        brushRotationNumber.value = val;
        saveToStorage();
        resetHoverToCenter();
        render();
    });

    brushRotationNumber.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) return;
        if (val < 0) val = 0;
        if (val > 360) val = 360;
        currentBrushRotation = val;
        brushRotationInput.value = val;
        saveToStorage();
        resetHoverToCenter();
        render();
    });

    brushRotationNumber.addEventListener('blur', (e) => {
        if (isNaN(parseInt(e.target.value, 10))) {
            brushRotationNumber.value = currentBrushRotation;
            saveToStorage();
        }
    });
    
    addWallsCheckbox.addEventListener('change', (e) => {
        addWalls = e.target.checked;
        recomputeEntities();
        saveToStorage();
        render();
    });
    
    const numBeltsElem = document.getElementById('numBelts');
    if (numBeltsElem) {
        numBeltsElem.addEventListener('change', () => {
            recomputeEntities();
            saveToStorage();
            render();
        });
    }
    
    // Tool buttons
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // Keyboard shortcuts and WASD panning
    const keys = { w: false, a: false, s: false, d: false };
    let keyboardPanAnimation = null;
    
    function startKeyboardPan() {
        if (keyboardPanAnimation) return;
        
        let lastTime = performance.now();
        function panLoop(time) {
            const dt = (time - lastTime) / 1000;
            lastTime = time;
            
            const panSpeed = 600; // pixels per second
            let dx = 0;
            let dy = 0;
            if (keys.w) dy += 1;
            if (keys.s) dy -= 1;
            if (keys.a) dx += 1;
            if (keys.d) dx -= 1;
            
            if (dx !== 0 || dy !== 0) {
                cameraX += dx * panSpeed * dt;
                cameraY += dy * panSpeed * dt;
                render();
                keyboardPanAnimation = requestAnimationFrame(panLoop);
            } else {
                keyboardPanAnimation = null;
            }
        }
        keyboardPanAnimation = requestAnimationFrame(panLoop);
    }
    
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) {
            keys[key] = true;
            startKeyboardPan();
        }
        
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
            e.preventDefault();
            redo();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.target.tagName === 'INPUT') return;
        
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) {
            keys[key] = false;
        }
    });
    
    clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire grid?')) {
            saveSnapshot();
            filledTiles.clear();
            commitSnapshot();
            render();
        }
    });
    
    function updateGridDimensions() {
        const newW = parseInt(widthInput.value, 10);
        const newH = parseInt(heightInput.value, 10);
        
        if (!isNaN(newW) && !isNaN(newH) && newW >= 10 && newH >= 10) {
            if (newW !== gridWidth || newH !== gridHeight) {
                saveSnapshot();
                gridWidth = newW;
                gridHeight = newH;
                
                // Filter out tiles that are now out of bounds
                const newSet = new Set();
                for (const tile of filledTiles) {
                    const commaIdx = tile.indexOf(',');
                    const tx = +tile.substring(0, commaIdx);
                    const ty = +tile.substring(commaIdx + 1);
                    if (tx < gridWidth && ty < gridHeight) {
                        newSet.add(tile);
                    }
                }
                filledTiles = newSet;
                commitSnapshot();
                saveToStorage(); // ensure it saves even if commitSnapshot didn't see a tile change
                
                initCanvas();
            }
        }
    }

    widthInput.addEventListener('input', updateGridDimensions);
    heightInput.addEventListener('input', updateGridDimensions);
    
    // Export functionality is imported from blueprint.js
    
    exportBtn.addEventListener('click', () => {
        if (filledTiles.size === 0) {
            alert('Please draw a shape first!');
            return;
        }
        
        recomputeEntities();
        const bp = generateBlueprint(gridWidth, gridHeight, filledTiles, computedWalls, computedBelts);
        
        navigator.clipboard.writeText(bp).then(() => {
            const originalText = exportBtn.textContent;
            exportBtn.textContent = 'Copied to clipboard!';
            exportBtn.style.backgroundColor = '#10b981'; // Success green
            
            setTimeout(() => {
                exportBtn.textContent = originalText;
                exportBtn.style.backgroundColor = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy blueprint:', err);
            alert('Failed to copy to clipboard. Please check console.');
        });
    });
    
    shareBtn.addEventListener('click', () => {
        const publicUrl = 'https://mikehaney24.github.io/factorio-ship-paint/' + window.location.hash;
        navigator.clipboard.writeText(publicUrl).then(() => {
            const originalText = shareBtn.textContent;
            shareBtn.textContent = 'Link copied!';
            shareBtn.style.backgroundColor = '#10b981'; // Success green
            
            setTimeout(() => {
                shareBtn.textContent = originalText;
                shareBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link to clipboard.');
        });
    });
    
    // Handle resize
    window.addEventListener('resize', () => {
        initCanvas();
    });
    
    // Initialize
    loadFromStorage();
    initCanvas();
});
