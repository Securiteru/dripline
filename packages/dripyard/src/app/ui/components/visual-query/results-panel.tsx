import { AlertCircle, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ResultsPanelProps {
  result: {
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
    durationMs: number;
    attached: string[];
  } | null;
  error: string | null;
  loading: boolean;
}

export function ResultsPanel({ result, error, loading }: ResultsPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0 border border-[var(--border-muted)] rounded bg-[var(--panel)]/40">
      <div className="flex flex-1 min-h-0 flex-col">
        {loading ? (
          <RunningState />
        ) : error ? (
          <ErrorState error={error} />
        ) : !result ? (
          <EmptyState />
        ) : result.rows.length === 0 ? (
          <NoRowsState result={result} />
        ) : (
          <ResultTable result={result} />
        )}
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
      Running…
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-1 items-start justify-center gap-2 p-3 overflow-auto">
      <AlertCircle className="size-4 text-[var(--error)] mt-0.5 flex-none" />
      <pre className="text-xs font-mono text-[var(--error)] whitespace-pre-wrap break-words">
        {error}
      </pre>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
      Run a query to see results
    </div>
  );
}

function NoRowsState({
  result,
}: {
  result: NonNullable<ResultsPanelProps["result"]>;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-[var(--muted)]">
      <span>No rows returned.</span>
      <span className="text-xs">
        {result.durationMs}ms · attached: {result.attached.join(", ") || "—"}
      </span>
    </div>
  );
}

function ResultTable({
  result,
}: {
  result: NonNullable<ResultsPanelProps["result"]>;
}) {
  const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center gap-3 px-3 py-1.5 flex-none border-b border-[var(--border-muted)] text-[11px] text-[var(--muted)]">
        <span>
          {result.rows.length.toLocaleString()} row
          {result.rows.length === 1 ? "" : "s"}
          {result.truncated && (
            <span className="text-[var(--warning)] ml-1">
              (truncated from {result.rowCount.toLocaleString()})
            </span>
          )}
        </span>
        <span>·</span>
        <span>{result.durationMs}ms</span>
        {result.attached.length > 0 && (
          <>
            <span>·</span>
            <span className="truncate">attached: {result.attached.join(", ")}</span>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell
                    key={c}
                    className="text-xs font-mono tabular-nums"
                  >
                    {formatCell(r[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
