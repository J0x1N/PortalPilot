import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const customerIds = Array.from({ length: 10 }, (_, index) => `CUST-${String(index + 1).padStart(3, "0")}`);
const datasets: Record<string, string[]> = {
	"customers.xlsx": customerIds,
	"customers-success.xlsx": customerIds,
	"customers-with-error.xlsx": [...customerIds, "CUST-999"]
};

function createWorkbook(ids: string[]): Buffer {
	const sheet = XLSX.utils.aoa_to_sheet([["customer_id"], ...ids.map((customerId) => [customerId])]);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function main(): Promise<void> {
	const targetDirectory = path.resolve(process.cwd(), "examples");
	await mkdir(targetDirectory, { recursive: true });

	for (const [fileName, ids] of Object.entries(datasets)) {
		await writeFile(path.join(targetDirectory, fileName), createWorkbook(ids));
		console.log(`Created examples/${fileName}`);
	}
}

void main();
