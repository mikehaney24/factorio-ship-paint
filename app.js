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
    
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const copyBtn = document.getElementById('copyBtn');
    const blueprintOutput = document.getElementById('blueprintOutput');
    
    // State
    let gridWidth = parseInt(widthInput.value, 10);
    let gridHeight = parseInt(heightInput.value, 10);
    let tileSize = 10;
    
    let isMouseDown = false;
    let currentButton = null; // 0 for left, 2 for right
    let currentBrushSize = parseInt(brushSizeInput.value, 10);
    let currentBrushShape = brushShapeSelect.value;
    let hoverCoords = null;
    let lastInteractCoords = null;
    
    let undoStack = [];
    let redoStack = [];
    let currentStateSnapshot = null;
    
    // Use a Set to store filled coordinates "x,y"
    let filledTiles = new Set();
    
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
        }
        currentStateSnapshot = null;
    }
    
    function undo() {
        if (undoStack.length === 0) return;
        redoStack.push(new Set(filledTiles));
        filledTiles = undoStack.pop();
        render();
        updateUndoRedoButtons();
    }
    
    function redo() {
        if (redoStack.length === 0) return;
        undoStack.push(new Set(filledTiles));
        filledTiles = redoStack.pop();
        render();
        updateUndoRedoButtons();
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
        // Calculate tileSize based on available window space
        const maxCanvasWidth = window.innerWidth - 100;
        const maxCanvasHeight = window.innerHeight - 250;
        
        const sizeX = Math.floor(maxCanvasWidth / gridWidth);
        const sizeY = Math.floor(maxCanvasHeight / gridHeight);
        tileSize = Math.max(5, Math.min(sizeX, sizeY, 20)); // clamp tile size
        
        canvas.width = gridWidth * tileSize;
        canvas.height = gridHeight * tileSize;
        
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
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid lines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = 0; x <= gridWidth; x++) {
            ctx.moveTo(x * tileSize, 0);
            ctx.lineTo(x * tileSize, canvas.height);
        }
        for (let y = 0; y <= gridHeight; y++) {
            ctx.moveTo(0, y * tileSize);
            ctx.lineTo(canvas.width, y * tileSize);
        }
        ctx.stroke();

        // Draw filled tiles
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            ctx.rect(tx * tileSize + 1, ty * tileSize + 1, tileSize - 2, tileSize - 2);
        }
        ctx.fill();
        
        // Draw center axes slightly brighter
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        const cx = Math.floor(gridWidth / 2) * tileSize;
        const cy = Math.floor(gridHeight / 2) * tileSize;
        
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(canvas.width, cy);
        ctx.stroke();

        // Draw brush preview
        if (hoverCoords) {
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
    }
    
    function getTileCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const tx = Math.floor(x / tileSize);
        const ty = Math.floor(y / tileSize);
        
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

    // Mouse Events
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 || e.button === 2) {
            isMouseDown = true;
            currentButton = e.button;
            lastInteractCoords = null;
            saveSnapshot();
            interact(e);
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (isMouseDown && (e.button === 0 || e.button === 2)) {
            isMouseDown = false;
            currentButton = null;
            lastInteractCoords = null;
            commitSnapshot();
            render(); // update brush preview color
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        hoverCoords = getTileCoords(e);
        if (isMouseDown) {
            interact(e);
        }
        render(); // update brush preview color and position
    });

    canvas.addEventListener('mouseout', () => {
        hoverCoords = null;
        render();
    });

    brushSizeInput.addEventListener('input', (e) => {
        currentBrushSize = parseInt(e.target.value, 10);
        brushSizeNumber.value = currentBrushSize;
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
        render();
    });
    
    // In case they leave the field empty or invalid, correct it on blur
    brushSizeNumber.addEventListener('blur', (e) => {
        if (isNaN(parseInt(e.target.value, 10))) {
            brushSizeNumber.value = currentBrushSize;
        }
    });

    brushShapeSelect.addEventListener('change', (e) => {
        currentBrushShape = e.target.value;
        render();
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
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            tiles.push({
                position: { 
                    x: tx - centerX, 
                    y: ty - centerY 
                },
                name: 'space-platform-foundation'
            });
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
        blueprintOutput.value = bp;
        exportModal.classList.remove('hidden');
    });
    
    closeModalBtn.addEventListener('click', () => {
        exportModal.classList.add('hidden');
    });
    
    copyBtn.addEventListener('click', () => {
        blueprintOutput.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = 'Copy to Clipboard';
        }, 2000);
    });
    
    // Handle resize
    window.addEventListener('resize', () => {
        initCanvas();
    });
    
    // Initialize
    initCanvas();
});
