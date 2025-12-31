import 'dotenv/config';

// Suppress gramJS/telegram library logging
if (typeof window === 'undefined') {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = function(...args: any[]) {
    const message = args.join(' ');
    if (!message.includes('[INFO]') && !message.includes('gramJS') && !message.includes('Running gramJS') && !message.includes('Connecting to') && !message.includes('Connection to') && !message.includes('Using LAYER')) {
      originalLog.apply(console, args);
    }
  };
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { addAuthTestRoutes } from "./authTest";
import { createTelegramBot } from "./telegramBot";
import { NotificationAlgorithmService } from "./notificationAlgorithm";
import { seedAdmin } from "./seedAdmin";
import { initializeDatabase } from "./initDb";
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const app = express();

export async function initAppForServerless() {
  // Register routes and middleware required for API handling.
  // This mirrors the setup done in the main startup flow but
  // intentionally avoids starting background workers or listening on a port.
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === 'coverImage' || file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Register routes (this will setup auth and route handlers)
  await registerRoutes(app, upload);
  addAuthTestRoutes(app);

  // Initialize DB schema where needed (best-effort, errors are logged)
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("❌ Failed to initialize database (serverless):", error);
  }

  return app;
}

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Accept image files for coverImage field
    if (file.fieldname === 'coverImage' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Raw body parsing for webhooks, JSON parsing for everything else
app.use('/api/webhook/paystack', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Apply multer middleware to admin routes for handling FormData
app.use('/api/admin/', upload.any());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Add cache control headers to prevent caching
app.use((req, res, next) => {
  // Disable caching for dynamic content
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

// Add middleware to handle external resource loading
app.use((req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Telegram bot
  const telegramBot = createTelegramBot();
  if (telegramBot) {
    const connectionTest = await telegramBot.testConnection();

    if (connectionTest.botInfo) {
      // NOTE: Bot polling is now handled by the independent telegram-bot service
      // Keeping this commented out to avoid conflicts with the separate bot instance
      // telegramBot.startPolling();
    }
  }

  const server = await registerRoutes(app, upload);
  addAuthTestRoutes(app);

  // Initialize database schema
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
  }

  // Initialize notification algorithm service
  const { storage } = await import('./storage');

  // Seed admin users
  try {
    await seedAdmin();
  } catch (error) {
    console.error("❌ Failed to seed admin users:", error);
  }
  const notificationAlgorithm = new NotificationAlgorithmService(storage);
  notificationAlgorithm.startNotificationScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Serve SPA routes from compiled dist BEFORE Vite middleware
  // This allows testing the compiled build while still running npm run dev
  const distPublicPath = path.resolve(import.meta.dirname, '../dist/public');
  if (fs.existsSync(distPublicPath)) {
    app.get('/telegram-mini-app', (_req, res) => {
      res.sendFile(path.resolve(distPublicPath, 'index.html'));
    });
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();