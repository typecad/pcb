export function findNodes(root: unknown, targetType: string | string[]): unknown[] {
    const targets = Array.isArray(targetType) ? targetType : [targetType];
    const results: unknown[] = [];
    if (Array.isArray(root)) {
        for (const item of root) {
            if (Array.isArray(item) && item.length > 0 && targets.includes(item[0] as string)) {
                results.push(item);
            } else if (Array.isArray(item)) {
                results.push(...findNodes(item, targets));
            }
        }
    }
    return results;
}
