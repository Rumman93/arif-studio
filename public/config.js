/* =========================================================
   আরিফ স্টুডিও — সাইট সেটিংস (Site settings)
   ---------------------------------------------------------
   এই মানগুলো নিরাপদ ডিফল্ট। অ্যাডমিন পেজে সেভ করা তথ্য আগে ব্যবহার হবে।
   These values are safe defaults. Settings saved in the admin page take priority.

   • নম্বর লিখুন ইংরেজি অঙ্কে: "01712345678"
     Write numbers with English digits.
   • কোনো এজেন্ট নম্বর খালি ("") রাখলে সেই কার্ড লুকিয়ে যাবে।
     Leave an agent number empty ("") to hide that brand.
   ========================================================= */
window.SITE_CONFIG = {
  // দোকানের নাম / Shop name
  shopName: {
    bn: "আরিফ স্টুডিও এন্ড টেলিকম",
    en: "Arif Studio & Telecom"
  },

  // পরিচালক / Proprietor
  proprietor: {
    name: { bn: "আরিফুল ইসলাম", en: "Ariful Islam" },
    phone: "01984993221"
  },

  // মোবাইল সার্ভিসিং টেকনিশিয়ান / Mobile servicing contact
  servicing: {
    name: { bn: "আশরাফুল", en: "Ashraful" },
    phone: "01970779989"
  },

  // ইমেইল / Email
  email: "arif.patwary35@gmail.com",

  // কল করার মূল নম্বর / Main phone number for calls
  phone: "01984993221",

  // হোয়াটসঅ্যাপ নম্বর / WhatsApp number
  whatsapp: "01984993221",

  // এজেন্ট নম্বর / Agent numbers
  agents: {
    bkash: "01970100271",
    nagad: "01750100271",
    rocket: "01639099723", // রকেট নম্বর ১২ অঙ্কের হলে পুরোটা লিখুন / write all 12 digits if it is a 12-digit Rocket number
    upay: "01970100271"               // উপায় এজেন্ট হলে নম্বর দিন / add the number if you are an Upay agent
  },

  // ফেসবুক পেজের লিংক (না থাকলে "" রাখুন) / Facebook page URL ("" hides it)
  facebook: "",

  // গুগল ম্যাপ লিংক / Google Maps link
  mapUrl: "https://maps.app.goo.gl/D1qnpb4jLAiJMfFE9",

  // ঠিকানা / Address
  address: {
    bn: "আয়েশা এম্পোরিয়াম, ফাজিলের ঘাট, দাগনভূঞা, ফেনী",
    en: "Ayesha Emporium, Faziler Ghat, Daganbhuiyan, Feni"
  },

  // খোলার সময় (২৪ ঘণ্টা ফরম্যাট) / Opening hours (24-hour format)
  hours: {
    open: "09:00",
    close: "22:00",
    // সাপ্তাহিক বন্ধের দিন / Weekly closed days
    // 0 = রবি, 1 = সোম, 2 = মঙ্গল, 3 = বুধ, 4 = বৃহস্পতি, 5 = শুক্র, 6 = শনি
    // উদাহরণ / example: [5]  — শুক্রবার বন্ধ
    closedDays: []
  }
};
