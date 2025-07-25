// index.js
import express from "express";
// ----------------Routes-import---------------------
import authRoutes from "./Routes/Auth.js"
import FollowRoutes from "./Routes/FollowRoutes.js"
import JourneyMap from "./Routes/JourneyMap.js"
import LeaderBoard from "./Routes/LeaderBoard.js"
import ProfileRoutes from "./Routes/ProfileRoutes.js";
import ReturnSpot from "./Routes/ReturnSpot.js"
import SpotPostRoute from "./Routes/SpotPost.js"
const app = express();
app.use(express.json());


app.use("/", authRoutes); 
app.use("/", FollowRoutes); 
app.use("/",JourneyMap); 
app.use("/",LeaderBoard);
app.use("/",ProfileRoutes); 
app.use("/",ReturnSpot);
app.use("/",SpotPostRoute); 


app.listen(process.env.PORT, () =>
  console.log(`API ready → http://localhost:${process.env.PORT}`)
);