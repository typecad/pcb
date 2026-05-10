import fs from 'node:fs';

const package_json = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

fs.cp(
  process.env.INIT_CWD + `/node_modules/${package_json.name}/build`,      // copy footprint and symbol from the install node_module location
  process.env.INIT_CWD + '/build',                                  // to the typeCAD project folder structure
  { recursive: true },
  (err) => {
    if (err) {
      console.error(err);
    }
  }
);