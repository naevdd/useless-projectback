const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");

dotenv.config();

const app = express();
const PORT = 5000;
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const gemini_api_key = process.env.API_KEY;
const googleAI = new GoogleGenerativeAI(gemini_api_key);
const geminiConfig = {
  temperature: 0.3,
  topP: 0.3,
  topK: 1,
  maxOutputTokens: 500,
  frequency_penalty:0.3,
  presence_penalty:0.5
};

const geminiModel = googleAI.getGenerativeModel({
  model: "gemini-pro",
  geminiConfig,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:5000/auth/google/callback" 
);

async function getCalendarEvents() {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const events = await calendar.events.list({
      calendarId: "primary", 
      timeMin: new Date().toISOString(), 
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    return events.data.items.map((event) => ({
      summary: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
    }));
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    throw error;
  }
}

app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    console.log("Access Token:", tokens.access_token);
    console.log("Refresh Token:", tokens.refresh_token);

    res.send("Tokens generated. Check your console for the access and refresh tokens.");
  } catch (error) {
    console.error("Error retrieving tokens:", error);
    res.status(500).send("Error retrieving tokens");
  }
});

app.get("/api/calendar", async (req, res) => {
  try {
    const events = await getCalendarEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

let storedHistory = [];

app.post("/api/history", (req, res) => {
    try {
        const historyItems = req.body.history || [];
        storedHistory = historyItems; 

        console.log(`Received ${historyItems.length} history items`);
        historyItems.forEach((item, index) => {
            console.log(`${index + 1}. ${item.title} - ${item.url}`);
        });

        res.json({
            message: "History received and stored successfully",
            count: historyItems.length
        });
    } catch (error) {
        console.error("Error processing history:", error);
        res.status(500).json({ error: "Failed to process history" });
    }
});

app.get("/api/get-history", (req, res) => {
    try {
        res.json({ history: storedHistory });
    } catch (error) {
        console.error("Error retrieving history:", error);
        res.status(500).json({ error: "Failed to retrieve history" });
    }
});


app.post("/api/generate", async (req, res) => {
  console.log("Received request:", req.body);
  const prompt = req.body.inp;

  try {
    let finalinput;
    console.log(prompt,'yes')

    if (req.body.inp.includes("EXCUSE")) {
      finalinput = "(generate a crazy and funny excuse for:)" + prompt + " (limited to 30 words)";
      console.log(finalinput,'excuse');
    } else if (req.body.inp.includes("ADVICE")) {
      finalinput = "(provide funny but useless advice on the following:" + prompt + " (limited to 30 words)";
      console.log(finalinput,'advice');
    } else if (req.body.inp.includes("THERAPY")) {
      finalinput = "(behave like a pessimistic therapist and give me completely useless therapy instead for the following:)" + prompt + " (limited to 30 words)";
      console.log(finalinput,"input");
    } else {
      finalinput = "tell me nothing worked";
      console.log('hm')
    }

    const result = await geminiModel.generateContent(finalinput);
    console.log("Result from model:", result);

    const candidates = result?.response?.candidates;
    if (candidates && candidates.length > 0) {
      const contentParts = candidates[0]?.content?.parts;
      if (contentParts && contentParts.length > 0) {
        const response = contentParts[0];
        res.json({ text: response });
      } else {
        console.error("No content parts found in the candidate response");
        res.json({ text: "No valid content generated." });
      }
    } else {
      console.error("No candidates found in the response");
      res.json({ text: "No response candidates found." });
    }
  } catch (error) {
    console.log("Response error:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
