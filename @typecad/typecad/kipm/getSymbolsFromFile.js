import fs from 'fs';

function getSymbolsFromFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf8');
  const symbolMatches = content.match(/\(symbol\s+"([^"]+)"/g) || [];
  return symbolMatches.map(match => match.match(/\(symbol\s+"([^"]+)"/)[1]);
}

export default getSymbolsFromFile;
