import express from 'express';
import { db } from '../index.js';
import authenticateToken from '../middlewares/authenticateToken.js';

import admin from 'firebase-admin';
import serviceAccount from '../spleet-e232e-firebase-adminsdk-t38q4-f7c0de8d65.json' assert { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const router = express.Router();

// Utility function to validate parameters
const validateGroup = (name, description) => {
  const errors = [];
  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('The group name is required and must be a valid string.');
  }
  if (description && typeof description !== 'string') {
    errors.push('The description must be a character string.');
  }
  return errors;
};

// Check if the user is a member of a group
const isUserInGroup = (groupId, userId, callback) => {
  db.get(`SELECT * FROM group_members WHERE groupId = ? AND userId = ?`, [groupId, userId], callback);
};

// Route to create a group
router.post('/', authenticateToken, (req, res) => {
  let { name, description } = req.body;
  const ownerId = req.user.userId;

  if (!description) description = '';

  if (!name) {
    return res.status(422).json({ error: 'The "name" and "description" fields are required.' });
  }

  // Request for user information
  db.get(`SELECT username, profileImage FROM users WHERE id = ?`, [ownerId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'Error retrieving user information' });
    }

    const joinCode = Math.random().toString(36).substring(2, 8);

    // Group creation
    db.run(
      `INSERT INTO groups (name, description, ownerId, joinCode) VALUES (?, ?, ?, ?)`,
      [name, description, ownerId, joinCode],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'Group creation error' });
        }

        const groupId = this.lastID;

        // Add user as group member
        db.run(
          `INSERT INTO group_members (groupId, userId) VALUES (?, ?)`,
          [groupId, ownerId],
          (err) => {
            if (err) {
              return res.status(400).json({ error: 'Error adding user as group member' });
            }

            res.status(201).json({
              id: groupId,
              joinCode,
              name,
              description,
              ownerId: ownerId,
              image: null,
              members: [
                {
                  id: ownerId,
                  username: user.username,
                  profileImage: user.profileImage,
                  lastNotificationDate: null
                }
              ]
            });
          }
        );
      }
    );
  });
});


// Route to retrieve all groups of the logged-in user
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.all(`SELECT g.*, gm.userId AS memberId, gm.lastNotificationDate as lastNotificationDate, u.username AS memberName, u.profileImage as profileImage from groups g
          JOIN group_members gm ON g.id = gm.groupId
          JOIN users u ON gm.userId = u.id
          WHERE gm.userId = ?`, [userId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error retrieving groups' });
    }

    const groups = rows.reduce((acc, row) => {
      const groupId = row.id;

      if (!acc[groupId]) {
        acc[groupId] = {
          id: groupId,
          joinCode: row.joinCode,
          name: row.name,
          description: row.description,
          ownerId: row.ownerId,
          image: row.image || null,
          members: []
        };
      }

      acc[groupId].members.push({
        id: row.memberId,
        username: row.memberName,
        profileImage: row.profileImage || null,
        lastNotificationDate: row.lastNotificationDate
      });

      return acc;
    }, {});

    res.json(Object.values(groups));
  });
});


// Route to retrieve a specific group
router.get('/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to view it' });
    }

    db.get(`SELECT * FROM groups WHERE id = ?`, [groupId], (err, group) => {
      if (err || !group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      db.all(`SELECT gm.userId, u.username, u.profileImage, gm.lastNotificationDate FROM group_members gm
              JOIN users u ON gm.userId = u.id
              WHERE gm.groupId = ?`, [groupId], (err, members) => {
        if (err) {
          return res.status(500).json({ error: 'Error retrieving group members' });
        }

        res.json({
          ...group,
          members: members.map(member => ({
            id: member.userId,
            username: member.username,
            profileImage: member.profileImage,
            lastNotificationDate: member.lastNotificationDate
          })),
        });
      });
    });
  });
});


// Route to update a group
router.put('/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const { name, description } = req.body;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to update it.' });
    }

    const validationErrors = validateGroup(name, description);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    db.run(
      `UPDATE groups SET name = ?, description = ? WHERE id = ?`,
      [name, description, groupId],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'Group update error' });
        }
        res.json({ message: 'Group successfully updated' });
      }
    );
  });
});

// Route to delete a group
router.delete('/:id', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.userId;
  
    // Check if the group exists and retrieve the ownerId
    db.get(`SELECT ownerId FROM groups WHERE id = ?`, [groupId], (err, group) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la vérification du groupe' });
      }
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
  
      if (group.ownerId !== userId) {
        return res.status(403).json({ error: 'You are not authorized to delete this group.' });
      }
  
      // If the user is the owner, delete the group
      db.run(`DELETE FROM groups WHERE id = ?`, [groupId], function (err) {
        if (err) {
          return res.status(400).json({ error: 'Group deletion error' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Group not found' });
        }
        res.json({ message: 'Group successfully deleted' });
      });
    });
  });
  

// Route to join a group
router.post('/:joinCode/join', authenticateToken, (req, res) => {
  const joinCode = req.params.joinCode;
  const userId = req.user.userId;
  
  // First check if the group exists
  db.get(`SELECT * FROM groups WHERE joinCode = ?`, [joinCode], (err, group) => {
    if (err || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    isUserInGroup(group.id, userId, (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Error verifying group membership' });
      }      

      if (member) {
        return res.status(400).json({ error: 'You are already a member of this group' });
      }

      db.run(
        `INSERT INTO group_members (groupId, userId) VALUES (?, ?)`,
        [group.id, userId],
        function (err) {
          if (err) {
            return res.status(400).json({ error: 'Error when trying to join the group' });
          }
          res.json({ message: 'You have successfully joined the group' });
        }
      );
    });
  });
});

