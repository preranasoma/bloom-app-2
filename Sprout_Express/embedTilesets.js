import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const mapPath = 'public/assets/maps/islandMap.json';
const tsxDir = 'public/assets/tilesets';

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

map.tilesets = map.tilesets.map(ts => {
  if (!ts.source) return ts;
  const tsxName = path.basename(ts.source);
  const tsxPath = path.join(tsxDir, tsxName);
  const tsxData = parser.parse(fs.readFileSync(tsxPath, 'utf8')).tileset;
  return {
    ...ts,
    name: tsxData.name,
    tilewidth: parseInt(tsxData.tilewidth),
    tileheight: parseInt(tsxData.tileheight),
    spacing: parseInt(tsxData.spacing || 0),
    margin: parseInt(tsxData.margin || 0),
    columns: parseInt(tsxData.columns),
    tilecount: parseInt(tsxData.tilecount),
    image: path.basename(tsxData.image.source),
    imagewidth: parseInt(tsxData.image.width),
    imageheight: parseInt(tsxData.image.height),
    source: undefined
  };
});

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('Done! Tilesets embedded.');