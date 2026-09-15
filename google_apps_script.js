/**
 * Google Apps Script Web App for SocioAI-SIG Question & Feedback Collection
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets (https://sheets.new) and create a new spreadsheet.
 * 2. In the top menu, go to: Extensions > Apps Script.
 * 3. Delete any default code, paste this entire file, and click the Save icon (💾).
 * 4. In the top right, click Deploy > New deployment.
 * 5. Under "Select type", choose "Web app".
 * 6. Set "Execute as": "Me" (your Google account).
 * 7. Set "Who has access": "Anyone" (allows attendees to submit questions).
 * 8. Click "Deploy", grant permissions when prompted, and copy the "Web app URL".
 * 9. In index.html, paste your Web app URL into the `GOOGLE_SCRIPT_WEBHOOK_URL` variable.
 */

function doPost(e) {
  try {
    // 1. Parse incoming payload
    var data = {};
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    // 2. MISUSE GUARD: Honeypot field check
    // Real users never see 'company_website'; spam bots fill every input.
    if (data.company_website && String(data.company_website).trim() !== "") {
      // Return fake success to bots without recording anything
      return createJsonResponse({ status: "success", message: "Received" });
    }

    // 3. MISUSE GUARD: Question content validation
    var rawQuestion = (data.question || data.message || "").trim();
    if (!rawQuestion) {
      return createJsonResponse({ status: "error", message: "Question content is required." });
    }

    // 4. MISUSE GUARD: Rate limiting via Google CacheService
    var cache = CacheService.getScriptCache();
    var clientSignature = (data.user_agent || "") + "_" + (data.affiliation || "");
    var clientKey = "sig_" + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, clientSignature));
    if (cache.get(clientKey)) {
      return createJsonResponse({ status: "error", message: "Rate limit: please wait a moment between submissions." });
    }
    // Set 25-second throttle key in cache
    cache.put(clientKey, "1", 25);

    // 5. MISUSE GUARD: Formula / CSV Injection sanitization
    // If text starts with =, +, -, or @, prepend a single quote (') so Sheets won't execute formulas
    var sanitize = function(val, maxLen) {
      if (!val) return "";
      var str = String(val).trim().slice(0, maxLen);
      if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
      }
      return str;
    };

    var name = sanitize(data.name || "Anonymous", 80);
    var affiliation = sanitize(data.affiliation || "Not provided", 120);
    var topic = sanitize(data.topic || "General Inquiry", 80);
    var question = sanitize(rawQuestion, 1500);
    var userAgent = sanitize(data.user_agent || "", 180);

    // 6. Append row to spreadsheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    // Auto-create header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Name", "Affiliation / Email", "Topic / Theme", "Question / Feedback", "User Agent"]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#f4ede4");
      sheet.setFrozenRows(1);
    }

    // 7. MISUSE GUARD: Maximum row cap protection (prevents runaway flooding)
    if (sheet.getLastRow() >= 5000) {
      return createJsonResponse({ status: "error", message: "Response limit reached. Please contact organizers directly." });
    }

    var timestamp = new Date();
    sheet.appendRow([timestamp, name, affiliation, topic, question, userAgent]);

    return createJsonResponse({ status: "success", message: "Feedback submitted successfully." });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    name: "SocioAI-SIG Feedback Webhook",
    conference: "CSCW 2026"
  })).setMimeType(ContentService.MimeType.JSON);
}
