import express from "express";
import { errorHandler } from "./middleware/index.js";
import {rootRouter} from "./routes/index.js";

const app = express();


app.use(express.json());

app.use("/api", rootRouter);

app.use(errorHandler);


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server listening on... ${PORT}`)
});
