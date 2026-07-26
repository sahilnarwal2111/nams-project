import express from "express";
import cors from "cors";
import { employeesRouter } from "./routes/employees.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { clientsRouter } from "./routes/clients.routes.js";

export const app = express();

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
app.use("/api/employees", employeesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/clients", clientsRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
