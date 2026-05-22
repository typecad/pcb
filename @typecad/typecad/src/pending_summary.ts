import chalk from 'chalk';
import logger from './logging.js';

type PendingTypecadSummary = {
    sheetName: string;
    netPath: string;
    projectTree?: string;
    schPath?: string;
    boardFilePath?: string;
    printed: boolean;
    hookInstalled: boolean;
};

export interface IPendingSummaryHost {
    pendingSummaryData(): PendingTypecadSummary | undefined;
    setPendingSummaryData(data: PendingTypecadSummary | undefined): void;
}

class PendingSummaryManager {
    #active: IPendingSummaryHost | null = null;

    setActive(host: IPendingSummaryHost | null): void {
        this.#active = host;
    }

    setPendingSchematicPath(schPath: string): void {
        const data = this.#active?.pendingSummaryData();
        if (data) {
            data.schPath = schPath;
        }
    }

    setPendingBoardFilePath(boardFilePath: string): void {
        const data = this.#active?.pendingSummaryData();
        if (data) {
            data.boardFilePath = boardFilePath;
        }
    }

    printSummary(boardFilePath?: string): boolean {
        const data = this.#active?.pendingSummaryData();
        if (!data || data.printed) return false;

        if (data.projectTree) {
            logger.log(data.projectTree);
        }

        logger.log('🏁 ' + chalk.whiteBright.bold('type') + 'CAD finished');
        logger.log('└── 📝 Output');
        logger.log('    └── ' + chalk.green(data.netPath));

        const finalBoardFilePath = boardFilePath || data.boardFilePath;
        if (finalBoardFilePath) {
            logger.log('    └── ' + chalk.green(finalBoardFilePath));
        }
        if (data.schPath) {
            logger.log('    └── ' + chalk.green(data.schPath));
        }

        data.printed = true;
        return true;
    }

    setupPendingSummary(
        host: IPendingSummaryHost,
        sheetName: string,
        netPath: string,
        projectTree?: string
    ): void {
        let data = host.pendingSummaryData();
        if (!data) {
            data = {
                sheetName,
                netPath,
                projectTree,
                printed: false,
                hookInstalled: false
            };
            host.setPendingSummaryData(data);
        } else {
            data.sheetName = sheetName;
            data.netPath = netPath;
            if (projectTree) data.projectTree = projectTree;
        }

        if (!data.hookInstalled) {
            data.hookInstalled = true;
            process.once('beforeExit', () => {
                this.printSummary();
            });
        }
    }
}

const manager = new PendingSummaryManager();

export function setActiveSummaryHost(host: IPendingSummaryHost | null): void {
    manager.setActive(host);
}

export function setupPendingSummary(
    host: IPendingSummaryHost,
    sheetName: string,
    netPath: string,
    projectTree?: string
): void {
    manager.setupPendingSummary(host, sheetName, netPath, projectTree);
}

export function setPendingSchematicPath(schPath: string): void {
    manager.setPendingSchematicPath(schPath);
}

export function setPendingBoardFilePath(boardFilePath: string): void {
    manager.setPendingBoardFilePath(boardFilePath);
}

export function printTypecadOutputSummary(boardFilePath?: string): boolean {
    return manager.printSummary(boardFilePath);
}
