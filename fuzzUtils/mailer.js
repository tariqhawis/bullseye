const fs = require("fs");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");

// Path to the OAuth 2.0 credentials JSON file
const CREDENTIALS_PATH = path.join(__dirname, "..", ".creds.json");
const TOKEN_PATH = path.join(__dirname, "..", "token.json");

// Define the necessary scopes
const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

/**
 * Authenticate with Google API using OAuth2 credentials.
 * @returns {Promise<OAuth2Client>} - The authenticated OAuth2 client.
 */
async function authenticate() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH)).installed;
  const { client_id, client_secret, redirect_uris } = credentials;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if token exists, otherwise, get new one
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    const token = await getNewToken(oAuth2Client);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    oAuth2Client.setCredentials(token);
  }

  return oAuth2Client;
}

/**
 * Get a new token for OAuth2 authentication.
 * @param {OAuth2Client} oAuth2Client - The OAuth2 client to get token for.
 * @returns {Promise<Object>} - The token object.
 */
function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this URL:", authUrl);

  return new Promise((resolve, reject) => {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question("Enter the code from that page here: ", async (code) => {
      readline.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        resolve(tokens);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Create a draft email.
 * @param {OAuth2Client} auth - The authenticated OAuth2 client.
 * @param {Object} emailDetails - The email details.
 * @param {string} emailDetails.from - Sender's email address.
 * @param {string} emailDetails.to - Recipient's email address.
 * @param {string} emailDetails.subject - Subject of the email.
 * @param {string} emailDetails.text - Plain text content of the email.
 * @param {string} emailDetails.html - HTML content of the email.
 * @returns {Promise<void>} - A promise that resolves when the draft is created.
 */
async function postDraft(auth, emailDetails) {
  const { marked } = await import("marked");
  const gmail = google.gmail({ version: "v1", auth });

  // Convert Markdown to HTML
  const htmlContent = marked.parse(emailDetails.markdown);

  // Configure the email content
  const mailOptions = {
    from: emailDetails.from,
    to: emailDetails.to,
    subject: emailDetails.subject,
    text: emailDetails.markdown, // Set the plain text version as the Markdown content
    html: htmlContent, // Set the HTML version as the converted HTML content
  };

  // Use Nodemailer to create the raw email format
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
  const message = await transporter.sendMail(mailOptions);

  // Create the draft
  const rawMessage = message.message.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: rawMessage,
      },
    },
  });

  console.log(`Draft created with ID: ${res.data.id}`);
}

// Export functions for external use
module.exports = {
  authenticate,
  postDraft,
};
