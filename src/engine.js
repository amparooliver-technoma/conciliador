import JSZip from "jszip";
import ExcelJS from "exceljs";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const HEADERS = [
  "N° Factura",
  "Código",
  "Código de Enlace",
  "Descripción",
  "Cantidad",
  "Precio Unit",
  "Total",
  "Divisa",
  "TECH",
  "NP",
  "Proyecto",
  "Estado",
  "Origen",
];

const MONTHS = {
  enero: "ENERO",
  febrero: "FEBRERO",
  marzo: "MARZO",
  abril: "ABRIL",
  mayo: "MAYO",
  junio: "JUNIO",
  julio: "JULIO",
  agosto: "AGOSTO",
  septiembre: "SEPTIEMBRE",
  setiembre: "SEPTIEMBRE",
  octubre: "OCTUBRE",
  noviembre: "NOVIEMBRE",
  diciembre: "DICIEMBRE",
};

const ENLACE_RE = /^C0*(\d{3})-(\d{3})\s*-\s*(.*)/i;
const CODE_AT_END_RE = /(OPTI\d+|OPT\d+)\s*$/i;
const INVOICE_RE = /\b(00\d{5,7})\b/;

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseAmount(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (typeof value === "number") return value;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function periodFromText(text) {
  const normalized = normalize(text);
  const match =
    normalized.match(/\d{1,2}\s+de\s+([a-z]+)\s+de\s+(\d{4})/) ||
    normalized.match(/mes\s+de\s+([a-z]+)\s+(\d{4})/);
  if (!match || !MONTHS[match[1]]) return null;
  return `${MONTHS[match[1]]}  ${match[2]}`;
}

function invoiceFromText(text) {
  const match = String(text).match(INVOICE_RE);
  return match ? `001-006-${match[1]}` : null;
}

function invoiceFromCsv(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function findReferenceSheet(workbook) {
  const expected = HEADERS.slice(0, 11).map(normalize);
  return workbook.worksheets.find((sheet) => {
    const headers = expected.map((_, index) => normalize(sheet.getCell(1, index + 1).value));
    return expected.every((header, index) => headers[index] === header);
  }) ?? workbook.worksheets[0];
}

export async function readReference(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = findReferenceSheet(workbook);
  if (!sheet) throw new Error("El Excel no contiene hojas.");
  const history = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const enlace = String(row.getCell(3).value ?? "").trim();
    if (!enlace) return;
    history.set(enlace, {
      codigo: row.getCell(2).value ?? "",
      tech: row.getCell(9).value ?? "",
      np: row.getCell(10).value ?? "",
      proyecto: row.getCell(11).value ?? "",
    });
  });
  return { history, count: history.size, sheetName: sheet.name };
}

async function pdfText(arrayBuffer) {
  const document = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let line = "";
    let lastY = null;
    const lines = [];
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
        lines.push(line.trim());
        line = "";
      }
      line += `${item.str} `;
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

function parsePdfRows(text, source) {
  const invoice = invoiceFromText(text);
  if (!invoice) throw new Error("No se detectó el número de factura");
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const unitMatch = line.match(/1,00\s*Un/i);
    if (!unitMatch) continue;
    const codeMatch = line.match(CODE_AT_END_RE);
    if (!codeMatch) continue;
    const code = codeMatch[1].toUpperCase();
    const body = line.slice(0, codeMatch.index).trim();
    const marker = body.match(/1,00\s*Un/i);
    if (!marker) continue;
    const prefix = body.slice(0, marker.index);
    const description = body.slice(marker.index + marker[0].length).trim();
    if (/^(ref:|corresponde|interconex)/i.test(description)) continue;
    const amounts = prefix.match(/\d[\d.,]*/g) ?? [];
    if (!amounts.length) continue;
    const unitPrice = parseAmount(amounts[0]);
    const total = parseAmount(amounts.at(-1));
    if (unitPrice === null || total === null) continue;
    rows.push({ invoice, code, description, unitPrice, total, source });
  }
  return { rows, period: periodFromText(text) };
}

