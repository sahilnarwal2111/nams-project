import { prisma } from "../lib/prisma.js";

export async function listClients(req, res) {
  const clients = await prisma.client.findMany({ orderBy: { id: "asc" } });
  res.json(clients);
}

export async function logClientCall(req, res) {
  const { id } = req.params;

  try {
    const client = await prisma.client.update({ where: { id }, data: { lastCall: new Date() } });
    res.json(client);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Client ${id} not found` });
    throw err;
  }
}
