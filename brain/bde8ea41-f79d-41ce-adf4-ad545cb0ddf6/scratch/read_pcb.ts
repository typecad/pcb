import * as fs from 'fs';

const content = fs.readFileSync('c:\\typecad\\typeCAD\\demo\\hw\\build\\pro_mini.kicad_pcb', 'utf8');

console.log('--- All Code Properties ---');
const codeMatches = content.matchAll(/\(property "Code" "([^"]+)"/g);
for (const match of codeMatches) {
    console.log(match[1]);
}

console.log('\n--- All References ---');
const refMatches = content.matchAll(/\(property "Reference" "([^"]+)"/g);
for (const match of refMatches) {
    console.log(match[1]);
}
