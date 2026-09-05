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
  mainCssContent: string,
): string {
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
    <a href="#content" class="skip-link">Skip to content</a>
    <div id="a11y-announce" class="sr-only" aria-live="polite"></div>

    <nav class="navbar" role="navigation">
        <button class="navbar-toggle" id="toc-toggle" aria-label="Toggle table of contents" title="Table of Contents">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="5" x2="17" y2="5"/>
                <line x1="3" y1="10" x2="17" y2="10"/>
                <line x1="3" y1="15" x2="17" y2="15"/>
            </svg>
        </button>
        <div class="navbar-title">
            <span>${escapeHtml(metadata.company)}</span>
            <span class="sep">&middot;</span>
            <span>${escapeHtml(metadata.board_name)}</span>
            <span class="sep">&middot;</span>
            <span>Rev ${escapeHtml(metadata.revision)}</span>
            <span class="sep">&middot;</span>
            <span>${escapeHtml(metadata.date)}</span>
        </div>
        <button class="navbar-theme-toggle" id="theme-toggle" aria-label="Toggle dark mode" title="Toggle theme">
            <svg width="20" height="20" viewBox="0 0 24 24" class="sun-moon">
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
    </nav>

    <div class="toc-backdrop" id="toc-backdrop"></div>
    <nav class="toc" id="toc" aria-label="Section navigation"></nav>

    <div class="container" id="content">
        ${wrappedHtmlContent}
    </div>

    <div class="modal" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div class="modal-content-container">
            <img class="modal-content">
            <div class="modal-label" id="modal-label"></div>
        </div>
    </div>

    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const darkModeDefault = ${metadata.dark_mode};
            if (darkModeDefault) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
            } else {
                document.body.classList.add('light-mode');
                document.body.classList.remove('dark-mode');
            }

            const sections = document.querySelectorAll('section');
            const totalPages = sections.length;
            let currentSectionIndex = 0;

            const a11yAnnounce = document.getElementById('a11y-announce');
            function announce(text) {
                a11yAnnounce.textContent = '';
                setTimeout(() => { a11yAnnounce.textContent = text; }, 50);
            }

            sections.forEach(section => {
                const h1 = section.querySelector('h1');
                if (h1) section.setAttribute('aria-label', h1.textContent);
            });

            function getUrlParameter(name) {
                const urlParams = new URLSearchParams(window.location.search);
                return urlParams.get(name) || '';
            }

            function scrollToSection(sectionIndex) {
                const sections = document.querySelectorAll('section');
                if (sectionIndex >= 0 && sectionIndex < sections.length) {
                    const section = sections[sectionIndex];
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }

            /* ===== TOC DRAWER ===== */
            const toc = document.getElementById('toc');
            const tocToggle = document.getElementById('toc-toggle');
            const tocBackdrop = document.getElementById('toc-backdrop');

            let allSections = document.querySelectorAll('section');
            allSections.forEach((section, index) => {
                const h1 = section.querySelector('h1');
                if (!h1) return;
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = h1.textContent;
                link.dataset.index = index;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    document.body.classList.remove('toc-open');
                    scrollToSection(index);
                });
                toc.appendChild(link);
            });

            const tocLinks = toc.querySelectorAll('a');

            function toggleToc() {
                document.body.classList.toggle('toc-open');
                const isOpen = document.body.classList.contains('toc-open');
                announce(isOpen ? 'Table of contents opened' : 'Table of contents closed');
            }

            tocToggle.addEventListener('click', toggleToc);
            tocBackdrop.addEventListener('click', () => {
                document.body.classList.remove('toc-open');
            });

            function updateTocActive() {
                tocLinks.forEach((link, i) => {
                    link.classList.toggle('active', i === currentSectionIndex);
                });
            }

            /* ===== INTERSECTION OBSERVER ===== */
            const observerOptions = {
                root: null,
                rootMargin: '-20% 0px -60% 0px',
                threshold: 0
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const idx = [...sections].indexOf(entry.target);
                        if (idx >= 0) {
                            currentSectionIndex = idx;
                            updateTocActive();
                        }
                    }
                });
            }, observerOptions);

            sections.forEach(section => observer.observe(section));

            const pageParam = getUrlParameter('page');
            if (pageParam) {
                const pageNum = parseInt(pageParam, 10);
                if (!isNaN(pageNum) && pageNum > 0) {
                    scrollToSection(pageNum - 1);
                }
            }

            /* ===== THEME TOGGLE ===== */
            const themeToggle = document.getElementById('theme-toggle');

            function toggleTheme() {
                if (document.body.classList.contains('dark-mode')) {
                    document.body.classList.remove('dark-mode');
                    document.body.classList.add('light-mode');
                } else {
                    document.body.classList.remove('light-mode');
                    document.body.classList.add('dark-mode');
                }
                const isDark = document.body.classList.contains('dark-mode');
                announce('Switched to ' + (isDark ? 'dark' : 'light') + ' mode');
            }

            themeToggle.addEventListener('click', toggleTheme);

            /* ===== DATA-LABEL FOR RESPONSIVE TABLES ===== */
            document.querySelectorAll('table').forEach(table => {
                const headers = [...table.querySelectorAll('th')].map(th => th.textContent.trim());
                if (headers.length === 0) return;
                table.querySelectorAll('tbody tr').forEach(tr => {
                    [...tr.querySelectorAll('td')].forEach((td, i) => {
                        if (headers[i]) td.setAttribute('data-label', headers[i]);
                    });
                });
            });

            /* ===== MODAL ===== */
            const modal = document.querySelector('.modal');
            const modalImg = document.querySelector('.modal-content');
            const modalLabel = document.getElementById('modal-label');
            let labelTimer = null;

            function openModal(imageSrc, width, height, isLayerBasedImage, isDrillLayer, label) {
                modal.classList.add('show');
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
                modalLabel.textContent = '';
                modalLabel.style.opacity = '0';
                if (label) {
                    clearTimeout(labelTimer);
                    labelTimer = setTimeout(() => {
                        modalLabel.textContent = label;
                        modalLabel.style.opacity = '1';
                    }, 300);
                }
                if (label) announce('Opened image: ' + label);
            }

            function openInlineModal(clone, label) {
                modal.classList.add('show');
                document.body.classList.add('modal-open');
                modalImg.style.display = 'none';
                const container = document.querySelector('.modal-content-container');
                container.appendChild(clone);
                modalLabel.textContent = '';
                modalLabel.style.opacity = '0';
                if (label) {
                    clearTimeout(labelTimer);
                    labelTimer = setTimeout(() => {
                        modalLabel.textContent = label;
                        modalLabel.style.opacity = '1';
                    }, 300);
                }
                if (label) announce('Opened image: ' + label);
            }

            function closeModal() {
                modal.classList.remove('show');
                document.body.classList.remove('modal-open');
                modalImg.classList.remove('drill-layer');
                modalImg.style.display = '';
                const container = document.querySelector('.modal-content-container');
                container.querySelectorAll('svg').forEach(s => s.remove());
                clearTimeout(labelTimer);
                modalLabel.textContent = '';
                modalLabel.style.opacity = '0';
            }

            document.querySelectorAll('img').forEach(img => {
                img.addEventListener('click', () => {
                    const widthAttr = img.getAttribute('width');
                    const heightAttr = img.getAttribute('height');
                    const isLayerBasedImage = img.alt.startsWith('{') && !img.alt.includes('Render');
                    const isDrillLayer = img.alt === '{Drill}';
                    const width = widthAttr ? parseInt(widthAttr, 10) : null;
                    const height = heightAttr ? parseInt(heightAttr, 10) : null;
                    const label = img.alt || '';
                    openModal(img.src, width, height, isLayerBasedImage, isDrillLayer, label);
                });
            });

            document.querySelectorAll('.stackup-inline, .svg-inline').forEach(el => {
                el.addEventListener('click', () => {
                    const svg = el.querySelector('svg');
                    if (!svg) return;
                    const clone = svg.cloneNode(true);
                    clone.removeAttribute('width');
                    clone.removeAttribute('height');
                    clone.style.width = '100%';
                    clone.style.maxHeight = '100%';
                    clone.style.objectFit = 'contain';
                    if (el.classList.contains('drill-layer')) {
                        clone.classList.add('drill-layer');
                    }
                    const label = el.closest('section');
                    const h1 = label ? label.querySelector('h1') : null;
                    openInlineModal(clone, h1 ? h1.textContent : '');
                });
            });

            modal.addEventListener('click', () => {
                closeModal();
            });

            /* ===== KEYBOARD ===== */
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    if (modal.classList.contains('show')) {
                        closeModal();
                    } else if (document.body.classList.contains('toc-open')) {
                        document.body.classList.remove('toc-open');
                    }
                }
                if ((event.key === 'd' || event.key === 'D') && !modal.classList.contains('show')) {
                    toggleTheme();
                }
                if (!modal.classList.contains('show')) {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
                        event.preventDefault();
                        scrollToSection(currentSectionIndex + 1);
                    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
                        event.preventDefault();
                        scrollToSection(currentSectionIndex - 1);
                    } else if (event.key === 'Home') {
                        event.preventDefault();
                        scrollToSection(0);
                    } else if (event.key === 'End') {
                        event.preventDefault();
                        scrollToSection(totalPages - 1);
                    }
                }
            });
        });
    </script>
</body>
</html>`;
}
