// Function is self-documenting, no need for detailed comment
export function wrapSectionsInHtml(htmlContent: string): string {
    // Split the HTML content by <h1> tags
    const parts = htmlContent.split(/(<h1.*?>.*?<\/h1>)/);

    let result = '';
    let currentSectionContent = '';

    parts.forEach((part) => {
        if (part.match(/<h1/)) {
            // If we encounter a new <h1>, close the previous section and start a new one
            if (currentSectionContent.trim()) {
                // Only add the section if it has content
                result += `<section>${currentSectionContent}</section>`;
            }
            currentSectionContent = part; // Start the new section with the <h1>
        } else {
            // Append content to the current section
            currentSectionContent += part;
        }
    });

    // Add the last section if it has content
    if (currentSectionContent.trim()) {
        result += `<section>${currentSectionContent}</section>`;
    }

    return result;
} 