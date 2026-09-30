export function checkEnvNumber(
  value: string | undefined,
  columName: string,
  minErrorValue: number = 0,
): void {
  if (value === undefined) {
    throw new Error(`ERROR: colum ${columName} is undefined`);
  }
  if (isNaN(Number(value)) === true) {
    throw new Error(`ERROR: colum ${columName} is invalid`);
  }
  if (Number(value) <= minErrorValue) {
    throw new Error(`ERROR: colum ${columName} is invalid`);
  }
}
