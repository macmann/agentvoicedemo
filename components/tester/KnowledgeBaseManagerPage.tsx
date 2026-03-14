"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";
import { cn } from "@/lib/utils/cn";

export function KnowledgeBaseManagerPage() {
  const { config, setConfig } = useDashboardRuntimeConfig();
  const [selectedName, setSelectedName] = useState<string | undefined>(config.uploadedTroubleshootingKbs[0]?.name);

  const selectedFile = useMemo(
    () => config.uploadedTroubleshootingKbs.find((file) => file.name === selectedName) ?? config.uploadedTroubleshootingKbs[0],
    [config.uploadedTroubleshootingKbs, selectedName]
  );

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const markdownFiles = files.filter((file) => file.name.toLowerCase().endsWith(".md"));
    const uploaded = await Promise.all(
      markdownFiles.map(async (file) => ({
        name: file.name,
        markdown: await file.text()
      }))
    );

    setConfig((prev) => {
      const merged = [...prev.uploadedTroubleshootingKbs, ...uploaded].slice(-20);
      return {
        ...prev,
        troubleshootingKbMode: "on",
        uploadedTroubleshootingKbs: merged
      };
    });

    if (uploaded[0]) setSelectedName(uploaded[0].name);
    event.target.value = "";
  };

  const removeFile = (name: string) => {
    setConfig((prev) => ({
      ...prev,
      uploadedTroubleshootingKbs: prev.uploadedTroubleshootingKbs.filter((file) => file.name !== name)
    }));

    if (selectedName === name) setSelectedName(undefined);
  };

  return (
    <main className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Knowledge Base Manager</h1>
        <p className="mt-1 text-sm text-slate-600">Upload markdown troubleshooting knowledge files, preview their content, and keep an active set used by the tester and agentic flow.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Upload & active files</h2>
          <p className="mt-1 text-xs text-slate-500">Only <code>.md</code> files are accepted.</p>

          <label className="mt-3 block">
            <input type="file" accept=".md,text/markdown" multiple onChange={(event) => { void handleUpload(event); }} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs" />
          </label>

          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            KB mode: <strong>{config.troubleshootingKbMode.toUpperCase()}</strong> · Active files: <strong>{config.uploadedTroubleshootingKbs.length || "default"}</strong>
          </div>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {config.uploadedTroubleshootingKbs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-500">No uploaded files. Default fallback is <code>/public/kb/troubleshooting.md</code>.</p>
            ) : (
              config.uploadedTroubleshootingKbs.map((file) => (
                <div key={file.name} className={cn("rounded-lg border p-2", selectedFile?.name === file.name ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50")}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedName(file.name)}>
                    <p className="truncate text-xs font-semibold text-slate-800">{file.name}</p>
                    <p className="text-[11px] text-slate-500">{file.markdown.split(/\r?\n/).length} lines</p>
                  </button>
                  <button type="button" className="mt-2 rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700" onClick={() => removeFile(file.name)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => setConfig((prev) => ({ ...prev, uploadedTroubleshootingKbs: [] }))}
            disabled={config.uploadedTroubleshootingKbs.length === 0}
          >
            Clear all uploaded files
          </button>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Markdown preview</h2>
            <span className="text-xs text-slate-500">{selectedFile?.name ?? "Default troubleshooting KB"}</span>
          </div>

          {selectedFile ? (
            <pre className="max-h-[620px] overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-5 text-slate-100">{selectedFile.markdown}</pre>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Select an uploaded file to preview its markdown. Uploaded files are automatically used by troubleshooting during tester runs.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
