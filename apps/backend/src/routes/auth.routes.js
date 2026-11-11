import { Router } from "express";
import { getSession, login } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.get("/session", getSession);
authRouter.post("/login", login);
