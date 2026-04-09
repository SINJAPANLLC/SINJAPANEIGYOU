import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import businessesRouter from "./businesses";
import leadsRouter from "./leads";
import templatesRouter from "./templates";
import campaignsRouter from "./campaigns";
import emailLogsRouter from "./email-logs";
import searchRouter from "./search";
import dashboardRouter from "./dashboard";
import unsubscribeRouter from "./unsubscribe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(businessesRouter);
router.use(leadsRouter);
router.use(templatesRouter);
router.use(campaignsRouter);
router.use(emailLogsRouter);
router.use(searchRouter);
router.use(dashboardRouter);
router.use(unsubscribeRouter);

export default router;
