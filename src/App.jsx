import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  FileSpreadsheet,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { clearLocalReference, loadReferenceLocally, saveReferenceLocally } from "./db";
import { downloadWorkbook, processZip, readReference } from "./engine";

function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function FilePicker({ icon: Icon, title, description, accept, file, onChange, disabled }) {
  const inputRef = useRef(null);
  return (
    <div className={`file-picker ${file ? "has-file" : ""}`}>
      <div className="file-picker__icon">
        <Icon size={22} />
      </div>
      <div className="file-picker__copy">
        <strong>{file ? file.name : title}</strong>
        <span>{file ? `${formatBytes(file.size)} · listo` : description}</span>
      </div>
      <button type="button" className="icon-button" title="Seleccionar archivo" onClick={() => inputRef.current?.click()} disabled={disabled}>
        <Upload size={18} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [referenceFile, setReferenceFile] = useState(null);
  const [reference, setReference] = useState(null);
  const [zipFile, setZipFile] = useState(null);
  const [saveLocal, setSaveLocal] = useState(true);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("Esperando referencia");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadReferenceLocally()
      .then((file) => file && selectReference(file, false))
      .catch(() => {});
  }, []);

  async function selectReference(file, persist = saveLocal) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const parsed = await readReference(file);
      setReferenceFile(file);
      setReference(parsed);
      setResult(null);
      setStatus(`Referencia lista · ${parsed.count} enlaces`);
      if (persist) await saveReferenceLocally(file);
    } catch (err) {
      setError(`No se pudo leer la referencia: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function forgetReference() {
    await clearLocalReference();
    setReferenceFile(null);
    setReference(null);
    setResult(null);
    setStatus("Esperando referencia");
  }

  async function runProcess() {
    if (!reference || !zipFile) return;
    setBusy(true);
    setError("");
    setResult(null);
    setStatus("Procesando localmente...");
    try {
      const processed = await processZip(zipFile, reference);
      setResult(processed);
      setStatus("Conciliación completada");
    } catch (err) {
      setError(err.message);
      setStatus("No se pudo completar");
    } finally {
      setBusy(false);
    }
  }

  const outputName = useMemo(() => {
    if (!zipFile) return "Conciliacion_Mensual.xlsx";
    return `${zipFile.name.replace(/\.zip$/i, "").replace(/[^a-z0-9_-]+/gi, "_")}_conciliado.xlsx`;
  }, [zipFile]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><RefreshCw size={20} /></div>
          <div>
            <strong>ConciliaFlow</strong>
            <span>Conciliación local de documentos</span>
          </div>
        </div>
        <div className="privacy-badge"><ShieldCheck size={17} /> Procesamiento local</div>
      </header>

      <section className="workspace">
        <div className="workspace__main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Nueva conciliación</p>
              <h1>Documentos contra referencia</h1>
              <p>Selecciona la referencia y el ZIP mensual. Nada se envía a servidores.</p>
            </div>
            <div className={`status ${error ? "status--error" : result ? "status--success" : ""}`}>
              {error ? <AlertCircle size={17} /> : result ? <CheckCircle2 size={17} /> : <LockKeyhole size={17} />}
              {status}
            </div>
          </div>

          {error && <div className="error-banner"><AlertCircle size={18} /> {error}</div>}

          <section className="panel">
            <div className="panel__heading">
              <div>
                <span className="step">01</span>
                <h2>Referencia</h2>
              </div>
              {referenceFile && (
                <button type="button" className="icon-button" title="Olvidar referencia guardada" onClick={forgetReference}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <FilePicker
              icon={Database}
              title="Seleccionar Excel de referencia"
              description="Archivo .xlsx con enlaces, TECH, NP y proyecto"
              accept=".xlsx,.xls"
              file={referenceFile}
              onChange={selectReference}
              disabled={busy}
            />
            <label className="toggle-row">
              <input type="checkbox" checked={saveLocal} onChange={(event) => setSaveLocal(event.target.checked)} />
              <span className="toggle" />
              <span>
                <strong>Recordar en este navegador</strong>
                <small>La referencia queda sólo en esta computadora.</small>
              </span>
            </label>
          </section>

          <section className="panel">
            <div className="panel__heading">
              <div>
                <span className="step">02</span>
                <h2>Documentos mensuales</h2>
              </div>
            </div>
            <FilePicker
              icon={FileArchive}
              title="Seleccionar ZIP mensual"
              description="Puede contener archivos PDF, CSV o ambos"
              accept=".zip"
              file={zipFile}
              onChange={(file) => { setZipFile(file); setResult(null); setError(""); }}
              disabled={busy}
            />
          </section>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={runProcess} disabled={!reference || !zipFile || busy}>
              <RefreshCw size={18} className={busy ? "spin" : ""} />
              {busy ? "Procesando..." : "Conciliar archivos"}
            </button>
            {result && (
              <button type="button" className="secondary-button" onClick={() => downloadWorkbook(result, outputName)}>
                <Download size={18} /> Descargar Excel
              </button>
            )}
          </div>

          {result && (
            <section className="results">
              <div className="results__heading">
                <div>
                  <p className="eyebrow">Resultado</p>
                  <h2>{result.period}</h2>
                </div>
                <CheckCircle2 size={25} />
              </div>
              <div className="metrics">
                <Metric label="Archivos" value={result.sourceCount} />
                <Metric label="Facturas" value={result.invoiceCount} />
                <Metric label="Filas" value={result.rows.length} />
                <Metric label="Pendientes" value={result.pendingCount} />
              </div>
              {result.pendingCount > 0 && (
                <div className="notice">
                  <AlertCircle size={17} />
                  El Excel incluye filas pendientes para completar o incorporar a la próxima referencia.
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="sidebar">
          <section>
            <h3><ShieldCheck size={18} /> Privacidad</h3>
            <p>Los archivos se abren y procesan dentro de este navegador. No se cargan a GitHub ni a servicios externos.</p>
          </section>
          <section>
            <h3><FileSpreadsheet size={18} /> Referencia actual</h3>
            {reference ? (
              <dl>
                <div><dt>Archivo</dt><dd>{referenceFile.name}</dd></div>
                <div><dt>Hoja</dt><dd>{reference.sheetName}</dd></div>
                <div><dt>Enlaces</dt><dd>{reference.count}</dd></div>
              </dl>
            ) : (
              <p>La referencia es obligatoria y no está incluida en la aplicación pública.</p>
            )}
          </section>
          <section>
            <h3><LockKeyhole size={18} /> Sin reglas internas</h3>
            <p>Los datos no encontrados se marcan como pendientes. La aplicación pública no contiene proyectos, enlaces ni asignaciones privadas.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
