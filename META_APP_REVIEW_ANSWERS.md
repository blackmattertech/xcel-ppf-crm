# Meta App Review — Answers to Fill In

Use this document to complete the **App settings** section of the Meta App Review form so you can publish your app.

---

## 1. App icon (required)

**Issue:** The form shows "This is a required question" because no app icon has been uploaded.

**What to do:**

- **Option A (recommended):** Use your existing PWA icon.
  - In the project, run: `npm run generate-icons` (if you have `favicon.png` in `public/`). This creates `public/icon-512x512.png`.
  - Upload **`public/icon-512x512.png`** in the Meta form (Edit app icon).
  - Meta accepts: **512×512 to 1024×1024 pixels**, JPG/GIF/PNG, max **5 MB**.

- **Option B:** Use your main website logo (xcelppf.com) as a square image in the size above and upload it.

---

## 2. Privacy policy URL

**Status:** Already filled and valid (green checkmark).

- **Value:** `https://xcelppf.com/about-us-xcel-premium-car-detailing-ppf-ceramic-coating-tints-in-bangalore/`
- No change needed.

---

## 3. User data deletion (required — fix "invalid domain")

**Issue:** The form shows "This URL contains an invalid domain" when the Data deletion instructions URL is empty or wrong.

**Reason:** Meta requires a **public, HTTPS** page that explains how users can request deletion of their data. The URL must be on a valid domain (e.g. your app domain or your business domain).

**What we did:** A **Data Deletion Instructions** page was added to your app at:

**Use this URL in the form:**

```
https://xcel-ppf-crm.vercel.app/data-deletion
```

- In the form, keep **User Data Deletion type** as **"Data deletion instructions URL"**.
- In the text field, enter exactly: **`https://xcel-ppf-crm.vercel.app/data-deletion`**
- Deploy your app (e.g. push to Vercel) so this URL is live before you submit. Meta’s crawler will check that the page loads and is publicly accessible.

If your production URL is different (e.g. a custom domain), use that base URL + `/data-deletion` instead.

---

## 4. App category

**Status:** Already set correctly.

- **Value:** **Business and pages**
- No change needed.

---

## 5. Primary contact

**Status:** Already set.

- **Value:** `michaellawzer@gmail.com`
- No change needed unless you want to use another address.

---

## Checklist before submitting

1. [ ] **App icon:** Uploaded (512×512–1024×1024, ≤ 5 MB).
2. [ ] **Privacy policy URL:** Unchanged (already valid).
3. [ ] **User data deletion URL:** Set to `https://xcel-ppf-crm.vercel.app/data-deletion` (or your production base URL + `/data-deletion`).
4. [ ] **Deploy:** App deployed so `/data-deletion` is live and open without login.
5. [ ] **Test:** Open the data-deletion URL in a browser and confirm the page loads and is readable.

After saving, click **Next** to continue the App Review flow.
