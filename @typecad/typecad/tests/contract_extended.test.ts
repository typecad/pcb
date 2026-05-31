import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { Pin } from '../src/pin.js';
import { createTempDir, cleanupTempDir, writeTempFile, readTempFile } from './helpers/temp_dir.js';

vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
    execFile: vi.fn(),
}));

vi.mock('../src/kicad.js', () => ({
    KiCAD: {
        instance: { cliPath: 'kicad-cli', path: '/kicad', isFlatpak: false, getLibraryPaths: () => ({ symbols: '/kicad/symbols', footprints: '/kicad/footprints' }) },
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

    it('should handle MCU detection with typehal property', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Create a mock MCU component with typehal and proper footprint format
        const mcu = new Component({
            symbol: 'MCU_Symbol',
            footprint: 'Library:MCU_Footprint',
            typehal: {
                boardPackage: 'arduino:avr:uno'
            }
        });
        
        pcb.state.components.push(mcu);
        
        // Mock fs functions
        const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
        const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
        writeFileSyncMock.mockImplementation(() => {});
        mkdirSyncMock.mockImplementation(() => {});
        
        // Should not throw and should call writeFileSync
        exportContract(pcb, {});
        expect(writeFileSyncMock).toHaveBeenCalled();
        
        // Clean up mocks
        writeFileSyncMock.mockRestore();
        mkdirSyncMock.mockRestore();
    });

    it('should handle MCU detection with reference', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Create components without typehal
        const mcu = new Component({
            symbol: 'MCU_Symbol',
            footprint: 'Library:MCU_Footprint',
            reference: 'U1'
        });
        
        pcb.state.components.push(mcu);
        
        // Mock fs functions
        const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
        const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
        writeFileSyncMock.mockImplementation(() => {});
        mkdirSyncMock.mockImplementation(() => {});
        
        // Should detect MCU by reference
        exportContract(pcb, { mcuReference: 'U1' });
        expect(writeFileSyncMock).toHaveBeenCalled();
        
        // Clean up mocks
        writeFileSyncMock.mockRestore();
        mkdirSyncMock.mockRestore();
    });

    it('should handle MCU detection with symbol pattern', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Create components without typehal
        const mcu = new Component({
            symbol: 'ATmega328P',
            footprint: 'Library:MCU_Footprint',
            reference: 'U1'
        });
        
        pcb.state.components.push(mcu);
        
        // Mock fs functions
        const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
        const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
        writeFileSyncMock.mockImplementation(() => {});
        mkdirSyncMock.mockImplementation(() => {});
        
        // Should detect MCU by symbol pattern
        exportContract(pcb, { mcuSymbolPattern: 'ATmega' });
        expect(writeFileSyncMock).toHaveBeenCalled();
        
        // Clean up mocks
        writeFileSyncMock.mockRestore();
        mkdirSyncMock.mockRestore();
    });

    it('should warn when no MCU is found', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Mock console.warn to capture warnings
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
        
        // Should warn and not write file
        exportContract(pcb, {});
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No MCU found'));
        expect(writeFileSyncMock).not.toHaveBeenCalled();
        
        // Clean up mocks
        warnSpy.mockRestore();
        writeFileSyncMock.mockRestore();
    });

    it('should handle peripheral pin requirements', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Create a mock MCU component with typehal
        const mcu = new Component({
            symbol: 'MCU_Symbol',
            footprint: 'Library:MCU_Footprint',
            typehal: {
                boardPackage: 'arduino:avr:uno'
            }
        });
        
        pcb.state.components.push(mcu);
        
        // Mock fs functions
        const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
        const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
        writeFileSyncMock.mockImplementation(() => {});
        mkdirSyncMock.mockImplementation(() => {});
        
        // Should handle custom peripheral pins
        exportContract(pcb, {
            peripheralPins: {
                i2c: ['A4', 'A5'],
                spi: ['D11', 'D12', 'D13'],
                uart: ['D0', 'D1']
            }
        });
        expect(writeFileSyncMock).toHaveBeenCalled();
        
        // Clean up mocks
        writeFileSyncMock.mockRestore();
        mkdirSyncMock.mockRestore();
    });

    it('should handle custom output path', async () => {
        const { exportContract } = await importContract();
        const pcb = new PCB('test');
        
        // Create a mock MCU component with typehal
        const mcu = new Component({
            symbol: 'MCU_Symbol',
            footprint: 'Library:MCU_Footprint',
            typehal: {
                boardPackage: 'arduino:avr:uno'
            }
        });
        
        pcb.state.components.push(mcu);
        
        // Mock fs functions
        const writeFileSpy = vi.spyOn(fs, 'writeFileSync');
        const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
        writeFileSpy.mockImplementation(() => {});
        mkdirSyncMock.mockImplementation(() => {});
        
        const customPath = path.join(tempDir, 'custom-contract.json');
        
        // Should use custom output path
        exportContract(pcb, { outputPath: customPath });
        expect(writeFileSpy).toHaveBeenCalledWith(expect.stringContaining('custom-contract.json'), expect.any(String));
        
        // Clean up mocks
        writeFileSpy.mockRestore();
        mkdirSyncMock.mockRestore();
    });
});