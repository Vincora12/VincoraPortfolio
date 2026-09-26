import JSZip from "jszip";

const MAX_SPREADSHEET_TEXT = 40_000;

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`));
  return decodeXml(match?.[1] ?? match?.[2] ?? "");
}

function xmlText(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function workbookPath(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("xl/")) return target;
  const parts: string[] = [];
  for (const part of `xl/${target}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, result - 1);
}

function sheetRows(xml: string, shared: readonly string[]): string[] {
  const rows: string[] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values: string[] = [];
    const row = rowMatch[1] ?? "";
    for (const cellMatch of row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const index = Math.min(199, columnIndex(xmlAttribute(attributes, "r")));
      const type = xmlAttribute(attributes, "t");
      const raw = decodeXml(body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? "");
      const formula = decodeXml(body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1] ?? "");
      const value = type === "s"
        ? shared[Number.parseInt(raw, 10)] ?? ""
        : type === "inlineStr"
          ? xmlText(body)
          : type === "b"
            ? raw === "1" ? "VERO" : "FALSO"
            : raw || (formula ? `=${formula}` : "");
      while (values.length < index) values.push("");
      values[index] = value.replace(/[\t\r\n]+/g, " ").trim();
    }
    while (values.at(-1) === "") values.pop();
    if (values.length) rows.push(values.join("\t"));
  }
  return rows;
}

/** Estrae valori e formule dall'XLSX nel browser, senza inviarlo a terzi. */
export async function extractSpreadsheetText(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const workbook = zip.file("xl/workbook.xml");
  if (!workbook) throw new Error("XLSX non valido: manca la cartella di lavoro");
  const workbookXml = await workbook.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text") ?? "";
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text") ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1] ?? ""));
  const relationships = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = match[1] ?? "";
    const id = xmlAttribute(attributes, "Id");
    const target = xmlAttribute(attributes, "Target");
    if (id && target) relationships.set(id, workbookPath(target));
  }
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].flatMap((match) => {
    const attributes = match[1] ?? "";
    const path = relationships.get(xmlAttribute(attributes, "r:id"));
    return path ? [{ name: xmlAttribute(attributes, "name") || "Foglio", path }] : [];
  });
  if (!sheets.length) {
    for (const path of Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()) {
      sheets.push({ name: `Foglio ${sheets.length + 1}`, path });
    }
  }
  let result = "";
  for (const sheet of sheets) {
    const entry = zip.file(sheet.path);
    if (!entry) continue;
    const rows = sheetRows(await entry.async("text"), shared);
    if (!rows.length) continue;
    result += `${result ? "\n\n" : ""}[FOGLIO: ${sheet.name}]\n${rows.join("\n")}`;
    if (result.length >= MAX_SPREADSHEET_TEXT) return `${result.slice(0, MAX_SPREADSHEET_TEXT)}\n[ANTEPRIMA TRONCATA]`;
  }
  if (!result.trim()) throw new Error("Il foglio Excel non contiene celle leggibili");
  return result;
}
