import { z } from "zod";

export const debriefInputSchema = z.object({ sessionId: z.string().uuid() }).strict();
