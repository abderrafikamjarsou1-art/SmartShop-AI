"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileUp, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { previewInventoryImport, commitInventoryImport, type ImportPreview } from "@/actions/inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Phase = "pick" | "preview" | "done";

/**
 * CSV import flow: pick file -> server-side validation + dry-run preview
 * (row-by-row errors, nothing written) -> confirm -> commit.
 * Atomic toggle: ON = any bad row aborts everything; OFF = valid rows
 * apply, bad rows are reported and skipped.
 */
export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [atomic, setAtomic] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ applied: number; skipped: { row: number; sku: string; error: string }[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPhase("pick"); setCsv(""); setFileName(""); setPreview(null); setResult(null); };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Please choose a .csv file."); return; }
    setFileName(file.name);
    file.text().then((text) => {
      setCsv(text);
      startTransition(async () => {
        const r = await previewInventoryImport({ csv: text });
        if (r.success) { setPreview(r.data); setPhase("preview"); }
        else toast.error(r.error);
      });
    });
  };

  const commit = () => {
    startTransition(async () => {
      const r = await commitInventoryImport({ csv, atomic });
      if (r.success) { setResult(r.data); setPhase("done"); }
      else toast.error(r.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileUp className="size-4" aria-hidden /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import stock adjustments</DialogTitle>
          <DialogDescription>
            CSV with header <code className="rounded bg-secondary px-1">sku,newQuantity,reason</code>. Each row sets a product's stock by SKU.
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
            <span className="text-sm font-medium text-foreground">{pending ? "Validating…" : "Drop your CSV here or click to browse"}</span>
            <span className="text-xs">Up to 500 rows · 2 MB</span>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </button>
        )}

        {phase === "preview" && preview && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="truncate font-medium">{fileName}</span>
              <Badge variant="secondary" className="text-success">{preview.valid.length} valid</Badge>
              {preview.errors.length > 0 && (
                <Badge variant="secondary" className="text-destructive">{preview.errors.length} with problems</Badge>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product / problem</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.valid.map((r) => (
                    <TableRow key={`v${r.row}`}>
                      <TableCell className="tabular text-xs text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="text-xs">{r.sku}</TableCell>
                      <TableCell className="max-w-48 truncate text-sm">{r.productName}</TableCell>
                      <TableCell className="tabular text-right text-sm">{r.from} → <span className="font-medium">{r.to}</span></TableCell>
                    </TableRow>
                  ))}
                  {preview.errors.map((r) => (
                    <TableRow key={`e${r.row}`} className="bg-destructive/5">
                      <TableCell className="tabular text-xs text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="text-xs">{r.sku}</TableCell>
                      <TableCell colSpan={2} className="text-sm text-destructive">{r.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <Label htmlFor="atomic">All-or-nothing import</Label>
                <p className="text-xs text-muted-foreground">If any row has a problem, nothing is imported.</p>
              </div>
              <Switch id="atomic" checked={atomic} onCheckedChange={setAtomic} />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={reset} disabled={pending}>Choose another file</Button>
              <Button onClick={commit} disabled={pending || preview.valid.length === 0 || (atomic && preview.errors.length > 0)}>
                {pending ? "Importing…" : `Import ${preview.valid.length} row${preview.valid.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "done" && result && (
          <>
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              {result.applied > 0
                ? <CheckCircle2 className="size-8 text-success" aria-hidden />
                : <XCircle className="size-8 text-destructive" aria-hidden />}
              <p className="font-medium">{result.applied} adjustment{result.applied === 1 ? "" : "s"} applied</p>
              {result.skipped.length > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} skipped</p>
              )}
            </div>
            {result.skipped.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs text-muted-foreground">
                {result.skipped.map((s) => <li key={s.row}>Row {s.row} ({s.sku}): {s.error}</li>)}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
