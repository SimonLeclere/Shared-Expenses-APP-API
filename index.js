import express from 'express';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

import userRoutes from './routes/userRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import setupUploadRoutes from './routes/uploadRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());

// Middleware for enabling CORS
app.use(cors());

const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

ensureDirectoryExists('uploads');
ensureDirectoryExists('uploads/profile');
ensureDirectoryExists('uploads/group');
ensureDirectoryExists('uploads/expense');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine the folder according to the request URL
    if (req.originalUrl.includes('/upload/profile')) {
      cb(null, 'uploads/profile/');
    } else if (req.originalUrl.includes('/upload/group')) {
      cb(null, 'uploads/group/');
    } else if (req.originalUrl.includes('/upload/expense')) {
      cb(null, 'uploads/expense/');
    } else {
      cb(new Error('Invalid image type'), null);
    }
  },
  filename: (req, file, cb) => {    

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`; // Generate a unique file name
    if (req.originalUrl.includes('/upload/profile')) {
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }

    if (req.originalUrl.includes('/upload/group')) {
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }

    if (req.originalUrl.includes('/upload/expense')) {
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }
});

const upload = multer({ storage });


// Routes
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/groups', expenseRoutes);
app.use('/upload', setupUploadRoutes(upload)); // Pass upload to routes

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Expense Tracker API' });
})

// Initialize the SQLite database
const db = new sqlite3.Database(
    ':memory:', // Change ':memory:' to a file path to create a persistent database
    (err) => {
        if (err) {
            console.error('Error opening the database :', err.message);
        } else {
            console.log('SQLite database initialized');
        }
    }
);

// Create tables for users, groups and expenses
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      profileImage TEXT
    )
  `);

  // Groups table
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      joinCode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      ownerId INTEGER,
      image TEXT,
      FOREIGN KEY (ownerId) REFERENCES users(id)
    )
  `);

  // Expenses table
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      payerId INTEGER NOT NULL,
      splitType TEXT NOT NULL,
      date TEXT NOT NULL,
      image TEXT,
      FOREIGN KEY (groupId) REFERENCES groups(id),
      FOREIGN KEY (payerId) REFERENCES users(id)
    )
  `);

  // Table for managing the split values of each expense
  db.run(`
    CREATE TABLE IF NOT EXISTS expense_split_values (
      expenseId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      splitValue REAL,
      FOREIGN KEY (expenseId) REFERENCES expenses(id),
      FOREIGN KEY (userId) REFERENCES users(id),
      PRIMARY KEY (expenseId, userId)
    )
  `);

  // Table for managing group members
  db.run(`
    CREATE TABLE IF NOT EXISTS group_members (
      groupId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      FOREIGN KEY (groupId) REFERENCES groups(id),
      FOREIGN KEY (userId) REFERENCES users(id),
      PRIMARY KEY (groupId, userId)
    )
  `);

  // Table for managing the users who participated in an expense
  db.run(`
    CREATE TABLE IF NOT EXISTS expense_users (
      expenseId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      FOREIGN KEY (expenseId) REFERENCES expenses(id),
      FOREIGN KEY (userId) REFERENCES users(id),
      PRIMARY KEY (expenseId, userId)
    )
  `);

  console.log('Tables created or existing tables checked');
});


// start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app, db, upload, PORT as port };