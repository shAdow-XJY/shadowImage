import fs from 'node:fs/promises';
import sharp from 'sharp';
const all=JSON.parse(await fs.readFile('experiments/generated/manifest.json'));
const picked=all, tiles=[];
for(let i=0;i<picked.length;i++){
  tiles.push({input:await sharp(`experiments/generated/${picked[i].id}.png`).resize(150,100,{fit:'contain',background:'#eee'}).png().toBuffer(),left:i%6*160,top:Math.floor(i/6)*125});
  tiles.push({input:Buffer.from(`<svg width="150" height="22"><text x="5" y="17" font-size="15">${i+1} ${picked[i].hasTransparency?'alpha':''}</text></svg>`),left:i%6*160,top:Math.floor(i/6)*125+100});
}
await sharp({create:{width:960,height:Math.ceil(picked.length/6)*125,channels:3,background:'#fff'}}).composite(tiles).png().toFile('experiments/generated/contact.png');
