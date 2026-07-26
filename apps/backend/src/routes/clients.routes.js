import { Router } from "express";
import { listClients, logClientCall } from "../controllers/clients.controller.js";

export const clientsRouter = Router();

clientsRouter.get("/", listClients);
clientsRouter.patch("/:id", logClientCall);
