# আইটি রিকুইজিশন ট্র্যাকার

রিকুইজিশন ও গেট পাস মিলকরণ ট্র্যাকার — Node.js + Express + PostgreSQL।

## ফোন দিয়ে ফ্রিতে হোস্ট করার ধাপ

### ১. GitHub-এ কোড আপলোড
1. GitHub অ্যাপ বা ব্রাউজারে নতুন রিপোজিটরি বানান (যেমন: `it-requisition-tracker`)
2. এই ফোল্ডারের সব ফাইল আপলোড করুন (GitHub মোবাইল অ্যাপ থেকে "Add file → Upload files")

### ২. Render-এ ডাটাবেজ বানান
1. render.com-এ লগইন করুন (আপনার আগে থেকেই অ্যাকাউন্ট আছে)
2. "New +" → "PostgreSQL" → নাম দিন (যেমন `it-tracker-db`) → Free plan সিলেক্ট করে Create
3. তৈরি হওয়ার পর "Internal Database URL" কপি করে রাখুন

### ৩. Render-এ ওয়েব সার্ভিস বানান
1. "New +" → "Web Service" → আপনার GitHub রিপো সিলেক্ট করুন
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Environment Variables যোগ করুন:
   - `DATABASE_URL` = ধাপ ২-এর Internal Database URL
   - `SESSION_SECRET` = যেকোনো একটা লম্বা র‍্যান্ডম লেখা
5. Free plan সিলেক্ট করে "Create Web Service"

কয়েক মিনিট পর একটা লিংক পাবেন (যেমন `it-requisition-tracker.onrender.com`) — এটাই আপনার লাইভ অ্যাপ।

### ৪. প্রথম অ্যাকাউন্ট
প্রথম যে অ্যাকাউন্ট রেজিস্টার করবে সে স্বয়ংক্রিয়ভাবে "admin" হয়ে যাবে, পরের সবাই "staff"।

## নোট
- Free plan-এর ডাটাবেজ ৯০ দিন পর মেয়াদ শেষ হয়ে যেতে পারে (Render-এর নিয়ম) — তখন নতুন একটা বানিয়ে DATABASE_URL আপডেট করে দিতে হবে।
- Free web service কিছুক্ষণ ব্যবহার না হলে "ঘুমিয়ে" যায়, প্রথম ভিজিটে লোড হতে ২০-৩০ সেকেন্ড লাগতে পারে — এটা স্বাভাবিক।
