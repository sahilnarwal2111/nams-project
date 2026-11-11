import { useState, useMemo, useEffect } from "react";
import {
  hasApi, fetchEmployees, fetchTasks, updateTaskStatus, fetchClients, logClientCall, localDay,
  createTask, updateTask, deleteTask, taskFromForm, nextLocalTaskId,
} from "./api.js";
import {
  Ruler, Route, Building2, Droplets, Plane, Waves,
  Menu, X, ChevronRight, Clock, PhoneCall,
  Mail, Phone, MapPin, ArrowLeft,
  ArrowRight, Filter, ChevronDown, Plus, Pencil, Trash2, CalendarDays
} from "lucide-react";

/* ---------------------------------------------------------------
   DESIGN TOKENS
------------------------------------------------------------------*/
const C = {
  navy: "#0F2137",
  navyDeep: "#091524",
  blue: "#1E4B75",
  blueLight: "#4A80B4",
  paper: "#F5F2EB",
  paperDark: "#E8E2D3",
  card: "#FFFFFF",
  orange: "#E25C1D",
  orangeDeep: "#B54311",
  green: "#4D6B41",
  steel: "#5A6672",
  ink: "#1A1B1E",
  line: "#DFD8C8",
  lineDark: "#2A3D52",
};

/* ---------------------------------------------------------------
   MOCK DATA
------------------------------------------------------------------*/
const SERVICES = [
  { code: "SVY-01", icon: Ruler, title: "Surveying & Mapping", desc: "Topographic, boundary, and cadastral surveys delivered as scaled, drawing-office-ready engineering maps." },
  { code: "SVY-02", icon: Waves, title: "X-Section & L-Section", desc: "Cross-sections and longitudinal profiles for highways, railways, canals, and river systems." },
  { code: "SVY-03", icon: Building2, title: "Bridge Designing", desc: "Structural layout, foundation design, and structural detailing for road and rail river crossings." },
  { code: "SVY-04", icon: Route, title: "Highway Designing", desc: "Geometric alignment, pavement structural planning, and intersection designs for high-speed corridors." },
  { code: "SVY-05", icon: Droplets, title: "Wastewater & Storm Water", desc: "Hydraulic drainage network modeling and treatment layouts for municipal & industrial projects." },
  { code: "SVY-06", icon: Plane, title: "Drone Surveys", desc: "High-resolution aerial photogrammetry, 3D mesh modeling, and orthomosaic mapping for site analysis." },
];

const EMPLOYEES = [
  { id: "e1", name: "Narender Kumar", role: "MD & CEO — All-Topics SME", initials: "NK" },
  { id: "e2", name: "Munesh Kumari", role: "Director", initials: "MK" },
  { id: "e3", name: "Sahil", role: "Software Engineer", initials: "SA" },
  { id: "e4", name: "Rajesh Kumar", role: "X-Section Lead", initials: "RK" },
  { id: "e5", name: "Sonu", role: "AutoCAD Lead", initials: "SO" },
  { id: "e6", name: "Ankit", role: "Survey Lead", initials: "AN" },
  { id: "e7", name: "Komal", role: "Accounts", initials: "KO" },
];

