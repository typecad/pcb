import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateHtmlReport } from '../../src/gitdiff/utils/html-generator.js';
import type { LayerInfo } from '../../src/gitdiff/utils/html-generator.js';

vi.mock('fs', async () => {
  const actual = (await vi.importActual('fs')) as typeof import('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import * as fs from 'fs';

const mockTemplate = `<!DOCTYPE html><html><head><title>PCB Layer Diff Viewer</title></head><body></body></html>`;

const mockLayers: LayerInfo[] = [
  {
    name: 'F.Cu',
    originalSvg: '<svg><path d="M0 0" /></svg>',
    modifiedSvg: '<svg><path d="M0 0" /><path d="M10 10" /></svg>',
    annotatedOriginalSvg: '<svg><path class="diff-hidden" d="M0 0" /></svg>',
    annotatedModifiedSvg: '<svg><path class="diff-hidden" d="M0 0" /><path class="diff-added" d="M10 10" /></svg>',
    hasDifferences: true,
  },
];

describe('generateHtmlReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if template file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(generateHtmlReport(mockLayers)).rejects.toThrow('Could not find diff-viewer.html template');
  });

  it('injects layer data script', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockTemplate);

    const result = await generateHtmlReport(mockLayers);

    expect(result).toContain('setLayerData');
    expect(result).toContain('F.Cu');
    expect(result).toContain('diff-hidden');
    expect(result).toContain('diff-added');
  });

  it('injects textual diff data when provided', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockTemplate);

    const textualDiff = {
      changes: [{ type: 'added' as const, category: 'component' as const, description: 'R1 added', ref: 'R1' }],
      summary: '1 change: 1 added',
    };

    const result = await generateHtmlReport(mockLayers, textualDiff);

    expect(result).toContain('setTextualDiff');
    expect(result).toContain('R1 added');
  });

  it('includes timestamp in title', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockTemplate);

    const result = await generateHtmlReport(mockLayers);

    expect(result).toContain('PCB Layer Diff Viewer - ');
  });

  it('handles layers with null SVG gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockTemplate);

    const layersWithNull: LayerInfo[] = [
      {
        name: 'F.Silkscreen',
        originalSvg: null,
        modifiedSvg: null,
        annotatedOriginalSvg: null,
        annotatedModifiedSvg: null,
        hasDifferences: false,
      },
    ];

    const result = await generateHtmlReport(layersWithNull);
    expect(result).toContain('setLayerData');
  });

  it('includes SVG content in safe JSON-serialized form', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const testSvg = '<svg><path d="M0 0" /></svg>';
    vi.mocked(fs.readFileSync).mockReturnValue(mockTemplate);

    const result = await generateHtmlReport([
      {
        name: 'F.Cu',
        originalSvg: testSvg,
        modifiedSvg: testSvg,
        annotatedOriginalSvg: null,
        annotatedModifiedSvg: null,
        hasDifferences: false,
      },
    ]);

    expect(result).toContain('M0 0');
    expect(result).toContain('setLayerData');
  });
});
