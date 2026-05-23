import fs from 'node:fs';

const package_json = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

fs.cp(
  process.env.INIT_CWD + `/node_modules/${package_json.name}/build`,
  process.env.INIT_CWD + '/build',
  { recursive: true },
  (err) => {
    if (err) {
      console.error(err);
    }
  }
);