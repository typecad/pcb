/**
 * This file contains utility functions for validating and normalizing names,
 * wire colors and CSV output in the TypeCAD wiring library.
 */

/**
 * Validates and normalizes a component name by:
 * 1. Replacing hyphens with underscores
 * 2. Replacing spaces with underscores
 *
 * @param name - The original name to validate and normalize
 * @returns The normalized name with hyphens and spaces replaced by underscores
 */
export function normalizeComponentName(name: string): string {
  if (!name) {
    return name; // Return as is if undefined or empty
  }

  let normalizedName = name;
  const changeDetails: string[] = [];

  // Replace hyphens with underscores
  if (normalizedName.includes('-')) {
    normalizedName = normalizedName.replace(/-/g, '_');
    changeDetails.push("hyphens");
  }

  // Replace spaces with underscores
  if (normalizedName.includes(' ')) {
    normalizedName = normalizedName.replace(/\s+/g, '_');
    changeDetails.push("spaces");
  }

  // If the name was changed, log a warning
  if (changeDetails.length > 0) {
    const changesText = changeDetails.join(" and ");
    console.warn(`Warning: Name "${name}" contains ${changesText}. Automatically converting to "${normalizedName}"`);
  }

  return normalizedName;
}

/**
 * Base X11 color names understood by Graphviz (case-insensitive).
 * Numbered variants such as "gray50" or "skyblue2" are accepted by
 * stripping the trailing digits and checking the base name.
 */
const X11_COLOR_NAMES = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet',
  'brown', 'burlywood',
  'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
  'cornsilk', 'crimson', 'cyan',
  'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid',
  'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
  'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
  'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green',
  'greenyellow', 'grey',
  'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory',
  'khaki',
  'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrod', 'lightgray', 'lightgreen',
  'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue',
  'lightslateblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
  'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
  'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'navyblue',
  'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid',
  'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue',
  'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
  'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue',
  'tan', 'teal', 'thistle', 'tomato', 'turquoise',
  'violet',
  'wheat', 'white', 'whitesmoke',
  'yellow', 'yellowgreen'
]);

/**
 * Checks whether a color string is usable as a Graphviz color:
 * an X11 color name (including numbered variants like "gray50",
 * case-insensitive) or a hex value like "#ff0000".
 *
 * @param color - The color value to check
 * @returns True if Graphviz understands the color
 */
export function isValidGraphvizColor(color: string): boolean {
  if (/^#[0-9a-f]{3,12}$/i.test(color)) {
    return true;
  }

  const name = color.toLowerCase();
  if (X11_COLOR_NAMES.has(name)) {
    return true;
  }

  // Numbered X11 variants: gray50, skyblue2, ...
  const numbered = name.match(/^(.+?)(\d{1,4})$/);
  return numbered !== null && X11_COLOR_NAMES.has(numbered[1]);
}

/**
 * Escapes a single CSV field: wraps it in quotes when it contains a comma,
 * quote or newline, doubling embedded quotes.
 *
 * @param field - The raw field value
 * @returns The safely escaped field
 */
export function escapeCsv(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
