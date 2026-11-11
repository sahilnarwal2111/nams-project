import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors apps/frontend/src/App.jsx's EMPLOYEES and INITIAL_TASKS, so the seeded
// API responses match the mock UI content.

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

// The amount to charge for some of the sample work, in rupees. Work not listed
// has no amount yet; 0 means the work is not charged.
const FEES = {
  "NK-101": 40000, "NK-102": 18000, "NK-103": 60000, "NK-104": 85000, "NK-106": 30000,
  "NK-110": 0, "NK-112": 45000, "NK-113": 25000, "NK-119": 35000,
};

async function main() {
  for (const employee of EMPLOYEES) {
    await prisma.employee.upsert({ where: { id: employee.id }, update: employee, create: employee });
  }
  for (const task of TASKS) {
    const data = { ...task, fee: FEES[task.id] ?? null };
    await prisma.task.upsert({ where: { id: task.id }, update: data, create: data });
  }
  console.log(`Seeded ${EMPLOYEES.length} employees and ${TASKS.length} tasks.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
