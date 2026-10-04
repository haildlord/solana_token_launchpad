import "dotenv/config";
import express from "express";
import { errorHandler } from "./middleware/index.js";
import {rootRouter} from "./routes/index.js";
import { UPLOAD_DIR } from "./middleware/upload.js";

const app = express();


app.use(express.json());

// express leaves req.body undefined when no body is sent, so give routes an empty object
app.use((req, _res, next) => {
    req.body ??= {};
    next();
});

app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/api", rootRouter);

app.use(errorHandler);


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server listening on... ${PORT}`)
});
