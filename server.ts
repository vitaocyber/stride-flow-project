import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import session from "express-session";
import cookieParser from "cookie-parser";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fs from "fs";

const CONFIG_FILE = path.join(process.cwd(), "config.json");

// Load initial config
let siteConfig = {
  ebookPrice: 49.90,
  heroTitle: "TREINE COM INTELIGÊNCIA.",
  adminEmail: "kaneki0202fake@gmail.com",
  ebookUrl: "https://example.com/ebook-maratona.pdf" // Link do arquivo real
};

// In-memory storage for demo (would be a DB in production)
let userPurchases: Record<string, boolean> = {};
let userPlans: Record<string, any[]> = {};
let allPurchases: any[] = [];
let activities: any[] = [];
let userProfiles: Record<string, any> = {};
let communities: any[] = [];

if (fs.existsSync(CONFIG_FILE)) {
  try {
    siteConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (e) {
    console.error("Error loading config:", e);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(siteConfig, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: process.env.SESSION_SECRET || "strideflow-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));

  // Google Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL}/auth/google/callback`
    }, (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      const user = {
        email,
        displayName: profile.displayName,
        provider: 'google',
        isAdmin: email === siteConfig.adminEmail
      };
      return done(null, user);
    }));
  }

  // Facebook Strategy
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: `${process.env.APP_URL}/auth/facebook/callback`,
      profileFields: ['id', 'displayName', 'emails']
    }, (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      const user = {
        email,
        displayName: profile.displayName,
        provider: 'facebook',
        isAdmin: email === siteConfig.adminEmail
      };
      return done(null, user);
    }));
  }

  // Auth Routes
  app.get("/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(501).send("Google OAuth não configurado. Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos Secrets.");
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", { failureRedirect: "/" }, (err: any, user: any) => {
      if (err || !user) return res.redirect("/");
      req.login(user, (loginErr) => {
        if (loginErr) return res.redirect("/");
        res.send(`
          <html>
            <body>
              <script>
                window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
              </script>
            </body>
          </html>
        `);
      });
    })(req, res, next);
  });

  app.get("/auth/facebook", (req, res, next) => {
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      return res.status(501).send("Facebook OAuth não configurado. Adicione FACEBOOK_APP_ID e FACEBOOK_APP_SECRET nos Secrets.");
    }
    passport.authenticate("facebook", { scope: ["email"] })(req, res, next);
  });

  app.get("/auth/facebook/callback", (req, res, next) => {
    passport.authenticate("facebook", { failureRedirect: "/" }, (err: any, user: any) => {
      if (err || !user) return res.redirect("/");
      req.login(user, (loginErr) => {
        if (loginErr) return res.redirect("/");
        res.send(`
          <html>
            <body>
              <script>
                window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
              </script>
            </body>
          </html>
        `);
      });
    })(req, res, next);
  });

  // API Routes
  app.get("/api/config", (req, res) => {
    res.json(siteConfig);
  });

  app.post("/api/admin/config", (req, res) => {
    const user = req.user as any;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { ebookPrice, heroTitle, ebookUrl } = req.body;
    if (ebookPrice) siteConfig.ebookPrice = Number(ebookPrice);
    if (heroTitle) siteConfig.heroTitle = heroTitle;
    if (ebookUrl) siteConfig.ebookUrl = ebookUrl;
    
    saveConfig();
    res.json({ success: true, config: siteConfig });
  });

  app.get("/api/admin/purchases", (req, res) => {
    const user = req.user as any;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    res.json(allPurchases);
  });

  // Training Plans Persistence
  app.get("/api/plans", (req, res) => {
    const user = req.user as any;
    if (!user) return res.json([]);
    res.json(userPlans[user.email] || []);
  });

  app.post("/api/plans", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });
    
    if (!userPlans[user.email]) userPlans[user.email] = [];
    userPlans[user.email].push(req.body);
    res.json({ success: true });
  });

  // Payment System (PIX Mock)
  app.post("/api/payment/pix", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    // Simulate PIX data generation
    const pixCode = "00020126580014BR.GOV.BCB.PIX0136strideflow-pix-key-random-1235204000053039865404" + siteConfig.ebookPrice.toFixed(2).replace('.', '') + "5802BR5910STRIDEFLOW6009SAO PAULO62070503***6304E2B1";
    
    res.json({ 
      pixCode,
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`
    });
  });

  app.post("/api/payment/confirm", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    userPurchases[user.email] = true;
    allPurchases.push({
      email: user.email,
      amount: siteConfig.ebookPrice,
      date: new Date().toISOString()
    });
    
    // Simulate Email Sending
    console.log(`[EMAIL SENT] To: ${user.email} - Subject: Seu Ebook StrideFlow chegou! - Link: ${siteConfig.ebookUrl}`);
    
    res.json({ success: true, ebookUrl: siteConfig.ebookUrl });
  });

  app.get("/api/purchases/check", (req, res) => {
    const user = req.user as any;
    if (!user) return res.json({ hasPurchased: false });
    res.json({ hasPurchased: !!userPurchases[user.email], ebookUrl: userPurchases[user.email] ? siteConfig.ebookUrl : null });
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user || null });
  });

  // Activities & Feed
  app.get("/api/activities", (req, res) => {
    // Return all activities sorted by date desc
    const sorted = [...activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(sorted);
  });

  app.post("/api/activities", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const activity = {
      ...req.body,
      id: Math.random().toString(36).substr(2, 9),
      userId: user.email,
      userEmail: user.email,
      userName: user.displayName,
      date: new Date().toISOString(),
      likes: [],
      comments: []
    };

    activities.push(activity);

    // Update user profile stats
    if (!userProfiles[user.email]) {
      userProfiles[user.email] = {
        email: user.email,
        displayName: user.displayName,
        totalDistance: 0,
        totalRuns: 0,
        followers: [],
        following: []
      };
    }
    userProfiles[user.email].totalDistance += activity.distance;
    userProfiles[user.email].totalRuns += 1;

    res.json({ success: true, activity });
  });

  app.post("/api/activities/:id/like", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const activity = activities.find(a => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: "Not found" });

    if (!activity.likes.includes(user.email)) {
      activity.likes.push(user.email);
    } else {
      activity.likes = activity.likes.filter((e: string) => e !== user.email);
    }
    res.json({ success: true, likes: activity.likes });
  });

  app.post("/api/activities/:id/comment", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const activity = activities.find(a => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: "Not found" });

    const comment = {
      id: Math.random().toString(36).substr(2, 9),
      userEmail: user.email,
      userName: user.displayName,
      text: req.body.text,
      date: new Date().toISOString()
    };

    activity.comments.push(comment);
    res.json({ success: true, comment });
  });

  // Profiles
  app.get("/api/profile/:email", (req, res) => {
    const profile = userProfiles[req.params.email];
    if (!profile) {
      // Return a default profile if not found
      return res.json({
        email: req.params.email,
        displayName: req.params.email.split('@')[0],
        totalDistance: 0,
        totalRuns: 0,
        followers: [],
        following: []
      });
    }
    res.json(profile);
  });

  app.post("/api/profile/:email/follow", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const targetEmail = req.params.email;
    if (targetEmail === user.email) return res.status(400).json({ error: "Cannot follow yourself" });

    // Update target's followers
    if (!userProfiles[targetEmail]) {
      userProfiles[targetEmail] = { email: targetEmail, displayName: targetEmail.split('@')[0], totalDistance: 0, totalRuns: 0, followers: [], following: [] };
    }
    if (!userProfiles[targetEmail].followers.includes(user.email)) {
      userProfiles[targetEmail].followers.push(user.email);
    }

    // Update current user's following
    if (!userProfiles[user.email]) {
      userProfiles[user.email] = { email: user.email, displayName: user.displayName, totalDistance: 0, totalRuns: 0, followers: [], following: [] };
    }
    if (!userProfiles[user.email].following.includes(targetEmail)) {
      userProfiles[user.email].following.push(targetEmail);
    }

    res.json({ success: true });
  });

  app.post("/api/profile/:email/unfollow", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const targetEmail = req.params.email;

    if (userProfiles[targetEmail]) {
      userProfiles[targetEmail].followers = userProfiles[targetEmail].followers.filter((e: string) => e !== user.email);
    }
    if (userProfiles[user.email]) {
      userProfiles[user.email].following = userProfiles[user.email].following.filter((e: string) => e !== targetEmail);
    }

    res.json({ success: true });
  });

  app.post("/api/profile", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    userProfiles[user.email] = {
      ...userProfiles[user.email],
      ...req.body,
      email: user.email // Ensure email is not changed
    };
    res.json({ success: true, profile: userProfiles[user.email] });
  });

  app.post("/api/workouts/:id/complete", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    if (!userProfiles[user.email]) {
      userProfiles[user.email] = { email: user.email, displayName: user.displayName, totalDistance: 0, totalRuns: 0, followers: [], following: [], completedWorkouts: [] };
    }
    if (!userProfiles[user.email].completedWorkouts) {
      userProfiles[user.email].completedWorkouts = [];
    }

    const workoutId = req.params.id;
    if (!userProfiles[user.email].completedWorkouts.includes(workoutId)) {
      userProfiles[user.email].completedWorkouts.push(workoutId);
    } else {
      userProfiles[user.email].completedWorkouts = userProfiles[user.email].completedWorkouts.filter((id: string) => id !== workoutId);
    }

    res.json({ success: true, completedWorkouts: userProfiles[user.email].completedWorkouts });
  });

  // Communities
  app.get("/api/communities", (req, res) => {
    res.json(communities);
  });

  app.post("/api/communities", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const community = {
      id: Math.random().toString(36).substr(2, 9),
      name: req.body.name,
      description: req.body.description,
      creatorEmail: user.email,
      members: [user.email],
      events: [],
      date: new Date().toISOString()
    };

    communities.push(community);
    res.json({ success: true, community });
  });

  app.post("/api/communities/:id/join", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const community = communities.find(c => c.id === req.params.id);
    if (!community) return res.status(404).json({ error: "Not found" });

    if (!community.members.includes(user.email)) {
      community.members.push(user.email);
    }
    res.json({ success: true, members: community.members });
  });

  app.post("/api/communities/:id/leave", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const community = communities.find(c => c.id === req.params.id);
    if (!community) return res.status(404).json({ error: "Not found" });

    community.members = community.members.filter((m: string) => m !== user.email);
    res.json({ success: true, members: community.members });
  });

  app.post("/api/communities/:id/events", (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Login required" });

    const community = communities.find(c => c.id === req.params.id);
    if (!community) return res.status(404).json({ error: "Not found" });

    const event = {
      id: Math.random().toString(36).substr(2, 9),
      title: req.body.title,
      description: req.body.description,
      date: req.body.date,
      location: req.body.location,
      creatorEmail: user.email,
      attendees: [user.email]
    };

    community.events.push(event);
    res.json({ success: true, event });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  // Mock Login for testing (if no keys provided)
  app.post("/api/auth/mock-login", (req, res) => {
    const { email } = req.body;
    const user = { 
      email, 
      displayName: "Admin Test", 
      provider: 'mock', 
      isAdmin: email === siteConfig.adminEmail 
    };
    req.login(user, () => {
      res.json({ user });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
