import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();
// Replit's managed proxy is the single trusted hop. Express derives req.ip from
// that hop instead of trusting arbitrary client-supplied forwarding headers.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buffer) => {
    (req as any).rawBody = buffer.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/images", express.static(path.join(__dirname, "../public/images")));

app.use("/api", router);

export default app;
