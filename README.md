# CoachKit — SAY East Youth Soccer Manager
## Complete Launch Guide (Free, No Credit Card)

This guide takes you from zero to a live, password-protected CoachKit app in about 30 minutes.
You'll use three free services: **GitHub** (stores your code), **Clerk** (handles logins), and **Vercel** (hosts the app).

---

## What You'll Need
- A computer with internet access
- An email address

---

## PART 1 — Install Node.js (one time only)

Node.js lets you run the app locally and build it for deployment.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** download button (the left one)
3. Run the installer — click Next through all the defaults
4. When done, open **Terminal** (Mac: press Cmd+Space, type "Terminal") or **Command Prompt** (Windows: press Win+R, type "cmd")
5. Type this and press Enter to confirm it worked:
   ```
   node --version
   ```
   You should see something like `v20.11.0`

---

## PART 2 — Set Up GitHub (stores your code)

1. Go to **https://github.com** and click **Sign up**
2. Create a free account with your email
3. Verify your email when prompted

**Install GitHub Desktop (easiest way to manage code):**
1. Go to **https://desktop.github.com**
2. Download and install GitHub Desktop
3. Sign in with your GitHub account

**Create your repository:**
1. Open GitHub Desktop
2. Click **File → New Repository**
3. Name it: `coachkit`
4. Choose a local path (e.g. your Documents folder)
5. Click **Create Repository**
6. Click **Publish repository** in the top bar
7. Uncheck "Keep this code private" (leave it public — Vercel needs this on the free plan)
8. Click **Publish Repository**

**Add your project files:**
1. Find the repository folder on your computer (GitHub Desktop shows the path)
2. Copy ALL the files from this zip into that folder, replacing anything there
3. Back in GitHub Desktop, you'll see all the files listed as changes
4. At the bottom left, type a commit message like `Initial CoachKit setup`
5. Click **Commit to main**
6. Click **Push origin** (top bar)

Your code is now on GitHub ✅

---

## PART 3 — Set Up Clerk (handles coach logins)

1. Go to **https://clerk.com** and click **Start building for free**
2. Sign up with your GitHub account (easiest) or email
3. Once logged in, click **Create application**
4. Name it: `CoachKit`
5. Under "How will your users sign in?", enable **Email** (and optionally **Google**)
6. Click **Create application**

**Get your API key:**
1. In the left sidebar, click **API Keys**
2. You'll see a key that starts with `pk_test_...`
3. Copy that entire key — you'll need it in the next two steps

---

## PART 4 — Configure Your Local App

1. Find the file `.env.example` in your coachkit folder
2. Make a copy of it and rename the copy to `.env.local`
3. Open `.env.local` in any text editor (Notepad, TextEdit, etc.)
4. Replace `pk_test_replace_this_with_your_key` with the key you copied from Clerk
5. Save the file

**Test it locally (optional but recommended):**
1. Open Terminal / Command Prompt
2. Navigate to your coachkit folder:
   ```
   cd path/to/your/coachkit
   ```
   (drag the folder onto the terminal window to get the path automatically)
3. Install dependencies:
   ```
   npm install
   ```
4. Start the local server:
   ```
   npm run dev
   ```
5. Open **http://localhost:5173** in your browser — you should see the CoachKit login screen!
6. Press Ctrl+C in the terminal when done testing

---

## PART 5 — Deploy to Vercel (makes it live on the internet)

1. Go to **https://vercel.com** and click **Sign Up**
2. Choose **Continue with GitHub** — sign in with your GitHub account
3. Click **Add New → Project**
4. Find your `coachkit` repository and click **Import**
5. Vercel auto-detects Vite — leave all settings as-is
6. Before clicking Deploy, expand **Environment Variables** and add:
   - **Name:** `VITE_CLERK_PUBLISHABLE_KEY`
   - **Value:** your `pk_test_...` key from Clerk
   - Click **Add**
7. Click **Deploy**
8. Wait ~1 minute for the build to finish
9. Click the preview URL — your app is live! 🎉

---

## PART 6 — Tell Clerk Your App's URL

This step lets Clerk know where your app lives so logins work correctly.

1. Copy your Vercel URL (looks like `https://coachkit-abc123.vercel.app`)
2. Go back to **https://dashboard.clerk.com**
3. Click your CoachKit app
4. In the left sidebar, click **Domains**
5. Click **Add domain**
6. Paste your Vercel URL and click **Add**

That's it — your app is live and protected by coach login! ✅

---

## PART 7 — Making Updates Later

Whenever you want to update the app:
1. Replace files in your local coachkit folder
2. Open GitHub Desktop
3. Write a commit message and click **Commit to main**
4. Click **Push origin**
5. Vercel automatically rebuilds and deploys within ~1 minute

---

## Your Free Limits
| Service | Free Limit | Your Usage |
|---------|-----------|------------|
| Clerk   | 10,000 monthly active users | You'll use ~1-5 |
| Vercel  | 100GB bandwidth/month | You'll use ~1GB |
| GitHub  | Unlimited public repos | ✅ |

You will never hit these limits for a single team's coaching app.

---

## Troubleshooting

**"Missing VITE_CLERK_PUBLISHABLE_KEY" error:**
Make sure your `.env.local` file exists and has the correct key. The file must start with `VITE_`.

**Login page shows but signing in gives an error:**
Go to Clerk Dashboard → Domains and make sure your Vercel URL is added.

**App deploys but looks broken:**
Check the Vercel build logs for errors. Usually means a typo in the env variable name.

**Need help?**
Open the app in Claude and describe what you're seeing — happy to debug!
