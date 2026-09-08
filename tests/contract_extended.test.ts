import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PCB, getPcbState } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { Pin } from '../src/pin.js';
import { createTempDir, cleanupTempDir, writeTempFile, readTempFile } from './helpers/temp_dir.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../src/kicad.js', () => ({
  KiCAD: {
    instance: {
      cliPath: 'kicad-cli',
      path: '/kicad',
      isFlatpak: false,
      getLibraryPaths: () => ({ symbols: '/kicad/symbols', footprints: '/kicad/footprints' }),
    },
    cliPath: 'kicad-cli',
    path: '/kicad',
    isFlatpak: false,
  },
  discoverKiCAD: vi.fn(),
  kicad_cli_path: 'kicad-cli',
}));

describe('Contract Functionality', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('contract-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  async function importContract() {
    return await import('../src/contract.js');
  }

  it('should handle MCU with typehal property', async () => {
    const { exportContract } = await importContract();
    const pcb = new PCB('test');

    const mcu = new Component({
      symbol: 'MCU_Symbol',
      footprint: 'Library:MCU_Footprint',
      reference: 'U1',
      typehal: { PB5: 'D13' },
    });

    getPcbState(pcb).components.push(mcu);

    const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    writeFileSyncMock.mockImplementation(() => {});
    mkdirSyncMock.mockImplementation(() => {});

    exportContract(pcb, { mcu });
    expect(writeFileSyncMock).toHaveBeenCalled();

    writeFileSyncMock.mockRestore();
    mkdirSyncMock.mockRestore();
  });

  it('should handle MCU component directly', async () => {
    const { exportContract } = await importContract();
    const pcb = new PCB('test');

    const mcu = new Component({
      symbol: 'MCU_Symbol',
      footprint: 'Library:MCU_Footprint',
      reference: 'U1',
    });

    getPcbState(pcb).components.push(mcu);

    const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    writeFileSyncMock.mockImplementation(() => {});
    mkdirSyncMock.mockImplementation(() => {});

    exportContract(pcb, { mcu });
    expect(writeFileSyncMock).toHaveBeenCalled();

    writeFileSyncMock.mockRestore();
    mkdirSyncMock.mockRestore();
  });

  it('should handle MCU without typehal', async () => {
    const { exportContract } = await importContract();
    const pcb = new PCB('test');

    const mcu = new Component({
      symbol: 'ATmega328P',
      footprint: 'Library:MCU_Footprint',
      reference: 'U1',
    });

    getPcbState(pcb).components.push(mcu);

    const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    writeFileSyncMock.mockImplementation(() => {});
    mkdirSyncMock.mockImplementation(() => {});

    exportContract(pcb, { mcu });
    expect(writeFileSyncMock).toHaveBeenCalled();

    writeFileSyncMock.mockRestore();
    mkdirSyncMock.mockRestore();
  });

  it('should handle peripheral pin requirements', async () => {
    const { exportContract } = await importContract();
    const pcb = new PCB('test');

    const mcu = new Component({
      symbol: 'MCU_Symbol',
      footprint: 'Library:MCU_Footprint',
      reference: 'U1',
      typehal: { PB5: 'D13' },
    });

    getPcbState(pcb).components.push(mcu);

    const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    writeFileSyncMock.mockImplementation(() => {});
    mkdirSyncMock.mockImplementation(() => {});

    exportContract(pcb, {
      mcu,
      peripheralPins: {
        i2c: ['A4', 'A5'],
        spi: ['D11', 'D12', 'D13'],
        uart: ['D0', 'D1'],
      },
    });
    expect(writeFileSyncMock).toHaveBeenCalled();

    writeFileSyncMock.mockRestore();
    mkdirSyncMock.mockRestore();
  });

  it('should handle custom output path', async () => {
    const { exportContract } = await importContract();
    const pcb = new PCB('test');

    const mcu = new Component({
      symbol: 'MCU_Symbol',
      footprint: 'Library:MCU_Footprint',
      reference: 'U1',
      typehal: { PB5: 'D13' },
    });

    getPcbState(pcb).components.push(mcu);

    const writeFileSpy = vi.spyOn(fs, 'writeFileSync');
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    writeFileSpy.mockImplementation(() => {});
    mkdirSyncMock.mockImplementation(() => {});

    const customPath = path.join(tempDir, 'custom-contract.json');

    exportContract(pcb, { mcu, outputPath: customPath });
    expect(writeFileSpy).toHaveBeenCalledWith(expect.stringContaining('custom-contract.json'), expect.any(String));

    writeFileSpy.mockRestore();
    mkdirSyncMock.mockRestore();
  });
});
