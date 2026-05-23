import { IMetadata } from '../types/metadata.js';

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function generateHtmlDocument(
    metadata: IMetadata,
    pcbFilePath: string,
    wrappedHtmlContent: string,
    mainCssContent: string
): string {
    const isDarkMode = metadata.dark_mode ? 'true' : 'false';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(metadata.title)} - typeCAD Documentation Generator</title>
    <style>
${mainCssContent}
    </style>
    ${metadata.stylesheet ? `<link rel="stylesheet" href="${escapeHtml(metadata.stylesheet)}">` : ''}
</head>
<body ${metadata.dark_mode ? 'class="dark-mode"' : 'class="light-mode"'}>
    <div class="mobile-warning">
        This documentation is optimized for desktop viewing. Some features may not work correctly on mobile devices.
    </div>
    <button id="dark-mode-toggle" aria-label="Toggle dark mode">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="sun-moon">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    </button>
    <div id="title-block" class="title-block">
        <table>
            <tbody>
                <tr>
                    <td class="label">Company</td>
                    <td class="value">${escapeHtml(metadata.company)}</td>
                    <td class="label">Board Name</td>
                    <td class="value">${escapeHtml(metadata.board_name)}</td>
                    <td class="label">Variant</td>
                    <td class="value">${escapeHtml(metadata.variant)}</td>
                    <td class="label">Sheet</td>
                    <td class="value" id="page-count">1 of 1</td>
                </tr>
                <tr>
                    <td class="label">Filename</td>
                    <td class="value">${escapeHtml(pcbFilePath)}</td>
                    <td class="label">Revision</td>
                    <td class="value">${escapeHtml(metadata.revision)}</td>
                    <td class="label">Date</td>
                    <td class="value">${escapeHtml(metadata.date)}</td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="container">
        ${wrappedHtmlContent}
    </div>
    <div class="modal">
        <div class="modal-content-container">
            <img class="modal-content">
        </div>
    </div>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const darkModeDefault = ${metadata.dark_mode};
            if (darkModeDefault) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.add('light-mode');
            }

            const sections = document.querySelectorAll('section');
            const totalPages = sections.length;

            function getUrlParameter(name) {
                const urlParams = new URLSearchParams(window.location.search);
                return urlParams.get(name) || '';
            }

            function scrollToSection(sectionIndex) {
                const sections = document.querySelectorAll('section');
                if (sectionIndex >= 0 && sectionIndex < sections.length) {
                    const section = sections[sectionIndex];
                    section.scrollIntoView({ behavior: 'smooth' });
                    updatePageCount();
                }
            }

            function updatePageCount() {
                const container = document.querySelector('.container');
                const containerRect = container.getBoundingClientRect();
                const sections = document.querySelectorAll('section');
                let currentSection = 1;
                let maxVisibleHeight = 0;
                sections.forEach((section, index) => {
                    const sectionRect = section.getBoundingClientRect();
                    const visibleHeight = Math.min(sectionRect.bottom, containerRect.bottom) -
                                        Math.max(sectionRect.top, containerRect.top);
                    if (visibleHeight > maxVisibleHeight) {
                        maxVisibleHeight = visibleHeight;
                        currentSection = index + 1;
                    }
                });
                document.getElementById('page-count').textContent = currentSection + ' of ' + totalPages;
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('page', currentSection);
                window.history.replaceState({}, '', newUrl);
            }

            const pageParam = getUrlParameter('page');
            if (pageParam) {
                const pageNum = parseInt(pageParam, 10);
                if (!isNaN(pageNum) && pageNum > 0) {
                    scrollToSection(pageNum - 1);
                }
            }

            const container = document.querySelector('.container');
            container.addEventListener('scroll', updatePageCount);
            updatePageCount();

            const modal = document.querySelector('.modal');
            const modalImg = document.querySelector('.modal-content');

            function openModal(imageSrc, width, height, isLayerBasedImage, isDrillLayer) {
                modal.style.display = 'block';
                document.body.classList.add('modal-open');
                modalImg.src = imageSrc;
                modalImg.style.width = '';
                modalImg.style.height = '';
                modalImg.style.maxWidth = '';
                modalImg.style.maxHeight = '';
                modalImg.style.margin = '';
                modalImg.style.padding = '';
                modalImg.style.backgroundColor = '';
                modalImg.style.maxWidth = '100%';
                modalImg.style.maxHeight = '100%';
                modalImg.style.width = 'auto';
                modalImg.style.height = 'auto';
                modalImg.style.objectFit = 'contain';
                modalImg.classList.toggle('drill-layer', isDrillLayer);
            }

            function closeModal() {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                modalImg.classList.remove('drill-layer');
            }

            document.querySelectorAll('img').forEach(img => {
                img.addEventListener('click', () => {
                    const widthAttr = img.getAttribute('width');
                    const heightAttr = img.getAttribute('height');
                    const isLayerBasedImage = img.alt.startsWith('{') && !img.alt.includes('Render');
                    const isDrillLayer = img.alt === '{Drill}';
                    const width = widthAttr ? parseInt(widthAttr, 10) : null;
                    const height = heightAttr ? parseInt(heightAttr, 10) : null;
                    openModal(img.src, width, height, isLayerBasedImage, isDrillLayer);
                });
            });

            modal.addEventListener('click', (event) => {
                if (event.target === modal || event.target === modalImg) {
                    closeModal();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeModal();
                }
            });

            const toggleButton = document.getElementById('dark-mode-toggle');
            const isDarkMode = ${isDarkMode};

            if (isDarkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.add('light-mode');
            }

            const initialStackupImages = document.querySelectorAll('img[alt="{Stackup}"]');
            initialStackupImages.forEach((img, i) => {
                if (img.getAttribute('alt') === '{Stackup}' && !img.getAttribute('data-light-src')) {
                    const src = img.getAttribute('src');
                    if (src) {
                        if (src.includes('_light.png')) {
                            const darkSrc = src.replace('_light.png', '_dark.png');
                            img.setAttribute('data-light-src', src);
                            img.setAttribute('data-dark-src', darkSrc);
                        } else if (src.includes('_dark.png')) {
                            const lightSrc = src.replace('_dark.png', '_light.png');
                            img.setAttribute('data-light-src', lightSrc);
                            img.setAttribute('data-dark-src', src);
                        } else {
                            const lightSrc = src.replace(/\\.png$/, '_light.png');
                            const darkSrc = src.replace(/\\.png$/, '_dark.png');
                            img.setAttribute('data-light-src', lightSrc);
                            img.setAttribute('data-dark-src', darkSrc);
                        }
                    }
                }

                const lightSrc = img.getAttribute('data-light-src');
                const darkSrc = img.getAttribute('data-dark-src');

                if (lightSrc && darkSrc) {
                    if (isDarkMode) {
                        img.setAttribute('src', darkSrc);
                    } else {
                        img.setAttribute('src', lightSrc);
                    }
                }
            });

            toggleButton.addEventListener('click', () => {
                const isDarkMode = document.body.classList.contains('dark-mode');
                document.body.classList.remove('dark-mode', 'light-mode');
                if (isDarkMode) {
                    document.body.classList.add('light-mode');
                } else {
                    document.body.classList.add('dark-mode');
                }

                const stackupImages = document.querySelectorAll('img[alt="{Stackup}"]');
                stackupImages.forEach((img, i) => {
                    const lightSrc = img.getAttribute('data-light-src');
                    const darkSrc = img.getAttribute('data-dark-src');
                    const currentSrc = img.getAttribute('src');
                    if (lightSrc && darkSrc) {
                        if (isDarkMode) {
                            img.setAttribute('src', lightSrc);
                        } else {
                            img.setAttribute('src', darkSrc);
                        }
                    } else if (currentSrc) {
                        if (currentSrc.includes('_light.png')) {
                            const darkSrc = currentSrc.replace('_light.png', '_dark.png');
                            if (isDarkMode) {
                                img.setAttribute('src', darkSrc);
                            }
                        } else if (currentSrc.includes('_dark.png')) {
                            const lightSrc = currentSrc.replace('_dark.png', '_light.png');
                            if (!isDarkMode) {
                                img.setAttribute('src', lightSrc);
                            }
                        }
                    }
                });
            });
        });
    </script>
</body>
</html>`;
}
