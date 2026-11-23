import ExcelJS from 'exceljs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Single-use test data kept in workbooks under `test-data/` (gitignored:
 * real account data).
 *
 * Some data can only be used once: a registered user, a deleted record, a
 * consumed invite or voucher. Each such sheet has a `Status` and a `Used On` column. A
 * run takes the next row whose Status is blank and marks it `Used` *before* the
 * test acts on it. Marking first is deliberate: a run that dies part-way may
 * already have changed the record on the server, and replaying it would fail.
 *
 * One run, one row per sheet: a failed test restarts the worker (and may be
 * retried), so each claim is remembered against the run id (TESTNOVA_RUN_ID, set by
 * src/global-setup.ts) in `.testnova/data-claims.json`, and every worker of the
 * same run gets the same row back instead of taking another. Without a run id
 * no claim is ever reused, so a row can never be handed out twice.
 */

export const DATA_DIR = resolve(process.env.TEST_DATA_DIR ?? 'test-data');
const CLAIMS_FILE = resolve('.testnova', 'data-claims.json');
const STATUS = 'Status';
const USED_ON = 'Used On';

export interface SheetSpec<K extends string> {
  /** Workbook file name inside test-data, e.g. `03-sign-up.xlsx`. */
  readonly file: string;
  readonly sheet: string;
  /** Field name → column header in row 1. Every column is required. */
  readonly columns: Readonly<Record<K, string>>;
  /** Extra checks on a row before it is marked Used. Throw to stop the run. */
  readonly validate?: (values: Readonly<Record<K, string>>, where: string) => void;
}

export interface ClaimedRow<K extends string> {
  /** 1-based row number in the sheet. */
  readonly row: number;
  readonly values: Readonly<Record<K, string>>;
}

const pathOf = (file: string): string => resolve(DATA_DIR, file);

async function open(file: string, sheet: string): Promise<{ wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet; headers: Map<string, number> }> {
  const path = pathOf(file);
  if (!existsSync(path)) throw new Error(`Test data workbook not found: ${path}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`${path} has no sheet named "${sheet}".`);
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, n) => headers.set(cell.text.trim(), n));
  return { wb, ws, headers };
}

function column(headers: Map<string, number>, header: string, where: string): number {
  const n = headers.get(header);
  if (!n) throw new Error(`${where}: column "${header}" is missing from row 1.`);
  return n;
}

async function save(wb: ExcelJS.Workbook, file: string): Promise<void> {
  try {
    await wb.xlsx.writeFile(pathOf(file));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new Error(`Cannot update ${pathOf(file)}: it is open in Excel. Close it and run again.`);
    }
    throw error;
  }
}

type Claims = Record<string, { owner: string; row: number }>;

function readClaims(): Claims {
  try {
    return existsSync(CLAIMS_FILE) ? (JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')) as Claims) : {};
  } catch {
    return {};
  }
}

function writeClaim(key: string, row: number): void {
  const owner = process.env.TESTNOVA_RUN_ID;
  if (!owner) return;
  // Claims from earlier runs are dead weight: keep only this run's.
  const claims = Object.fromEntries(Object.entries(readClaims()).filter(([, c]) => c.owner === owner));
  claims[key] = { owner, row };
  mkdirSync(dirname(CLAIMS_FILE), { recursive: true });
  writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2));
}

/**
 * This run's row from the sheet, claiming the next unused one on the first call.
 * Throws, with a message that says what to do, when no unused row is left.
 */
export async function claimRow<K extends string>(spec: SheetSpec<K>): Promise<ClaimedRow<K>> {
  const where = `${pathOf(spec.file)} [${spec.sheet}]`;
  const { wb, ws, headers } = await open(spec.file, spec.sheet);
  const cols = Object.fromEntries(
    (Object.entries(spec.columns) as [K, string][]).map(([key, header]) => [key, column(headers, header, where)]),
  ) as Record<K, number>;
  const status = column(headers, STATUS, where);
  const usedOn = column(headers, USED_ON, where);

  const read = (row: number): Record<K, string> => {
    const values = Object.fromEntries(
      (Object.keys(cols) as K[]).map((key) => [key, ws.getRow(row).getCell(cols[key]).text.trim()]),
    ) as Record<K, string>;
    const missing = (Object.keys(values) as K[]).filter((key) => values[key] === '').map((key) => spec.columns[key]);
    if (missing.length) throw new Error(`${where} row ${row}: ${missing.join(', ')} is empty.`);
    spec.validate?.(values, `${where} row ${row}`);
    return values;
  };

  const key = `${spec.file}#${spec.sheet}`;
  const mine = readClaims()[key];
  if (mine && process.env.TESTNOVA_RUN_ID && mine.owner === process.env.TESTNOVA_RUN_ID) {
    return { row: mine.row, values: read(mine.row) };
  }

  const isEmpty = (row: number) => (Object.values(cols) as number[]).every((c) => ws.getRow(row).getCell(c).text.trim() === '');
  let total = 0;
  for (let row = 2; row <= ws.rowCount; row += 1) {
    if (isEmpty(row)) continue;
    total += 1;
    if (ws.getRow(row).getCell(status).text.trim() !== '') continue;

    const values = read(row); // validate before marking anything
    ws.getRow(row).getCell(status).value = 'Used';
    ws.getRow(row).getCell(usedOn).value = new Date().toLocaleString('en-GB');
    await save(wb, spec.file);
    writeClaim(key, row);
    console.log(`TEST DATA: ${spec.file} [${spec.sheet}] row ${row} marked Used: ${JSON.stringify(values, (k, v) => (/password|pin|otp|secret|token/i.test(k) ? '***' : v))}`);
    return { row, values };
  }

  throw new Error(
    `No unused test data left in ${where}: all ${total} row(s) are marked Used. ` +
      'Add new rows with an empty Status and run again. Used rows are never reused.',
  );
}

/** Write one cell of a claimed row (e.g. the User ID a registration issued). Best effort: never fails a test. */
export async function writeCell(file: string, sheet: string, row: number, header: string, value: string): Promise<void> {
  try {
    const { wb, ws, headers } = await open(file, sheet);
    ws.getRow(row).getCell(column(headers, header, `${pathOf(file)} [${sheet}]`)).value = value;
    await save(wb, file);
  } catch (error) {
    console.warn(`TEST DATA: could not write ${header}=${value} to ${file} [${sheet}] row ${row}: ${(error as Error).message}`);
  }
}
