export function checkEnvString(
  value: string | undefined,
  columnName: string,
  canBeEmpty: boolean = false,
): void {
  if (value === undefined) {
    throw new Error(`ERROR: column ${columnName} is undefined`);
  }

  if (typeof value !== 'string') {
    throw new Error(`ERROR: column ${columnName} is invalid`);
  }

  if (canBeEmpty === false && value.trim() === '') {
    throw new Error(`ERROR: column ${columnName} is invalid`);
  }
}
