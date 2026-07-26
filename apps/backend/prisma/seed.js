import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors apps/frontend/src/App.jsx's EMPLOYEES / INITIAL_TASKS / INITIAL_CLIENTS
// exactly, so the seeded API responses match today's mock UI content.

const EMPLOYEES = [
  { id: "e1", name: "Narender Kumar", role: "MD & CEO — All-Topics SME", initials: "NK" },
  { id: "e2", name: "Munesh Kumari", role: "Director", initials: "MK" },
  { id: "e3", name: "Sahil", role: "Software Engineer", initials: "SA" },
  { id: "e4", name: "Rajesh Kumar", role: "X-Section Lead", initials: "RK" },
  { id: "e5", name: "Sonu", role: "AutoCAD Lead", initials: "SO" },
  { id: "e6", name: "Ankit", role: "Survey Lead", initials: "AN" },
  { id: "e7", name: "Komal", role: "Accounts", initials: "KO" },
];

const TASKS = [
  { id: "NK-101", title: "Topographic survey — Narwana layout", client: "Jind Infra Developers Pvt Ltd", assigneeId: "e6", status: "done", priority: "high" },
  { id: "NK-102", title: "Boundary survey — Safidon plot 44", client: "Rohtak Builders", assigneeId: "e6", status: "todo", priority: "low" },
  { id: "NK-103", title: "Drone survey — solar plant site, Hisar", client: "Kaithal Roadways", assigneeId: "e6", status: "inprogress", priority: "high" },
  { id: "NK-104", title: "L-section — Western Yamuna Canal stretch", client: "Jind Municipal Council", assigneeId: "e4", status: "inprogress", priority: "high" },
  { id: "NK-105", title: "X-section survey — NH-352 Jind bypass", client: "National Highways Cell", assigneeId: "e4", status: "todo", priority: "medium" },
  { id: "NK-106", title: "Cross-section review — Ghaggar embankment, Kaithal", client: "Jind Municipal Council", assigneeId: "e4", status: "done", priority: "medium" },
  { id: "NK-110", title: "GIS survey-data pipeline upgrade", client: "Internal — NK Consultancy", assigneeId: "e3", status: "inprogress", priority: "high" },
  { id: "NK-111", title: "Drawing archive digitization — legacy project scans", client: "Internal — NK Consultancy", assigneeId: "e3", status: "todo", priority: "low" },
  { id: "NK-112", title: "Design review & sign-off — NH-71 realignment", client: "National Highways Cell", assigneeId: "e1", status: "done", priority: "high" },
  { id: "NK-113", title: "Client escalation review — Panipat Industries Assoc.", client: "Panipat Industries Assoc.", assigneeId: "e1", status: "inprogress", priority: "high" },
  { id: "NK-114", title: "Tender documentation — Jind Municipal Council waterworks", client: "Jind Municipal Council", assigneeId: "e2", status: "todo", priority: "high" },
  { id: "NK-116", title: "Saraswati River X-section — Phase 1", client: "Saraswati Heritage Development Board", assigneeId: "e4", status: "todo", priority: "high" },
  { id: "NK-117", title: "Drone survey — MSIL Plant, Manesar", client: "Maruti Suzuki India Ltd (MSIL)", assigneeId: "e6", status: "todo", priority: "high" },
  { id: "NK-118", title: "Road design — Panchkula Road (Amravati Round About)", client: "Haryana PWD", assigneeId: "e1", status: "inprogress", priority: "high" },
  { id: "NK-119", title: "Survey work — Panchkula Road (Amravati Round About)", client: "Haryana PWD", assigneeId: "e6", status: "done", priority: "high" },
  { id: "NK-120", title: "Storm water plan — Mulana", client: "Mulana Gram Panchayat", assigneeId: "e1", status: "todo", priority: "medium" },
  { id: "NK-121", title: "Wastewater plan — Beri", client: "Beri Gram Panchayat", assigneeId: "e3", status: "todo", priority: "medium" },
  { id: "NK-122", title: "Payment review (15 days)", client: "Internal — NK Consultancy", assigneeId: "e7", status: "todo", priority: "medium" },
  { id: "NK-123", title: "Road X-section — Kaithal Road", client: "Kaithal Roadways", assigneeId: "e2", status: "todo", priority: "medium" },
  { id: "NK-124", title: "CAD drawing preparation — PHC Jind", client: "Haryana Health Dept — PHC Jind", assigneeId: "e5", status: "todo", priority: "high" },
  { id: "NK-125", title: "Village XYZ pond survey", client: "Village XYZ Panchayat", assigneeId: "e6", status: "todo", priority: "low" },
  { id: "NK-126", title: "Village XYZ pond X-section", client: "Village XYZ Panchayat", assigneeId: "e4", status: "todo", priority: "low" },
];

const CLIENTS = [
  { id: "c1", name: "Jind Infra Developers Pvt Ltd", contact: "Suresh Malik", phone: "+91 98961 23450", due: 184000, invoiceDate: "2026-05-12", lastCall: "2026-07-18", status: "overdue", notes: "Promised payment after milestone billing on the 25th." },
  { id: "c2", name: "Jind Municipal Council", contact: "Eng. R. Dahiya", phone: "+91 98123 45678", due: 96000, invoiceDate: "2026-06-20", lastCall: "2026-07-20", status: "due-soon", notes: "Bill in final approval stage at municipal office." },
  { id: "c3", name: "Rohtak Builders", contact: "Vinod Chhikara", phone: "+91 98221 55678", due: 52000, invoiceDate: "2026-06-02", lastCall: "2026-07-10", status: "overdue", notes: "Escalate to email if no response by Friday." },
  { id: "c4", name: "Yamuna Bridgeworks", contact: "Neha Sharma", phone: "+91 90211 44890", due: 0, invoiceDate: "2026-05-28", lastCall: "2026-07-05", status: "paid", notes: "Cleared in full. Official receipt dispatched." },
  { id: "c5", name: "Kaithal Roadways", contact: "Ramesh Sihag", phone: "+91 98811 22990", due: 133000, invoiceDate: "2026-06-15", lastCall: "2026-07-21", status: "due-soon", notes: "Confirmed cheque dispatch, awaiting bank clearance." },
  { id: "c6", name: "Panipat Industries Assoc.", contact: "Devendra Ahlawat", phone: "+91 97641 33221", due: 76500, invoiceDate: "2026-04-30", lastCall: "2026-07-19", status: "overdue", notes: "Third reminder call made; requested formal statement." },
];

async function main() {
  for (const employee of EMPLOYEES) {
    await prisma.employee.upsert({ where: { id: employee.id }, update: employee, create: employee });
  }
  for (const task of TASKS) {
    await prisma.task.upsert({ where: { id: task.id }, update: task, create: task });
  }
  for (const client of CLIENTS) {
    const data = { ...client, invoiceDate: new Date(client.invoiceDate), lastCall: new Date(client.lastCall) };
    await prisma.client.upsert({ where: { id: client.id }, update: data, create: data });
  }
  console.log(`Seeded ${EMPLOYEES.length} employees, ${TASKS.length} tasks, ${CLIENTS.length} clients.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
