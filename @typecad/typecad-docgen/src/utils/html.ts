export function wrapSectionsInHtml(htmlContent: string): string {
    const parts: string[] = [];
    let depth = 0;
    let currentStart = -1;
    let i = 0;

    while (i < htmlContent.length) {
        if (htmlContent[i] === '<') {
            const isClosing = htmlContent[i + 1] === '/';
            const tagMatch = htmlContent.slice(i).match(/^<(\/?)\s*(\w+)/);
            if (tagMatch) {
                const tagName = tagMatch[2].toLowerCase();
                const isSelfClosing = /\/\s*>/.test(htmlContent.slice(i, htmlContent.indexOf('>', i) + 1));

                if (tagName === 'h1' && !isClosing) {
                    if (depth > 0) {
                        parts.push(htmlContent.slice(currentStart, i));
                    }
                    currentStart = i;
                    depth++;
                } else if (tagName === 'h1' && isClosing) {
                    depth--;
                }
            }
            i = htmlContent.indexOf('>', i);
            if (i === -1) break;
            i++;
        } else {
            i++;
        }
    }

    if (currentStart >= 0 && currentStart < htmlContent.length) {
        parts.push(htmlContent.slice(currentStart));
    }

    if (parts.length === 0) {
        return htmlContent.trim() ? `<section>${htmlContent}</section>` : '';
    }

    const beforeFirstH1 = htmlContent.slice(0, htmlContent.indexOf(parts[0]));
    let result = beforeFirstH1.trim() ? `<section>${beforeFirstH1}</section>` : '';

    for (const part of parts) {
        result += `<section>${part}</section>`;
    }

    return result;
}