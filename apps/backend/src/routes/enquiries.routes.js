import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { createEnquiry, deleteEnquiry, listEnquiries, updateEnquiry } from "../controllers/enquiries.controller.js";

export const enquiriesRouter = Router();

// Sending an enquiry is public; everything else is for signed-in staff.
enquiriesRouter.post("/", createEnquiry);
enquiriesRouter.get("/", requireAuth, listEnquiries);
enquiriesRouter.patch("/:id", requireAuth, updateEnquiry);
enquiriesRouter.delete("/:id", requireAuth, deleteEnquiry);
