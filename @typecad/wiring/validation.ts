/**
 * This file contains utility functions for validating and normalizing connector and cable names
 * in the TypeCAD wiring library. It ensures that names don't contain hyphens or spaces, which could 
 * cause issues with file naming and references.
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
  let hasChanged = false;
  const changeDetails: string[] = []; // Explicitly type the array as string[]
  
  // Replace hyphens with underscores
  if (normalizedName.includes('-')) {
    normalizedName = normalizedName.replace(/-/g, '_');
    hasChanged = true;
    changeDetails.push("hyphens");
  }
  
  // Replace spaces with underscores
  if (normalizedName.includes(' ')) {
    normalizedName = normalizedName.replace(/\s+/g, '_');
    hasChanged = true;
    changeDetails.push("spaces");
  }
  
  // If the name was changed, log a warning
  if (hasChanged) {
    const changesText = changeDetails.join(" and ");
    console.warn(`Warning: Name "${name}" contains ${changesText}. Automatically converting to "${normalizedName}"`);
  }
  
  return normalizedName;
}