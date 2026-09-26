import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Upload } from "lucide-react";

/**
 * The import contract, in the order the template writes them.
 *
 * These are the human labels from the existing "Export CSV", so a file exported
 * from the app can be edited and fed straight back in. `Days Left` / `Status`
 * are deliberately absent — they're derived per student, not stored.
 *
 * `Expiry Date` is deliberately absent too. A membership's expiry is owned by
 * payments, not by the import: a new member starts with no expiry, shows as
 * Pay Required with 0 days left, and gets a real expiry the moment a payment is
 * recorded. Importing an expiry would let a hand-typed date quietly disagree
 * with the payment history.
 */
const COLUMNS = [
  { header: "Member ID", key: "registerNo", required: true, example: "101" },
  { header: "Name", key: "name", required: true, example: "Ravi Kumar" },
  { header: "Batch", key: "batch", required: false, example: "Morning" },
  { header: "Phone", key: "phone", required: true, example: "9876543210" },
  { header: "Address", key: "address", required: false, example: "12 MG Road" },
  { header: "Join Date", key: "joinDate", required: true, example: "15-01-2026" },
] as const;

/** Keep in step with the server's MAX_IMPORT_ROWS so the cap isn't a surprise. */
const MAX_ROWS = 1000;

/** Rows pre-filled in a fresh download. Bump it in the dialog if you need more. */
const DEFAULT_TEMPLATE_ROWS = 5;

/**
 * Builds the template with Member IDs already filled in, counting up from the
 * next free ID. Only the ID column is pre-filled — every other cell is left
 * blank so the user just types over one clean grid.
 *
 * Every generated ID is `> max(existing)`, and no existing ID can be greater
 * than that maximum, so the generated range cannot collide with a current
 * member. The server still rejects duplicates per row as a safety net for
 * hand-edited or re-uploaded files.
 */
function buildTemplateCsv(startRegisterNo: number, rowCount: number): string {
  const headers = COLUMNS.map((column) => column.header);
  const rows = Array.from({ length: rowCount }, (_, index) =>
    COLUMNS.map((column) =>
      column.key === "registerNo" ? String(startRegisterNo + index) : "",
    ),
  );
  return buildCsv(headers, rows);
}

/**
 * "Member ID", "member_id" and "MEMBERID" all have to land on the same column,
 * otherwise the file the user just downloaded from this app fails to reimport.
 */
function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

type ParsedRow = Record<string, string>;

type ImportResult = {
  total: number;
  imported: number;
  failed: number;
  results: {
    row: number;
    registerNo: string;
    name: string;
    status: "success" | "failed";
    error?: string;
  }[];
};

