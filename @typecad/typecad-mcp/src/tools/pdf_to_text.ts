import { MCPServer } from '../server';
import { PdfReader } from 'pdfreader';
import * as fs from 'fs';
import * as path from 'path';

export function registerPdfToTextTool(server: MCPServer) {
  server.registerTool({
    name: 'pdf_to_text',
    description: 'Convert a PDF file to a text file.',
    inputSchema: {
      type: 'object',
      properties: {
        pdfPath: {
          type: 'string',
          description: 'Path to the PDF file (absolute or relative to cwd)'
        },
        txtPath: {
          type: 'string',
          description: 'Path to the output text file (absolute or relative to cwd)'
        },
        cwd: {
          type: 'string',
          description: 'Current working directory where the project files are located (must be absolute path to project root, not relative)'
        }
      },
      required: ['pdfPath', 'txtPath', 'cwd']
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'pdf_to_text') return;

    const { pdfPath, txtPath, cwd } = args;

    // Validate inputs
    if (!pdfPath || !txtPath || !cwd) {
      reject(new Error('pdfPath, txtPath, and cwd are all required'));
      return;
    }

    // Decode URL-encoded paths (handle cases like c%3A/path -> c:/path)
    let decodedCwd = decodeURIComponent(cwd);
    const decodedPdfPath = decodeURIComponent(pdfPath);
    const decodedTxtPath = decodeURIComponent(txtPath);

    // Normalize Windows paths (handle /c:/path -> c:/path)
    if (process.platform === 'win32' && decodedCwd.match(/^\/[a-zA-Z]:/)) {
      decodedCwd = decodedCwd.substring(1); // Remove leading slash
    }

    // Validate that cwd is an absolute path (catch common mistake of passing ".")
    if (!path.isAbsolute(decodedCwd)) {
      reject(new Error(`cwd must be an absolute path to the project directory. Received: "${decodedCwd}" (original: "${cwd}"). Please pass the full project path instead of a relative path.`));
      return;
    }

    // Resolve paths using the decoded working directory
    const resolvedPdfPath = path.isAbsolute(decodedPdfPath) ? decodedPdfPath : path.resolve(decodedCwd, decodedPdfPath);
    const resolvedTxtPath = path.isAbsolute(decodedTxtPath) ? decodedTxtPath : path.resolve(decodedCwd, decodedTxtPath);

    // Check if PDF file exists
    if (!fs.existsSync(resolvedPdfPath)) {
      reject(new Error(`PDF file not found: ${resolvedPdfPath} (resolved from: ${decodedPdfPath} with cwd: ${decodedCwd})`));
      return;
    }

    // Ensure output directory exists
    const outputDir = path.dirname(resolvedTxtPath);
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (mkdirErr) {
        reject(new Error(`Failed to create output directory: ${outputDir}`));
        return;
      }
    }

    try {
      let text = '';
      let warnings: string[] = [];

      // Store original console methods
      const originalError = console.error;
      const originalWarn = console.warn;
      const originalStderrWrite = process.stderr.write;

      // Function to restore console methods
      const restoreConsole = () => {
        console.error = originalError;
        console.warn = originalWarn;
        (process.stderr as any).write = originalStderrWrite;
      };

      // Suppress console output during PDF parsing
      console.error = (...msg: any[]) => { warnings.push(msg.map(String).join(' ')); };
      console.warn = (...msg: any[]) => { warnings.push(msg.map(String).join(' ')); };
      (process.stderr as any).write = function (chunk: any, ...args: any[]) {
        warnings.push(chunk.toString());
        return true;
      };

      // Parse PDF with timeout and proper error handling
      const parsePromise = new Promise<void>((res, rej) => {
        let finished = false;

        const reader = new PdfReader();

        reader.parseFileItems(resolvedPdfPath, (err, item) => {
          if (finished) return; // Prevent multiple callbacks

          if (err) {
            finished = true;
            restoreConsole();
            rej(new Error(`PDF parsing error: ${String(err)}`));
          } else if (!item) {
            // End of file
            finished = true;
            try {
              fs.writeFileSync(resolvedTxtPath, text, 'utf8');
              restoreConsole();
              res();
            } catch (writeErr) {
              restoreConsole();
              rej(new Error(`Failed to write text file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`));
            }
          } else if (item.text) {
            text += item.text + '\n';
          }
        });
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<void>((_, rej) => {
        setTimeout(() => {
          restoreConsole();
          rej(new Error('PDF parsing timed out after 30 seconds'));
        }, 30000);
      });

      // Race between parsing and timeout
      await Promise.race([parsePromise, timeoutPromise]);

      if (!text.trim()) {
        const warningMsg = warnings.length ? ` Warnings: ${warnings.join('; ')}` : '';
        reject(new Error(`No text could be extracted from the PDF.${warningMsg}`));
      } else {
        const textLength = text.length;
        const lines = text.split('\n').length;
        const warningMsg = warnings.length ? ` Warnings: ${warnings.join('; ')}` : '';
        const successMessage = `PDF successfully converted to text. Extracted ${textLength} characters across ${lines} lines. Output saved to: ${resolvedTxtPath}${warningMsg}`;
        resolve(successMessage);
      }
    } catch (error) {
      reject(error);
    }
  });
} 