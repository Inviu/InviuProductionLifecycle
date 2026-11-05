import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { ArrowLeft, LogOut, RefreshCw, Loader, Cog, Plus, Pencil, X, Search, Trash2 } from "lucide-react";

// Steps that run on machines come first; the rest (QC, packing, plating, dispatch)
// can still have machines if the floor wants them.
const MACHINE_FORMS = ["machining", "machining_bits"];

export const MachinesPage = () => {
  const { navigateTo, logout } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // machine object or { new: true, processIds }
  const [showOther, setShowOther] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await api.machineSetup.get());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const byId = useMemo(() => new Map((data?.machines || []).map((m) => [m.id, m])), [data]);
  const q = query.trim().toLowerCase();
  const matches = (m) => !q || m.name.toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q);

  const removeFromStep = async (m, stepId, stepName) => {
    if (!window.confirm(`Remove ${m.name} from ${stepName}? Operators won't be able to pick it for this step. Its past logs stay.`)) return;
    try {
      await api.machineSetup.update(m.id, { name: m.name, description: m.description, processIds: m.processIds.filter((p) => p !== stepId) });
      flash(`${m.name} removed from ${stepName}.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const machineSteps = data?.steps.filter((s) => MACHINE_FORMS.includes(s.formType)) || [];
  const otherSteps = data?.steps.filter((s) => !MACHINE_FORMS.includes(s.formType)) || [];
  const unassigned = data?.machines.filter((m) => m.processIds.length === 0 && matches(m)) || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigateTo("home")} className="text-slate-600 hover:text-slate-900 px-2 py-2 rounded-lg hover:bg-slate-100 transition" aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Cog className="w-6 h-6 text-blue-600" />
                Machines
              </h1>
              <p className="text-sm text-slate-600 mt-1">Machine numbers and names for each step. Operators pick from these in the app.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button onClick={() => setEditing({ new: true, processIds: [] })} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
              <Plus className="w-4 h-4" /> New machine
            </button>
            <button onClick={load} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg transition">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={logout} className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg transition">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}
        {notice && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4">{notice}</div>}

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a machine number or name"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {data && <span className="text-sm text-slate-500">{data.machines.length} machines across {machineSteps.length} machining steps</span>}
        </div>

        {!data && loading ? (
          <div className="flex justify-center py-16"><Loader className="w-8 h-8 text-blue-600 animate-spin" /></div>
        ) : data ? (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {machineSteps.map((s) => (
                <StepCard key={s.id} step={s} byId={byId} matches={matches} onEdit={setEditing} onRemove={removeFromStep} onAdded={(msg) => { flash(msg); load(); }} onError={setError} />
              ))}
            </div>

            {unassigned.length > 0 && (
              <section className="mt-6 bg-white rounded-lg border border-amber-200 p-5">
                <h2 className="font-semibold text-slate-900">Not on any step</h2>
                <p className="text-sm text-slate-500 mb-3">Operators can’t pick these. Add them to a step, or delete them if they’re no longer used.</p>
                <div className="divide-y divide-slate-100">
                  {unassigned.map((m) => (
                    <MachineRow key={m.id} m={m} onEdit={() => setEditing(m)} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6">
              <button onClick={() => setShowOther((v) => !v)} className="text-sm text-blue-700 hover:underline">
                {showOther ? "Hide" : "Show"} other steps (QC, packing, plating, dispatch)
              </button>
              {showOther && (
                <div className="grid gap-5 md:grid-cols-2 mt-3">
                  {otherSteps.map((s) => (
                    <StepCard key={s.id} step={s} byId={byId} matches={matches} onEdit={setEditing} onRemove={removeFromStep} onAdded={(msg) => { flash(msg); load(); }} onError={setError} compact />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>

      {editing && data && (
        <EditMachine
          machine={editing}
          steps={data.steps}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            flash(msg);
            load();
          }}
        />
      )}
    </div>
  );
};

function StepCard({ step, byId, matches, onEdit, onRemove, onAdded, onError, compact }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const machines = step.machineIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const shown = machines.filter(matches);

  const add = async (e) => {
    e.preventDefault();
    const num = code.trim();
    if (!num) return;
    setBusy(true);
    try {
      const existing = [...byId.values()].find((m) => m.name.toLowerCase() === num.toLowerCase());
      if (existing) {
        if (existing.processIds.includes(step.id)) throw new Error(`${existing.name} is already on ${step.name}.`);
        // Same machine used on another step too (e.g. a power press for blanking and bending).
        await api.machineSetup.update(existing.id, {
          name: existing.name,
          description: name.trim() || existing.description,
          processIds: [...existing.processIds, step.id],
        });
        onAdded(`${existing.name} added to ${step.name}.`);
      } else {
        await api.machineSetup.create({ name: num, description: name.trim() || null, processIds: [step.id] });
        onAdded(`${num} added to ${step.name}.`);
      }
      setCode("");
      setName("");
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold text-slate-900">{step.name}</h2>
        <span className="text-sm text-slate-500">{machines.length} machine{machines.length === 1 ? "" : "s"}</span>
      </div>
      {machines.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">{compact ? "No machines — operators skip the machine screen for this step." : "No machines yet."}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No match.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {shown.map((m) => (
            <MachineRow key={m.id} m={m} onEdit={() => onEdit(m)} onRemove={() => onRemove(m, step.id, step.name)} />
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Machine no."
          className="w-40 px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`New machine number for ${step.name}`}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="flex-1 min-w-[140px] px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`New machine name for ${step.name}`}
        />
        <button disabled={busy || !code.trim()} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>
    </section>
  );
}

function MachineRow({ m, onEdit, onRemove }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="font-semibold text-slate-900 w-16 shrink-0">{m.name}</span>
      <span className="flex-1 text-sm text-slate-600 truncate">{m.description || <span className="text-slate-400">—</span>}</span>
      {m.processIds.length > 1 && <span className="text-xs text-slate-400 whitespace-nowrap">{m.processIds.length} steps</span>}
      {m.logs > 0 && <span className="text-xs text-slate-400 whitespace-nowrap">{m.logs} log{m.logs === 1 ? "" : "s"}</span>}
      <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" aria-label={`Edit ${m.name}`} title="Edit">
        <Pencil className="w-4 h-4" />
      </button>
      {onRemove && (
        <button onClick={onRemove} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600" aria-label={`Remove ${m.name} from this step`} title="Remove from this step">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function EditMachine({ machine, steps, onClose, onSaved }) {
  const isNew = !!machine.new;
  const [name, setName] = useState(isNew ? "" : machine.name);
  const [description, setDescription] = useState(isNew ? "" : machine.description || "");
  const [processIds, setProcessIds] = useState(machine.processIds || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hasHistory = !isNew && (machine.logs > 0 || machine.assignments > 0);

  const toggle = (id) => setProcessIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    if (!name.trim()) return setErr("Enter a machine number.");
    setBusy(true);
    setErr(null);
    try {
      const body = { name: name.trim(), description: description.trim() || null, processIds };
      if (isNew) await api.machineSetup.create(body);
      else await api.machineSetup.update(machine.id, body);
      onSaved(isNew ? `${body.name} added.` : `${body.name} saved.`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete machine ${machine.name}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.machineSetup.remove(machine.id);
      onSaved(`${machine.name} deleted.`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const ordered = [...steps].sort((a, b) => (MACHINE_FORMS.includes(b.formType) ? 1 : 0) - (MACHINE_FORMS.includes(a.formType) ? 1 : 0));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={isNew ? "New machine" : `Edit ${machine.name}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{isNew ? "New machine" : `Edit ${machine.name}`}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{err}</div>}
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Machine no.</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="DR14" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Radial drill, Bay 2" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>
          {!isNew && machine.logs > 0 && (
            <p className="text-xs text-slate-500">Renaming keeps its {machine.logs} past log{machine.logs === 1 ? "" : "s"} — they’ll show the new number.</p>
          )}
          <div>
            <span className="text-sm font-medium text-slate-700">Used for these steps</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {ordered.map((s) => (
                <label key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm cursor-pointer ${processIds.includes(s.id) ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                  <input type="checkbox" checked={processIds.includes(s.id)} onChange={() => toggle(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-slate-200">
          {!isNew ? (
            <button
              onClick={remove}
              disabled={busy || hasHistory}
              title={hasHistory ? "Has production history — remove it from its steps instead" : "Delete this machine"}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 disabled:text-slate-400 disabled:hover:bg-transparent px-3 py-2 rounded-lg"
            >
              <Trash2 className="w-4 h-4" /> Delete machine
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {hasHistory && <p className="px-5 pb-4 -mt-2 text-xs text-slate-500">It can’t be deleted because it has production history. Untick all steps to take it out of use.</p>}
      </div>
    </div>
  );
}
