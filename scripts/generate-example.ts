import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const customerIds = Array.from({ length: 10 }, (_, index) => `CUST-${String(index + 1).padStart(3, "0")}`);
const sheet = XLSX.utils.aoa_to_sheet([["customer_id"], ...customerIds.map((customerId) => [customerId])]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "Customers");

async function main(): Promise<void> {
	const targetDirectory = path.resolve(process.cwd(), "examples");
	await mkdir(targetDirectory, { recursive: true });
	await writeFile(path.join(targetDirectory, "customers.xlsx"), XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
	console.log("Created examples/customers.xlsx");
}

void main();
