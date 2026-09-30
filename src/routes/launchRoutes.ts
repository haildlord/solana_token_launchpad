import { Router } from "express";

export const launchRoute = Router();


launchRoute.post("/", () => {console.log("Launch route");});