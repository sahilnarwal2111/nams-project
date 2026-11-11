import { Router } from "express";
import { createClient, deleteClient, listClients, updateClient } from "../controllers/clients.controller.js";
import { listPayments, recordPayment } from "../controllers/payments.controller.js";

export const clientsRouter = Router();

clientsRouter.get("/", listClients);
clientsRouter.post("/", createClient);
clientsRouter.patch("/:id", updateClient);
clientsRouter.delete("/:id", deleteClient);
clientsRouter.get("/:id/payments", listPayments);
clientsRouter.post("/:id/payments", recordPayment);
