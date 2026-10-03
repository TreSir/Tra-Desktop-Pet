'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
let checked = 0;
for (const directory of [root,path.join(root,'renderer'),__dirname]) {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    if (!entry.isFile() || !/\.(?:js|cjs)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath,['--check',path.join(directory,entry.name)],{encoding:'utf8'});
    if (result.error || result.status !== 0) {
      console.error(result.error?.message || result.stderr);
      process.exit(1);
    }
    checked++;
  }
}
console.log(`Syntax OK: ${checked} JavaScript files. This does not test Electron interactions.`);
