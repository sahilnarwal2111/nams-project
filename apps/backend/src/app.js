import express from "express";
import cors from "cors";
import { employeesRouter } from "./routes/employees.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { clientsRouter } from "./routes/clients.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { enquiriesRouter } from "./routes/enquiries.routes.js";
import { teamRouter } from "./routes/team.routes.js";
import { activityRouter } from "./routes/activity.routes.js";
import { requireAdmin, requireAuth } from "./lib/auth.js";

export const app = express();

// Render sits behind one proxy; this makes req.ip the visitor's address, which
// the login attempt limit relies on.
app.set("trust proxy", 1);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0) return callback(null, true);
      const isAllowed = allowedOrigins.some((allowed) =>
        allowed.includes("*") ? new RegExp(`^${allowed.replace(/\*/g, ".*")}$`).test(origin) : allowed === origin
      );
      callback(isAllowed ? null : new Error("Not allowed by CORS"), isAllowed);
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
// Public: names and roles for the landing page.
app.use("/api/team", teamRouter);

// Open while APP_PASSWORD is unset; otherwise these need a signed-in token.
app.use("/api/employees", requireAuth, employeesRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/clients", requireAuth, clientsRouter);
// Who did what, and when. Admin only: the entries include amounts.
app.use("/api/activity", requireAuth, requireAdmin, activityRouter);
// Sending an enquiry is public; the router guards the staff-only routes itself.
app.use("/api/enquiries", enquiriesRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
