import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { createClient, deleteClient, listClients, updateClient } from "../controllers/clients.controller.js";
import { listPayments, recordPayment } from "../controllers/payments.controller.js";

export const clientsRouter = Router();

// Staff can see the list (without amounts) and log a reminder call. Anything
// that shows or changes money needs an admin.
clientsRouter.get("/", listClients);
clientsRouter.post("/", requireAdmin, createClient);
clientsRouter.patch("/:id", updateClient);
clientsRouter.delete("/:id", requireAdmin, deleteClient);
clientsRouter.get("/:id/payments", requireAdmin, listPayments);
clientsRouter.post("/:id/payments", requireAdmin, recordPayment);