const INITIAL_TASKS = [
  { id: "NK-101", title: "Topographic survey — Narwana layout", client: "Jind Infra Developers Pvt Ltd", assignee: "e6", status: "done", priority: "high" },
  { id: "NK-102", title: "Boundary survey — Safidon plot 44", client: "Rohtak Builders", assignee: "e6", status: "todo", priority: "low" },
  { id: "NK-103", title: "Drone survey — solar plant site, Hisar", client: "Kaithal Roadways", assignee: "e6", status: "inprogress", priority: "high" },
  { id: "NK-104", title: "L-section — Western Yamuna Canal stretch", client: "Jind Municipal Council", assignee: "e4", status: "inprogress", priority: "high" },
  { id: "NK-105", title: "X-section survey — NH-352 Jind bypass", client: "National Highways Cell", assignee: "e4", status: "todo", priority: "medium" },
  { id: "NK-106", title: "Cross-section review — Ghaggar embankment, Kaithal", client: "Jind Municipal Council", assignee: "e4", status: "done", priority: "medium" },
  { id: "NK-110", title: "GIS survey-data pipeline upgrade", client: "Internal — NK Consultancy", assignee: "e3", status: "inprogress", priority: "high" },
  { id: "NK-111", title: "Drawing archive digitization — legacy project scans", client: "Internal — NK Consultancy", assignee: "e3", status: "todo", priority: "low" },
  { id: "NK-112", title: "Design review & sign-off — NH-71 realignment", client: "National Highways Cell", assignee: "e1", status: "done", priority: "high" },
  { id: "NK-113", title: "Client escalation review — Panipat Industries Assoc.", client: "Panipat Industries Assoc.", assignee: "e1", status: "inprogress", priority: "high" },
  { id: "NK-114", title: "Tender documentation — Jind Municipal Council waterworks", client: "Jind Municipal Council", assignee: "e2", status: "todo", priority: "high" },
  { id: "NK-116", title: "Saraswati River X-section — Phase 1", client: "Saraswati Heritage Development Board", assignee: "e4", status: "todo", priority: "high" },
  { id: "NK-117", title: "Drone survey — MSIL Plant, Manesar", client: "Maruti Suzuki India Ltd (MSIL)", assignee: "e6", status: "todo", priority: "high" },
  { id: "NK-118", title: "Road design — Panchkula Road (Amravati Round About)", client: "Haryana PWD", assignee: "e1", status: "inprogress", priority: "high" },
  { id: "NK-119", title: "Survey work — Panchkula Road (Amravati Round About)", client: "Haryana PWD", assignee: "e6", status: "done", priority: "high" },
  { id: "NK-120", title: "Storm water plan — Mulana", client: "Mulana Gram Panchayat", assignee: "e1", status: "todo", priority: "medium" },
  { id: "NK-121", title: "Wastewater plan — Beri", client: "Beri Gram Panchayat", assignee: "e3", status: "todo", priority: "medium" },
  { id: "NK-122", title: "Payment review (15 days)", client: "Internal — NK Consultancy", assignee: "e7", status: "todo", priority: "medium" },
  { id: "NK-123", title: "Road X-section — Kaithal Road", client: "Kaithal Roadways", assignee: "e2", status: "todo", priority: "medium" },
  { id: "NK-124", title: "CAD drawing preparation — PHC Jind", client: "Haryana Health Dept — PHC Jind", assignee: "e5", status: "todo", priority: "high" },
  { id: "NK-125", title: "Village XYZ pond survey", client: "Village XYZ Panchayat", assignee: "e6", status: "todo", priority: "low" },
  { id: "NK-126", title: "Village XYZ pond X-section", client: "Village XYZ Panchayat", assignee: "e4", status: "todo", priority: "low" },
];

const INITIAL_CLIENTS = [
  { id: "c1", name: "Jind Infra Developers Pvt Ltd", contact: "Suresh Malik", phone: "+91 98961 23450", due: 184000, invoiceDate: "2026-05-12", lastCall: "2026-07-18", status: "overdue", notes: "Promised payment after milestone billing on the 25th." },
  { id: "c2", name: "Jind Municipal Council", contact: "Eng. R. Dahiya", phone: "+91 98123 45678", due: 96000, invoiceDate: "2026-06-20", lastCall: "2026-07-20", status: "due-soon", notes: "Bill in final approval stage at municipal office." },
  { id: "c3", name: "Rohtak Builders", contact: "Vinod Chhikara", phone: "+91 98221 55678", due: 52000, invoiceDate: "2026-06-02", lastCall: "2026-07-10", status: "overdue", notes: "Escalate to email if no response by Friday." },
  { id: "c4", name: "Yamuna Bridgeworks", contact: "Neha Sharma", phone: "+91 90211 44890", due: 0, invoiceDate: "2026-05-28", lastCall: "2026-07-05", status: "paid", notes: "Cleared in full. Official receipt dispatched." },
  { id: "c5", name: "Kaithal Roadways", contact: "Ramesh Sihag", phone: "+91 98811 22990", due: 133000, invoiceDate: "2026-06-15", lastCall: "2026-07-21", status: "due-soon", notes: "Confirmed cheque dispatch, awaiting bank clearance." },
  { id: "c6", name: "Panipat Industries Assoc.", contact: "Devendra Ahlawat", phone: "+91 97641 33221", due: 76500, invoiceDate: "2026-04-30", lastCall: "2026-07-19", status: "overdue", notes: "Third reminder call made; requested formal statement." },
];

const STATUS_META = {
  todo: { label: "To Do", color: C.steel, bg: "#EFECE6" },
  inprogress: { label: "In Progress", color: C.orange, bg: "#FDF2EC" },
  done: { label: "Completed", color: C.green, bg: "#EEF3ED" },
};

const PRIORITY_META = {
  high: { label: "High", color: C.orangeDeep, bg: "#FDF0EA" },
  medium: { label: "Medium", color: C.blue, bg: "#EBF3FA" },
  low: { label: "Low", color: C.steel, bg: "#F0F2F4" },
};

// Ids match the API's workTypes values exactly, like status and priority.
const WORK_TYPES = [
  { id: "survey", label: "Survey" },
  { id: "x-section", label: "X-Section" },
  { id: "drawing", label: "Drawing" },
  { id: "design", label: "Design" },
  { id: "printout", label: "Printout" },
];

