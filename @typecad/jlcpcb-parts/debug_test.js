// Quick debug test to see what's happening with the resistance matching
const description1 = "62.5mW Thick Film Resistors 50V ±100ppm/℃ ±1% 10kΩ 0402 Chip Resistor - Surface Mount ROHS";
const description2 = "62.5mW Thick Film Resistors 50V ±100ppm/℃ ±1% 510kΩ 0402 Chip Resistor - Surface Mount ROHS";
const description1Lower = description1.toLowerCase();
const description2Lower = description2.toLowerCase();

const resPattern = /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:Ω|ohm|Ohm|OHM|R)/;

console.log("Testing 10k resistor:");
console.log("Original Description:", description1);
console.log("Lowercase Description:", description1Lower);
const match1 = description1Lower.match(resPattern);
console.log("Match:", match1);

console.log("\nTesting 510k resistor:");
console.log("Original Description:", description2);
console.log("Lowercase Description:", description2Lower);
const match2 = description2Lower.match(resPattern);
console.log("Match:", match2);

// Test with different patterns
console.log("\nTesting different patterns:");
const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:Ω|ohm|Ohm|OHM|R)/,
    /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:ω|ohm|Ohm|OHM|R)/,
    /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:Ω|ω|ohm|Ohm|OHM|R)/,
    /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?[Ωω]/,
    /(\d+(?:\.\d+)?)\s*[mkMG]?[Ωω]/
];

patterns.forEach((pattern, i) => {
    console.log(`Pattern ${i + 1}: ${pattern}`);
    console.log(`  Match 10k: ${description1Lower.match(pattern)}`);
    console.log(`  Match 510k: ${description2Lower.match(pattern)}`);
});

// Check character codes
console.log("\nCharacter analysis:");
const omega1 = description1.match(/[Ωω]/);
const omega2 = description2.match(/[Ωω]/);
if (omega1) {
    console.log("Omega in desc1:", omega1[0], "char code:", omega1[0].charCodeAt(0));
}
if (omega2) {
    console.log("Omega in desc2:", omega2[0], "char code:", omega2[0].charCodeAt(0));
}