import express from 'express';

import userRoutes from './routes/user';
const app = express();

app.use(express.json());

app.use("", userRoutes);


app.listen(3000, () => {
  console.log("server running on port 3000");
})