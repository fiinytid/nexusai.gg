import { httpRouter } from "convex/server";
import { controlHandler } from "./control";

const http = httpRouter();
http.route({ path: "/", method: "GET",     handler: controlHandler });
http.route({ path: "/", method: "POST",    handler: controlHandler });
http.route({ path: "/", method: "OPTIONS", handler: controlHandler });

export default http;