# 📱 How to work on the Bangle Catalogue from anywhere

You do NOT need your office PC. Everything below works from a phone, home PC, or tablet — just a web browser.

---

## 1. To chat with Claude & edit the prompt sheets (from any device)

1. Open a browser and go to **claude.ai/code**
2. **Log in** with your usual account
3. If asked, **connect GitHub** and allow access to the **bangle-tracker** project (one-time only)
4. Open the **bangle-tracker** project → open the **catalogue** folder
5. Start chatting with Claude, exactly like on the office PC. Examples:
   - "Edit prompt B3·P2 to make the light softer"
   - "Add 5 new marketing prompts for Diwali"
   - "Change the tagline in prompt 4"

Your files live here:
- `catalogue/photography_prompts.txt` — the 16 exhibition catalogue prompts
- `catalogue/marketing_prompts.txt` — the 10 branded marketing prompts
- `catalogue/siddhi_logo.png` — the logo
- `catalogue/add_logo_watermark.py` — stamps logo + design code on photos

---

## 2. To generate the actual photos (from any device)

1. Open **gemini.google.com** (sign in with your Google AI Pro account)
2. Upload a bangle photo
3. Paste a prompt from the sheets above
4. Check the result, download it

---

## 3. To manage the catalogue website content (from any device)

- **Live catalogue:** bangle-tracker.pages.dev/catalogue/
- **Admin panel:** the catalogue admin page (password protected)
- Changes save to the cloud (Firebase) instantly — no PC needed.

---

## Important reminders
- **Never paste your API key into a file that gets saved to GitHub.** Keep it only in your local Gemini app / on your own device.
- Claude Code web runs in the **cloud**, so anything Claude "runs" happens on the cloud copy — perfect for editing prompts and text.
- Always check AI-generated text for spelling before using it.

---
*Saved for Siddhi Creation — exhibition catalogue project.*
