const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const file of fs.readdirSync(root)) if (file.endsWith('.html')) fs.copyFileSync(path.join(root,file),path.join(output,file));
for (const dir of ['css','js','images']) fs.cpSync(path.join(root,dir),path.join(output,dir),{recursive:true});
console.log('Built public frontend; server, SQL and environment files excluded.');
