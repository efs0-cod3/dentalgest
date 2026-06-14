import { createRequestListener } from "@react-router/node";
// @ts-ignore — build/server/ is created at build time before this function runs
import * as build from "../build/server/index.js";

export default createRequestListener({
  // @ts-ignore
  build,
  mode: process.env.NODE_ENV ?? "production",
});
