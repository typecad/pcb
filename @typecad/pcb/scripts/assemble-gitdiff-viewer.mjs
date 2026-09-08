import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const viewerDir = path.join(projectRoot, 'src', 'gitdiff', 'viewer');
const htmlPath = path.join(viewerDir, 'diff-viewer.html');
const cssPath = path.join(viewerDir, 'diff-viewer.css');
const basecoatPath = path.join(viewerDir, 'basecoat.cdn.min.css');
const faviconPath = path.join(viewerDir, 'favicon.ico');
const jsPath = path.join(projectRoot, 'dist', 'gitdiff', 'viewer', 'diff-viewer.js');
const outputPath = path.join(projectRoot, 'dist', 'gitdiff', 'diff-viewer.html');

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

let combinedCss = css;
if (fs.existsSync(basecoatPath)) {
    combinedCss = fs.readFileSync(basecoatPath, 'utf8') + '\n' + css;
}

html = html.replace('<!-- INLINE_CSS -->', `<style>\n${combinedCss}\n</style>`);

if (fs.existsSync(faviconPath)) {
    const faviconB64 = fs.readFileSync(faviconPath).toString('base64');
    html = html.replace('</title>', `</title>\n    <link rel="icon" type="image/x-icon" href="data:image/x-icon;base64,${faviconB64}" />`);
}

html = html.replace('<!-- INLINE_JS -->', `<script>\n${js}\n</script>`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Assembled viewer written to ${outputPath}`);
