import { createRequestHandler } from "@react-router/node";
import * as build from "../build/server/index.js";

export default createRequestHandler({
  // @ts-ignore — build types generated at build time
  build,
  mode: process.env.NODE_ENV ?? "production",
});
