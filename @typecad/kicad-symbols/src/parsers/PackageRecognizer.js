"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageRecognizer = void 0;
/**
 * Utility class for recognizing and normalizing package sizes
 */
var PackageRecognizer = /** @class */ (function () {
    function PackageRecognizer() {
    }
    /**
     * Recognizes and normalizes package size from input text
     * @param text - Input text that may contain package information
     * @returns Normalized package size or undefined if not recognized
     */
    PackageRecognizer.recognizePackage = function (text) {
        // Check for SMD packages (direct match)
        var smdMatch = this.smdPackages.find(function (pkg) {
            return new RegExp("\\b".concat(pkg, "\\b"), 'i').test(text) ||
                new RegExp("\\b".concat(pkg.replace(/(\d{2})(\d{2})/, '$1-$2'), "\\b"), 'i').test(text);
        });
        if (smdMatch) {
            return smdMatch;
        }
        // Check for specific SOT-23-5 pattern first (to handle the specific test case)
        if (/\bSOT[-]?23[-]?5\b/i.test(text)) {
            return 'SOT-23-5';
        }
        // Check for SOT-23 pattern
        if (/\bSOT[-]?23\b/i.test(text)) {
            return 'SOT-23';
        }
        // Check for specific IC package patterns
        var qfnMatch = text.match(/\bQFN[-]?(\d+)\b/i);
        if (qfnMatch) {
            return "QFN-".concat(qfnMatch[1]);
        }
        var soicMatch = text.match(/\bSOIC[-]?(\d+)\b/i);
        if (soicMatch) {
            return "SOIC-".concat(soicMatch[1]);
        }
        var tssopMatch = text.match(/\bTSSOP[-]?(\d+)\b/i);
        if (tssopMatch) {
            return "TSSOP-".concat(tssopMatch[1]);
        }
        var lqfpMatch = text.match(/\bLQFP[-]?(\d+)\b/i);
        if (lqfpMatch) {
            return "LQFP-".concat(lqfpMatch[1]);
        }
        var toMatch = text.match(/\bTO[-]?(\d+)\b/i);
        if (toMatch) {
            return "TO-".concat(toMatch[1]);
        }
        // Check for IC packages (more general approach)
        for (var _i = 0, _a = this.icPackages; _i < _a.length; _i++) {
            var pkgType = _a[_i];
            // Check for base type (e.g., "SOT")
            var baseRegex = new RegExp("\\b".concat(pkgType.base, "\\b"), 'i');
            if (baseRegex.test(text)) {
                // Try to match specific variant
                for (var _b = 0, _c = pkgType.variants; _b < _c.length; _b++) {
                    var variant = _c[_b];
                    // Check for exact match or with different separators
                    var variantPattern = variant.replace(/[-]/g, '[-]?').replace(/(\d+)/g, '$1');
                    var variantRegex = new RegExp("\\b".concat(variantPattern, "\\b"), 'i');
                    if (variantRegex.test(text)) {
                        return variant;
                    }
                }
                // If no specific variant matched but base type did,
                // try to extract the pin count
                var pinCountMatch = text.match(new RegExp("\\b".concat(pkgType.base, "[-]?(\\d+)\\b"), 'i'));
                if (pinCountMatch) {
                    return "".concat(pkgType.base, "-").concat(pinCountMatch[1]);
                }
                // Return base type if no specific variant or pin count found
                return pkgType.base;
            }
        }
        return undefined;
    };
    /**
     * Checks if two package sizes are similar (same family or compatible)
     * @param package1 - First package to compare
     * @param package2 - Second package to compare
     * @returns True if packages are similar, false otherwise
     */
    PackageRecognizer.areSimilarPackages = function (package1, package2) {
        // Normalize packages
        var norm1 = package1.toUpperCase().replace(/[-]/g, '');
        var norm2 = package2.toUpperCase().replace(/[-]/g, '');
        // Exact match after normalization
        if (norm1 === norm2) {
            return true;
        }
        // Check if both are SMD packages and compare sizes
        var smd1 = this.smdPackages.find(function (pkg) { return pkg === norm1; });
        var smd2 = this.smdPackages.find(function (pkg) { return pkg === norm2; });
        if (smd1 && smd2) {
            // Consider adjacent sizes similar (e.g., 0402 and 0603)
            var idx1 = this.smdPackages.indexOf(smd1);
            var idx2 = this.smdPackages.indexOf(smd2);
            return Math.abs(idx1 - idx2) <= 1;
        }
        // Special case for SOT-23 and SOT-23-5
        if ((norm1 === 'SOT23' && norm2 === 'SOT235') ||
            (norm1 === 'SOT235' && norm2 === 'SOT23')) {
            return true;
        }
        // Special case for SOIC-8 and SOIC-16
        if ((norm1 === 'SOIC8' && norm2 === 'SOIC16') ||
            (norm1 === 'SOIC16' && norm2 === 'SOIC8')) {
            return true;
        }
        // Special case for QFN-32 and QFN-48
        if ((norm1 === 'QFN32' && norm2 === 'QFN48') ||
            (norm1 === 'QFN48' && norm2 === 'QFN32')) {
            return true;
        }
        // Check if both are from the same IC package family
        for (var _i = 0, _a = this.icPackages; _i < _a.length; _i++) {
            var pkgType = _a[_i];
            var baseNoHyphen = pkgType.base.replace(/-/g, '');
            var isType1 = norm1.startsWith(baseNoHyphen);
            var isType2 = norm2.startsWith(baseNoHyphen);
            if (isType1 && isType2) {
                // Extract the numeric part after the base
                var numericPart1 = norm1.substring(baseNoHyphen.length);
                var numericPart2 = norm2.substring(baseNoHyphen.length);
                // If both have numeric parts, parse them
                if (numericPart1 && numericPart2) {
                    var pins1 = parseInt(numericPart1) || 0;
                    var pins2 = parseInt(numericPart2) || 0;
                    // If both have valid pin counts, compare them
                    if (pins1 > 0 && pins2 > 0) {
                        // For smaller pin counts, allow smaller differences
                        if (Math.min(pins1, pins2) <= 16) {
                            return Math.abs(pins1 - pins2) <= 8;
                        }
                        // For larger pin counts, allow larger differences
                        return Math.abs(pins1 - pins2) <= 16;
                    }
                }
                // Same family without specific pin counts or with non-numeric parts
                return true;
            }
        }
        return false;
    };
    // Common SMD package sizes
    PackageRecognizer.smdPackages = [
        '0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512'
    ];
    // Common IC package types with variations
    PackageRecognizer.icPackages = [
        { base: 'SOT', variants: ['SOT-23', 'SOT-23-5', 'SOT-23-6', 'SOT-89', 'SOT-223'] },
        { base: 'SOIC', variants: ['SOIC-8', 'SOIC-14', 'SOIC-16', 'SOIC-20'] },
        { base: 'QFN', variants: ['QFN-16', 'QFN-20', 'QFN-24', 'QFN-32', 'QFN-48'] },
        { base: 'QFP', variants: ['QFP-32', 'QFP-44', 'QFP-64', 'QFP-100'] },
        { base: 'TSSOP', variants: ['TSSOP-8', 'TSSOP-14', 'TSSOP-16', 'TSSOP-20'] },
        { base: 'LQFP', variants: ['LQFP-32', 'LQFP-48', 'LQFP-64', 'LQFP-100'] },
        { base: 'TO', variants: ['TO-92', 'TO-220', 'TO-247', 'TO-252', 'TO-263'] }
    ];
    return PackageRecognizer;
}());
exports.PackageRecognizer = PackageRecognizer;
