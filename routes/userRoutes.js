import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { db } from '../index.js';
import authenticateToken from '../middlewares/authenticateToken.js';

const router = express.Router();

// Route to create a user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields (username, email, password) are required.' });
  }

   // Check if user already exists by email or username
   db.get(
    `SELECT id, email, username FROM users WHERE email = ? OR username = ?`,
    [email, username],
    async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Existing user verification error.' });
      }

      // If a user already exists with this email or username
      if (row) {
        if (row.email === email) {
          return res.status(400).json({ error: 'A user with this email address already exists.' });
        }
        if (row.username === username) {
          return res.status(400).json({ error: 'A user with this username already exists.' });
        }
      }

      // Password hash
      const passwordHash = await bcrypt.hash(password, 10);

      // Insert user in database
      db.run(
        `INSERT INTO users (username, email, passwordHash) VALUES (?, ?, ?)`,
        [username, email, passwordHash],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Account creation error.' });
          }
          res.status(201).json({ id: this.lastID, username, email, profileImage: null });
        }
      );
    }
  );
});

// Route for user connection
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Checking the required parameters
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, id: user.id, username: user.username, email: user.email, profileImage: user.profileImage });
  });
});

// Route to retrieve logged-in user information
router.get('/profile', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.get(`SELECT id, username, email, profileImage FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Route to update logged-in user information
router.put('/profile', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { username, email, password } = req.body;

  const updates = [];
  const params = [];

  // Checks if at least one field to be updated is provided
  if (!username && !email && !password) {
    return res.status(400).json({ error: 'No information to update. Provide at least one field.' });
  }

  if (username) {
    updates.push('username = ?');
    params.push(username);
  }
  if (email) {
    updates.push('email = ?');
    params.push(email);
  }
  if (password) {
    const passwordHash = await bcrypt.hash(password, 10);
    updates.push('passwordHash = ?');
    params.push(passwordHash);
  }

  params.push(userId);
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) {
      return res.status(400).json({ error: 'Error updating profile' });
    }
    res.json({ message: 'Profile successfully updated' });
  });
});

export default router;