export function ImportStudentsDialog({
  open,
  onOpenChange,
  onImported,
  nextRegisterNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import so the caller can refresh its queries. */
  onImported: () => void;
  /** Lowest unused Member ID, so the template never reuses an existing one. */
  nextRegisterNo: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [templateRows, setTemplateRows] = useState(DEFAULT_TEMPLATE_ROWS);

  // `nextRegisterNo` is computed by the caller as max(existing) + 1, so counting
  // up from here can only ever produce unused IDs.
  const firstFreeId = Math.max(1, parseInt(nextRegisterNo, 10) || 1);

  const reset = () => {
    setFileName("");
    setRows([]);
    setParseError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const importMutation = useMutation({
    mutationFn: async (batch: ParsedRow[]) => {
      const response = await apiRequest("POST", "/api/students/import", {
        students: batch,
      });
      return (await response.json()) as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      // Refresh either way: even a fully-failed import may have landed some
      // rows, and the list on the other side of the dialog should be truthful.
      onImported();
    },
  });

  const handleDownloadTemplate = () => {
    const count = Math.min(Math.max(templateRows, 1), MAX_ROWS);
    downloadCsv(
      "student_import_template.csv",
      buildTemplateCsv(firstFreeId, count),
    );
  };

  const handleFile = (file: File | undefined) => {
    setResult(null);
    setRows([]);
    setParseError("");
    if (!file) return;

    if (!/\.csv$/i.test(file.name)) {
      setParseError("Please choose a .csv file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("File is larger than 5 MB — split it into smaller files");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const grid = parseCsv(String(event.target?.result ?? ""));
        if (grid.length < 2) {
          setParseError(
            "That file has a header but no student rows. Fill in the template and try again.",
          );
          return;
        }

        const [headerRow, ...dataRows] = grid;
        // column index in the file → our field name
        const headerToKey = new Map<number, string>();
        headerRow.forEach((header, index) => {
          const match = COLUMNS.find(
            (column) => normaliseHeader(column.header) === normaliseHeader(header),
          );
          if (match) headerToKey.set(index, match.key);
        });

        const presentKeys = Array.from(headerToKey.values());
        const missing = COLUMNS.filter(
          (column) => column.required && !presentKeys.includes(column.key),
        );
        if (missing.length > 0) {
          setParseError(
            `Missing required column${missing.length > 1 ? "s" : ""}: ${missing
              .map((column) => column.header)
              .join(", ")}`,
          );
          return;
        }

        if (dataRows.length > MAX_ROWS) {
          setParseError(
            `That file has ${dataRows.length} rows — the limit is ${MAX_ROWS} per import`,
          );
          return;
        }

        setRows(
          dataRows.map((cells) => {
            const row: ParsedRow = {};
            headerToKey.forEach((key, columnIndex) => {
              row[key] = (cells[columnIndex] ?? "").trim();
            });
            return row;
          }),
        );
      } catch {
        setParseError("Could not read that file — make sure it is a valid CSV");
      }
    };
    reader.onerror = () => setParseError("Could not read that file");
    reader.readAsText(file);
  };

  const failedRows = result?.results.filter((row) => row.status === "failed") ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* `flex flex-col` replaces DialogContent's base `grid` (twMerge). Header and
          footer stay put and only the body scrolls, so the action buttons are never
          pushed out of view. `overflow-hidden` on the dialog is deliberate: with
          `overflow-y-auto` alone, CSS computes overflow-x to `auto` too and the
          dialog itself scrolls sideways, pushing the wide table off-screen. */}
      <DialogContent
        className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden"
        data-testid="dialog-import-students"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Import Students</DialogTitle>
          <DialogDescription>
            Download the template, fill it in, then upload it back. Every row is
            checked on its own, so one bad entry won't stop the rest.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          {/* ── Step 1: the template ── */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Step 1 — Get the template</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="import-template-rows"
                  className="text-xs text-muted-foreground"
                >
                  Rows
                </label>
                <Input
                  id="import-template-rows"
                  type="number"
                  min={1}
                  max={MAX_ROWS}
                  value={templateRows}
                  onChange={(event) => {
                    const parsed = parseInt(event.target.value, 10);
                    setTemplateRows(
                      Number.isFinite(parsed) ? parsed : DEFAULT_TEMPLATE_ROWS,
                    );
                  }}
                  className="h-8 w-20"
                  data-testid="input-template-rows"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  data-testid="button-download-template"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </div>
            </div>

            {/* The one thing worth spelling out before anyone fills the file in. */}
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Member IDs already in use will be rejected. This template starts
                at <span className="font-semibold">{firstFreeId}</span> — the
                next free ID — and counts up, so it will not clash with any
                current member.
              </span>
            </p>

            {/* No extra overflow wrapper here: `Table` already renders inside its
                own `overflow-auto` div, and nesting a second one is what made the
                columns look misaligned. A min-width lets the cells size to their
                content and scroll as a single, clean container. */}
            <div className="rounded-md border bg-background">
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column.key} className="whitespace-nowrap">
                        {column.header}
                        {column.required ? (
                          <span className="ml-1 text-red-500">*</span>
                        ) : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableCell
                        key={column.key}
                        className="whitespace-nowrap text-muted-foreground"
                      >
                        {/* Show the ID the download will really contain, not a
                            hardcoded sample, so the preview can't mislead. */}
                        {column.key === "registerNo"
                          ? firstFreeId
                          : column.example}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-red-500">*</span> required. Dates are
              day-month-year, e.g. 15-01-2026. Batch accepts Morning or Evening
              (leave blank for Morning). Address may be left empty. There is no
              Expiry Date column — new members start as Pay Required with 0 days
              left, and the expiry is set for you when you record a payment. The
              template comes with {templateRows} row{Math.abs(templateRows - 1) === 1 ? "" : "s"};{" "}
              raise the Rows box to get more.
            </p>
          </div>

          {/* ── Step 2: pick the filled file ── */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Step 2 — Upload the filled template</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
              data-testid="input-import-file"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-file"
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose CSV file
              </Button>
              {fileName ? (
                <span className="min-w-0 break-all text-sm text-muted-foreground">
                  {fileName}
                  {rows.length > 0 ? ` — ${rows.length} row(s) ready` : ""}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No file chosen</span>
              )}
            </div>
            {parseError ? (
              <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </p>
            ) : null}
          </div>

          {/* ── Step 3: results ── */}
          {result ? (
            <div className="space-y-3" data-testid="import-result">
              <div className="flex flex-wrap items-stretch gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/30">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="text-sm text-green-800 dark:text-green-200">
                    <span className="font-semibold">{result.imported}</span> imported
                  </span>
                </div>
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    result.failed > 0
                      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                      : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
                  }`}
                >
                  <AlertCircle
                    className={`h-4 w-4 shrink-0 ${
                      result.failed > 0 ? "text-red-600" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      result.failed > 0
                        ? "text-red-800 dark:text-red-200"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="font-semibold">{result.failed}</span> failed
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-semibold">{result.total}</span> row(s) in file
                  </span>
                </div>
              </div>

              {failedRows.length > 0 ? (
                /* Capped height so a long failure list scrolls inside the dialog
                   instead of stretching it past the viewport. */
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table className="min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Row</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedRows.map((row) => (
                        <TableRow key={row.row}>
                          <TableCell className="text-muted-foreground">
                            {row.row}
                          </TableCell>
                          <TableCell>{row.registerNo || "—"}</TableCell>
                          <TableCell>{row.name || "—"}</TableCell>
                          <TableCell className="text-red-600 dark:text-red-400">
                            {row.error}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            data-testid="button-close-import"
          >
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => importMutation.mutate(rows)}
            disabled={rows.length === 0 || importMutation.isPending}
            data-testid="button-start-import"
          >
            {importMutation.isPending
              ? "Importing..."
              : `Import ${rows.length > 0 ? `${rows.length} Student` : "Students"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
