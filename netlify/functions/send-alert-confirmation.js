exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const alert = JSON.parse(event.body);
    
    // Normalize phone to E.164
    let phone = (alert.phone || "").replace(/[^0-9+]/g, "");
    if (!phone.startsWith("+")) phone = "+1" + phone;

    // Format date and times
    const date = new Date(alert.target_date + "T12:00:00");
    const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    
    const fmtTime = (t) => {
      if (!t) return "";
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const hr = h % 12 || 12;
      return m === 0 ? hr + " " + ampm : hr + ":" + String(m).padStart(2, "0") + " " + ampm;
    };

    const early = fmtTime(alert.earliest_time || "06:00");
    const late = fmtTime(alert.latest_time || "18:00");

    const msg = "Alert set!\n\n"
      + "We'll text you when tee times open up at " + alert.course_name
      + " on " + dateStr + ", " + early + " - " + late + "."
      + "\n\nYou'll get up to 3 notifications."
      + "\nReply STOP to unsubscribe."
      + "\n\n— Daily Tee Times";

    // Call Twilio API directly (no SDK needed)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    const params = new URLSearchParams();
    params.append("To", phone);
    params.append("From", fromNumber);
    params.append("Body", msg);

    const resp = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" + accountSid + "/Messages.json",
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const data = await resp.json();

    if (resp.ok) {
      return { statusCode: 200, body: JSON.stringify({ success: true, sid: data.sid }) };
    } else {
      console.error("Twilio error:", data);
      return { statusCode: 400, body: JSON.stringify({ success: false, error: data.message }) };
    }
  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
