export function generateBlueprint(gridWidth, gridHeight, filledTiles, computedWalls, computedBelts) {
    if (filledTiles.size === 0) return '';
    
    const centerX = Math.floor(gridWidth / 2);
    const centerY = Math.floor(gridHeight / 2);
    
    const tiles = [];
    const entities = [];
    let entityNumber = 1;
    
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
    }
    
    for (const wall of computedWalls) {
        const commaIdx = wall.indexOf(',');
        const tx = +wall.substring(0, commaIdx);
        const ty = +wall.substring(commaIdx + 1);
        const px = tx - centerX;
        const py = ty - centerY;
        entities.push({
            entity_number: entityNumber++,
            name: "stone-wall",
            position: { x: px + 0.5, y: py + 0.5 }
        });
    }
    
    for (const [key, dir] of computedBelts.entries()) {
        const commaIdx = key.indexOf(',');
        const tx = +key.substring(0, commaIdx);
        const ty = +key.substring(commaIdx + 1);
        const px = tx - centerX;
        const py = ty - centerY;
        entities.push({
            entity_number: entityNumber++,
            name: "express-transport-belt",
            position: { x: px + 0.5, y: py + 0.5 },
            direction: dir
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
            entities: entities,
            tiles: tiles,
            item: "blueprint",
            version: 281479273971712
        }
    };
    
    const jsonStr = JSON.stringify(blueprintData);
    
    // Convert string to utf-8 byte array
    const utf8Encoder = new TextEncoder();
    const utf8Bytes = utf8Encoder.encode(jsonStr);
    
    // Deflate
    const deflated = window.pako.deflate(utf8Bytes);
    
    // Base64 encode
    let binaryString = '';
    for (let i = 0; i < deflated.length; i++) {
        binaryString += String.fromCharCode(deflated[i]);
    }
    
    return '0' + btoa(binaryString);
}
