import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const htmlPath = path.join(projectRoot, 'src', 'viewer', 'diff-viewer.html');
const cssPath = path.join(projectRoot, 'src', 'viewer', 'diff-viewer.css');
const jsPath = path.join(projectRoot, 'dist', 'viewer', 'diff-viewer.js');
const outputPath = path.join(projectRoot, 'dist', 'diff-viewer.html');

if (!fs.existsSync(htmlPath)) {
    console.error('Missing template:', htmlPath);
    process.exit(1);
}
if (!fs.existsSync(cssPath)) {
    console.error('Missing CSS:', cssPath);
    process.exit(1);
}
if (!fs.existsSync(jsPath)) {
    console.error('Missing compiled JS:', jsPath);
    process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

html = html.replace('<!-- INLINE_CSS -->', `<style>\n${css}\n</style>`);
html = html.replace('<!-- INLINE_JS -->', `<script>\n${js}\n</script>`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Assembled viewer written to ${outputPath}`);
