import { PCB, Schematic, KiCAD, kicad_cli_path } from "@typecad/typecad";
import chalk from 'chalk';
import { execSync } from "node:child_process";
import fs from 'node:fs';
import { replaceInFileSync } from 'replace-in-file';
import { zip } from 'zip-a-folder';

let package_json = JSON.parse(fs.readFileSync(`${process.env.INIT_CWD}/package.json`, 'utf8'));

const runCommand = (command: string) => {
    try {
        execSync(`${command}`, { stdio: "ignore" });
    } catch (e) {
        console.error(`Failed executing ${command}`, e);
        return false;
    }
    return true;
};

export function jlcpcb_export(schematic: Schematic, pcb: PCB, ignore?: boolean) {
    new KiCAD();
    let output_path = `./build/jlcpcb-${package_json.version}`;
    let input_path = './build';
    let _ignore = ignore || false;

    process.stdout.write(chalk.bgBlue.white.bold(`JLCPCB`) + ' Assembly Processor starting...\n');

    // run DRC on the board
    try {
        execSync(`"${kicad_cli_path}" pcb drc --exit-code-violations --all-track-errors --format json ${input_path}/${pcb.Boardname}.kicad_pcb`);
    } catch (error) {
        if (!_ignore) {
            schematic.error('DRC failed');
        } else {
            schematic.warn('DRC failed. Continuing due to ignore flag.');
        }
    }

    // check the git repo
    try {
        const stdout = execSync('git status --porcelain').toString();
        if (stdout.trim() !== '') {
            if (!_ignore) {
                schematic.error('The repository is dirty. Please commit or stash changes before running this command.');
            } else {
                schematic.warn('The repository is dirty. Please commit or stash changes before running this command. Continuing due to ignore flag.');
            }
        }
    } catch (error) {
        schematic.error(`Failed executing ${error}`);
    }

    // make folder
    fs.mkdirSync(`${output_path}`, { recursive: true });
    process.stdout.write(chalk.blue.bold(`${output_path}`) + ' folder created\n');

    // make position file and edit fields
    process.stdout.write(chalk.blue.bold(`${output_path}/${pcb.Boardname}_cpl.csv`) + ' Position/PnP file written\n');
    runCommand(`"${kicad_cli_path}" pcb export pos --exclude-dnp --units=mm --format=csv --output ${output_path}/${pcb.Boardname}_cpl.csv ${input_path}/${pcb.Boardname}.kicad_pcb`)

    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}_cpl.csv`,
        from: /Ref/g,
        to: 'Designator',
    });
    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}_cpl.csv`,
        from: /PosX/g,
        to: 'Mid X',
    });

    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}_cpl.csv`,
        from: /PosY/g,
        to: 'Mid Y',
    });

    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}_cpl.csv`,
        from: /Rot/g,
        to: 'Rotation',
    });

    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}_cpl.csv`,
        from: /Side/g,
        to: 'Layer',
    });

    // gerbers
    // make directory
    fs.mkdirSync(`${output_path}/gerbers`, { recursive: true });
    // make gerbers
    process.stdout.write(chalk.blue.bold(`${output_path}/gerbers/`) + ' Gerber files written\n');
    runCommand(`"${kicad_cli_path}" pcb export gerbers --output ${output_path}/gerbers ${input_path}/${pcb.Boardname}.kicad_pcb`)

    // make drill files
    process.stdout.write(chalk.blue.bold(`${output_path}/gerbers/${pcb.Boardname}.drl`) + ' Drill file written\n');
    runCommand(`"${kicad_cli_path}" pcb export drill --output ${output_path}/gerbers ${input_path}/${pcb.Boardname}.kicad_pcb`)

    // zip them
    process.stdout.write(chalk.blue.bold(`${output_path}/gerbers.zip`) + ' zipping Gerbers and drill file\n');
    zip(`${output_path}/gerbers`, `${output_path}/gerbers.zip`);

    // bom file
    schematic.bom(output_path);
    replaceInFileSync({
        files: `${output_path}/${pcb.Boardname}.csv`,
        from: /MPN/g,
        to: 'JLCPCB Part#',
    });

    process.stdout.write(chalk.blue.italic.underline(`https://jlcpcb.com/`) + ` to order. All files are in ./build/jlcpcb-${package_json.version}\n`);
}