// Route to leave a group
router.post('/:id/leave', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You are not part of this group' });
    }

    // Check if the user is the group owner
    db.get(`SELECT ownerId FROM groups WHERE id = ?`, [groupId], (err, group) => {
      if (err) {
        return res.status(500).json({ error: 'Error retrieving group information' });
      }
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const isOwner = group.ownerId === userId;

      // Remove user from group
      db.run(
        `DELETE FROM group_members WHERE groupId = ? AND userId = ?`,
        [groupId, userId],
        function (err) {
          if (err) {
            return res.status(400).json({ error: 'Error trying to leave group' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'You are not part of this group' });
          }

          // If the user is the owner, check if other members are still present
          if (isOwner) {
            db.get(`SELECT userId FROM group_members WHERE groupId = ? LIMIT 1`, [groupId], (err, newOwner) => {
              if (err) {
                return res.status(500).json({ error: 'Error searching for a new owner' });
              }

              if (newOwner) {
                // Randomly decide of the new owner
                db.run(`UPDATE groups SET ownerId = ? WHERE id = ?`, [newOwner.userId, groupId], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Error when assigning a new owner' });
                  }
                  return res.json({ message: 'You have left the group and a new owner has been assigned.' });
                });
              } else {
                // If there are no more members, delete the group
                db.run(`DELETE FROM groups WHERE id = ?`, [groupId], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Group deletion error' });
                  }
                  return res.json({ message: 'You left and the group was deleted as there were no more members.' });
                });
              }
            });
          } else {
            // If not the creator, the user simply leaves the group
            res.json({ message: 'You have successfully left the group' });
          }
        }
      );
    });
  });
});

// test route
router.post('/notify', (req, res) => {

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  const message = `You owe 23.50€ to Florine and 2 others!`

  const payload = {
    data: {
      title: "Don't forget ⏳",
      body: message
    },
    token: token
  };

  admin.messaging().send(payload)
    .then((response) => {
      console.log('Successfully sent message:', response);
      res.json({ message: 'Notification sent successfully' });
    })
    .catch((error) => {
      console.log('Error sending message:', error);
      res.status(500).json({ error: 'Error sending notification' });
    });
});

// Route to remind a user to pay a debt
router.post('/:groupId/reminder', authenticateToken, (req, res) => {
  // amountOwed is an array of objects { userId, amount }
  const { userWhoOweId, amountsOwed } = req.body;
  const groupId = req.params.groupId;

  // check if the authenticated user is a member of the group
  isUserInGroup(groupId, req.user.userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to send reminders' });
    }

    // check if the user to remind is a member of the group
    isUserInGroup(groupId, userWhoOweId, (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Error verifying group membership' });
      }
      if (!member) {
        return res.status(404).json({ error: 'User not found in this group' });
      }

      // check if the user to remind has been notified in the last 24 hours
      db.get(`SELECT * FROM group_members WHERE groupId = ? AND userId = ?`, [groupId, userWhoOweId], (err, member) => {
        if (err) {
          return res.status(500).json({ error: 'Error retrieving user information' });
        }
        if (!member) {
          return res.status(404).json({ error: 'User not found in this group' });
        }

        const lastNotificationDate = member.lastNotificationDate;
        const currentDate = new Date().getTime();
        if (lastNotificationDate && currentDate - lastNotificationDate < 86400000) {
          return res.status(400).json({ error: 'You can only send a reminder once every 24 hours' });
        }

        // check the device token of the user to remind
        if (!member.deviceToken) {
          return res.status(422).json({ error: 'The user to remind has not registered a device token' });
        }

        // if the user to remind owes multiple people, send a single notification with the text "You owe {totalAmount} to {maxCreditor} and {otherCreditorsCount} other{s?}!"
        // if the user to remind owes a single person, send a single notification with the text "You owe {totalAmount} to {creditor}!"
        const totalAmount = amountsOwed.reduce((acc, amount) => acc + amount.amount, 0); // sum of all amounts owed
        const creditorCount = amountsOwed.length; // number of people to whom the user owes money
        
        // the user to remind owes the largest amount to this person
        const creditor = amountsOwed.reduce((max, amount) => (amount.amount > max.amount) ? amount : max, amountsOwed[0]);
        const creditorName = creditor.username;
        
        const message = creditorCount > 1
          ? `You owe ${totalAmount} to ${creditorName} and ${creditorCount - 1} other${creditorCount > 2 ? 's' : ''}!`
          : `You owe ${totalAmount} to ${creditorName}!`;

        const payload = {
          data: {
            title: "Don't forget ⏳",
            body: message
          },
          token: member.deviceToken
        };

        admin.messaging().send(payload)
          .then(() => {
            db.run(`UPDATE group_members SET lastNotificationDate = ? WHERE groupId = ? AND userId = ?`, [currentDate, groupId, userWhoOweId], (err) => {
              if (err) {
                return res.status(500).json({ error: 'Error updating last notification date' });
              }
              res.json({ message: 'Reminder sent successfully' });
            });
          })
          .catch(() => {
            return res.status(500).json({ error: 'Error sending reminder' });
          });
      });
    });
  });
});

// Error Codes for the reminder route
// 403: Not a member of the group
// 404: User not found in this group
// 400: Reminder sent too recently (24 hours limit)
// 422: No device token registered
// 500: Error sending reminder
// 200: Reminder sent successfully

export default router;