function parseDelimitedLine(line, delimiter = ";") {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseCsvRows(text, source) {
  const values = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => parseDelimitedLine(line));
  const invoice = invoiceFromCsv(values[0]?.[1]);
  if (!invoice) throw new Error("No se detectó el número de factura");
  const rows = [];
  let period = null;
  for (const row of values.slice(1)) {
    const description = String(row[1] ?? "").trim();
    const amount = parseAmount(row[3]);
    period ||= periodFromText(description);
    if (!description || amount === null) continue;
    if (/^(ref:|corresponde|interconex)/i.test(description)) continue;
    rows.push({
      invoice,
      code: "",
      description,
      unitPrice: amount,
      total: amount,
      source,
    });
  }
  return { rows, period };
}

function enrichRows(rawRows, history) {
  const output = [];
  let lastContext = null;
  const seen = new Set();
  for (const raw of rawRows) {
    const enlaceMatch = raw.description.match(ENLACE_RE);
    const enlace = enlaceMatch ? `${enlaceMatch[1]}-${enlaceMatch[2]}` : "";
    const description = enlaceMatch ? enlaceMatch[3].trim() : raw.description;
    let context;
    let status;
    if (enlace) {
      context = history.get(enlace) ?? null;
      lastContext = context;
      status = context ? "Referencia encontrada" : "Enlace sin referencia";
    } else {
      context = lastContext;
      status = context ? "Contexto heredado" : "Sin contexto";
    }
    const code = raw.code || context?.codigo || "";
    const row = {
      factura: raw.invoice,
      codigo: code,
      enlace,
      descripcion: description,
      cantidad: 1,
      precioUnit: raw.unitPrice,
      total: raw.total,
      divisa: "USD",
      tech: context?.tech ?? "",
      np: context?.np ?? "",
      proyecto: context?.proyecto ?? "",
      estado: status,
      origen: raw.source,
    };
    const key = JSON.stringify([
      row.factura,
      row.codigo,
      row.enlace,
      row.descripcion,
      row.total,
      row.tech,
      row.np,
      row.proyecto,
    ]);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(row);
    }
  }
  return output;
}

export async function processZip(zipFile, reference) {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.(pdf|csv)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) throw new Error("El ZIP no contiene archivos PDF o CSV.");

  const rawRows = [];
  const warnings = [];
  let period = null;
  for (const entry of files) {
    try {
      let parsed;
      if (/\.pdf$/i.test(entry.name)) {
        parsed = parsePdfRows(await pdfText(await entry.async("arraybuffer")), entry.name);
      } else {
        parsed = parseCsvRows(await entry.async("string"), entry.name);
      }
      rawRows.push(...parsed.rows);
      period ||= parsed.period;
    } catch (error) {
      warnings.push(`${entry.name}: ${error.message}`);
    }
  }
  const rows = enrichRows(rawRows, reference.history);
  if (!rows.length) throw new Error("No se pudo extraer ninguna línea válida.");
  return {
    rows,
    warnings,
    period: period ?? "CONCILIACION",
    invoiceCount: new Set(rows.map((row) => row.factura)).size,
    pendingCount: rows.filter((row) => /sin referencia|sin contexto/i.test(row.estado)).length,
    sourceCount: files.length,
  };
}

export async function downloadWorkbook(result, filename) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(result.period.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [
    { header: HEADERS[0], key: "factura", width: 20 },
    { header: HEADERS[1], key: "codigo", width: 14 },
    { header: HEADERS[2], key: "enlace", width: 18 },
    { header: HEADERS[3], key: "descripcion", width: 56 },
    { header: HEADERS[4], key: "cantidad", width: 10 },
    { header: HEADERS[5], key: "precioUnit", width: 14 },
    { header: HEADERS[6], key: "total", width: 14 },
    { header: HEADERS[7], key: "divisa", width: 10 },
    { header: HEADERS[8], key: "tech", width: 12 },
    { header: HEADERS[9], key: "np", width: 18 },
    { header: HEADERS[10], key: "proyecto", width: 48 },
    { header: HEADERS[11], key: "estado", width: 22 },
    { header: HEADERS[12], key: "origen", width: 38 },
  ];
  worksheet.addRows(result.rows);
  worksheet.autoFilter = { from: "A1", to: "M1" };
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12685D" } };
    cell.alignment = { vertical: "middle" };
  });
  worksheet.getColumn("precioUnit").numFmt = "#,##0.00";
  worksheet.getColumn("total").numFmt = "#,##0.00";
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
