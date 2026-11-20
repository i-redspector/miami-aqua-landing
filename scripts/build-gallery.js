/*
 * Builds public/assets/media/gallery.json from the photos/videos in
 * public/assets/media/instagram/ (e.g. the unzipped Browsable export).
 * Usage:  node scripts/build-gallery.js [maxItems]
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'assets', 'media', 'instagram');
const max = Number(process.argv[2]) || 12;
const IMG = /\.(jpe?g|png|webp)$/i, VID = /\.(mp4|webm|mov)$/i;

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = fs.existsSync(dir) ? walk(dir).filter((f) => IMG.test(f) || VID.test(f)) : [];
files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
// Interleave videos and photos so the grid feels varied
const vids = files.filter((f) => VID.test(f)), imgs = files.filter((f) => IMG.test(f));
const mixed = [];
while ((vids.length || imgs.length) && mixed.length < max) { if (vids.length) mixed.push(vids.shift()); if (imgs.length && mixed.length < max) mixed.push(imgs.shift()); }
const rel = (f) => path.relative(path.join(__dirname, '..', 'public'), f).split(path.sep).join('/');
const items = mixed.map((f) => ({ type: VID.test(f) ? 'video' : 'image', src: rel(f) }));
fs.writeFileSync(path.join(dir, '..', 'gallery.json'), JSON.stringify(items, null, 2));
console.log(`Wrote ${items.length} items to public/assets/media/gallery.json`);
