import { createApp } from "./app.js";
import { ENV } from "./config/env.js";
import job from "./config/cron.js";

const app = createApp();
const PORT = ENV.PORT || 5001;

// Keep-alive cron only in production (used for Render free tier).
if (ENV.NODE_ENV === "production" && ENV.API_URL) job.start();

app.listen(PORT, () => {
  console.log(`Server started on port: ${PORT}`);
});
