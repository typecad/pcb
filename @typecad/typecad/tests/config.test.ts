import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Config } from '../src/config.js'

describe('Config', () => {
    const tmpDir = path.join(os.tmpdir(), `typecad-config-test-${Date.now()}`)
    const configPath = path.join(tmpDir, 'typecad.json')
    let originalCwd: string

    beforeEach(() => {
        fs.mkdirSync(tmpDir, { recursive: true })
        originalCwd = process.cwd()
        process.chdir(tmpDir)
    })

    afterEach(() => {
        process.chdir(originalCwd)
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should return empty string for missing key when no config file exists', () => {
        const config = new Config()
        expect(config.get('nonexistent')).toBe('')
    })

    it('should read a value from an existing config file', () => {
        fs.writeFileSync(configPath, JSON.stringify({ kicad_cli: '/usr/bin/kicad-cli' }))
        const config = new Config()
        expect(config.get('kicad_cli')).toBe('/usr/bin/kicad-cli')
    })

    it('should return empty string for a key not in the config file', () => {
        fs.writeFileSync(configPath, JSON.stringify({ kicad_cli: '/usr/bin/kicad-cli' }))
        const config = new Config()
        expect(config.get('other_key')).toBe('')
    })

    it('should write a value and read it back', () => {
        const config = new Config()
        expect(config.set('test_key', 'test_value')).toBe(true)

        const config2 = new Config()
        expect(config2.get('test_key')).toBe('test_value')
    })

    it('should overwrite an existing value', () => {
        fs.writeFileSync(configPath, JSON.stringify({ key: 'old' }))
        const config = new Config()
        config.set('key', 'new')

        const config2 = new Config()
        expect(config2.get('key')).toBe('new')
    })

    it('should handle malformed JSON gracefully', () => {
        fs.writeFileSync(configPath, '{ invalid json')
        const config = new Config()
        expect(config.get('any_key')).toBe('')
    })

    it('should handle empty config file', () => {
        fs.writeFileSync(configPath, '')
        const config = new Config()
        expect(config.get('any_key')).toBe('')
    })
})
