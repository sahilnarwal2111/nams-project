import { useState, useMemo, useEffect } from "react";
import {
  hasApi, fetchEmployees, fetchTasks, updateTaskStatus, localDay,
  createTask, updateTask, deleteTask, taskFromForm, nextLocalTaskId,
  setTaskFee, recordPayment, fetchPayments, removePayment, logReminder, parseRupees,
  fetchSession, login, logout, onAuthLost,
  daysAgo, enquiryError,
  fetchActivity,
  fetchTeam, canEditTask, viewerLabel, signInChoices, defaultSignInChoice, personalPasswordError, setEmployeePassword, clearEmployeePassword, sendEnquiry, fetchEnquiries, updateEnquiryStatus, deleteEnquiry,
} from "./api.js";
import {
  filterTasks, sortTasks, isOverdue, SORT_MODES, workCounts,
  boardTasks, completedTasks, completedByMonth, RECENT_DAYS,
} from "./board.js";
import { pageFromHash, hashForPage, anchorFromHash } from "./route.js";
import {
  PAYMENT_LABELS, RECEIVABLE_FILTERS, balanceOf, filterReceivables, receivableCounts, receivableTotals, sortReceivables,
  parseFee, paymentError, withStatus, applyPayment, removeLocalPayment,
} from "./receivables.js";
import { KIND_FILTERS, kindLabel, actorFilters, groupByDay, changeRows, deviceLabel, dayOf, dayLabel, timeLabel } from "./activity.js";
import {
  Ruler, Route, Building2, Droplets, Plane, Waves,
  Menu, X, ChevronRight, PhoneCall,
  Mail, Phone, MapPin, ArrowLeft,
  ArrowRight, Filter, ChevronDown, Plus, Pencil, Trash2, CalendarDays, IndianRupee, Lock, LogOut, History, Search, CircleCheck, Send, MessageSquare, KeyRound, UserRound, Eye, Info, ScrollText, RefreshCw
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

const SAMPLE_TASKS = [
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

// Mock mode only: [amount to charge, received so far] for some of the sample
// work. The rest has no amount yet; 0 is work that is not charged.
const SAMPLE_BILLING = {
  "NK-101": [40000, 40000], "NK-102": [18000, 0], "NK-103": [60000, 20000], "NK-104": [85000, 0], "NK-106": [30000, 30000],
  "NK-110": [0, 0], "NK-112": [45000, 20000], "NK-113": [25000, 0], "NK-119": [35000, 0],
};
const INITIAL_TASKS = SAMPLE_TASKS.map((task) => {
  const [fee, received] = SAMPLE_BILLING[task.id] ?? [null, 0];
  const payments = received > 0 ? [{ id: 1, amount: received, note: null, receivedAt: "2026-11-02" }] : [];
  return withStatus({ ...task, fee, received, payments, lastReminder: null });
});

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

// Colours for the API's paymentStatus values; the labels are PAYMENT_LABELS.
const PAYMENT_META = {
  unset: { color: C.steel, bg: "#F0F2F4" },
  unpaid: { color: C.orangeDeep, bg: "#FDF0EA" },
  part: { color: C.blue, bg: "#EBF3FA" },
  paid: { color: C.green, bg: "#EEF3ED" },
};

const ENQUIRY_STATUS_META = {
  new: { label: "New", color: C.orangeDeep, bg: "#FDF0EA" },
  contacted: { label: "Contacted", color: C.blue, bg: "#EBF3FA" },
  closed: { label: "Closed", color: C.green, bg: "#EEF3ED" },
};

// Mock mode only: sample enquiries, newest first.
const INITIAL_ENQUIRIES = [
  { id: 2, name: "Suresh Malik", phone: "+91 98120 44556", message: "Need a boundary survey for a 2 acre plot near Uchana before registry.", status: "new", createdAt: "2026-11-10" },
  { id: 1, name: "Kavita Sharma", phone: "+91 94160 22113", message: "Quotation for drone survey of a warehouse site in Narwana.", status: "contacted", createdAt: "2026-11-07" },
];

const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");
const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/* ---------------------------------------------------------------
   NAVIGATION BAR
------------------------------------------------------------------*/
function TopNav({ page, setPage, onSignOut, userName, showTeam, showActivity }) {
  const [open, setOpen] = useState(false);
  const items = [
    { id: "home", label: "Overview" },
    { id: "work", label: "Work Board" },
    { id: "payments", label: "Receivables" },
    { id: "enquiries", label: "Enquiries" },
    ...(showTeam ? [{ id: "team", label: "Team" }] : []),
    ...(showActivity ? [{ id: "activity", label: "Activity" }] : []),
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

        {/* Desktop menu: from 1024px, where every item, Sign out and the name fit on one line. */}
        <nav className="hidden lg:flex items-center gap-1">
          {items.map((it) => {
            const active = page === it.id || (it.id === "work" && page === "completed");
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
          {onSignOut && (
            <button
              onClick={onSignOut}
              style={{ color: C.blueLight, borderColor: C.lineDark }}
              className="f-body text-xs px-3 py-1.5 ml-3 font-medium rounded border flex items-center gap-1.5 hover:text-white"
            >
              <LogOut size={13} /> Sign out
            </button>
          )}
          {onSignOut && userName && (
            <span data-testid="signed-in-as" style={{ color: C.blueLight }} className="f-body text-xs ml-2 flex items-center gap-1">
              <UserRound size={13} /> {userName}
            </span>
          )}
        </nav>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden p-2 rounded text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div style={{ background: C.navyDeep, borderBottom: `1px solid ${C.lineDark}` }} className="lg:hidden px-4 pt-2 pb-4 space-y-1">
          {items.map((it) => {
            const active = page === it.id || (it.id === "work" && page === "completed");
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
          {onSignOut && (
            <button
              onClick={() => { onSignOut(); setOpen(false); }}
              style={{ color: C.blueLight }}
              className="f-body text-sm px-4 py-3 w-full text-left font-medium flex items-center gap-2"
            >
              <LogOut size={15} /> Sign out{userName ? ` (${userName})` : ""}
            </button>
          )}
        </div>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------
   LANDING / OVERVIEW PAGE
------------------------------------------------------------------*/
// The public "contact us" form. onSend returns a promise; a rejection is shown
// and the visitor's text is kept so they can try again.
function EnquiryForm({ onSend }) {
  const empty = { name: "", phone: "", message: "", website: "" };
  const [form, setForm] = useState(empty);
  const [state, setState] = useState({ step: "idle" }); // idle | sending | sent | error
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const inputStyle = { borderColor: C.line, color: C.ink };

  const submit = (e) => {
    e.preventDefault();
    if (state.step === "sending") return;
    const problem = enquiryError(form);
    if (problem) return setState({ step: "error", message: problem });
    setState({ step: "sending" });
    onSend(form)
      .then(() => { setForm(empty); setState({ step: "sent" }); })
      .catch((err) => setState({ step: "error", message: err.message }));
  };

  if (state.step === "sent") {
    return (
      <div role="status" style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-8 text-center shadow-sm">
        <div style={{ background: "#EEF3ED", color: C.green }} className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
          <CircleCheck size={24} />
        </div>
        <h3 style={{ color: C.ink }} className="f-display text-lg font-bold mb-1">Thank you. We have your enquiry.</h3>
        <p style={{ color: C.steel }} className="f-body text-sm mb-5">Our office will call you back on the number you gave.</p>
        <button onClick={() => setState({ step: "idle" })} style={{ color: C.blue }} className="f-body text-sm font-semibold underline">
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Enquiry form" style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-6 shadow-sm space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Your name" required>
          <input name="name" value={form.name} onChange={set("name")} maxLength={100} autoComplete="name" style={inputStyle} className={INPUT_CLASS} />
        </Field>
        <Field label="Phone number" required>
          <input name="phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={25} autoComplete="tel" placeholder="+91" style={inputStyle} className={INPUT_CLASS} />
        </Field>
      </div>
      <Field label="What do you need?">
        <textarea name="message" value={form.message} onChange={set("message")} rows={4} maxLength={1000} placeholder="For example: boundary survey of a plot in Safidon" style={inputStyle} className={INPUT_CLASS} />
      </Field>
      {/* Hidden from people; only a script fills it in, and the server drops those. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
      </div>
      {state.step === "error" && (
        <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="border rounded px-3 py-2 f-body text-sm">
          {state.message}
        </div>
      )}
      <button
        type="submit"
        disabled={state.step === "sending"}
        style={{ background: C.orange, color: "#FFFFFF" }}
        className="f-body font-semibold text-sm px-6 py-3 rounded shadow-sm hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-2 w-full sm:w-auto"
      >
        <Send size={15} /> {state.step === "sending" ? "Sending…" : "Send Enquiry"}
      </button>
    </form>
  );
}

// The team shown on the landing page: the mock list, or the database's in API
// mode. Nothing is shown until the API answers, so visitors never see old names.
function useTeam() {
  const useApi = hasApi();
  const [team, setTeam] = useState(useApi ? null : EMPLOYEES);
  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    fetchTeam()
      .then((list) => { if (!cancelled) setTeam(list); })
      .catch(() => { if (!cancelled) setTeam([]); });
    return () => { cancelled = true; };
  }, [useApi]);
  return team;
}

function Landing({ setPage, onEnquiry }) {
  const team = useTeam();
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
              <a
                href="#enquiry"
                style={{ borderColor: C.lineDark, color: C.paper }}
                className="f-body font-medium text-sm px-6 py-3.5 rounded border hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
              >
                Send an Enquiry <MessageSquare size={16} />
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
            {team === null && [0, 1, 2, 3].map((i) => (
              <div key={i} data-testid="team-placeholder" style={{ background: "rgba(255,255,255,0.04)", borderColor: C.lineDark }} className="border rounded-md p-5 h-[92px] sm:h-[134px] animate-pulse" />
            ))}
            {team?.map((e) => (
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

      {/* ENQUIRY */}
      <section id="enquiry" style={{ background: C.paper }} className="border-t border-stone-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Get In Touch</div>
            <h2 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold mb-4">Tell us about your site</h2>
            <p style={{ color: C.steel }} className="f-body text-sm leading-relaxed mb-6">
              Leave your number and a line about the work. Our office will call you back with the next steps and a quotation.
            </p>
            <div style={{ color: C.ink }} className="f-body text-sm space-y-2.5">
              <div className="flex items-center gap-2.5"><Phone size={16} style={{ color: C.orange }} /> +91-9355247066</div>
              <div className="flex items-center gap-2.5"><MapPin size={16} style={{ color: C.orange }} /> Jind, Haryana, India</div>
            </div>
          </div>
          <div className="lg:col-span-3 relative">
            <EnquiryForm onSend={onEnquiry} />
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

// A boxed explanation with an optional action, used where controls are hidden
// because of how the viewer signed in.
function AccessNote({ testId, icon: Icon = Info, title, children, actionLabel, onAction }) {
  return (
    <div data-testid={testId} role="note" style={{ background: "#EBF3FA", borderColor: C.blueLight, color: C.ink }} className="border rounded-md px-4 py-3 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <Icon size={18} style={{ color: C.blue }} className="shrink-0 mt-0.5" />
        <div className="f-body text-sm leading-relaxed">
          <div className="font-semibold">{title}</div>
          {children}
        </div>
      </div>
      {onAction && (
        <button onClick={onAction} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90 shrink-0 self-start sm:self-auto">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   WORK BOARD
------------------------------------------------------------------*/
// Anyone signed in can move a card. canEdit decides whether the edit button is shown.
function TaskCard({ task, employees, onMove, onEdit, busy, today, canEdit }) {
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
          {canEdit && (
            <button
              onClick={() => onEdit(task)}
              aria-label={`Edit ${task.id}`}
              style={{ color: C.steel }}
              className="p-1 rounded hover:bg-stone-100 active:scale-95 transition-transform"
            >
              <Pencil size={12} />
            </button>
          )}
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
      {task.expectedCompletion && (() => {
        const overdue = isOverdue(task, today);
        return (
          <div style={{ color: overdue ? C.orangeDeep : C.steel }} className={`f-body text-xs flex items-center gap-1.5 mb-2 ${overdue ? "font-semibold" : ""}`}>
            <CalendarDays size={12} style={{ color: overdue ? C.orangeDeep : C.blue }} />
            {overdue ? "Overdue, was due" : "Due"} {fmtDate(task.expectedCompletion)}
          </div>
        );
      })()}
      {task.status === "done" && task.completedAt && (
        <div style={{ color: C.green }} className="f-body text-xs flex items-center gap-1.5 mb-2">
          <CircleCheck size={12} /> Completed {fmtDate(task.completedAt)}
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

// Runs a save or delete for a dialog: a rejection is shown in the dialog, which
// stays open; success closes it.
function useDialogAction(onClose) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = (action) => {
    setBusy(true);
    setError(null);
    action()
      .then(onClose)
      .catch((err) => { setError(err.message); setBusy(false); });
  };
  return { busy, error, setError, run };
}

function Modal({ label, kicker, title, busy, onClose, onSubmit, footer, width = "max-w-2xl", children }) {
  return (
    <div
      style={{ background: "rgba(9, 21, 36, 0.55)" }}
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-label={label}
        style={{ background: C.paper, borderColor: C.line }}
        className={`w-full ${width} border rounded-lg shadow-xl`}
      >
        <div style={{ background: C.navy }} className="flex items-center justify-between px-5 py-4 rounded-t-lg">
          <div>
            <div style={{ color: C.orange }} className="f-mono text-[10px] font-semibold tracking-wider uppercase">{kicker}</div>
            <h2 style={{ color: C.paper }} className="f-display text-lg font-bold">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ color: C.paper }} className="p-1 rounded hover:opacity-80">
            <X size={20} />
          </button>
        </div>
        {children}
        <div style={{ borderColor: C.line }} className="border-t px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          {footer}
        </div>
      </form>
    </div>
  );
}

function DialogError({ error }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="sm:col-span-2 border rounded-md px-3 py-2 f-body text-sm">
      {error}
    </div>
  );
}

// Delete button that asks once before calling onConfirm.
function DeleteControl({ question, busy, onConfirm }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} disabled={busy} style={{ color: C.orangeDeep }} className="f-body text-xs font-semibold flex items-center gap-1.5 px-2 py-2 rounded hover:bg-orange-50">
        <Trash2 size={14} /> Delete
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span style={{ color: C.orangeDeep }} className="f-body text-xs font-semibold">{question}</span>
      <button type="button" onClick={onConfirm} disabled={busy} style={{ background: C.orangeDeep, color: C.paper }} className="f-body text-xs font-semibold px-3 py-1.5 rounded">
        Yes, delete
      </button>
      <button type="button" onClick={() => setAsking(false)} disabled={busy} style={{ borderColor: C.line, color: C.ink }} className="f-body text-xs px-3 py-1.5 rounded border bg-white">
        No
      </button>
    </div>
  );
}

function DialogButtons({ busy, onClose, saveLabel }) {
  return (
    <div className="flex items-center gap-2 ml-auto">
      <button type="button" onClick={onClose} disabled={busy} style={{ borderColor: C.line, color: C.ink }} className="f-body text-sm px-4 py-2 rounded border bg-white">
        Cancel
      </button>
      <button type="submit" disabled={busy} style={{ background: C.orange, color: C.paper }} className="f-body text-sm font-semibold px-5 py-2 rounded shadow-sm hover:opacity-90 disabled:opacity-60">
        {busy ? "Saving…" : saveLabel}
      </button>
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
// Anyone can add work for anyone. Only an admin may reassign or delete existing
// work. defaultAssignee preselects a person when they add work themselves.
function WorkForm({ task, employees, onSave, onDelete, onClose, isAdmin = true, defaultAssignee = null }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_WORK,
    assignee: (employees.some((e) => e.id === defaultAssignee) ? defaultAssignee : employees[0]?.id) ?? "",
    ...(task
      ? Object.fromEntries(Object.keys(EMPTY_WORK).map((k) => [k, task[k] ?? EMPTY_WORK[k]]))
      : {}),
    // Only the admin's form has the amount to charge; blank means not decided.
    ...(isAdmin ? { fee: task?.fee === null || task?.fee === undefined ? "" : String(task.fee) } : {}),
  }));
  const { busy, error, setError, run } = useDialogAction(onClose);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleType = (id) =>
    setForm((f) => ({ ...f, workTypes: f.workTypes.includes(id) ? f.workTypes.filter((t) => t !== id) : [...f.workTypes, id] }));

  const submit = (e) => {
    e.preventDefault();
    if (form.title.trim() === "" || form.client.trim() === "") {
      setError("Work name and customer name are required.");
      return;
    }
    if (isAdmin) {
      const fee = parseFee(form.fee, task?.received ?? 0);
      if (fee.error) { setError(fee.error); return; }
    }
    run(() => onSave(form));
  };

  const line = { borderColor: C.line, color: C.ink };

  return (
    <Modal
      label={task ? `Edit ${task.id}` : "New work"}
      kicker={task ? task.id : "Work Order"}
      title={task ? "Edit Work" : "New Work"}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <div>
          {task && isAdmin && <DeleteControl question="Delete this work permanently?" busy={busy} onConfirm={() => run(() => onDelete(task.id))} />}
        </div>
        <DialogButtons busy={busy} onClose={onClose} saveLabel={task ? "Save Changes" : "Add Work"} />
      </>}
    >
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
          {isAdmin && (
            <div className="sm:col-span-2">
              <Field label="Amount to charge (₹)">
                <input name="fee" inputMode="numeric" value={form.fee} onChange={set("fee")} style={line} className={INPUT_CLASS} placeholder="Leave blank if not decided yet" />
              </Field>
              <p style={{ color: C.steel }} className="f-body text-xs mt-1">Shown to the admin only. Payments are recorded against it in Receivables.</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Assign to" required>
              <select name="assignee" value={form.assignee} onChange={set("assignee")} required disabled={!isAdmin && Boolean(task)} title={!isAdmin && task ? "Only an admin can reassign work" : undefined} style={line} className={`${INPUT_CLASS} disabled:bg-stone-100 disabled:text-stone-500`}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
              </select>
            </Field>
          </div>

          <DialogError error={error} />
        </div>
    </Modal>
  );
}

// viewer: { isAdmin, employeeId }. An admin creates, edits, moves and deletes
// any work; a person signed in by name edits and moves only their own; the
// office sign-in only looks. The API enforces the same rules.
const fmtMonth = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

// Every finished piece of work, newest first, in month groups. Anyone can
// reopen one, which moves it back to In Progress on the board.
function CompletedList({ tasks, total, employees, saving, viewer, onReopen, onEdit }) {
  const groups = completedByMonth(tasks);
  if (tasks.length === 0) {
    return (
      <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border border-dashed rounded-md p-10 text-center f-body text-sm">
        {total === 0 ? "No work has been completed yet. Work moved to Completed on the board is listed here." : "No completed work matches this search or person."}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key ?? "undated"} data-testid="completed-group">
          <h3 style={{ color: C.steel }} className="f-mono text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            {group.key ? fmtMonth(group.key) : "Earlier, date not recorded"} · {group.tasks.length}
          </h3>
          <div style={{ background: C.card, borderColor: C.line }} className="border rounded-md shadow-sm divide-y divide-stone-200/70">
            {group.tasks.map((task) => {
              const emp = employees.find((e) => e.id === task.assignee);
              return (
                <div key={task.id} data-testid="completed-row" className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <span style={{ color: C.steel }} className="f-mono text-[11px] font-medium md:w-16 shrink-0">{task.id}</span>
                  <div className="min-w-0 flex-1">
                    <div style={{ color: C.ink }} className="f-body text-sm font-semibold leading-snug">{task.title}</div>
                    <div style={{ color: C.steel }} className="f-body text-xs">{task.client}{task.district ? ` · ${task.district}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 md:w-36 shrink-0">
                    <div style={{ background: C.navy, color: C.paper }} className="w-6 h-6 rounded-full flex items-center justify-center f-mono text-[10px] font-bold shrink-0">{emp?.initials}</div>
                    <span style={{ color: C.steel }} className="f-body text-xs font-medium">{emp?.name}</span>
                  </div>
                  <div style={{ color: task.completedAt ? C.green : C.steel }} className="f-body text-xs flex items-center gap-1.5 md:w-32 shrink-0">
                    <CircleCheck size={12} /> {task.completedAt ? fmtDate(task.completedAt) : "Date not recorded"}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onReopen(task.id)}
                      disabled={saving.has(task.id)}
                      aria-label={`Reopen ${task.id}`}
                      style={{ borderColor: C.line, color: C.ink }}
                      className="f-body text-xs font-semibold px-3 py-1.5 rounded border bg-white hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <ArrowLeft size={12} /> Reopen
                    </button>
                    {canEditTask(task, viewer) && (
                      <button onClick={() => onEdit(task)} aria-label={`Edit ${task.id}`} style={{ color: C.steel }} className="p-1.5 rounded hover:bg-stone-100">
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// view is "board" or "completed" (the list of all finished work); onView
// switches between them. access (API mode with sign-in on): { adminConfigured,
// onSwitchSignIn, onOpenTeam }, used to explain what a sign-in can do.
function WorkBoard({ viewer = { isAdmin: true, employeeId: null }, access = null, view = "board", onView = () => {}, local, setLocal }) {
  const useApi = hasApi();
  // Mock mode keeps the tasks in App, so Receivables shows the same tickets.
  const [remote, setRemote] = useState([]);
  const tasks = useApi ? remote : local;
  const setTasks = useApi ? setRemote : setLocal;
  const [employees, setEmployees] = useState(useApi ? [] : EMPLOYEES);
  const [load, setLoad] = useState(useApi ? { state: "loading" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(() => new Set());
  // A person starts on their own work.
  const [filter, setFilter] = useState(viewer.employeeId ?? "all");
  // null = form closed, "new" = creating, a task = editing it.
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("board");
  const today = localDay();

  // Both return promises so the form can show a failure and stay open.
  const saveWork = async (form) => {
    if (editing === "new") {
      const created = useApi
        ? await createTask(form)
        : withStatus({ fee: null, ...taskFromForm(form), id: nextLocalTaskId(tasks), status: "todo", createdAt: new Date().toISOString(), completedAt: null, received: 0, payments: [], lastReminder: null });
      setTasks((prev) => [...prev, created]);
    } else {
      const id = editing.id;
      const updated = useApi ? await updateTask(id, form) : taskFromForm(form);
      // In mock mode the payment status follows a changed amount, as on the server.
      setTasks((prev) => prev.map((t) => (t.id === id ? (useApi ? { ...t, ...updated } : withStatus({ ...t, ...updated })) : t)));
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
        setRemote(tks);
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

  // Moving to "done" stamps the completion day and moving back clears it, as
  // the server does. previous restores a card exactly after a failed save.
  const setStatus = (id, status, previous) => setTasks((prev) => prev.map((t) => {
    if (t.id !== id) return t;
    if (previous) return { ...t, status, completedAt: previous.completedAt };
    return { ...t, status, completedAt: status === "done" ? (t.status === "done" ? t.completedAt : today) : null };
  }));

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
        setStatus(id, prevStatus, task);
        setSaveError(`Could not save the move for "${task.title}" (${id}); it was put back. ${err.message}`);
      })
      .finally(() => setSaving((prev) => { const next = new Set(prev); next.delete(id); return next; }));
  };

  // The search and the person filter apply to both views.
  const matching = useMemo(() => {
    const byStaff = filter === "all" ? tasks : tasks.filter((t) => t.assignee === filter);
    return filterTasks(byStaff, query);
  }, [tasks, filter, query]);
  // The board: open work plus work finished in the last week.
  const visible = useMemo(() => sortTasks(boardTasks(matching, today), sort), [matching, today, sort]);
  const completedMatching = useMemo(() => completedTasks(matching), [matching]);
  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length;
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
            {!viewer.isAdmin && (
              <p data-testid="board-access" style={{ color: C.steel }} className="f-body text-sm mt-1">
                {viewer.employeeId
                  ? "You can add work and move any card. You can edit the details of work assigned to you."
                  : "You can add work and move any card. To edit the details of your work, sign in with your own name."}
                {!viewer.employeeId && access?.onSwitchSignIn && (
                  <button onClick={access.onSwitchSignIn} style={{ color: C.blue }} className="font-semibold underline ml-2">Switch sign-in</button>
                )}
              </p>
            )}
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

        {viewer.isAdmin && access && load.state === "ready" && employees.length > 0 && employees.every((e) => e.hasPassword === false) && (
          <AccessNote testId="team-hint" icon={KeyRound} title="Nobody has their own sign-in yet" actionLabel="Open Team page" onAction={access.onOpenTeam}>
            <div>Everyone can add and move work. Until you set a password for each person on the Team page, only you can edit the details of work.</div>
          </AccessNote>
        )}

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

        {/* Board or the list of all completed work */}
        <div role="tablist" aria-label="Work views" style={{ borderColor: C.line }} className="flex items-center gap-1 border-b mb-5">
          {[
            { id: "board", label: "Board" },
            { id: "completed", label: `Completed (${counts.done})` },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => onView(tab.id)}
              style={{ color: view === tab.id ? C.orangeDeep : C.steel, borderColor: view === tab.id ? C.orange : "transparent" }}
              className="f-body text-sm font-semibold px-4 py-2 border-b-2 -mb-px hover:text-stone-900"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <label className="relative flex-1 max-w-md">
            <Search size={15} style={{ color: C.steel }} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search work"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by work, customer, district or NK number"
              style={{ borderColor: C.line, color: C.ink }}
              className="f-body text-sm w-full rounded border pl-9 pr-3 py-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </label>
          {view === "board" && <label className="flex items-center gap-2">
            <span className="f-mono text-xs text-stone-500 shrink-0">Sort:</span>
            <select
              aria-label="Sort work"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ borderColor: C.line, color: C.ink }}
              className="f-body text-sm rounded border px-3 py-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              {SORT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>}
          {view === "board" && overdueCount > 0 && (
            <span data-testid="overdue-count" style={{ background: "#FDF0EA", color: C.orangeDeep, borderColor: C.orangeDeep }} className="f-body text-xs font-semibold px-3 py-1.5 rounded border sm:ml-auto self-start sm:self-auto">
              {overdueCount} overdue
            </span>
          )}
        </div>

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

        {view === "completed" && (
          <>
            <p data-testid="completed-summary" style={{ color: C.steel }} className="f-body text-sm mb-4">
              {completedMatching.length === counts.done
                ? `${counts.done} completed, newest first.`
                : `Showing ${completedMatching.length} of ${counts.done} completed.`}
              {" "}The board keeps work finished in the last {RECENT_DAYS} days. Everything completed is listed here.
            </p>
            <CompletedList tasks={completedMatching} total={counts.done} employees={employees} saving={saving} viewer={viewer} onReopen={(id) => moveTask(id, "inprogress")} onEdit={setEditing} />
          </>
        )}

        {/* Kanban Columns */}
        {view === "board" && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col) => {
            const colTasks = visible.filter((t) => t.status === col);
            return (
              <div key={col} style={{ background: "rgba(232, 226, 211, 0.4)", borderColor: C.line }} className="border rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="flex items-center gap-2">
                    <span style={{ background: STATUS_META[col].color }} className="w-2.5 h-2.5 rounded-full" />
                    <h3 style={{ color: C.ink }} className="f-body text-sm font-bold">{STATUS_META[col].label}</h3>
                    {col === "done" && <span style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider">last {RECENT_DAYS} days</span>}
                  </div>
                  <span style={{ color: C.steel, background: C.card }} className="f-mono text-xs px-2 py-0.5 rounded border border-stone-200 font-semibold">
                    {colTasks.length}
                  </span>
                </div>

                <div className="min-h-[250px]">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} employees={employees} onMove={moveTask} onEdit={setEditing} busy={saving.has(t.id)} today={today} canEdit={canEditTask(t, viewer)} />
                  ))}
                  {colTasks.length === 0 && (
                    <div style={{ borderColor: C.line, color: C.steel }} className="border border-dashed rounded-md p-8 text-center f-body text-xs">
                      {query.trim() ? "No work matches your search here." : col === "done" ? `Nothing completed in the last ${RECENT_DAYS} days.` : "No assignments found in this status."}
                    </div>
                  )}
                  {col === "done" && counts.done > 0 && (
                    <button
                      data-testid="all-completed-link"
                      onClick={() => onView("completed")}
                      style={{ color: C.blue, borderColor: C.line }}
                      className="f-body text-xs font-semibold w-full mt-1 px-3 py-2 rounded border bg-white hover:bg-stone-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <History size={13} /> All completed work ({counts.done})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>}
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
          isAdmin={viewer.isAdmin}
          defaultAssignee={viewer.employeeId}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   PAYMENTS / RECEIVABLES PAGE
------------------------------------------------------------------*/
// isAdmin decides whether amounts and the money actions are shown. Staff see
// only whether payment is received or pending.
// One ticket in Receivables: its number, the work, how far the work is, and
// how far the payment is. Amounts and the money buttons are the admin's.
function ReceivableRow({ task, employees, isAdmin, busy, onAmount, onPayment, onPaid, onHistory, onReminder }) {
  const pay = PAYMENT_META[task.paymentStatus];
  const work = STATUS_META[task.status];
  const assignee = employees.find((e) => e.id === task.assignee);
  const due = balanceOf(task);
  const owing = task.paymentStatus === "unpaid" || task.paymentStatus === "part";
  const pill = "f-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap";
  const outline = "f-body text-xs font-semibold px-3 py-1.5 rounded border bg-white flex items-center gap-1 shadow-sm hover:bg-stone-50 active:scale-95 transition-all";
  const iconButton = "p-1.5 rounded hover:bg-stone-100 active:scale-95 transition-transform";

  return (
    <li data-testid="receivable-row" data-task={task.id} style={{ borderColor: C.line }} className="border-t first:border-t-0 px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span style={{ color: C.steel }} className="f-mono text-xs font-semibold">{task.id}</span>
          <span data-testid="pay-status" style={{ background: pay.bg, color: pay.color }} className={pill}>{PAYMENT_LABELS[task.paymentStatus]}</span>
          <span data-testid="work-status" style={{ color: work.color, borderColor: C.line }} className={`${pill} border bg-white font-medium`}>Work: {work.label}</span>
        </div>
        <div style={{ color: C.ink }} className="f-display text-sm font-bold leading-snug">{task.title}</div>
        <div style={{ color: C.steel }} className="f-body text-xs mt-0.5">
          {task.client}{assignee ? ` · ${assignee.name}` : ""}
          {owing && <> · <span data-testid="last-reminder">Reminder: {task.lastReminder ? daysAgo(task.lastReminder) : "none yet"}</span></>}
        </div>
      </div>

      {isAdmin && (
        <div data-testid="pay-amount" className="lg:w-52 lg:text-right shrink-0">
          {task.paymentStatus === "unset" ? (
            <div style={{ color: C.steel }} className="f-body text-sm">No amount yet</div>
          ) : task.fee === 0 ? (
            <div style={{ color: C.steel }} className="f-body text-sm">No charge</div>
          ) : (<>
            <div style={{ color: C.ink }} className="f-body text-sm"><strong>{fmtINR(task.received ?? 0)}</strong> of {fmtINR(task.fee)} received</div>
            <div style={{ color: due > 0 ? C.orangeDeep : C.green }} className="f-display text-sm font-bold">{due > 0 ? `${fmtINR(due)} due` : "Settled"}</div>
          </>)}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap lg:justify-end shrink-0">
        {isAdmin && task.paymentStatus === "unset" && (
          <button onClick={() => onAmount(task)} style={{ borderColor: C.blue, color: C.blue }} className={outline}>
            <IndianRupee size={12} /> Set amount
          </button>
        )}
        {isAdmin && owing && (<>
          <button onClick={() => onPayment(task)} style={{ borderColor: C.line, color: C.ink }} className={outline}>
            <IndianRupee size={12} /> Part payment
          </button>
          <button onClick={() => onPaid(task)} style={{ borderColor: C.green, color: C.green }} className={outline}>
            <CircleCheck size={13} /> Mark as paid
          </button>
        </>)}
        {owing && (
          <button onClick={() => onReminder(task.id)} disabled={busy} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
            <PhoneCall size={13} /> Log reminder
          </button>
        )}
        {isAdmin && task.paymentStatus !== "unset" && (<>
          <button onClick={() => onHistory(task)} aria-label={`Payments on ${task.id}`} title="Payments received" style={{ color: C.steel }} className={iconButton}>
            <History size={14} />
          </button>
          <button onClick={() => onAmount(task)} aria-label={`Change the amount for ${task.id}`} title="Change the amount to charge" style={{ color: C.steel }} className={iconButton}>
            <Pencil size={14} />
          </button>
        </>)}
      </div>
    </li>
  );
}

// The line under a dialog's title saying which work it is about.
function TicketLine({ task }) {
  return (
    <p style={{ color: C.steel }} className="f-body text-sm leading-snug">
      <strong style={{ color: C.ink }}>{task.title}</strong><br />{task.client}
    </p>
  );
}

// Set or change the amount to charge for a ticket. onSave returns a promise.
function AmountForm({ task, onSave, onClose }) {
  const [value, setValue] = useState(task.fee === null || task.fee === undefined ? "" : String(task.fee));
  const { busy, error, setError, run } = useDialogAction(onClose);
  const received = task.received ?? 0;

  const submit = (e) => {
    e.preventDefault();
    const parsed = parseFee(value, received);
    if (parsed.error) { setError(parsed.error); return; }
    run(() => onSave(task, parsed.fee));
  };

  return (
    <Modal label={`Amount to charge for ${task.id}`} kicker={task.id} title="Amount to charge" busy={busy} onClose={onClose} onSubmit={submit} width="max-w-md" footer={<DialogButtons busy={busy} onClose={onClose} saveLabel="Save Amount" />}>
      <div className="p-5 grid grid-cols-1 gap-4">
        <TicketLine task={task} />
        <Field label="Amount to charge (₹)">
          <input name="fee" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS} />
        </Field>
        <p style={{ color: C.steel }} className="f-body text-xs -mt-2">
          {received > 0
            ? `${fmtINR(received)} has been received, so the amount cannot be less than that.`
            : "Leave blank if it is not decided yet. Enter 0 for work that is not charged."}
        </p>
        <DialogError error={error} />
      </div>
    </Modal>
  );
}

// Record part of what is owed. onSave returns a promise.
function PaymentForm({ task, onSave, onClose }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, setError, run } = useDialogAction(onClose);
  const due = balanceOf(task);
  const paid = parseRupees(amount);
  const remaining = Number.isNaN(paid) || paid > due ? null : due - paid;

  const submit = (e) => {
    e.preventDefault();
    const problem = paymentError(task, amount);
    if (problem) { setError(problem); return; }
    run(() => onSave(task, amount, note));
  };

  return (
    <Modal label={`Record a payment on ${task.id}`} kicker={task.id} title="Payment received" busy={busy} onClose={onClose} onSubmit={submit} width="max-w-md" footer={<DialogButtons busy={busy} onClose={onClose} saveLabel="Record Payment" />}>
      <div className="p-5 grid grid-cols-1 gap-4">
        <TicketLine task={task} />
        <div style={{ background: C.card, borderColor: C.line }} className="border rounded p-3 flex items-center justify-between">
          <span style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider">Balance due</span>
          <span style={{ color: C.orangeDeep }} className="f-display text-lg font-bold">{fmtINR(due)}</span>
        </div>
        <Field label="Amount received (₹)" required>
          <input name="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS} />
        </Field>
        {remaining !== null && paid > 0 && (
          <p data-testid="remaining" style={{ color: remaining === 0 ? C.green : C.steel }} className="f-body text-sm -mt-2">
            {remaining === 0 ? "This settles the ticket. It will show as Paid." : `${fmtINR(remaining)} will still be due. The ticket will show as Part paid.`}
          </p>
        )}
        <Field label="Note">
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS} placeholder="e.g. Cheque no., UPI, cash" />
        </Field>
        <DialogError error={error} />
      </div>
    </Modal>
  );
}

// "Are you sure?" before a ticket is marked as paid in full. onConfirm
// returns a promise.
function ConfirmPaid({ task, onConfirm, onClose }) {
  const { busy, error, run } = useDialogAction(onClose);
  const due = balanceOf(task);
  const received = task.received ?? 0;
  return (
    <Modal
      label={`Mark ${task.id} as paid`}
      kicker={task.id}
      title="Mark as paid?"
      busy={busy}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); run(() => onConfirm(task)); }}
      width="max-w-md"
      footer={<DialogButtons busy={busy} onClose={onClose} saveLabel="Yes, mark as paid" />}
    >
      <div data-testid="confirm-paid" className="p-5 grid grid-cols-1 gap-3">
        <TicketLine task={task} />
        <p style={{ color: C.ink }} className="f-body text-sm leading-relaxed">
          This records <strong>{fmtINR(due)}</strong> received today{received > 0 ? `, on top of the ${fmtINR(received)} received earlier` : ""}. The ticket will show as <strong>Paid</strong>.
        </p>
        <p style={{ color: C.steel }} className="f-body text-xs">If this was a mistake, the payment can be removed from the ticket&rsquo;s payment list.</p>
        <DialogError error={error} />
      </div>
    </Modal>
  );
}

// The payments received on one ticket, newest first. load returns a promise
// of the list; onRemove takes one back and returns a promise.
function PaymentHistory({ task, load, onRemove, onClose }) {
  const [state, setState] = useState({ status: "loading" });
  // The payment being asked about, and the one being removed.
  const [asking, setAsking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((payments) => { if (!cancelled) setState({ status: "ready", payments }); })
      .catch((err) => { if (!cancelled) setState({ status: "error", message: err.message }); });
    return () => { cancelled = true; };
  }, [load]);

  const remove = (payment) => {
    setRemoving(payment.id);
    setError(null);
    onRemove(task, payment.id)
      .then(() => setState((s) => ({ ...s, payments: s.payments.filter((p) => p.id !== payment.id) })))
      .catch((err) => setError(`Could not remove the payment. ${err.message}`))
      .finally(() => { setRemoving(null); setAsking(null); });
  };

  const due = balanceOf(task);
  const small = "f-body text-xs px-2.5 py-1 rounded";

  return (
    <Modal
      label={`Payments on ${task.id}`}
      kicker={task.id}
      title="Payments received"
      busy={removing !== null}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); onClose(); }}
      width="max-w-md"
      footer={<button type="submit" disabled={removing !== null} style={{ borderColor: C.line, color: C.ink }} className="f-body text-sm px-4 py-2 rounded border bg-white ml-auto">Close</button>}
    >
      <div className="p-5 grid grid-cols-1 gap-3">
        <TicketLine task={task} />
        <div style={{ background: C.card, borderColor: C.line }} className="border rounded p-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["To charge", fmtINR(task.fee ?? 0), C.ink, "history-fee"],
            ["Received", fmtINR(task.received ?? 0), C.green, "total-received"],
            ["Due", due > 0 ? fmtINR(due) : "Nothing", due > 0 ? C.orangeDeep : C.green, "history-due"],
          ].map(([label, value, color, testId]) => (
            <div key={label}>
              <div style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider">{label}</div>
              <div data-testid={testId} style={{ color }} className="f-display text-base font-bold">{value}</div>
            </div>
          ))}
        </div>
        {state.status === "loading" && <p style={{ color: C.steel }} className="f-body text-sm text-center py-4">Loading payments…</p>}
        {state.status === "error" && <DialogError error={`Could not load the payments. ${state.message}`} />}
        {state.status === "ready" && state.payments.length === 0 && (
          <p style={{ color: C.steel }} className="f-body text-sm text-center py-4">No payments recorded yet.</p>
        )}
        {state.status === "ready" && state.payments.length > 0 && (
          <ul style={{ borderColor: C.line }} className="border rounded divide-y divide-stone-200 bg-white">
            {state.payments.map((p) => (
              <li key={p.id} data-testid="payment-row" className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div style={{ color: C.ink }} className="f-body text-sm font-semibold">{fmtDate(p.receivedAt)}</div>
                    {p.note && <div style={{ color: C.steel }} className="f-body text-xs mt-0.5">{p.note}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ color: C.green }} className="f-display text-sm font-bold">{fmtINR(p.amount)}</span>
                    {asking !== p.id && (
                      <button type="button" onClick={() => setAsking(p.id)} disabled={removing !== null} aria-label={`Remove the payment of ${fmtINR(p.amount)}`} title="Remove this payment" style={{ color: C.steel }} className="p-1 rounded hover:bg-stone-100">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {asking === p.id && (
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span style={{ color: C.orangeDeep }} className="f-body text-xs font-semibold">Remove this payment? {fmtINR(p.amount)} will be due again.</span>
                    <button type="button" onClick={() => remove(p)} disabled={removing !== null} style={{ background: C.orangeDeep, color: C.paper }} className={`${small} font-semibold`}>
                      {removing === p.id ? "Removing…" : "Yes, remove"}
                    </button>
                    <button type="button" onClick={() => setAsking(null)} disabled={removing !== null} style={{ borderColor: C.line, color: C.ink }} className={`${small} border bg-white`}>No</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <DialogError error={error} />
      </div>
    </Modal>
  );
}

// Receivables, ticket by ticket. Every ticket on the Work Board is listed
// here, so the two never disagree. local and setLocal are the mock-mode tasks
// shared with the Work Board.
function Payments({ isAdmin, local, setLocal }) {
  const useApi = hasApi();
  const [remote, setRemote] = useState([]);
  const [employees, setEmployees] = useState(useApi ? [] : EMPLOYEES);
  const [load, setLoad] = useState(useApi ? { state: "loading" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(() => new Set());
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  // { kind: "amount" | "payment" | "paid" | "history", id }, or null.
  const [dialog, setDialog] = useState(null);
  const tasks = useApi ? remote : local;
  const setTasks = useApi ? setRemote : setLocal;
  // The viewer's own calendar day, so "Today" is right before 05:30 IST too.
  const today = localDay();

  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    Promise.all([fetchEmployees(), fetchTasks()])
      .then(([people, list]) => {
        if (cancelled) return;
        setEmployees(people);
        setRemote(list);
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

  const replaceTask = (task) => setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));

  // These return promises so the dialogs can show a failure and stay open.
  const saveFee = async (task, fee) => replaceTask(useApi ? await setTaskFee(task.id, fee) : withStatus({ ...task, fee }));
  const savePayment = async (task, amount, note) => {
    if (useApi) {
      replaceTask((await recordPayment(task.id, amount, note)).task);
      return;
    }
    const earlier = task.payments ?? [];
    replaceTask(applyPayment(task, { id: Math.max(0, ...earlier.map((p) => p.id)) + 1, amount: parseRupees(amount), note: note.trim() || null, receivedAt: today }));
  };
  const markPaid = (task) => savePayment(task, String(balanceOf(task)), "");
  const takeBack = async (task, paymentId) => replaceTask(useApi ? await removePayment(task.id, paymentId) : removeLocalPayment(task, paymentId));

  const open = dialog ? tasks.find((t) => t.id === dialog.id) : null;
  // Stable while the dialog is open, so it loads once. In mock mode the list
  // is read when the dialog opens; the dialog then keeps its own copy.
  const historyId = dialog?.kind === "history" ? dialog.id : null;
  const loadHistory = useMemo(
    () => () => (useApi ? fetchPayments(historyId) : Promise.resolve(local.find((t) => t.id === historyId)?.payments ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useApi, historyId]
  );

  const setReminder = (id, lastReminder) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, lastReminder } : t)));

  // One save per ticket at a time, so a failed save always restores a date the
  // server really had.
  const remind = (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || saving.has(id)) return;
    const previous = task.lastReminder ?? null;
    setSaveError(null);
    setReminder(id, today);
    if (!useApi) return;
    setSaving((prev) => new Set(prev).add(id));
    logReminder(id)
      .then((updated) => setReminder(id, updated.lastReminder))
      .catch((err) => {
        setReminder(id, previous);
        setSaveError(`Could not save the reminder for ${id}; it was undone. ${err.message}`);
      })
      .finally(() => setSaving((prev) => { const next = new Set(prev); next.delete(id); return next; }));
  };

  const counts = receivableCounts(tasks);
  const totals = receivableTotals(tasks);
  const visible = useMemo(() => sortReceivables(filterReceivables(filterTasks(tasks, query), filter)), [tasks, query, filter]);
  const tile = "border rounded-md p-4 sm:p-5 shadow-sm";
  const tileLabel = "f-mono text-[11px] uppercase tracking-wider mb-1";
  const tileValue = "f-display text-xl sm:text-2xl font-bold";

  return (
    <div style={{ background: C.paper }} className="min-h-[calc(100vh-4rem)] grid-bg py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Receivables</div>
          <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold">Payments by ticket</h1>
          <p style={{ color: C.steel }} className="f-body text-sm mt-1 max-w-2xl">
            Every ticket on the Work Board is listed here with its payment. {isAdmin ? "Set the amount to charge, then record what comes in, in part or in full." : "Amounts are shown to the admin only."}
          </p>
        </div>

        {load.state === "loading" && (
          <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">
            Loading payments…
          </div>
        )}

        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load payments. {load.message}</p>
            <button onClick={retry} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90">
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div style={{ background: C.navy, borderColor: C.navy }} className={`${tile} text-white`}>
              <div style={{ color: C.blueLight }} className={tileLabel}>{isAdmin ? "Total due" : "Payment pending"}</div>
              <div data-testid="total-tile" className={tileValue}>
                {isAdmin ? fmtINR(totals.outstanding) : <>{counts.unpaid + counts.part} <span className="text-sm font-normal opacity-70">of {counts.all} tickets</span></>}
              </div>
            </div>
            <div style={{ background: C.card, borderColor: C.line }} className={tile}>
              <div style={{ color: C.steel }} className={tileLabel}>{isAdmin ? "Received so far" : "Paid"}</div>
              <div data-testid="received-tile" style={{ color: C.green }} className={tileValue}>{isAdmin ? fmtINR(totals.received) : counts.paid}</div>
            </div>
            <div style={{ background: C.card, borderColor: C.line }} className={tile}>
              <div style={{ color: C.steel }} className={tileLabel}>Part paid</div>
              <div data-testid="part-tile" style={{ color: C.blue }} className={tileValue}>{counts.part}</div>
            </div>
            <div style={{ background: C.card, borderColor: C.line }} className={tile}>
              <div style={{ color: C.steel }} className={tileLabel}>Amount not set</div>
              <div data-testid="unset-tile" style={{ color: counts.unset > 0 ? C.orangeDeep : C.steel }} className={tileValue}>{counts.unset}</div>
            </div>
          </div>

          <div className="relative mb-3 max-w-md">
            <Search size={15} style={{ color: C.steel }} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search tickets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by NK number, work or customer"
              style={{ borderColor: C.line, color: C.ink }}
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>

          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-2 no-scrollbar">
            {RECEIVABLE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                style={{ background: filter === f.id ? C.navy : C.card, color: filter === f.id ? C.paper : C.ink, borderColor: C.line }}
                className="f-body text-xs px-4 py-2 rounded border font-medium whitespace-nowrap shadow-sm shrink-0"
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div data-testid="receivables-empty" style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border border-dashed rounded-md p-10 text-center f-body text-sm">
              {tasks.length === 0 ? "No tickets yet. Work added on the Work Board appears here." : "No tickets in this list."}
            </div>
          ) : (
            <ul style={{ borderColor: C.line, background: C.card }} className="border rounded-md shadow-sm overflow-hidden">
              {visible.map((t) => (
                <ReceivableRow
                  key={t.id}
                  task={t}
                  employees={employees}
                  isAdmin={isAdmin}
                  busy={saving.has(t.id)}
                  onAmount={(task) => setDialog({ kind: "amount", id: task.id })}
                  onPayment={(task) => setDialog({ kind: "payment", id: task.id })}
                  onPaid={(task) => setDialog({ kind: "paid", id: task.id })}
                  onHistory={(task) => setDialog({ kind: "history", id: task.id })}
                  onReminder={remind}
                />
              ))}
            </ul>
          )}
        </>)}
      </div>

      {open && dialog.kind === "amount" && <AmountForm key={open.id} task={open} onSave={saveFee} onClose={() => setDialog(null)} />}
      {open && dialog.kind === "payment" && <PaymentForm key={open.id} task={open} onSave={savePayment} onClose={() => setDialog(null)} />}
      {open && dialog.kind === "paid" && <ConfirmPaid key={open.id} task={open} onConfirm={markPaid} onClose={() => setDialog(null)} />}
      {open && dialog.kind === "history" && <PaymentHistory key={open.id} task={open} load={loadHistory} onRemove={takeBack} onClose={() => setDialog(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   ENQUIRIES (staff view of the landing page form)
------------------------------------------------------------------*/
function EnquiryCard({ enquiry, busy, onStatus, onDelete }) {
  const meta = ENQUIRY_STATUS_META[enquiry.status] ?? ENQUIRY_STATUS_META.new;
  const [confirming, setConfirming] = useState(false);
  const action = (label, status, primary) => (
    <button
      key={status}
      disabled={busy}
      onClick={() => onStatus(enquiry.id, status)}
      style={primary ? { background: C.navy, color: C.paper } : { borderColor: C.line, color: C.ink }}
      className={`f-body text-xs font-semibold px-3 py-2 rounded disabled:opacity-50 ${primary ? "shadow-sm hover:opacity-90" : "border bg-white hover:bg-stone-50"}`}
    >
      {label}
    </button>
  );
  return (
    <div data-testid="enquiry-card" style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-5 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 style={{ color: C.ink }} className="f-display text-base font-bold break-words">{enquiry.name}</h3>
          <a href={`tel:${enquiry.phone.replace(/[^\d+]/g, "")}`} style={{ color: C.blue }} className="f-mono text-sm font-medium inline-flex items-center gap-1.5 mt-1">
            <Phone size={13} /> {enquiry.phone}
          </a>
        </div>
        <span style={{ background: meta.bg, color: meta.color }} className="f-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0">{meta.label}</span>
      </div>
      <p style={{ color: enquiry.message ? C.ink : C.steel }} className="f-body text-sm leading-relaxed whitespace-pre-wrap break-words mb-4 flex-1">
        {enquiry.message || "No message left."}
      </p>
      <div style={{ color: C.steel }} className="f-body text-xs flex items-center gap-1.5 mb-4">
        <CalendarDays size={12} /> Received {fmtDate(enquiry.createdAt)} · {daysAgo(enquiry.createdAt)}
      </div>
      <div style={{ borderColor: C.line }} className="border-t pt-3 flex flex-wrap items-center gap-2">
        {enquiry.status === "new" && action("Mark Contacted", "contacted", true)}
        {enquiry.status !== "closed" && action("Close", "closed", false)}
        {enquiry.status !== "new" && action("Reopen", "new", false)}
        <span className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <button disabled={busy} onClick={() => onDelete(enquiry.id)} style={{ background: C.orangeDeep, color: "#FFFFFF" }} className="f-body text-xs font-semibold px-3 py-2 rounded disabled:opacity-50">Yes, delete</button>
              <button onClick={() => setConfirming(false)} style={{ color: C.steel }} className="f-body text-xs font-medium px-2 py-2">Keep</button>
            </>
          ) : (
            <button disabled={busy} onClick={() => setConfirming(true)} aria-label={`Delete enquiry from ${enquiry.name}`} style={{ color: C.steel }} className="p-2 rounded hover:bg-stone-100 disabled:opacity-50">
              <Trash2 size={15} />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

// local / setLocal hold the enquiries in mock mode, where the landing page
// form adds to the same list.
function Enquiries({ local, setLocal }) {
  const useApi = hasApi();
  const [remote, setRemote] = useState([]);
  const [load, setLoad] = useState(useApi ? { state: "loading" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(() => new Set());
  const [filter, setFilter] = useState("open");
  const enquiries = useApi ? remote : local;
  const setEnquiries = useApi ? setRemote : setLocal;

  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    fetchEnquiries()
      .then((list) => {
        if (cancelled) return;
        setRemote(list);
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

  const setBusy = (id, on) => setSaving((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  // The status changes at once and goes back if the save fails.
  const changeStatus = (id, status) => {
    const enquiry = enquiries.find((e) => e.id === id);
    if (!enquiry || saving.has(id)) return;
    const previous = enquiry.status;
    setSaveError(null);
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    if (!useApi) return;
    setBusy(id, true);
    updateEnquiryStatus(id, status)
      .catch((err) => {
        setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status: previous } : e)));
        setSaveError(`Could not update the enquiry from ${enquiry.name}. ${err.message}`);
      })
      .finally(() => setBusy(id, false));
  };

  const remove = (id) => {
    const enquiry = enquiries.find((e) => e.id === id);
    if (!enquiry || saving.has(id)) return;
    setSaveError(null);
    if (!useApi) return setEnquiries((prev) => prev.filter((e) => e.id !== id));
    setBusy(id, true);
    deleteEnquiry(id)
      .then(() => setEnquiries((prev) => prev.filter((e) => e.id !== id)))
      .catch((err) => setSaveError(`Could not delete the enquiry from ${enquiry.name}. ${err.message}`))
      .finally(() => setBusy(id, false));
  };

  const counts = { new: 0, contacted: 0, closed: 0 };
  enquiries.forEach((e) => { if (e.status in counts) counts[e.status] += 1; });
  const visible = enquiries.filter((e) => (filter === "all" ? true : filter === "open" ? e.status !== "closed" : e.status === filter));

  return (
    <div style={{ background: C.paper }} className="w-full min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Website Leads</div>
          <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold">Enquiries</h1>
          <p style={{ color: C.steel }} className="f-body text-sm mt-1">Messages sent from the contact form on the website.</p>
        </div>

        {load.state === "loading" && (
          <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">
            Loading enquiries…
          </div>
        )}

        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load enquiries. {load.message}</p>
            <button onClick={retry} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90">
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

          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
            {[
              { id: "open", label: `Open (${counts.new + counts.contacted})` },
              { id: "new", label: `New (${counts.new})` },
              { id: "contacted", label: `Contacted (${counts.contacted})` },
              { id: "closed", label: `Closed (${counts.closed})` },
              { id: "all", label: `All (${enquiries.length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{ background: filter === f.id ? C.navy : C.card, color: filter === f.id ? C.paper : C.ink, borderColor: C.line }}
                className="f-body text-xs px-4 py-2 rounded border font-medium whitespace-nowrap shadow-sm shrink-0"
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border border-dashed rounded-md p-10 text-center f-body text-sm">
              {enquiries.length === 0 ? "No enquiries yet. They appear here when someone fills in the form on the website." : "No enquiries in this list."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visible.map((e) => (
                <EnquiryCard key={e.id} enquiry={e} busy={saving.has(e.id)} onStatus={changeStatus} onDelete={remove} />
              ))}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TEAM (a profile for each person; the admin sets their passwords)
------------------------------------------------------------------*/
// canManage: the admin, who sets and removes passwords. Everyone else sees
// the profile only. work is { open, done } for this person.
function TeamMember({ employee, work, isYou, canManage, busy, onSet, onClear }) {
  const [mode, setMode] = useState("idle"); // idle | setting | removing
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const save = (e) => {
    e.preventDefault();
    const problem = personalPasswordError(password);
    if (problem) return setError(problem);
    setError(null);
    onSet(employee.id, password)
      .then(() => { setMode("idle"); setPassword(""); })
      .catch((err) => setError(err.message));
  };
  const remove = () => onClear(employee.id).then(() => setMode("idle")).catch((err) => setError(err.message));
  const smallBtn = "f-body text-xs font-semibold px-3 py-2 rounded disabled:opacity-50";
  const knowsPassword = typeof employee.hasPassword === "boolean";

  return (
    <div data-testid="team-member" style={{ background: C.card, borderColor: C.line }} className="border rounded-md p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
        <div style={{ background: C.navy, color: C.paper }} className="w-10 h-10 rounded-full flex items-center justify-center f-mono text-xs font-bold shrink-0">{employee.initials}</div>
        <div className="min-w-0 flex-1">
          <div style={{ color: C.ink }} className="f-body text-sm font-semibold">
            {employee.name}{isYou && <span style={{ color: C.orangeDeep }} className="f-mono text-[10px] font-bold uppercase tracking-wider ml-2">You</span>}
          </div>
          <div style={{ color: C.steel }} className="f-body text-xs">{employee.role}</div>
          <div data-testid="work-count" style={{ color: C.steel }} className="f-mono text-[11px] mt-1">{work.open} open · {work.done} completed</div>
        </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {knowsPassword && (
          <span data-testid="password-state" style={employee.hasPassword ? { background: "#EEF3ED", color: C.green } : { background: "#F1EFEA", color: C.steel }} className="f-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            {employee.hasPassword ? "Can sign in" : "No password"}
          </span>
        )}
        {canManage && mode === "idle" && (
          <div className="flex items-center gap-2">
            <button disabled={busy} onClick={() => { setMode("setting"); setError(null); }} style={{ background: C.navy, color: C.paper }} className={smallBtn}>
              {employee.hasPassword ? "Change password" : "Set password"}
            </button>
            {employee.hasPassword && (
              <button disabled={busy} onClick={() => { setMode("removing"); setError(null); }} style={{ borderColor: C.line, color: C.ink }} className={`${smallBtn} border bg-white`}>Remove</button>
            )}
          </div>
        )}
        </div>
      </div>
      {canManage && mode === "setting" && (
        <form onSubmit={save} aria-label={`Password for ${employee.name}`} className="mt-3 flex flex-col sm:flex-row gap-2">
          <input name="password" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password, at least 6 characters" style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS} autoFocus />
          <div className="flex gap-2 shrink-0">
            <button type="submit" disabled={busy} style={{ background: C.orange, color: "#FFFFFF" }} className={smallBtn}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => { setMode("idle"); setPassword(""); setError(null); }} style={{ color: C.steel }} className={smallBtn}>Cancel</button>
          </div>
        </form>
      )}
      {canManage && mode === "removing" && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span style={{ color: C.ink }} className="f-body text-sm">Remove {employee.name}'s password? They will be signed out.</span>
          <button disabled={busy} onClick={remove} style={{ background: C.orangeDeep, color: "#FFFFFF" }} className={smallBtn}>Yes, remove</button>
          <button onClick={() => setMode("idle")} style={{ color: C.steel }} className={smallBtn}>Keep</button>
        </div>
      )}
      {error && <div role="alert" style={{ color: C.orangeDeep }} className="f-body text-xs mt-2">{error}</div>}
    </div>
  );
}

// Everyone signed in sees the profiles. Only the admin (viewer.isAdmin) sets
// passwords. access is as on the Work Board.
function Team({ viewer, access }) {
  const [employees, setEmployees] = useState([]);
  const [counts, setCounts] = useState({});
  const [load, setLoad] = useState({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEmployees(), fetchTasks()])
      .then(([list, tasks]) => {
        if (cancelled) return;
        setEmployees(list);
        setCounts(workCounts(tasks));
        setLoad({ state: "ready" });
      })
      .catch((err) => { if (!cancelled) setLoad({ state: "error", message: err.message }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const mark = (id, hasPassword) => setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, hasPassword } : e)));
  const busyWhile = async (id, work) => {
    setSaving(id);
    try { await work(); } finally { setSaving(null); }
  };
  const onSet = (id, password) => busyWhile(id, async () => { await setEmployeePassword(id, password); mark(id, true); });
  const onClear = (id) => busyWhile(id, async () => { await clearEmployeePassword(id); mark(id, false); });

  return (
    <div style={{ background: C.paper }} className="w-full min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Team</div>
        <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold flex items-center gap-2"><UserRound size={24} /> Team profiles</h1>
        <p style={{ color: C.steel }} className="f-body text-sm mt-1 mb-6">
          {viewer.isAdmin
            ? "Each person has a profile. Give them a password here and tell them in person. They then pick their name on the sign-in screen and can edit the details of the work assigned to them."
            : "Each person has a profile. Once the admin gives you a password, pick your name on the sign-in screen to edit the details of the work assigned to you."}
        </p>
        {!viewer.isAdmin && (
          <AccessNote testId="team-access" icon={Eye} title="Only the admin can set or change passwords" actionLabel={viewer.employeeId ? undefined : "Switch sign-in"} onAction={viewer.employeeId ? undefined : access?.onSwitchSignIn}>
            <div>Sign in with the admin password to manage these profiles.</div>
            {access && !access.adminConfigured && (
              <div data-testid="no-admin-note" style={{ color: C.orangeDeep }} className="font-semibold mt-1">
                No admin password is set on the server yet. Add ADMIN_PASSWORD in the Render dashboard first.
              </div>
            )}
          </AccessNote>
        )}
        {load.state === "loading" && <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">Loading team…</div>}
        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load the team. {load.message}</p>
            <button onClick={() => { setLoad({ state: "loading" }); setAttempt((a) => a + 1); }} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90">Retry</button>
          </div>
        )}
        {load.state === "ready" && (
          <div className="space-y-3">
            {employees.map((e) => (
              <TeamMember
                key={e.id}
                employee={e}
                work={counts[e.id] ?? { open: 0, done: 0 }}
                isYou={viewer.employeeId === e.id}
                canManage={viewer.isAdmin}
                busy={saving === e.id}
                onSet={onSet}
                onClear={onClear}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------
   ACTIVITY LOG (admin only: who changed what, and when)
------------------------------------------------------------------*/
const ACTOR_COLORS = { person: C.navy, admin: C.orangeDeep, office: C.steel, public: C.blue, unknown: C.orangeDeep, open: C.steel };

// One line of the log. Opens to show the before and after of each field and
// where the request came from.
function ActivityEntry({ entry, employees }) {
  const [open, setOpen] = useState(false);
  const rows = open ? changeRows(entry, employees) : [];
  return (
    <li data-testid="activity-entry" style={{ borderColor: C.line }} className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-black/[0.02]"
      >
        <div className="flex items-center gap-3 sm:w-64 shrink-0">
          <span style={{ color: C.steel }} className="f-mono text-xs w-16 shrink-0">{timeLabel(entry.at)}</span>
          <span
            data-testid="activity-actor"
            style={{ color: ACTOR_COLORS[entry.actorType] ?? C.steel, borderColor: C.line, background: C.paper }}
            className="f-body text-xs font-semibold px-2 py-0.5 rounded border truncate"
          >
            {entry.actorName}
          </span>
        </div>
        <span data-testid="activity-summary" style={{ color: C.ink }} className="f-body text-sm flex-1 leading-snug">{entry.summary}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span style={{ color: C.steel }} className="f-mono text-[10px] uppercase tracking-wider">{kindLabel(entry.action)}</span>
          <ChevronDown size={15} style={{ color: C.steel }} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </span>
      </button>
      {open && (
        <div data-testid="activity-detail" style={{ background: C.paper, borderColor: C.line }} className="border-t px-4 py-3">
          {rows.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="f-body text-xs w-full">
                <thead>
                  <tr style={{ color: C.steel }} className="text-left">
                    <th className="font-semibold py-1 pr-4 w-40">What</th>
                    <th className="font-semibold py-1 pr-4">Before</th>
                    <th className="font-semibold py-1">After</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field} style={{ borderColor: C.line, color: C.ink }} className="border-t align-top">
                      <td style={{ color: C.steel }} className="py-1.5 pr-4 whitespace-nowrap">{row.label}</td>
                      <td className="py-1.5 pr-4 break-words">{row.from}</td>
                      <td className="py-1.5 font-medium break-words">{row.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ color: C.steel }} className="f-mono text-[11px] leading-relaxed">
            Entry #{entry.id} · {dayLabel(dayOf(entry.at))}, {timeLabel(entry.at)} · {deviceLabel(entry.userAgent)}{entry.ip ? ` · from ${entry.ip}` : ""}
          </div>
        </div>
      )}
    </li>
  );
}

// Shown in place of the log to anyone who is not the admin, and in the
// preview without a server, where nothing is recorded.
function ActivityUnavailable({ access }) {
  return (
    <div style={{ background: C.paper }} className="w-full min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold mb-6">Activity log</h1>
        {hasApi() ? (
          <AccessNote testId="activity-access" icon={Lock} title="Only the admin can see the activity log" actionLabel="Switch sign-in" onAction={access?.onSwitchSignIn}>
            <div>It records every change made on this site, who made it and when.</div>
          </AccessNote>
        ) : (
          <AccessNote testId="activity-access" title="Nothing is recorded in this preview">
            <div>The activity log is kept by the server. This copy of the site runs on sample data without one.</div>
          </AccessNote>
        )}
      </div>
    </div>
  );
}

function Activity() {
  const [filters, setFilters] = useState({ actor: "", kind: "" });
  const [entries, setEntries] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [load, setLoad] = useState({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState({ busy: false, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchActivity(filters), fetchEmployees()])
      .then(([page, people]) => {
        if (cancelled) return;
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
        setEmployees(people);
        setLoad({ state: "ready" });
      })
      .catch((err) => { if (!cancelled) setLoad({ state: "error", message: err.message }); });
    return () => { cancelled = true; };
  }, [filters, attempt]);

  const reload = () => { setLoad({ state: "loading" }); setMore({ busy: false, error: null }); setAttempt((a) => a + 1); };
  const choose = (change) => { setLoad({ state: "loading" }); setMore({ busy: false, error: null }); setFilters((f) => ({ ...f, ...change })); };
  const loadOlder = async () => {
    setMore({ busy: true, error: null });
    try {
      const page = await fetchActivity({ ...filters, before: nextBefore });
      setEntries((prev) => [...prev, ...page.entries]);
      setNextBefore(page.nextBefore);
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: err.message });
    }
  };

  const today = localDay();
  const groups = groupByDay(entries);
  const selectStyle = { borderColor: C.line, color: C.ink };

  return (
    <div style={{ background: C.paper }} className="w-full min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Admin</div>
        <h1 style={{ color: C.ink }} className="f-display text-2xl sm:text-3xl font-bold flex items-center gap-2"><ScrollText size={24} /> Activity log</h1>
        <p style={{ color: C.steel }} className="f-body text-sm mt-1 mb-6 max-w-2xl">
          Every change made on this site, who made it and when. Entries are written by the server as the change is saved and cannot be edited or deleted, by anyone.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
          <label className="f-body text-xs font-semibold flex-1 sm:max-w-xs" style={{ color: C.steel }}>
            Who
            <select aria-label="Who" value={filters.actor} onChange={(e) => choose({ actor: e.target.value })} style={selectStyle} className={`${INPUT_CLASS} mt-1`}>
              {actorFilters(employees).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="f-body text-xs font-semibold flex-1 sm:max-w-xs" style={{ color: C.steel }}>
            What
            <select aria-label="What" value={filters.kind} onChange={(e) => choose({ kind: e.target.value })} style={selectStyle} className={`${INPUT_CLASS} mt-1`}>
              {KIND_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <button onClick={reload} style={{ borderColor: C.line, color: C.ink, background: C.card }} className="f-body text-xs font-semibold px-4 py-2.5 rounded border shadow-sm flex items-center justify-center gap-2 hover:opacity-80">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {load.state === "loading" && <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border rounded-md p-10 text-center f-body text-sm">Loading activity…</div>}
        {load.state === "error" && (
          <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="border rounded-md p-6 text-center">
            <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load the activity log. {load.message}</p>
            <button onClick={reload} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90">Retry</button>
          </div>
        )}
        {load.state === "ready" && entries.length === 0 && (
          <div data-testid="activity-empty" style={{ borderColor: C.line, color: C.steel, background: C.card }} className="border border-dashed rounded-md p-10 text-center f-body text-sm">
            {filters.actor || filters.kind ? "Nothing recorded for this choice." : "Nothing recorded yet. Changes appear here from now on."}
          </div>
        )}
        {load.state === "ready" && groups.map((group) => (
          <section key={group.day} className="mb-6">
            <h2 style={{ color: C.steel }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-2 px-1">
              {group.day === today ? "Today · " : ""}{dayLabel(group.day)}
            </h2>
            <ul style={{ borderColor: C.line, background: C.card }} className="border rounded-md shadow-sm overflow-hidden">
              {group.entries.map((entry) => <ActivityEntry key={entry.id} entry={entry} employees={employees} />)}
            </ul>
          </section>
        ))}
        {load.state === "ready" && entries.length > 0 && (
          <div className="text-center">
            {more.error && <p role="alert" style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not load older entries. {more.error}</p>}
            {nextBefore !== null ? (
              <button data-testid="activity-older" onClick={loadOlder} disabled={more.busy} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-5 py-2.5 rounded shadow-sm hover:opacity-90 disabled:opacity-60">
                {more.busy ? "Loading…" : "Show older entries"}
              </button>
            ) : (
              <p data-testid="activity-end" style={{ color: C.steel }} className="f-body text-xs">That is everything recorded{filters.actor || filters.kind ? " for this choice" : ""}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   STAFF SIGN-IN
------------------------------------------------------------------*/
// Whether the staff pages may be shown: "open" (no API, or the server has no
// password set), "checking", "login", "signedIn" or "error".
const SIGNED_OUT = { role: "staff", employeeId: null, name: null };

function useStaffSession() {
  const useApi = hasApi();
  const signedOut = SIGNED_OUT;
  // role is "admin" or "staff"; employeeId and name are set for a personal
  // sign-in; people are offered on the sign-in screen. Without an API there is
  // no sign-in and everything shows.
  const [session, setSession] = useState(
    useApi
      ? { state: "checking", ...signedOut, people: [], methods: { admin: true, office: true } }
      : { state: "open", role: "admin", employeeId: null, name: null, people: [], methods: { admin: true, office: true } }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!useApi) return undefined;
    let cancelled = false;
    fetchSession()
      .then((found) => { if (!cancelled) setSession(found); })
      .catch((err) => { if (!cancelled) setSession({ state: "error", ...signedOut, people: [], methods: { admin: true, office: true }, message: err.message }); });
    // Signed out by the server: ask again, so the sign-in screen has the
    // current list of people.
    const stopListening = onAuthLost(() => {
      setSession((prev) => ({ ...prev, state: "checking", ...signedOut }));
      setAttempt((a) => a + 1);
    });
    return () => { cancelled = true; stopListening(); };
  }, [useApi, attempt, signedOut]);

  return {
    session,
    isAdmin: session.role === "admin",
    viewer: { isAdmin: session.role === "admin", employeeId: session.employeeId },
    signIn: async (password, as) => { await login(password, as); setSession(await fetchSession()); },
    // Reloads the session so the sign-in screen lists whoever was given a
    // password since this browser last checked.
    signOut: () => {
      logout();
      setSession((prev) => ({ ...prev, state: "checking", ...signedOut }));
      setAttempt((a) => a + 1);
    },
    retry: () => { setSession((prev) => ({ ...prev, state: "checking" })); setAttempt((a) => a + 1); },
  };
}

const SIGN_IN_AS_KEY = "nk.signInAs";
const rememberedChoice = () => { try { return localStorage.getItem(SIGN_IN_AS_KEY); } catch { return null; } };

// methods: which shared passwords exist on the server. people: every profile,
// with hasPassword false until the admin sets one.
function SignIn({ people, methods, onSignIn }) {
  const choices = signInChoices(people, methods);
  const [as, setAs] = useState(() => defaultSignInChoice(people, rememberedChoice()));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const chosen = choices.find((c) => c.value === as) ?? choices[0];
  const noteStyle = { borderColor: C.blueLight, background: "#EBF3FA", color: C.ink };

  const submit = (e) => {
    e.preventDefault();
    if (!chosen.ready) return;
    setBusy(true);
    setError(null);
    try { localStorage.setItem(SIGN_IN_AS_KEY, chosen.value); } catch { /* storage blocked */ }
    onSignIn(password, chosen.value).catch((err) => { setError(err.message); setBusy(false); });
  };

  return (
    <form onSubmit={submit} aria-label="Staff sign in" style={{ background: C.card, borderColor: C.line }} className="w-full max-w-sm border rounded-lg shadow-sm p-6">
      <div style={{ background: C.navy, color: C.orange }} className="w-11 h-11 rounded-full flex items-center justify-center mb-4">
        <Lock size={18} />
      </div>
      <div style={{ color: C.orangeDeep }} className="f-mono text-xs font-semibold tracking-wider uppercase mb-1">Staff Only</div>
      <h1 style={{ color: C.ink }} className="f-display text-xl font-bold mb-1">Sign in to continue</h1>
      <p style={{ color: C.steel }} className="f-body text-sm mb-5">The work board and receivables are for NK Consultancy staff.</p>
      <div className="mb-3">
        <Field label="Sign in as" required>
          <select name="as" value={chosen.value} onChange={(e) => { setAs(e.target.value); setError(null); }} style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS}>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        {chosen.value === "shared" && methods.admin && methods.office && (
          <p style={{ color: C.steel }} className="f-body text-xs mt-1.5">The admin password can edit and delete any work and shows amounts. The office password can add and move work.</p>
        )}
      </div>
      {chosen.ready ? (
        <Field label="Password" required>
          <input
            name="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required autoFocus
            style={{ borderColor: C.line, color: C.ink }} className={INPUT_CLASS}
          />
        </Field>
      ) : (
        <div data-testid="no-password-note" role="note" style={noteStyle} className="border rounded-md px-3 py-2 f-body text-sm">
          {chosen.name} does not have a password yet. The admin sets it on the Team page, and then {chosen.name} can sign in here.
        </div>
      )}
      {!methods.admin && (
        <div data-testid="no-admin-note" role="note" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="border rounded-md px-3 py-2 mt-3 f-body text-sm">
          No admin password is set on the server yet, so nobody can set up profiles, delete work or see amounts. Add ADMIN_PASSWORD in the Render dashboard.
        </div>
      )}
      {error && (
        <div role="alert" style={{ borderColor: C.orangeDeep, background: "#FDF0EA", color: C.orangeDeep }} className="border rounded-md px-3 py-2 mt-3 f-body text-sm">
          {error}
        </div>
      )}
      <button type="submit" disabled={busy || !chosen.ready} style={{ background: C.orange, color: C.paper }} className="f-body text-sm font-semibold w-full px-5 py-2.5 mt-4 rounded shadow-sm hover:opacity-90 disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

// Shows its children only when the staff session allows it.
function StaffOnly({ staff, children }) {
  const { session, signIn, retry } = staff;
  if (session.state === "open" || session.state === "signedIn") return children;

  return (
    <div style={{ background: C.paper }} className="min-h-[calc(100vh-4rem)] grid-bg py-10 sm:py-16 px-4 flex items-start justify-center">
      {session.state === "login" && <SignIn people={session.people} methods={session.methods} onSignIn={signIn} />}
      {session.state === "checking" && (
        <div style={{ borderColor: C.line, color: C.steel, background: C.card }} className="w-full max-w-sm border rounded-md p-8 text-center f-body text-sm">
          Checking access…
          <div className="text-xs mt-2">The server can take up to a minute to wake up.</div>
        </div>
      )}
      {session.state === "error" && (
        <div style={{ borderColor: C.orangeDeep, background: "#FDF0EA" }} className="w-full max-w-sm border rounded-md p-6 text-center">
          <p style={{ color: C.orangeDeep }} className="f-body text-sm mb-3">Could not check access. {session.message}</p>
          <button onClick={retry} style={{ background: C.navy, color: C.paper }} className="f-body text-xs font-semibold px-4 py-2 rounded shadow-sm hover:opacity-90">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP EXPORT
------------------------------------------------------------------*/
export default function App() {
  // The page comes from the address, so back, forward and shared links work.
  const [page, setPageState] = useState(() => pageFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => {
      const next = pageFromHash(window.location.hash);
      setPageState(next);
      // A page starts at the top; a section link scrolls to its section once
      // the landing page has drawn.
      const anchor = anchorFromHash(window.location.hash);
      if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
      else window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  // Opening the site at a section link such as #enquiry: scroll there once
  // the landing page has drawn.
  useEffect(() => {
    const anchor = anchorFromHash(window.location.hash);
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  }, []);
  const setPage = (next) => {
    if (pageFromHash(window.location.hash) === next && !anchorFromHash(window.location.hash)) {
      window.scrollTo(0, 0);
      return;
    }
    window.location.hash = hashForPage(next);
  };
  const staff = useStaffSession();
  const signedIn = staff.session.state === "signedIn";
  // With sign-in on, the pages can explain hidden buttons and offer the fix.
  const access = signedIn
    ? { adminConfigured: staff.session.methods.admin, onSwitchSignIn: staff.signOut, onOpenTeam: () => setPage("team") }
    : null;
  // Mock mode only: enquiries live here so the landing page form and the
  // Enquiries page share one list.
  const [localEnquiries, setLocalEnquiries] = useState(INITIAL_ENQUIRIES);
  // Mock mode only: the tickets live here so the Work Board and Receivables
  // always show the same ones.
  const [localTasks, setLocalTasks] = useState(INITIAL_TASKS);
  const sendLocalEnquiry = async (form) => {
    setLocalEnquiries((prev) => [
      { id: Math.max(0, ...prev.map((e) => e.id)) + 1, name: form.name.trim(), phone: form.phone.trim(), message: form.message.trim() || null, status: "new", createdAt: localDay() },
      ...prev,
    ]);
  };
  return (
    <div className="f-body w-full min-h-screen antialiased" style={{ background: C.paper }}>
      <TopNav
        page={page}
        setPage={setPage}
        onSignOut={signedIn ? staff.signOut : null}
        userName={signedIn ? viewerLabel(staff.session) : null}
        showTeam={hasApi() && (signedIn || staff.session.state === "open")}
        showActivity={hasApi() && staff.isAdmin && (signedIn || staff.session.state === "open")}
      />
      <main>
        {page === "home" && <Landing setPage={setPage} onEnquiry={hasApi() ? sendEnquiry : sendLocalEnquiry} />}
        {(page === "work" || page === "completed") && (
          <StaffOnly staff={staff}>
            <WorkBoard
              key={`${staff.session.role}-${staff.session.employeeId}`}
              viewer={staff.viewer}
              access={access}
              view={page === "completed" ? "completed" : "board"}
              onView={(next) => setPage(next === "completed" ? "completed" : "work")}
              local={localTasks}
              setLocal={setLocalTasks}
            />
          </StaffOnly>
        )}
        {page === "payments" && <StaffOnly staff={staff}><Payments key={staff.session.role} isAdmin={staff.isAdmin} local={localTasks} setLocal={setLocalTasks} /></StaffOnly>}
        {page === "team" && <StaffOnly staff={staff}><Team key={`${staff.session.role}-${staff.session.employeeId}`} viewer={staff.viewer} access={access} /></StaffOnly>}
        {page === "activity" && (
          <StaffOnly staff={staff}>
            {hasApi() && staff.isAdmin ? <Activity key={staff.session.role} /> : <ActivityUnavailable access={access} />}
          </StaffOnly>
        )}
        {page === "enquiries" && <StaffOnly staff={staff}><Enquiries local={localEnquiries} setLocal={setLocalEnquiries} /></StaffOnly>}
      </main>
    </div>
  );
}
