export function recomputeEntities(filledTiles, addWalls, numBelts, computedWalls, computedBelts) {
    computedWalls.clear();
    computedBelts.clear();
    
    if (filledTiles.size === 0) return;
    
    const neighborOffsets = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0],          [1,  0],
        [-1,  1], [0,  1], [1,  1]
    ];
    
    if (addWalls) {
        for (const tile of filledTiles) {
            const commaIdx = tile.indexOf(',');
            const tx = +tile.substring(0, commaIdx);
            const ty = +tile.substring(commaIdx + 1);
            
            let isEdge = false;
            for (const [dx, dy] of neighborOffsets) {
                if (!filledTiles.has(`${tx + dx},${ty + dy}`)) {
                    isEdge = true;
                    break;
                }
            }
            
            if (isEdge) {
                computedWalls.add(tile);
            }
        }
    }
    
    if (numBelts > 0) {
        let V = new Set(filledTiles);
        
        function erode(tileSet) {
            const nextSet = new Set();
            const offsets = [
                [-1, -1], [0, -1], [1, -1],
                [-1,  0],          [1,  0],
                [-1,  1], [0,  1], [1,  1]
            ];
            for (const tile of tileSet) {
                const [tx, ty] = tile.split(',').map(Number);
                let isEdge = false;
                for (const [dx, dy] of offsets) {
                    if (!tileSet.has(`${tx + dx},${ty + dy}`)) {
                        isEdge = true;
                        break;
                    }
                }
                if (!isEdge) {
                    nextSet.add(tile);
                }
            }
            return nextSet;
        }

        V = erode(V);
        if (addWalls) {
            V = erode(V);
        }
        
        const dirOffsets = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, S, W, N
        
        for (let b = 0; b < numBelts; b++) {
            const C = new Set();
            for (const tile of V) {
                const [x, y] = tile.split(',').map(Number);
                if (V.has(`${x+1},${y}`) && V.has(`${x},${y+1}`) && V.has(`${x+1},${y+1}`)) {
                    C.add(tile);
                }
            }
            
            V = new Set();
            for (const center of C) {
                const [x, y] = center.split(',').map(Number);
                V.add(`${x},${y}`);
                V.add(`${x+1},${y}`);
                V.add(`${x},${y+1}`);
                V.add(`${x+1},${y+1}`);
            }
            
            if (V.size === 0) break;
            
            const unvisitedV = new Set(V);
            const components = [];
            while (unvisitedV.size > 0) {
                const start = unvisitedV.values().next().value;
                const comp = new Set();
                const queue = [start];
                unvisitedV.delete(start);
                
                while (queue.length > 0) {
                    const curr = queue.shift();
                    comp.add(curr);
                    const [cx, cy] = curr.split(',').map(Number);
                    const neighbors = [
                        `${cx+1},${cy}`, `${cx-1},${cy}`,
                        `${cx},${cy+1}`, `${cx},${cy-1}`
                    ];
                    for (const n of neighbors) {
                        if (unvisitedV.has(n)) {
                            unvisitedV.delete(n);
                            queue.push(n);
                        }
                    }
                }
                components.push(comp);
            }
            
            const currentBeltTiles = new Set();
            
            for (const comp of components) {
                let minX = Infinity;
                let minY = Infinity;
                for (const tile of comp) {
                    const [x, y] = tile.split(',').map(Number);
                    if (y < minY || (y === minY && x < minX)) {
                        minY = y;
                        minX = x;
                    }
                }
                
                let currTx = minX;
                let currTy = minY;
                let currDir = 0; // E
                
                const visitedStates = new Set();
                
                while (true) {
                    const stateKey = `${currTx},${currTy},${currDir}`;
                    if (visitedStates.has(stateKey)) break;
                    visitedStates.add(stateKey);
                    
                    let nextTx, nextTy, nextDir;
                    
                    const tryDirs = [
                        (currDir + 3) % 4, // Left
                        currDir,           // Straight
                        (currDir + 1) % 4, // Right
                        (currDir + 2) % 4  // Back
                    ];
                    
                    for (const d of tryDirs) {
                        const tx = currTx + dirOffsets[d][0];
                        const ty = currTy + dirOffsets[d][1];
                        if (comp.has(`${tx},${ty}`)) {
                            nextTx = tx;
                            nextTy = ty;
                            nextDir = d;
                            break;
                        }
                    }
                    
                    if (nextTx === undefined) break;
                    
                    const factorioDir = ((nextDir + 1) % 4) * 4;
                    computedBelts.set(`${currTx},${currTy}`, factorioDir);
                    currentBeltTiles.add(`${currTx},${currTy}`);
                    
                    currTx = nextTx;
                    currTy = nextTy;
                    currDir = nextDir;
                }
            }
            
            // Remove the current belt ring from V for the next iteration
            for (const tile of currentBeltTiles) {
                V.delete(tile);
            }
        }
    }
}
