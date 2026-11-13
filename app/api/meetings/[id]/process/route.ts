// Backwards-compatible alias for clients still calling the original process endpoint.
export const runtime = "nodejs";
export const maxDuration = 300;
export { POST } from "../intelligence/process/route";
