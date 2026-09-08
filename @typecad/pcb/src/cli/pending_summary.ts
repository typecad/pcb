import chalk from 'chalk';
import logger from '../utils/logging.js';

export type PendingTypecadSummary = {
  sheetName: string;
  netPath: string;
  projectTree?: string;
  schPath?: string;
  boardFilePath?: string;
  additionalPaths: string[];
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

  addOutputPath(outputPath: string): void {
    const data = this.#active?.pendingSummaryData();
    if (data) {
      data.additionalPaths.push(outputPath);
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
    const bomPath = `./build/${data.sheetName}.csv`;
    if (bomPath) {
      logger.log('    └── ' + chalk.green(bomPath));
    }

    for (const extraPath of data.additionalPaths) {
      logger.log('    └── ' + chalk.green(extraPath));
    }

    data.printed = true;
    return true;
  }

  setupPendingSummary(host: IPendingSummaryHost, sheetName: string, netPath: string, projectTree?: string): void {
    let data = host.pendingSummaryData();
    if (!data) {
      data = {
        sheetName,
        netPath,
        projectTree,
        additionalPaths: [],
        printed: false,
        hookInstalled: false,
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

let _manager: PendingSummaryManager | null = null;
function getManager(): PendingSummaryManager {
  if (!_manager) _manager = new PendingSummaryManager();
  return _manager;
}

/** @internal */
export function setActiveSummaryHost(host: IPendingSummaryHost | null): void {
  getManager().setActive(host);
}

/** @internal */
export function setupPendingSummary(
  host: IPendingSummaryHost,
  sheetName: string,
  netPath: string,
  projectTree?: string,
): void {
  getManager().setupPendingSummary(host, sheetName, netPath, projectTree);
}

/** @internal */
export function setPendingSchematicPath(schPath: string): void {
  getManager().setPendingSchematicPath(schPath);
}

/** @internal */
export function setPendingBoardFilePath(boardFilePath: string): void {
  getManager().setPendingBoardFilePath(boardFilePath);
}

/** @internal */
export function addOutputPath(outputPath: string): void {
  getManager().addOutputPath(outputPath);
}

/** @internal */
export function printTypecadOutputSummary(boardFilePath?: string): boolean {
  return getManager().printSummary(boardFilePath);
}
