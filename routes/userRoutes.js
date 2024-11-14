import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { db } from '../index.js';
import authenticateToken from '../middlewares/authenticateToken.js';

const router = express.Router();

// Route to create a user
router.post('/register', async (req, res) => {
  let { username, email, password } = req.body;

  console.log(req.body);
  

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  if (!username) username = email.split('@')[0];

   // Check if user already exists by email
   db.get(
    `SELECT id, email, username FROM users WHERE email = ?`,
    [email],
    async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Existing user verification error.' });
      }

      // If a user already exists with this email or username
      if (row) {
        if (row.email === email) {
          return res.status(400).json({ error: 'A user with this email address already exists.' });
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

          const token = jwt.sign({ userId: this.lastID }, process.env.JWT_SECRET, { expiresIn: '1y' });

          res.status(201).json({ id: this.lastID, username, email, profileImage: null, token });
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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1y' });
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
  const { username, email, newPassword, oldPassword } = req.body;

  // Verifier si on souhaite changer le mot de passe
  if (newPassword && !oldPassword) {
    return res.status(400).json({ error: 'Please provide your current password to change it.' });
  }

  // Vérifier si le mot de passe actuel est correct
  if (newPassword && oldPassword) {
    db.get(`SELECT passwordHash FROM users WHERE id = ?`, [userId], async (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(422).json({ error: 'Old password is incorrect' });
      }

      // Si le mot de passe est valide, on continue avec la mise à jour
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const updates = [];
      const params = [];

      // On ajoute le nouveau mot de passe au tableau des mises à jour
      if (newPassword) {
        updates.push('passwordHash = ?');
        params.push(passwordHash);
      }

      if (username) {
        updates.push('username = ?');
        params.push(username);
      }

      if (email) {
        updates.push('email = ?');
        params.push(email);
      }

      params.push(userId);
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
        if (err) {
          return res.status(400).json({ error: 'Error updating profile' });
        }
        res.json({ message: 'Profile successfully updated' });
      });
    });
  } else {
    // Si pas de changement de mot de passe, on met à jour les autres champs
    const updates = [];
    const params = [];

    if (!username && !email && !newPassword) {
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

    params.push(userId);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) {
        return res.status(400).json({ error: 'Error updating profile' });
      }
      res.json({ message: 'Profile successfully updated' });
    });
  }
});

// Route to get user by ID
router.get('/:id', (req, res) => {
  const userId = req.params.id;

  db.get(`SELECT id, username, email, profileImage FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Route to update user device token
router.post('/device-token', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { deviceToken } = req.body;

  console.log("deviceToken", deviceToken);

  const query = `UPDATE users SET deviceToken = ? WHERE id = ?`;

  db.run(query, [deviceToken, userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du token' });
    }
    res.json({ message: 'Token mis à jour avec succès' });
  });

});




export default router;
