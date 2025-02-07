/**
 * @brief Voice assistant. Server side NodeJS.
 * @author Aveesha Vivek
 * @copyright GPLv3
 */

// Include libraries
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const cors = require('cors'); // To enable cross-origin requests

// Initialize environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Path to files
const recordFile = path.resolve("./resources/recording.wav");
const voicedFile = path.resolve("./resources/voicedby.wav");

// API Key
const apiKey = process.env.OPENAI_API_KEY;  // Securely access the API key
let shouldDownloadFile = false;
const maxTokens = 30; // Defines the length of GPT response

// Initialize OpenAI API client
const openai = new OpenAI();

// Middleware for parsing incoming requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors()); // Enable CORS for remote access

// Route to upload audio
app.post('/uploadAudio', (req, res) => {
    shouldDownloadFile = false;
    const recordingFile = fs.createWriteStream(recordFile, { encoding: "utf8" });

    req.on('data', function (data) {
        recordingFile.write(data);
    });

    req.on('end', async function () {
        recordingFile.end();
        const transcription = await speechToTextAPI();
        res.status(200).send(transcription);
        // Send transcription to GPT-3.5 Turbo
        callGPT(transcription);
    });
});

// Simple test route
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Route to check variable state
app.get('/checkVariable', (req, res) => {
    res.json({ ready: shouldDownloadFile });
});

// Route to broadcast the audio
app.get('/broadcastAudio', (req, res) => {
    fs.stat(voicedFile, (err, stats) => {
        if (err) {
            console.error('File not found');
            res.sendStatus(404);
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': stats.size
        });

        const readStream = fs.createReadStream(voicedFile);
        readStream.pipe(res);

        readStream.on('end', () => {
            // Audio sent successfully
        });

        readStream.on('error', (err) => {
            console.error('Error reading file', err);
            res.sendStatus(500);
        });
    });
});

// Start the server and make it publicly accessible
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log(`You can now access this server remotely.`);
});

// Convert speech to text using OpenAI Whisper API
async function speechToTextAPI() {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(recordFile),
            model: "whisper-1",
            response_format: "text"
        });

        console.log('Transcription:', transcription);
        return transcription;
    } catch (error) {
        console.error('Error in speechToTextAPI:', error.message);
        return null;
    }
}

// Call GPT-3.5 Turbo to generate a response based on transcription
async function callGPT(text) {
    try {
        // GPT request message
        const message = {
            role: "system",
            content: text
        };

        // API-request to GPT
        const completion = await openai.chat.completions.create({
            messages: [message],
            model: "gpt-3.5-turbo",
            max_tokens: maxTokens
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const gptResponse = completion.choices[0].message.content;
        console.log('GPT Response:', gptResponse);

        // Convert GPT response to speech
        GptResponsetoSpeech(gptResponse);

    } catch (error) {
        console.error('Error calling GPT:', error.response?.data || error.message);
    }
}

// Convert GPT response text to speech and save as audio file
async function GptResponsetoSpeech(gptResponse) {
    try {
        const wav = await openai.audio.speech.create({
            model: "tts-1",
            voice: "echo",
            input: gptResponse,
            response_format: "wav",
        });

        const buffer = Buffer.from(await wav.arrayBuffer());
        await fs.promises.writeFile(voicedFile, buffer);

        // Successfully saved the audio file
        shouldDownloadFile = true;
    } catch (error) {
        console.error("Error saving audio file:", error);
    }
}
