import { Router } from "express";
import { listActivity } from "../controllers/activity.controller.js";

export const activityRouter = Router();

// Reading only. The log has no route that edits or removes an entry.
activityRouter.get("/", listActivity);
