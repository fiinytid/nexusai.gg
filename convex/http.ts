import { httpRouter } from "convex/server";
import { controlHandler } from "./control";
import { storageHandler } from "./storage";

const http = httpRouter();

// ── Existing single-endpoint dispatch (action-in-body) ──────────────────────
http.route({ path: "/", method: "GET",     handler: controlHandler });
http.route({ path: "/", method: "POST",    handler: controlHandler });
http.route({ path: "/", method: "OPTIONS", handler: controlHandler });

// ── Storage — GIF capture upload / list / serve / delete ────────────────────
// needed a second one until now. Final URL: https://<deployment>.convex.site/storage
http.route({ path: "/storage", method: "GET",     handler: storageHandler });
http.route({ path: "/storage", method: "POST",    handler: storageHandler });
http.route({ path: "/storage", method: "DELETE",  handler: storageHandler });
http.route({ path: "/storage", method: "OPTIONS", handler: storageHandler });

export default http;