const PAY_STATUS_META = {
  paid: { label: "Paid", color: C.green, bg: "#EEF3ED" },
  "due-soon": { label: "Due Soon", color: C.blue, bg: "#EBF3FA" },
  overdue: { label: "Overdue", color: C.orangeDeep, bg: "#FDF0EA" },
};

const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");
const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const daysAgo = (s) => {
  const diff = Math.round((Date.now() - new Date(s + "T00:00:00").getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
};

/* ---------------------------------------------------------------
   NAVIGATION BAR
------------------------------------------------------------------*/
function TopNav({ page, setPage }) {
  const [open, setOpen] = useState(false);
  const items = [
    { id: "home", label: "Overview" },
    { id: "work", label: "Work Board" },
    { id: "payments", label: "Receivables" },
  ];

  return (
    <header style={{ background: C.navy, borderBottom: `1px solid ${C.lineDark}` }} className="w-full sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <button onClick={() => { setPage("home"); setOpen(false); }} className="flex items-center gap-3 text-left">
          <div style={{ background: C.orange }} className="w-9 h-9 flex items-center justify-center rounded f-mono text-white text-sm font-bold shadow-sm">
            NK
          </div>
          <div style={{ color: C.paper }} className="f-display text-base font-bold tracking-tight leading-none">NK Consultancy</div>
        </button>

        {/* Desktop Menu */}
        <nav className="hidden md:flex items-center gap-1">
          {items.map((it) => {
            const active = page === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setPage(it.id)}
                style={{
                  color: active ? C.orange : C.paper,
                  background: active ? "rgba(226, 92, 29, 0.1)" : "transparent",
                  borderBottom: active ? `2px solid ${C.orange}` : "2px solid transparent",
                }}
                className="f-body text-sm px-4 py-2 font-medium rounded-t transition-all hover:text-white"
              >
                {it.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile Toggle */}
        <button
          className="md:hidden p-2 rounded text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div style={{ background: C.navyDeep, borderBottom: `1px solid ${C.lineDark}` }} className="md:hidden px-4 pt-2 pb-4 space-y-1">
          {items.map((it) => {
            const active = page === it.id;
            return (
              <button
                key={it.id}
                onClick={() => { setPage(it.id); setOpen(false); }}
                style={{
                  color: active ? C.orange : C.paper,
                  background: active ? "rgba(226, 92, 29, 0.15)" : "transparent",
                  borderLeft: active ? `3px solid ${C.orange}` : "3px solid transparent",
                }}
                className="f-body text-sm px-4 py-3 rounded-r w-full text-left font-medium flex items-center justify-between"
              >
                <span>{it.label}</span>
                <ChevronRight size={16} className={active ? "opacity-100" : "opacity-40"} />
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------
   LANDING / OVERVIEW PAGE
------------------------------------------------------------------*/
function Landing({ setPage }) {
  return (
    <div className="w-full">
      {/* HERO */}
      <section style={{ background: C.navy }} className="contour-bg relative overflow-hidden border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="max-w-3xl">
            <h1 style={{ color: C.paper }} className="f-display text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              Precision ground truth for engineering designs.
            </h1>
            <p style={{ color: C.paperDark }} className="f-body text-base sm:text-lg mt-6 max-w-2xl leading-relaxed opacity-90">
              NK Consultancy Pvt Ltd provides complete civil engineering and land survey execution — from topographical contouring and highway alignments to bridge structural detailing.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 mt-8">
              <button
                onClick={() => setPage("work")}
                style={{ background: C.orange, color: "#FFFFFF" }}
                className="f-body font-semibold text-sm px-6 py-3.5 rounded shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
              >
                Open Work Board <ArrowRight size={16} />
              </button>
              <a
                href="#services"
                style={{ borderColor: C.lineDark, color: C.paper }}
                className="f-body font-medium text-sm px-6 py-3.5 rounded border hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
              >
                Explore Services <ChevronDown size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: C.paper }} className="grid-bg border-b border-stone-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="mb-10 sm:mb-12">
            <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Service Portfolio</div>
            <h2 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold">What We Survey, Design &amp; Deliver</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map((s) => (
              <div key={s.code} style={{ background: C.card, borderColor: C.line }} className="card-hover border rounded-md p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div style={{ background: C.paper, color: C.orangeDeep }} className="w-12 h-12 rounded-md flex items-center justify-center border border-amber-900/10">
                      <s.icon size={22} />
                    </div>
                    <span style={{ color: C.steel }} className="f-mono text-xs font-medium px-2 py-1 rounded bg-stone-100">{s.code}</span>
                  </div>
                  <h3 style={{ color: C.ink }} className="f-display text-lg font-bold mb-2">{s.title}</h3>
                  <p style={{ color: C.steel }} className="f-body text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section style={{ background: C.navy }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="max-w-xl mb-10">
            <div style={{ color: C.blueLight }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Engineering Team</div>
            <h2 style={{ color: C.paper }} className="f-display text-2xl sm:text-3xl font-bold">Multidisciplinary Practice Leaders</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {EMPLOYEES.map((e) => (
              <div key={e.id} style={{ background: "rgba(255,255,255,0.04)", borderColor: C.lineDark }} className="border rounded-md p-5 flex sm:flex-col items-center sm:items-start gap-4 sm:gap-0">
                <div style={{ background: C.orange, color: "#FFFFFF" }} className="w-11 h-11 rounded-full flex items-center justify-center f-mono text-sm font-bold shrink-0 sm:mb-4">
                  {e.initials}
                </div>
                <div>
                  <div style={{ color: C.paper }} className="f-body text-base font-semibold">{e.name}</div>
                  <div style={{ color: C.blueLight }} className="f-body text-xs mt-0.5">{e.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: C.navyDeep, borderTop: `1px solid ${C.lineDark}` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div style={{ color: C.paper }} className="f-display text-lg font-bold mb-2">NK Consultancy Pvt Ltd</div>
            <p style={{ color: C.steel }} className="f-body text-sm leading-relaxed">Civil design, topographic surveying, and geospatial infrastructure consulting.</p>
          </div>
          <div style={{ color: C.paper }} className="f-body text-sm space-y-2.5">
            <div className="flex items-center gap-2.5"><MapPin size={16} style={{ color: C.orange }} /> Jind, Haryana, India</div>
            <div className="flex items-center gap-2.5"><Phone size={16} style={{ color: C.orange }} /> +91-9355247066</div>
            <div className="flex items-center gap-2.5"><Mail size={16} style={{ color: C.orange }} /> nkconsultacypvtltd@gmail.com</div>
          </div>
          <div style={{ color: C.steel }} className="f-mono text-xs md:text-right flex md:block items-center justify-between">
            <div>DRAWING REF: NK/2026/REV-C</div>
            <div className="mt-1">© 2026 NK Consultancy</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------
   WORK BOARD
------------------------------------------------------------------*/
function TaskCard({ task, employees, onMove, onEdit, busy }) {
  const emp = employees.find((e) => e.id === task.assignee);
  const pr = PRIORITY_META[task.priority];
  const order = ["todo", "inprogress", "done"];
  const idx = order.indexOf(task.status);

  return (
    <div style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-4 mb-3 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: C.steel }} className="f-mono text-[11px] font-medium">{task.id}</span>
        <div className="flex items-center gap-1.5">
          <span style={{ background: pr.bg, color: pr.color }} className="f-mono text-[10px] font-semibold px-2 py-0.5 rounded">
            {pr.label}
          </span>
          <button
            onClick={() => onEdit(task)}
            aria-label={`Edit ${task.id}`}
            style={{ color: C.steel }}
            className="p-1 rounded hover:bg-stone-100 active:scale-95 transition-transform"
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>
      <h4 style={{ color: C.ink }} className="f-body text-sm font-semibold leading-snug mb-1">{task.title}</h4>
      <p style={{ color: C.steel }} className="f-body text-xs mb-2">
        {task.client}{task.district ? ` · ${task.district}` : ""}
      </p>

      {task.workTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {WORK_TYPES.filter((w) => task.workTypes.includes(w.id)).map((w) => (
            <span key={w.id} style={{ background: C.paper, color: C.blue, borderColor: C.line }} className="f-mono text-[10px] px-1.5 py-0.5 rounded border">
              {w.label}
            </span>
          ))}
        </div>
      )}
      {task.expectedCompletion && (
        <div style={{ color: C.steel }} className="f-body text-xs flex items-center gap-1.5 mb-2">
          <CalendarDays size={12} style={{ color: C.blue }} /> Due {fmtDate(task.expectedCompletion)}
        </div>
      )}
      <div className="mb-2" />

      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <div className="flex items-center gap-2">
          <div style={{ background: C.navy, color: C.paper }} className="w-6 h-6 rounded-full flex items-center justify-center f-mono text-[10px] font-bold">
            {emp?.initials}
          </div>
          <span style={{ color: C.steel }} className="f-body text-xs font-medium">{emp?.name.split(" ")[0]}</span>
        </div>

        <div className="flex items-center gap-1">
          {idx > 0 && (
            <button
              onClick={() => onMove(task.id, order[idx - 1])}
              disabled={busy}
              style={{ borderColor: C.line }}
              className="p-1 rounded border hover:bg-stone-100 text-slate-600 active:scale-95 transition-transform disabled:opacity-40"
            >
              <ArrowLeft size={13} />
            </button>
          )}
          {idx < order.length - 1 && (
            <button
              onClick={() => onMove(task.id, order[idx + 1])}
              disabled={busy}
              style={{ borderColor: C.line }}
              className="p-1 rounded border hover:bg-stone-100 text-slate-600 active:scale-95 transition-transform disabled:opacity-40"
            >
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_WORK = {
  title: "", client: "", customerPhone: "", district: "", department: "",
  workTypes: [], details: "", expectedCompletion: "", priority: "medium", assignee: "",
};

const INPUT_CLASS = "f-body text-sm w-full rounded border px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider font-medium block mb-1">
        {label}{required && <span style={{ color: C.orangeDeep }}> *</span>}
      </span>
      {children}
    </label>
  );
}

// Create (task = null) or edit a work item. onSave and onDelete return promises;
// a rejection is shown in the form and the form stays open.
function WorkForm({ task, employees, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_WORK,
    assignee: employees[0]?.id ?? "",
    ...(task
      ? Object.fromEntries(Object.keys(EMPTY_WORK).map((k) => [k, task[k] ?? EMPTY_WORK[k]]))
      : {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleType = (id) =>
    setForm((f) => ({ ...f, workTypes: f.workTypes.includes(id) ? f.workTypes.filter((t) => t !== id) : [...f.workTypes, id] }));

  const run = (action) => {
    setBusy(true);
    setError(null);
    action()
      .then(onClose)
      .catch((err) => { setError(err.message); setBusy(false); });
  };

  const submit = (e) => {
    e.preventDefault();
    if (form.title.trim() === "" || form.client.trim() === "") {
      setError("Work name and customer name are required.");
      return;
    }
    run(() => onSave(form));
  };

  const line = { borderColor: C.line, color: C.ink };

  return (
    <div
      style={{ background: "rgba(9, 21, 36, 0.55)" }}
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-label={task ? `Edit ${task.id}` : "New work"}
        style={{ background: C.paper, borderColor: C.line }}
        className="w-full max-w-2xl border rounded-lg shadow-xl"
      >
        <div style={{ background: C.navy }} className="flex items-center justify-between px-5 py-4 rounded-t-lg">
          <div>
            <div style={{ color: C.orange }} className="f-mono text-[10px] font-semibold tracking-wider uppercase">
              {task ? task.id : "Work Order"}
            </div>
            <h2 style={{ color: C.paper }} className="f-display text-lg font-bold">{task ? "Edit Work" : "New Work"}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ color: C.paper }} className="p-1 rounded hover:opacity-80">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Work name" required>
              <input name="title" value={form.title} onChange={set("title")} required autoFocus style={line} className={INPUT_CLASS} placeholder="e.g. Topographic survey, Narwana layout" />
            </Field>
          </div>
          <Field label="Customer name" required>
            <input name="client" value={form.client} onChange={set("client")} required style={line} className={INPUT_CLASS} />
          </Field>
          <Field label="Customer mobile number">
            <input name="customerPhone" type="tel" value={form.customerPhone} onChange={set("customerPhone")} style={line} className={INPUT_CLASS} placeholder="+91" />
          </Field>
          <Field label="District">
            <input name="district" value={form.district} onChange={set("district")} style={line} className={INPUT_CLASS} />
          </Field>
          <Field label="Department">
            <input name="department" value={form.department} onChange={set("department")} style={line} className={INPUT_CLASS} />
          </Field>

          <div className="sm:col-span-2">
            <span style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider font-medium block mb-1.5">Work type</span>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((w) => {
                const on = form.workTypes.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleType(w.id)}
                    style={{ background: on ? C.navy : C.card, color: on ? C.paper : C.ink, borderColor: on ? C.navy : C.line }}
                    className="f-body text-xs px-3 py-1.5 rounded border font-medium shadow-sm"
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2">
            <Field label="Other details">
              <textarea name="details" value={form.details} onChange={set("details")} rows={3} style={line} className={INPUT_CLASS} />
            </Field>
          </div>

          <Field label="Expected completion">
            <input name="expectedCompletion" type="date" value={form.expectedCompletion} onChange={set("expectedCompletion")} style={line} className={INPUT_CLASS} />
          </Field>
          <Field label="Priority" required>
            <select name="priority" value={form.priority} onChange={set("priority")} style={line} className={INPUT_CLASS}>
              {["high", "medium", "low"].map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Assign to" required>
              <select name="assignee" value={form.assignee} onChange={set("assignee")} required style={line} className={INPUT_CLASS}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
              </select>
            </Field>
          </div>

          {error && (
            <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="sm:col-span-2 border rounded-md px-3 py-2 f-body text-sm">
              {error}
            </div>
          )}
        </div>

        <div style={{ borderColor: C.line }} className="border-t px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            {task && !confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} style={{ color: C.orangeDeep }} className="f-body text-xs font-semibold flex items-center gap-1.5 px-2 py-2 rounded hover:bg-orange-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
            {task && confirmDelete && (
              <div className="flex items-center gap-2">
                <span style={{ color: C.orangeDeep }} className="f-body text-xs font-semibold">Delete this work permanently?</span>
                <button type="button" onClick={() => run(() => onDelete(task.id))} disabled={busy} style={{ background: C.orangeDeep, color: C.paper }} className="f-body text-xs font-semibold px-3 py-1.5 rounded">
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} style={{ borderColor: C.line, color: C.ink }} className="f-body text-xs px-3 py-1.5 rounded border bg-white">
                  No
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} disabled={busy} style={{ borderColor: C.line, color: C.ink }} className="f-body text-sm px-4 py-2 rounded border bg-white">
              Cancel
            </button>
            <button type="submit" disabled={busy} style={{ background: C.orange, color: C.paper }} className="f-body text-sm font-semibold px-5 py-2 rounded shadow-sm hover:opacity-90 disabled:opacity-60">
              {busy ? "Saving…" : task ? "Save Changes" : "Add Work"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function WorkBoard() {
  const useApi = hasApi();
  const [tasks, setTasks] = useState(useApi ? [] : INITIAL_TASKS);
  const [employees, setEmployees] = useState(useApi ? [] : EMPLOYEES);
  const [load, setLoad] = useState(useApi ? { state: "loading" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  // null = form closed, "new" = creating, a task = editing it.
  const [editing, setEditing] = useState(null);

  // Both return promises so the form can show a failure and stay open.
  const saveWork = async (form) => {
    if (editing === "new") {
      const created = useApi
        ? await createTask(form)
        : { ...taskFromForm(form), id: nextLocalTaskId(tasks), status: "todo" };
      setTasks((prev) => [...prev, created]);
    } else {
      const id = editing.id;
      const updated = useApi ? await updateTask(id, form) : taskFromForm(form);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
    }
  };

  const removeWork = async (id) => {
    if (useApi) await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    Promise.all([fetchEmployees(), fetchTasks()])
      .then(([emps, tks]) => {
        if (cancelled) return;
        setEmployees(emps);
        setTasks(tks);
        setLoad({ state: "ready" });
      })
      .catch((err) => {
        if (!cancelled) setLoad({ state: "error", message: err.message });
      });
    return () => { cancelled = true; };
  }, [useApi, attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((a) => a + 1);
  };

  const setStatus = (id, status) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));

  // One save per card at a time: a second move while the first is still being
  // saved could otherwise roll back to a status the server never had.
  const moveTask = (id, status) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status || saving.has(id)) return;
    const prevStatus = task.status;
    setSaveError(null);
    setStatus(id, status);
    if (!useApi) return;
    setSaving((prev) => new Set(prev).add(id));
    updateTaskStatus(id, status)
      .catch((err) => {
        setStatus(id, prevStatus);
        setSaveError(`Could not save the move for "${task.title}" (${id}); it was put back. ${err.message}`);
      })
      .finally(() => setSaving((prev) => { const next = new Set(prev); next.delete(id); return next; }));
  };

  const visible = useMemo(() => (filter === "all" ? tasks : tasks.filter((t) => t.assignee === filter)), [tasks, filter]);
  const columns = ["todo", "inprogress", "done"];
  const counts = { todo: 0, inprogress: 0, done: 0 };
  tasks.forEach((t) => { counts[t.status]++; });

  return (
    <div style={{ background: C.paper }} className="min-h-[calc(100vh-4rem)] grid-bg py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header & Metrics */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Task Operations</div>
            <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold">Project Work Board</h1>
            {load.state === "ready" && (
              <button
                onClick={() => setEditing("new")}
                style={{ background: C.orange, color: C.paper }}
                className="f-body text-sm font-semibold px-4 py-2 mt-3 rounded shadow-sm hover:opacity-90 active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <Plus size={16} /> New Work
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {columns.map((c) => (
              <div key={c} style={{ background: C.card, borderColor: C.line }} className="border rounded-md px-3 py-2 sm:px-4 sm:py-2.5 text-center min-w-[90px] shadow-sm">
                <div style={{ color: STATUS_META[c].color }} className="f-display text-lg sm:text-xl font-bold">{counts[c]}</div>
                <div style={{ color: C.steel }} className="f-mono text-[10px] tracking-wider uppercase font-medium">{STATUS_META[c].label}</div>
              </div>
            ))}
          </div>
        </div>

        {load.state === "loading" && (
          <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">
            Loading work board…
          </div>
        )}

        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load the work board. {load.message}</p>
            <button
              onClick={retry}
              style={{ background: C.navy, color: C.paper }}
              className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {load.state === "ready" && (<>
        {saveError && (
          <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="border rounded-md px-4 py-3 mb-4 f-body text-sm flex items-start justify-between gap-3">
            <span>{saveError}</span>
            <button onClick={() => setSaveError(null)} aria-label="Dismiss" className="shrink-0"><X size={16} /></button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
          <span className="f-mono text-xs text-stone-500 flex items-center gap-1 shrink-0 mr-1">
            <Filter size={13} /> Filter:
          </span>
          <button
            onClick={() => setFilter("all")}
            style={{
              background: filter === "all" ? C.navy : C.card,
              color: filter === "all" ? C.paper : C.ink,
              borderColor: C.line,
            }}
            className="f-body text-xs px-3.5 py-1.5 rounded border font-medium whitespace-nowrap shadow-sm shrink-0"
          >
            All Staff
          </button>
          {employees.map((e) => (
            <button
              key={e.id}
              onClick={() => setFilter(e.id)}
              style={{
                background: filter === e.id ? C.navy : C.card,
                color: filter === e.id ? C.paper : C.ink,
                borderColor: C.line,
              }}
              className="f-body text-xs px-3.5 py-1.5 rounded border font-medium whitespace-nowrap shadow-sm shrink-0"
            >
              {e.name}
            </button>
          ))}
        </div>

        {/* Kanban Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col) => {
            const colTasks = visible.filter((t) => t.status === col);
            return (
              <div key={col} style={{ background: "rgba(232, 226, 211, 0.4)", borderColor: C.line }} className="border rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="flex items-center gap-2">
                    <span style={{ background: STATUS_META[col].color }} className="w-2.5 h-2.5 rounded-full" />
                    <h3 style={{ color: C.ink }} className="f-body text-sm font-bold">{STATUS_META[col].label}</h3>
                  </div>
                  <span style={{ color: C.steel, background: C.card }} className="f-mono text-xs px-2 py-0.5 rounded border border-stone-200 font-semibold">
                    {colTasks.length}
                  </span>
                </div>

                <div className="min-h-[250px]">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} employees={employees} onMove={moveTask} onEdit={setEditing} busy={saving.has(t.id)} />
                  ))}
                  {colTasks.length === 0 && (
                    <div style={{ borderColor: C.line, color: C.steel }} className="border border-dashed rounded-md p-8 text-center f-body text-xs">
                      No assignments found in this status.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>)}
      </div>

      {editing && (
        <WorkForm
          key={editing === "new" ? "new" : editing.id}
          task={editing === "new" ? null : editing}
          employees={employees}
          onSave={saveWork}
          onDelete={removeWork}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   PAYMENTS / RECEIVABLES PAGE
------------------------------------------------------------------*/
function ClientCard({ client, onCallLogged, busy }) {
  const meta = PAY_STATUS_META[client.status];
  return (
    <div style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between mb-3 gap-2">
          <div>
            <h3 style={{ color: C.ink }} className="f-display text-base font-bold">{client.name}</h3>
            <div style={{ color: C.steel }} className="f-body text-xs mt-0.5">{client.contact} &nbsp;•&nbsp; {client.phone}</div>
          </div>
          <span style={{ background: meta.bg, color: meta.color }} className="f-mono text-[10px] font-bold px-2.5 py-1 rounded shrink-0 uppercase tracking-wide">
            {meta.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div style={{ background: C.paper }} className="rounded p-3 border border-stone-200/60">
            <div style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider mb-1">Outstanding</div>
            <div style={{ color: client.due > 0 ? C.orangeDeep : C.green }} className="f-display text-lg font-bold">
              {client.due > 0 ? fmtINR(client.due) : "Settled"}
            </div>
          </div>
          <div style={{ background: C.paper }} className="rounded p-3 border border-stone-200/60">
            <div style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider mb-1">Invoice Date</div>
            <div style={{ color: C.ink }} className="f-body text-sm font-semibold">{fmtDate(client.invoiceDate)}</div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ borderColor: C.line }} className="border-t pt-3 flex items-center justify-between flex-wrap gap-2">
          <div style={{ color: C.steel }} className="f-body text-xs flex items-center gap-1.5">
            <Clock size={13} style={{ color: C.blue }} /> Last contacted: <strong className="text-stone-700">{daysAgo(client.lastCall)}</strong>
          </div>
          {client.due > 0 && (
            <button
              onClick={() => onCallLogged(client.id)}
              disabled={busy}
              style={{ background: C.navy, color: C.paper }}
              className="f-body text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              <PhoneCall size={13} /> Log Reminder
            </button>
          )}
        </div>

        {client.notes && (
          <p style={{ color: C.steel, background: "#FAF8F5" }} className="f-body text-xs mt-3 p-2.5 rounded border border-stone-200/80 leading-relaxed italic">
            "{client.notes}"
          </p>
        )}
      </div>
    </div>
  );
}

function Payments() {
  const useApi = hasApi();
  const [clients, setClients] = useState(useApi ? [] : INITIAL_CLIENTS);
  const [load, setLoad] = useState(useApi ? { state: "loading" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  // The viewer's own calendar day, so "Today" is right before 05:30 IST too.
  const today = localDay();

  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    fetchClients()
      .then((list) => {
        if (cancelled) return;
        setClients(list);
        setLoad({ state: "ready" });
      })
      .catch((err) => {
        if (!cancelled) setLoad({ state: "error", message: err.message });
      });
    return () => { cancelled = true; };
  }, [useApi, attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((a) => a + 1);
  };

  const setLastCall = (id, lastCall) => setClients((prev) => prev.map((c) => (c.id === id ? { ...c, lastCall } : c)));

  // One save per client at a time, so a failed save always restores a date the
  // server really had.
  const logCall = (id) => {
    const client = clients.find((c) => c.id === id);
    if (!client || saving.has(id)) return;
    const prevLastCall = client.lastCall;
    setSaveError(null);
    setLastCall(id, today);
    if (!useApi) return;
    setSaving((prev) => new Set(prev).add(id));
    logClientCall(id)
      .then((updated) => setLastCall(id, updated.lastCall))
      .catch((err) => {
        setLastCall(id, prevLastCall);
        setSaveError(`Could not save the reminder for ${client.name}; it was undone. ${err.message}`);
      })
      .finally(() => setSaving((prev) => { const next = new Set(prev); next.delete(id); return next; }));
  };

  const totalDue = clients.reduce((s, c) => s + c.due, 0);
  const overdueCount = clients.filter((c) => c.status === "overdue").length;
  const calledToday = clients.filter((c) => c.lastCall === today).length;

  const visible = filter === "all" ? clients : clients.filter((c) => c.status === filter);

  return (
    <div style={{ background: C.paper }} className="min-h-[calc(100vh-4rem)] grid-bg py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Financial Log</div>
          <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold">Payment Receivables &amp; Follow-ups</h1>
        </div>

        {load.state === "loading" && (
          <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">
            Loading payments…
          </div>
        )}

        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load payments. {load.message}</p>
            <button
              onClick={retry}
              style={{ background: C.navy, color: C.paper }}
              className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {load.state === "ready" && (<>
        {saveError && (
          <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="border rounded-md px-4 py-3 mb-4 f-body text-sm flex items-start justify-between gap-3">
            <span>{saveError}</span>
            <button onClick={() => setSaveError(null)} aria-label="Dismiss" className="shrink-0"><X size={16} /></button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div style={{ background: C.navy }} className="rounded-md p-5 shadow-sm text-white">
            <div style={{ color: C.blueLight }} className="f-mono text-xs uppercase tracking-wider mb-1">Total Outstanding</div>
            <div className="f-display text-2xl sm:text-3xl font-bold">{fmtINR(totalDue)}</div>
          </div>
          <div style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-5 shadow-sm">
            <div style={{ color: C.steel }} className="f-mono text-xs uppercase tracking-wider mb-1">Overdue Accounts</div>
            <div style={{ color: C.orangeDeep }} className="f-display text-2xl sm:text-3xl font-bold">{overdueCount}</div>
          </div>
          <div style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-5 shadow-sm">
            <div style={{ color: C.steel }} className="f-mono text-xs uppercase tracking-wider mb-1">Followed Up Today</div>
            <div style={{ color: C.green }} className="f-display text-2xl sm:text-3xl font-bold">
              {calledToday} <span className="text-sm font-normal text-stone-500">/ {clients.filter(c => c.due > 0).length} pending</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
          {[
            { id: "all", label: "All Accounts" },
            { id: "overdue", label: "Overdue" },
            { id: "due-soon", label: "Due Soon" },
            { id: "paid", label: "Fully Paid" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: filter === f.id ? C.navy : C.card,
                color: filter === f.id ? C.paper : C.ink,
                borderColor: C.line,
              }}
              className="f-body text-xs px-4 py-2 rounded border font-medium whitespace-nowrap shadow-sm shrink-0"
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((c) => (
            <ClientCard key={c.id} client={c} onCallLogged={logCall} busy={saving.has(c.id)} />
          ))}
        </div>
        </>)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP EXPORT
------------------------------------------------------------------*/
export default function App() {
  const [page, setPage] = useState("home");
  return (
    <div className="f-body w-full min-h-screen antialiased" style={{ background: C.paper }}>
      <TopNav page={page} setPage={setPage} />
      <main>
        {page === "home" && <Landing setPage={setPage} />}
        {page === "work" && <WorkBoard />}
        {page === "payments" && <Payments />}
      </main>
    </div>
  );
}