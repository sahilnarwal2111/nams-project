import { Router } from "express";
import { createClient, listClients, updateClient } from "../controllers/clients.controller.js";

export const clientsRouter = Router();

clientsRouter.get("/", listClients);
clientsRouter.post("/", createClient);
clientsRouter.patch("/:id", updateClient);
