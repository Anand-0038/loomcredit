export class TerminalWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalWorkerError";
  }
}

export function isTerminalWorkerError(error: unknown): boolean {
  return error instanceof TerminalWorkerError;
}
