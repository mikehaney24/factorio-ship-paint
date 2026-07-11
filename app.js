document.addEventListener('DOMContentLoaded', () => {
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
    
    function saveToStorage() {
        try {
            localStorage.setItem('factorio-ship-paint-grid', JSON.stringify({ w: gridWidth, h: gridHeight }));
            localStorage.setItem('factorio-ship-paint-tiles', JSON.stringify([...filledTiles]));
            localStorage.setItem('factorio-ship-paint-brush', JSON.stringify({ size: currentBrushSize, shape: currentBrushShape }));
            localStorage.setItem('factorio-ship-paint-walls', addWallsCheckbox.checked);
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
            }
            
            const wallsStr = localStorage.getItem('factorio-ship-paint-walls');
            if (wallsStr !== null) {
                addWalls = wallsStr === 'true';
                addWallsCheckbox.checked = addWalls;
            }
            
            // Try loading core state from URL first
            if (loadFromUrl()) {
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
        }
        currentStateSnapshot = null;
    }
    
    function undo() {
        if (undoStack.length === 0) return;
        redoStack.push(new Set(filledTiles));
        filledTiles = undoStack.pop();
        render();
        updateUndoRedoButtons();
        saveToStorage();
    }
    
    function redo() {
        if (redoStack.length === 0) return;
        undoStack.push(new Set(filledTiles));
        filledTiles = redoStack.pop();
        render();
        updateUndoRedoButtons();
        saveToStorage();
    }
    
    function isTileInBrush(dx, dy, radius, shape) {
        if (shape === 'circle') {
            return dx*dx + dy*dy <= radius * radius;
        } else if (shape === 'square') {
            return Math.abs(dx) <= radius && Math.abs(dy) <= radius;
        } else if (shape === 'diamond') {
            return Math.abs(dx) + Math.abs(dy) <= radius;
        }
        return false;
    }

    function initCanvas() {
        const wrapper = canvas.parentElement;
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
        
        tileSize = 20; // Fixed logical tile size
        
        if (!cameraInitialized) {
            const gridPixelWidth = gridWidth * tileSize;
            const gridPixelHeight = gridHeight * tileSize;
            
            const scaleX = (canvas.width - 100) / gridPixelWidth; // 100px padding
            const scaleY = (canvas.height - 100) / gridPixelHeight;
            cameraZoom = Math.min(scaleX, scaleY, 2.0);
            
            cameraX = (canvas.width - gridPixelWidth * cameraZoom) / 2;
            cameraY = (canvas.height - gridPixelHeight * cameraZoom) / 2;
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
    let renderPending = false;
    
    function render() {
        if (!renderPending) {
            renderPending = true;
            requestAnimationFrame(() => {
                drawCanvas();
                renderPending = false;
            });
        }
    }
    
    function drawCanvas() {
        // Clear canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(cameraX, cameraY);
        ctx.scale(cameraZoom, cameraZoom);
        
        // Draw grid lines
        ctx.strokeStyle = '#334155';
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

        // Draw filled tiles
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            ctx.rect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        }
        ctx.fill();
        
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
                        if (isTileInBrush(dx, dy, radius, currentBrushShape)) {
                            ctx.rect(x * tileSize, y * tileSize, tileSize, tileSize);
                        }
                    }
                }
            }
            ctx.fill();
        }
        
        ctx.restore();
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

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                    const dx = x - centerTx;
                    const dy = y - centerTy;
                    if (isTileInBrush(dx, dy, radius, currentBrushShape)) {
                        const key = `${x},${y}`;
                        if (currentButton === 0) { // Left click
                            if (!filledTiles.has(key)) {
                                filledTiles.add(key);
                            }
                        } else if (currentButton === 2) { // Right click
                            if (filledTiles.has(key)) {
                                filledTiles.delete(key);
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
        render();
    });
    
    addWallsCheckbox.addEventListener('change', (e) => {
        addWalls = e.target.checked;
        saveToStorage();
    });
    
    // Tool buttons
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
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
    
    // Export functionality
    function generateBlueprint() {
        if (filledTiles.size === 0) return '';
        
        const centerX = Math.floor(gridWidth / 2);
        const centerY = Math.floor(gridHeight / 2);
        
        const tiles = [];
        const entities = [];
        let entityNumber = 1;
        
        const neighborOffsets = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0],          [1,  0],
            [-1,  1], [0,  1], [1,  1]
        ];
        
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            
            const px = tx - centerX;
            const py = ty - centerY;
            
            tiles.push({
                position: { x: px, y: py },
                name: 'space-platform-foundation'
            });
            
            if (addWalls) {
                let isEdge = false;
                for (const [dx, dy] of neighborOffsets) {
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (!filledTiles.has(`${nx},${ny}`)) {
                        isEdge = true;
                        break;
                    }
                }
                
                if (isEdge) {
                    entities.push({
                        entity_number: entityNumber++,
                        name: "stone-wall",
                        position: { x: px + 0.5, y: py + 0.5 }
                    });
                }
            }
        }
        
        const blueprintData = {
            blueprint: {
                icons: [
                    {
                        signal: { type: "item", name: "space-platform-foundation" },
                        index: 1
                    }
                ],
                tiles: tiles,
                item: "blueprint",
                label: "Custom Ship Shape",
                version: 562949953929216
            }
        };
        
        if (entities.length > 0) {
            blueprintData.blueprint.entities = entities;
        }
        
        const jsonStr = JSON.stringify(blueprintData);
        // Use pako (loaded via CDN)
        const deflated = pako.deflate(jsonStr);
        // Convert Uint8Array to base64
        let binaryString = '';
        for (let i = 0; i < deflated.length; i++) {
            binaryString += String.fromCharCode(deflated[i]);
        }
        const base64 = btoa(binaryString);
        return '0' + base64;
    }
    
    exportBtn.addEventListener('click', () => {
        if (filledTiles.size === 0) {
            alert('Please draw a shape first!');
            return;
        }
        
        const bp = generateBlueprint();
        
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
